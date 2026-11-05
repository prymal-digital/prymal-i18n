# PRYMAL i18n

Client-side EN/NL/FR/ES translation for prymal.world (Squarespace). No subscription, no visitor-time API calls.

## How it fits together
- A small script in Squarespace Code Injection picks the language and shows the globe dropdown.
- Three dictionary files (about 85 KB each) are published by GitHub Pages at `prymal-digital.github.io/prymal-i18n`. Only the visitor's language is downloaded. English visitors download none.
- The English content in Squarespace stays the source. The script swaps text in the visitor's browser only.

## Files
- `translations/master.psv`, `translations/master-core.psv`: the translations, one row per string: `EN | NL | FR | ES`. `¦` marks fragments of one sentence.
- `translations/rules.psv` + `rules.json`: sentences containing live numbers (plan builder, cart).
- `translations/keep.txt`: never translated (brand, people, tools, addresses).
- `src/`: runtime and switcher styles.
- `dist/header-injection-preview.html`: inert for visitors, for testing on real Squarespace.
- `dist/header-injection.html`: the live version.
- `dist/prymal-i18n-*.json`: the dictionaries.

## Install (once)
1. In Settings > Developer Tools > Code Injection > Header, paste:
   `<script defer src="https://prymal-digital.github.io/prymal-i18n/preview.js"></script>`
2. Open `https://www.prymal.world/?i18n-preview=1` in your own browser. `?i18n-preview=0` turns it off. `?lang=nl` forces a language.
3. To go live for everyone, change `preview.js` to `i18n.js` in that line.

`defer` means the site never waits for GitHub: if GitHub is down, the site stays in English.

## When site copy changes
Translations match the exact English text. A changed sentence shows in English until it is translated, never as an outdated translation.

1. Every Monday `.github/workflows/check.yml` crawls the sitemap pages for free on GitHub and commits untranslated strings to `collected.json`.
2. If anything is missing, `tools/notify.py` opens one GitHub issue, which emails the owner. No Claude tokens are used so far.
3. Ask Claude to update the translations: add rows to `translations/master-core.psv`, run `npm run build` and `npm test`, push.
4. `.github/workflows/pages.yml` publishes the new dictionaries. Squarespace needs no change.

`/journal` and `/record-store-design` are skipped on purpose (`SKIP_PAGES` in `tools/collect.mjs`).

## Known limits
- `/privacy-policy` and `/terms-conditions` are translated in Dutch only. French and Spanish stay English until reviewed: see `LEGAL` in `src/runtime.js`.
- No SEO value: search engines see English only. No hreflang, no translated URLs or metadata.
- Squarespace checkout runs outside this script and stays in Squarespace's language.
- Social captions and text inside images or videos stay in English.
- Form answers from dropdowns may arrive in the visitor's language.
