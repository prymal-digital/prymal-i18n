# PRYMAL i18n: handover for any AI agent or developer

prymal.world (Squarespace) is translated in the visitor's browser into NL, FR and ES. English is the source and default.
This repository is everything needed to change it. It works with Claude Code, Codex or by hand.

**Pushing to `main` changes the live website** within minutes. Browsers can show the old version for up to 10 minutes (Cmd + Shift + R).

## How it works
- Squarespace Settings > Developer Tools > Code Injection > Header holds one line:
  `<script defer src="https://prymal-digital.github.io/prymal-i18n/i18n.js"></script>`
- `.github/workflows/pages.yml` builds `dist/` and publishes it to GitHub Pages on every push that touches translations or the script.
- `src/runtime.js` swaps text by exact English match. Unknown text stays English, so a copy change can never show an old translation.
- English content lives in Squarespace only. Never change it from here.

## Files
- `translations/master.psv`, `translations/master-core.psv`: one row per string, `EN | NL | FR | ES`. Separator is space-pipe-space.
- `¦` marks fragments of one sentence split by formatting. Fragment counts must match in every language.
- `translations/rules.psv` + `rules.json`: strings with live numbers (plan builder, cart).
- `translations/keep.txt`: never translated (brands, people, tools, addresses).

## When Henk says the site copy changed
1. `npm ci` (first time). Needs Node 20+, Python 3 and Google Chrome.
2. `python3 tools/build.py`, then `node tools/collect.mjs`. Untranslated strings are written to `collected.json`.
3. Add rows to `translations/master-core.psv`.
4. `python3 tools/build.py`, then `LOCAL_BUNDLE=1 node tools/layout-audit.mjs` and read `layout-findings.json`:
   kinds `hit`, `over`, `btn`, `error` must be 0. Kind `wrap` is informational.
5. `npm test` must pass.
6. Look at screenshots yourself, desktop and 375px wide. Tests have missed real problems here.
7. `tools/publish.sh "message"` commits, pushes and waits for publishing (needs `gh` logged in as `prymal-digital`).

The Monday workflow `check.yml` runs the same crawl for free and opens a GitHub issue if text is missing.
It deliberately does not translate: Henk does not want AI tokens spent when nothing changed.

## Rules from Henk
- Never change English content, and nothing may conflict with the brand rules.
- Copy review scope: spoken language and bad literal translations only.
- Show old and new wording and get approval before changing already approved wording.
- Dutch uses `je`, French uses `vous`, Spanish uses `tú`.
- Keep brand and product names as they are: PRYMAL, PRYMAL Fridays, Wildflow, Coffee Rave, BIGG Fit, Starter, Growth, Premium.
- "Sober event" stays as a term in Dutch.
- Never alter prices, dates or legal meaning.
- Healing or ceremonial language belongs to Wildflow only, and Wildflow never promises an outcome. Coffee Rave stays warm and social. PRYMAL stays energetic.
- `/journal` and `/record-store-design` stay English on purpose. The homepage ticker stays English: translating it breaks its spacing.

## Squarespace traps (all found the hard way)
- Line breaks or formatting changes in English split the text differently, so they count as new text even if the words are the same. Keep the break in the same place in every language.
- Grid blocks have a fixed height for the English text. Longer text collides with the next block: prefer shorter copy, `fit()` is only a safety net.
- Some headings scale to fill their width, so shorter text gets bigger. Keep a similar length to the English.
- Highlight underlines are separate shapes positioned on resize. `redraw()` handles them.
- Dropdown labels are safe to translate: options keep their own `value`.
- Squarespace checkout, images and video are not translatable. Google only sees English: no multilingual SEO.

## Access needed
- GitHub: push access to `prymal-digital/prymal-i18n` (public repository, so never commit secrets).
- Squarespace and Google Analytics: Henk's own logins. GA property `G-KPLG33T4MQ`; custom dimension `site_language` is still to be created by Henk.

## Open items
- Legal review of translated privacy policy and terms.
- Native-speaker check of French and Spanish, starting with `/fridays`.
- Form error and thank-you messages are untested.
- Planned: migration off Squarespace. The translation tables carry over.
