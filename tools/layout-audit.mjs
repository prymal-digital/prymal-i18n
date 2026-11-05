// Finds text blocks that collide or overflow once translated, compared with English.
// Runs on the live site in preview mode. Publishes nothing.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.prymal.world';
const SKIP = /^\/(journal|record-store-design)/;
const pages = [...new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'sitemap_paths.json'), 'utf8')).filter(p => !SKIP.test(p)))];
const WIDTHS = [1440, 1024, 375];
const LOCAL = process.env.LOCAL_BUNDLE ? fs.readFileSync(path.join(ROOT, 'dist/i18n.js'), 'utf8') : null;

const measure = () => {
  const blocks = [...document.querySelectorAll('.fe-block')].filter(b => b.offsetHeight > 0 && (b.innerText || '').trim().length > 1 && !b.querySelector('.prymal-builder, .marquee-block') && b.querySelector('.sqs-html-content, .sqs-block-button-element, h1, h2, h3, h4, p'));
  const box = b => {
    const c = b.querySelector('.sqs-html-content') || b.querySelector('.sqs-block-button-element') || b;
    const r = document.createRange(); r.selectNodeContents(c);
    const t = r.getBoundingClientRect();
    return { top: t.top + scrollY, bottom: t.bottom + scrollY, left: t.left, right: t.right, blockBottom: b.getBoundingClientRect().bottom + scrollY, id: (b.className.match(/fe-block-[\w-]+/) || [b.id])[0], text: b.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) };
  };
  const bs = blocks.map(box), out = {};
  blocks.forEach(b => b.querySelectorAll('h1,h2,h3').forEach((h, i) => {
    const s = getComputedStyle(h), fs = parseFloat(s.fontSize); if (fs < 30) return;
    const lh = parseFloat(s.lineHeight) || fs * 1.2, r = document.createRange(); r.selectNodeContents(h);
    out['wrap:' + (b.className.match(/fe-block-[\w-]+/) || [b.id])[0] + ':' + i] = { px: Math.round(r.getBoundingClientRect().height / lh), text: Math.round(fs) + 'px: ' + h.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) };
  }));
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    if (a.bottom - a.blockBottom > 4) out['over:' + a.id] = { px: Math.round(a.bottom - a.blockBottom), text: a.text };
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j];
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (h > 4 && w > 20) out['hit:' + a.id + ':' + b.id] = { px: Math.round(h), text: a.text + ' ⇄ ' + b.text };
    }
  }
  return out;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const findings = [];
async function pageRun(w, p) {
  const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
  await ctx.route(/google-analytics|googletagmanager|facebook|doubleclick|hotjar/, r => r.abort());
  if (LOCAL) await ctx.route(/prymal-i18n\/preview\.js/, r => r.fulfill({ body: LOCAL, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (LOCAL) await ctx.route(/prymal-i18n-\w+\.json$/, r => r.fulfill({ path: path.join(ROOT, 'dist', /(prymal-i18n-\w+\.json)$/.exec(r.request().url())[1]), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('prymal_preview', '1'); } catch (e) {} });
  const g = await ctx.newPage();
  try {
    await g.goto(BASE + p, { waitUntil: 'load', timeout: 45000 });
    await g.waitForTimeout(1500);
    await g.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 900) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
    const en = await g.evaluate(measure);
    for (const l of ['nl', 'fr', 'es']) {
      await g.evaluate(l => window.__prymalI18n.setLang(l), l);
      await g.waitForTimeout(700);
      const now = await g.evaluate(measure);
      for (const [k, v] of Object.entries(now)) {
        const base = en[k];
        if (k.startsWith('wrap:') ? (base && v.px > base.px) : (!base || v.px > base.px + 4)) findings.push({ page: p, width: w, lang: l, kind: k.split(':')[0], px: v.px, text: v.text });
      }
    }
  } catch (e) { findings.push({ page: p, width: w, lang: '-', kind: 'error', px: 0, text: e.message.slice(0, 80) }); }
  await ctx.close();
}
const jobs = WIDTHS.flatMap(w => pages.map(p => [w, p]));
await Promise.all(Array.from({ length: 4 }, async () => { while (jobs.length) { const [w, p] = jobs.shift(); await pageRun(w, p); } }));
await browser.close();
findings.sort((a, b) => b.px - a.px);
fs.writeFileSync(path.join(ROOT, 'layout-findings.json'), JSON.stringify(findings, null, 1));
console.log('findings', findings.length, 'errors', findings.filter(f => f.kind === 'error').length);
const by = {}; for (const f of findings) { const k = f.page + ' ' + f.width; by[k] = (by[k] || 0) + 1; }
console.log(by);
for (const f of findings.slice(0, 70)) console.log(f.page, f.width, f.lang, f.kind, f.px + 'px', f.text.slice(0, 95));
