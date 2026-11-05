// End-to-end checks against the LIVE site with the snippet injected locally. Publishes nothing.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.prymal.world';
const STRIP = /<script[^>]*prymal-i18n\/[a-z0-9]+\.js[^>]*><\/script>/g; // the script is live: tests add their own copy
const snippet = fs.readFileSync(path.join(ROOT, 'dist/header-injection.html'), 'utf8');
const shots = path.join(ROOT, 'preview'); fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); };
async function context(opts = {}, inject = true) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const code = inject === true ? snippet : inject || '';
  await ctx.route(/google-analytics|googletagmanager|facebook|doubleclick|hotjar/, r => r.abort()); // keep tests out of real analytics
  await ctx.route(/prymal-i18n-\w+\.json$/, r => r.fulfill({ path: path.join(ROOT, 'dist', /(prymal-i18n-\w+\.json)$/.exec(r.request().url())[1]), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } })); // stands in for GitHub Pages
  await ctx.route(u => u.origin === BASE, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(STRIP, '').replace('</head>', () => code + '</head>') });
  });
  return ctx;
}
const errs = [];
async function open(ctx, p) {
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(p + ': ' + e.message.slice(0, 160)));
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  return page;
}
const state = page => page.evaluate(() => ({ lang: window.__prymalI18n && window.__prymalI18n.lang, html: document.documentElement.lang, nav: (document.querySelector('.header-nav-list a') || {}).textContent, err: window.__i18nError || null }));

// 1. Detection and fallback
const cases = [['nl-BE', 'nl'], ['nl-NL', 'nl'], ['fr-BE', 'fr'], ['fr-FR', 'fr'], ['es-ES', 'es'], ['es-MX', 'es'], ['en-GB', 'en'], ['de-DE', 'en'], ['ja-JP', 'en']];
for (const [loc, want] of cases) {
  const ctx = await context({ locale: loc }); const page = await open(ctx, '/');
  const s = await state(page); ok(`detect ${loc} -> ${want}`, s.lang === want && s.html.startsWith(want), JSON.stringify(s)); await ctx.close();
}
// ordered preference lists
for (const [list, want] of [[['en-GB', 'nl'], 'en'], [['de', 'fr', 'en'], 'fr'], [['pt-BR', 'es'], 'es']]) {
  const ctx = await context({}); await ctx.addInitScript(l => Object.defineProperty(navigator, 'languages', { get: () => l }), list);
  const page = await open(ctx, '/'); const s = await state(page); ok(`detect [${list}] -> ${want}`, s.lang === want, s.lang); await ctx.close();
}
// 2. Override persists through refresh and navigation, beats browser language
{
  const ctx = await context({ locale: 'nl-BE' }); const page = await open(ctx, '/');
  const closed = await page.locator('#prymal-lang .prymal-lang-menu').isHidden();
  await page.click('#prymal-lang .prymal-lang-btn'); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, 'dropdown-open.png') });
  const opts = await page.locator('#prymal-lang .prymal-lang-menu button').allTextContents();
  const fonts = await page.evaluate(() => { const f = e => { const s = getComputedStyle(e); return [s.fontFamily, s.fontWeight].join('/'); }; return { nav: f(document.querySelector('.header-nav-item a')), btn: f(document.querySelector('#prymal-lang .prymal-lang-btn')), opt: f(document.querySelector('#prymal-lang .prymal-lang-menu button')) }; });
  ok('dropdown: same font as site navigation', fonts.nav === fonts.btn && fonts.nav === fonts.opt, JSON.stringify(fonts));
  ok('dropdown: closed by default, lists all languages', closed && opts.join() === 'English,Nederlands,Français,Español', opts.join());
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('dropdown: Escape closes, focus returns', await page.locator('#prymal-lang .prymal-lang-menu').isHidden() && await page.evaluate(() => document.activeElement.className === 'prymal-lang-btn'));
  await page.click('#prymal-lang .prymal-lang-btn'); await page.mouse.click(700, 500); await page.waitForTimeout(100);
  ok('dropdown: click outside closes', await page.locator('#prymal-lang .prymal-lang-menu').isHidden());
  await page.focus('#prymal-lang .prymal-lang-btn'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  ok('dropdown: arrow keys move through languages', await page.evaluate(() => !!document.activeElement.dataset.lang));
  await page.keyboard.press('Escape');
  await page.click('#prymal-lang .prymal-lang-btn'); await page.click('#prymal-lang button[data-lang="es"]'); await page.waitForTimeout(400);
  ok('dropdown: button shows chosen language, menu closes', (await page.locator('#prymal-lang .prymal-lang-btn').textContent()) === 'ES' && await page.locator('#prymal-lang .prymal-lang-menu').isHidden());
  let s = await state(page); ok('switcher changes language live', s.lang === 'es' && s.nav.trim() === 'Nosotros', s.nav);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  s = await state(page); ok('override survives refresh', s.lang === 'es', s.lang);
  await page.click('.header-nav-list a[href="/contact"]'); await page.waitForTimeout(2500);
  s = await state(page); ok('override survives navigation', s.lang === 'es' && page.url().includes('/contact'), page.url());
  await ctx.close();
}
// 3. English untouched: visible text identical with and without the snippet
for (const p of ['/', '/digital', '/contact']) {
  const a = await context({ locale: 'en-GB' }, false), b = await context({ locale: 'en-GB' });
  const t = pg => pg.evaluate(() => { document.querySelectorAll('.prymal-lang').forEach(e => e.remove()); return document.body.innerText.replace(/\s+/g, ' ').replace(/(Regulate|Connect|Release|Move|Expand|Create)\s*•?\s*/g, ''); });
  const pa = await open(a, p); const x = await t(pa); // read at equal age: the home ticker grows over time
  const pb = await open(b, p); const y = await t(pb);
  ok(`English text unchanged ${p}`, x === y, `${x.length} vs ${y.length} chars`); await a.close(); await b.close();
}
// 4. Round trip NL -> EN restores the exact English text (incl. cloned nodes)
{
  const ref = await context({ locale: 'en-GB' }, false); const r = await open(ref, '/digital');
  const norm = pg => pg.evaluate(() => { document.querySelectorAll('.prymal-lang').forEach(e => e.remove()); return document.body.innerText.replace(/\s+/g, ' '); });
  const want = await norm(r); await ref.close();
  const ctx = await context({ locale: 'nl-BE' }); const page = await open(ctx, '/digital');
  await page.click('#prymal-lang .prymal-lang-btn'); await page.click('#prymal-lang button[data-lang="en"]'); await page.waitForTimeout(600);
  const got = await norm(page);
  let i = 0; while (i < want.length && want[i] === got[i]) i++;
  ok('NL -> EN restores English', got === want, got === want ? '' : `differs at ${i}: "${want.slice(i, i + 50)}" vs "${got.slice(i, i + 50)}"`); await ctx.close();
}
// 5. Plan builder: same logic in every language
const drive = page => page.evaluate(async () => {
  const r = document.querySelector('.prymal-builder'), w = () => new Promise(x => setTimeout(x, 400));
  const up = k => r.querySelector('[data-kind="' + k + '"] [data-step="1"]');
  r.querySelector('.pb-channel input').click(); await w();
  up('single').click(); up('carousel').click(); await w();
  const a = { credits: r.querySelector('[data-out="credits"]').textContent, title: r.querySelector('[data-out="title"]').textContent, price: r.querySelector('[data-out="price"]').textContent, cap: r.querySelector('[data-out="capacity"]').textContent, min: r.querySelector('[data-out="minimum"]').textContent, href: r.querySelector('.pb-cta').href, cta: r.querySelector('.pb-cta').textContent, status: r.querySelector('[role=status]').textContent, input: r.querySelector('[data-kind="single"] input').value };
  for (let i = 0; i < 12; i++) up('reel').click();
  await w();
  a.overTitle = r.querySelector('[data-out="title"]').textContent; a.overHref = r.querySelector('.pb-cta').href; a.overCta = r.querySelector('.pb-cta').textContent;
  return a;
});
const base = {};
for (const l of ['en', 'nl', 'fr', 'es']) {
  const ctx = await context({ locale: l === 'en' ? 'en-GB' : l }); const page = await open(ctx, '/digital');
  const b = await drive(page); base[l] = b;
  if (l === 'en') console.log('builder EN', JSON.stringify(b));
  else {
    const same = ['credits', 'href', 'overHref', 'input'].every(k => b[k] === base.en[k]);
    const translated = b.cta !== base.en.cta && b.cap !== base.en.cap && b.min !== base.en.min && b.overTitle !== base.en.overTitle;
    ok(`builder ${l}: logic + links identical, labels translated`, same && translated, `${b.title} | ${b.price} | ${b.cap} | ${b.cta}`);
    await page.locator('.prymal-builder').screenshot({ path: path.join(shots, `builder-${l}.png`) });
  }
  await ctx.close();
}
// 6. Forms: names and submit wiring untouched
{
  const a = await context({ locale: 'en-GB' }, false), b = await context({ locale: 'fr-FR' });
  const f = pg => pg.evaluate(() => [...document.querySelectorAll('form input,form textarea,form select')].map(e => e.name.replace(/yui_[0-9a-f-]+/, 'yui') + ':' + e.type + ':' + (e.required ? 1 : 0)).join());
  const pa = await open(a, '/contact'), pb = await open(b, '/contact');
  const [x, y] = [await f(pa), await f(pb)]; ok('form fields unchanged in FR', x === y && x.length > 0, x.slice(0, 90));
  await pb.screenshot({ path: path.join(shots, 'contact-fr.png') }); await a.close(); await b.close();
}
// 7. Mobile
{
  const ctx = await context({ locale: 'nl-BE', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }); const page = await open(ctx, '/digital');
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('mobile: no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));
  await page.evaluate(() => { const b = [...document.querySelectorAll('.header-burger-btn, .burger')].find(e => e.offsetWidth > 0); if (b) b.click(); }); await page.waitForTimeout(1200);
  const vis = await page.evaluate(() => { const e = document.getElementById('prymal-lang-m'); if (!e) return null; const r = e.getBoundingClientRect(); const b = e.querySelector('button').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, bw: b.width, bh: b.height, vh: innerHeight, color: getComputedStyle(e.querySelector('button')).color, bg: getComputedStyle(document.querySelector('.header-menu-bg') || document.body).backgroundColor }; });
  ok('mobile: switcher visible in menu, 44px targets', !!vis && vis.w > 0 && vis.top < vis.vh && vis.bh >= 44 && vis.color === 'rgb(255, 255, 255)', JSON.stringify(vis));
  await page.screenshot({ path: path.join(shots, 'mobile-menu-nl.png') });
  await page.click('#prymal-lang-m .prymal-lang-btn'); await page.waitForTimeout(250);
  const box = await page.locator('#prymal-lang-m .prymal-lang-menu').boundingBox();
  ok('mobile: dropdown opens fully on screen', !!box && box.x >= 0 && box.x + box.width <= 375 && box.y >= 0, JSON.stringify(box));
  await page.screenshot({ path: path.join(shots, 'mobile-dropdown-open.png') });
  await page.click('#prymal-lang-m button[data-lang="fr"]'); await page.waitForTimeout(400);
  ok('mobile: dropdown switches language', (await state(page)).lang === 'fr'); await ctx.close();
}
// 8. Performance: median of 3 cold loads
const TAG = '<script defer src="https://prymal-digital.github.io/prymal-i18n/i18n.js"></script>';
const load = async (inject, loc) => { const c = await context({ locale: loc }, inject); const pg = await c.newPage(); await pg.goto(BASE + '/digital', { waitUntil: 'load', timeout: 60000 }); const v = await pg.evaluate(() => Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)); await c.close(); return v; };
const A = [], B = [], C = [];
for (let i = 0; i < 9; i++) { A.push(await load(false, 'en-GB')); B.push(await load(TAG, 'en-GB')); C.push(await load(TAG, 'nl-BE')); } // interleaved so network drift hits all three
const med = a => [...a].sort((x, y) => x - y)[4];
ok('perf: English under 100ms slower than baseline', med(B) - med(A) < 100, `baseline ${med(A)}ms, EN ${med(B)}ms, NL ${med(C)}ms`);
// 9. Preview build: inert for visitors, active only after opting in
{
  const pv = fs.readFileSync(path.join(ROOT, 'dist/header-injection-preview.html'), 'utf8');
  const c = await context({ locale: 'nl-BE' }, pv); const g = await open(c, '/');
  let s = await state(g); const sw = await g.evaluate(() => !!document.getElementById('prymal-lang'));
  ok('preview build: visitor sees nothing', !s.lang && !sw && s.nav.trim() === 'About', s.nav.trim());
  await g.goto(BASE + '/?i18n-preview=1', { waitUntil: 'domcontentloaded' }); await g.waitForTimeout(2000);
  s = await state(g); ok('preview build: opt-in activates', s.lang === 'nl', s.lang);
  await g.goto(BASE + '/contact', { waitUntil: 'domcontentloaded' }); await g.waitForTimeout(2000);
  s = await state(g); ok('preview build: stays on across pages', s.lang === 'nl', s.lang);
  await g.goto(BASE + '/?i18n-preview=0', { waitUntil: 'domcontentloaded' }); await g.waitForTimeout(1500);
  s = await state(g); ok('preview build: opt-out turns it off', !s.lang, String(s.lang)); await c.close();
}
// 10. Ticket variant + add to cart while translated (test session only, stops at the cart)
{
  const ctx = await context({ locale: 'es-ES' }); const g = await open(ctx, '/tickets/p/wildflow');
  const sel = g.locator('select.variant-select').first();
  const before = await sel.evaluate(s => [...s.options].map(o => o.value + '=' + o.textContent.trim().replace(/\s+/g, ' ')));
  await sel.selectOption('Couple Ticket'); await g.waitForTimeout(500);
  const btn = g.locator('.sqs-add-to-cart-button, .product-add-to-cart [role=button], .add-to-cart-button, button[class*=add-to-cart]').first();
  const label = (await btn.innerText().catch(() => '')).trim();
  await btn.click({ timeout: 8000 }).catch(e => console.log('click failed', e.message.slice(0, 120)));
  await g.waitForTimeout(3500);
  await g.goto(BASE + '/cart', { waitUntil: 'domcontentloaded' }); await g.waitForTimeout(3000);
  const cart = await g.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok('tickets ES: labels translated, values untouched', before.some(x => x.startsWith('Couple Ticket=Entrada para dos')), before.slice(0, 6).join(' ; '));
  ok('tickets ES: correct variant in cart, cart translated', cart.includes('WildFlow VIII') && cart.includes('Entrada para dos') && !cart.includes('Couple Ticket') && !/Subtotal €.*CHECKOUT/.test(cart), 'button="' + label + '" ' + cart.slice(cart.indexOf('Carrito'), cart.indexOf('Carrito') + 110));
  await g.screenshot({ path: path.join(shots, 'ticket-es.png') }); await ctx.close();
}
// 13. Header fits at narrow desktop widths in the longest languages
for (const [loc, w] of [['fr-FR', 1025], ['fr-FR', 1100], ['fr-FR', 1200], ['es-ES', 1025], ['es-ES', 1240], ['nl-BE', 1025], ['fr-FR', 1241], ['fr-FR', 1300]]) {
  const ctx = await context({ locale: loc, viewport: { width: w, height: 800 } }); const g = await open(ctx, '/');
  const m = await g.evaluate(() => {
    const items = [...document.querySelectorAll('.header-display-desktop .header-nav-item, .header-nav-list > *')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect());
    const tops = new Set(items.map(r => Math.round(r.top)));
    const logo = [...document.querySelectorAll('.header-title-logo img')].find(e => e.offsetParent).getBoundingClientRect();
    const sw = document.getElementById('prymal-lang').getBoundingClientRect();
    const right = Math.max(...items.map(r => r.right)), left = Math.min(...items.map(r => r.left));
    return { rows: tops.size, gapLogo: Math.round(left - logo.right), gapSwitch: Math.round(sw.left - right), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  ok(`header fits ${loc} ${w}px`, m.rows === 1 && m.gapLogo >= 0 && m.gapSwitch >= 0 && !m.overflow, JSON.stringify(m));
  if (w === 1025 && loc === 'fr-FR') await g.screenshot({ path: path.join(shots, 'narrow-fr.png') });
  await ctx.close();
}
// 14. Highlight underlines sit on their words after translation and after switching
{
  const ctx = await context({ locale: 'nl-BE' }); const g = await open(ctx, '/');
  await g.waitForTimeout(1200);
  const drift = () => g.evaluate(() => {
    const spans = [...document.querySelectorAll('.sqsrte-text-highlight')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect());
    const nodes = [...document.querySelectorAll('.TextShape-node')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect());
    return { n: Math.min(spans.length, nodes.length), worst: Math.round(Math.max(0, ...spans.map((s, i) => nodes[i] ? Math.abs((s.left + s.width / 2) - (nodes[i].left + nodes[i].width / 2)) : 0))) };
  });
  const a = await drift(); ok('underlines aligned in NL', a.n >= 4 && a.worst <= 6, JSON.stringify(a));
  await g.click('#prymal-lang .prymal-lang-btn'); await g.click('#prymal-lang button[data-lang="fr"]'); await g.waitForTimeout(1500);
  const b2 = await drift(); ok('underlines aligned after switching to FR', b2.n >= 4 && b2.worst <= 6, JSON.stringify(b2));
  await ctx.close();
}
// 15. Language reporting reaches the site's analytics queue
{
  const ctx = await context({ locale: 'es-ES' }); const g = await open(ctx, '/');
  const evs = () => g.evaluate(() => (window.dataLayer || []).filter(a => a && a[0] === 'event' && /^language_/.test(a[1])).map(a => [a[1], a[2]]));
  const a = await evs();
  ok('analytics: language_view sent once', a.length === 1 && a[0][1].site_language === 'es' && a[0][1].language_source === 'browser', JSON.stringify(a));
  await g.click('#prymal-lang .prymal-lang-btn'); await g.click('#prymal-lang button[data-lang="nl"]'); await g.waitForTimeout(600);
  const b2 = await evs();
  ok('analytics: language_switch sent', b2.some(e => e[0] === 'language_switch' && e[1].from_language === 'es' && e[1].to_language === 'nl'), JSON.stringify(b2.slice(-1)));
  await ctx.close();
}
// 16. Legal pages translate in every language
for (const p of ['/privacy-policy', '/terms-conditions']) {
  const ctx = await context({ locale: 'nl-BE' }); const g = await open(ctx, p);
  const main = () => g.evaluate(() => document.querySelector('main').innerText);
  ok('legal page in Dutch ' + p, /We verkopen je gegevens niet|We behouden ons/.test(await main()));
  await g.click('#prymal-lang .prymal-lang-btn'); await g.click('#prymal-lang button[data-lang="fr"]'); await g.waitForTimeout(800);
  ok('legal page in French ' + p, /Nous ne vendons pas|Nous nous réservons/.test(await main()));
  await ctx.close();
}
// 11. /fridays in every language
for (const [loc, want] of [['es-ES', 'Los viernes'], ['nl-BE', 'Vrijdagavonden'], ['fr-FR', 'Les vendredis soir']]) {
  const ctx = await context({ locale: loc }); const g = await open(ctx, '/fridays');
  const t = await g.evaluate(() => document.body.innerText);
  const href = await g.evaluate(() => [...document.querySelectorAll('a')].map(a => a.href).filter(h => /ticket|bigg/i.test(h)).slice(0, 2).join(' '));
  ok('fridays ' + loc, t.includes(want) && !t.includes('Friday Nights'), href);
  await g.screenshot({ path: path.join(shots, 'fridays-' + loc.slice(0, 2) + '.png') });
  await ctx.close();
}
// 12. Dictionary unavailable: page stays usable in English, no hang
{
  const ctx = await context({ locale: 'nl-BE' });
  await ctx.route(/prymal-i18n-\w+\.json$/, r => r.fulfill({ status: 404, body: 'nope', headers: { 'access-control-allow-origin': '*' } }));
  const g = await open(ctx, '/digital');
  const s = await g.evaluate(() => ({ err: window.__i18nError, wait: document.documentElement.classList.contains('i18n-wait'), op: getComputedStyle(document.body).opacity, nav: document.querySelector('.header-nav-list a').textContent.trim(), lang: document.documentElement.lang }));
  ok('missing dictionary falls back to English', !s.wait && s.op === '1' && s.nav === 'About' && !!s.err, JSON.stringify(s)); await ctx.close();
}
// Screenshots
for (const [l, p, n] of [['nl-BE', '/', 'home-nl'], ['fr-FR', '/digital', 'digital-fr'], ['es-ES', '/events', 'events-es']]) {
  const c = await context({ locale: l }); const pg = await open(c, p); await pg.screenshot({ path: path.join(shots, n + '.png') }); await c.close();
}
ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' ; '));
await browser.close();
fs.writeFileSync(path.join(ROOT, 'test-results.json'), JSON.stringify(results, null, 1));
const f = results.filter(r => !r.pass).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
