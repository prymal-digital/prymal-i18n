// Loads the LIVE site read-only in headless Chrome with the runtime injected locally
// (nothing is published), drives the plan builder, and records every string the
// translator could not resolve. Output: collected.json + changes vs last run.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.prymal.world';
const STRIP = /<script[^>]*prymal-i18n\/[a-z0-9]+\.js[^>]*><\/script>/g; // the script is live: tests add their own copy
// Pages come from the live sitemap, so new pages are picked up automatically.
const smFile = path.join(ROOT, 'sitemap_paths.json');
try {
  const xml = await (await fetch(BASE + '/sitemap.xml')).text();
  const found = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(BASE, '') || '/');
  if (found.length) fs.writeFileSync(smFile, JSON.stringify(found, null, 0));
} catch (e) { console.error('sitemap unavailable, using last known list'); }
const PAGES = [...new Set([...JSON.parse(fs.readFileSync(smFile, 'utf8')), '/', '/podcast'])].concat('/cart');
const snippet = fs.readFileSync(path.join(ROOT, 'dist/header-injection.html'), 'utf8');
// Not translated on purpose: social captions, handles, file names, people and product names.
// Left in English on purpose: English-market SEO content.
const SKIP_PAGES = /^\/(journal|record-store-design)/;
const IGNORE = [/#\w+/, /@\w+/, /\.(png|jpe?g|webp)$/i, /⁠/, /^(https?:|www\.)/, /^[\d\s€.,:/+-]+$/];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ locale: 'nl-BE', viewport: { width: 1440, height: 900 } });
await ctx.addInitScript('window.__I18N_DEBUG__=true;');
// Serve the live HTML with the snippet at the end of <head>, as Squarespace header injection does.
await ctx.route(/google-analytics|googletagmanager|facebook|doubleclick|hotjar/, r => r.abort()); // keep crawls out of real analytics
await ctx.route(/prymal-i18n-\w+\.json$/, r => r.fulfill({ path: path.join(ROOT, 'dist', /(prymal-i18n-\w+\.json)$/.exec(r.request().url())[1]), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
await ctx.route(u => u.origin === BASE, async route => {
  if (route.request().resourceType() !== 'document') return route.continue();
  const res = await route.fetch();
  const body = (await res.text()).replace(STRIP, '').replace('</head>', () => snippet + '</head>');
  await route.fulfill({ response: res, body });
});
const out = { single: {}, group: {} };
const errors = [];
for (const p of PAGES) {
  if (p === '/cart' && !process.env.CI) { // a filled cart has strings an empty one never shows
    const t = await ctx.newPage();
    await t.goto(BASE + '/tickets/p/wildflow', { waitUntil: 'domcontentloaded', timeout: 60000 }); await t.waitForTimeout(2500);
    await t.locator('select.variant-select').first().selectOption('Couple Ticket'); await t.waitForTimeout(500);
    await t.locator('.sqs-add-to-cart-button, button[class*=add-to-cart]').first().click({ timeout: 8000 }); await t.waitForTimeout(3000);
    await t.close();
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(p + ': ' + e.message.slice(0, 200)); });
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
  });
  if (p === '/digital') {
    await page.evaluate(async () => {
      const r = document.querySelector('.prymal-builder');
      if (!r) return;
      const wait = () => new Promise(x => setTimeout(x, 350));
      r.querySelector('.pb-channel input').click(); await wait();
      const up = k => r.querySelector('[data-kind="' + k + '"] [data-step="1"]');
      up('single').click(); await wait();
      for (let i = 0; i < 12; i++) up('reel').click();
      await wait();
    });
  }
  await page.waitForTimeout(800);
  const alive = await page.evaluate(() => !!window.__prymalI18n && !!document.getElementById('prymal-lang'));
  if (!alive) { console.error('RUNTIME NOT ACTIVE on', p); process.exit(2); }
  const m = await page.evaluate(() => window.__i18nMisses);
  for (const k of ['single', 'group']) for (const t of Object.keys(m[k])) (out[k][t] ||= []).includes(p) || out[k][t].push(p);
  await page.close();
}
await browser.close();
if (errors.length) { console.error('PAGE ERRORS, results invalid:\n' + errors.join('\n')); process.exit(2); }
const keep = t => !IGNORE.some(r => r.test(t));
const res = { single: {}, group: {} };
for (const k of ['single', 'group']) for (const t of Object.keys(out[k]).sort()) if (keep(t) && !out[k][t].every(p => SKIP_PAGES.test(p))) res[k][t] = out[k][t];
const f = path.join(ROOT, 'collected.json');
fs.writeFileSync(f, JSON.stringify(res, null, 1));
console.log('untranslated single:', Object.keys(res.single).length, 'group:', Object.keys(res.group).length);
process.exit(Object.keys(res.single).length + Object.keys(res.group).length ? 1 : 0);
