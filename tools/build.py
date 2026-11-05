#!/usr/bin/env python3
"""Merge translations + runtime into dist/bundle.js and the Squarespace header snippet."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
rules = json.load(open(ROOT / "rules.json"))
COLS = {"nl": 1, "fr": 2, "es": 3}
SEP = " ¦ "
def rows(name):
    for n, line in enumerate(open(ROOT / "translations" / name, encoding="utf8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"): continue
        c = [x.strip() for x in line.split(" | ")]
        if len(c) != 4: raise SystemExit(f"{name}:{n} expected 4 columns, got {len(c)}: {line[:80]}")
        yield n, c
langs = {l: {"s": {}, "g": {}, "r": {}} for l in COLS}
for n, c in [r for f in sorted(p.name for p in (ROOT / "translations").glob("master*.psv")) for r in rows(f)]:
    for l, i in COLS.items():
        if "¦" in c[0]:
            a, b = c[0].split(SEP), c[i].split(SEP)
            if len(a) != len(b): raise SystemExit(f"master.psv:{n} fragment count differs for {l}: {c[0][:60]}")
            langs[l]["g"][c[0]] = b
        else:
            langs[l]["s"][c[0]] = c[i]
for line in (ROOT / "translations/keep.txt").read_text().splitlines():
    if line and not line.startswith("#"):
        for l in COLS: langs[l]["s"].setdefault(line.strip(), line.strip())
for n, c in rows("rules.psv"):
    for l, i in COLS.items(): langs[l]["r"][c[0]] = c[i]
(ROOT / "dist").mkdir(exist_ok=True)
for l, d in langs.items():
    (ROOT / f"dist/prymal-i18n-{l}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
DICT_BASE = "https://prymal-digital.github.io/prymal-i18n/prymal-i18n-"
data = json.dumps({"langs": {}, "rules": rules, "dictBase": DICT_BASE}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
runtime = (ROOT / "src/runtime.js").read_text()
css = (ROOT / "src/style.css").read_text()
js = "window.__PRYMAL_I18N__=" + data + ";\n" + runtime
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist/bundle.js").write_text(
    js + "\n(function(){var s=document.createElement('style');s.textContent="
    + json.dumps(css) + ";(document.head||document.documentElement).appendChild(s)})();\n")
snippet = "<!-- PRYMAL i18n: generated, do not edit by hand -->\n<style>" + css + "</style>\n<script>" + js + "</script>\n"
(ROOT / "dist/header-injection.html").write_text(snippet)
print("snippet bytes", len(snippet.encode()))

# Canary: installed site-wide but inert unless the browser opted in with ?i18n-preview=1
canary = ("(function(){try{if(/[?&]i18n-preview=1/.test(location.search))localStorage.setItem('prymal_preview','1');"
          "if(/[?&]i18n-preview=0/.test(location.search))localStorage.removeItem('prymal_preview');"
          "if(!localStorage.getItem('prymal_preview'))return;}catch(e){return;}\n"
          "var s=document.createElement('style');s.textContent=" + json.dumps(css) + ";document.head.appendChild(s);\n"
          + js + "\n})();")
(ROOT / "dist/header-injection-preview.html").write_text("<!-- PRYMAL i18n PREVIEW: invisible to visitors -->\n<script>" + canary + "</script>\n")

# Hosted copies, so Squarespace only ever needs a one-line <script defer src=...> tag.
(ROOT / "dist/preview.js").write_text(canary, encoding="utf8")
(ROOT / "dist/i18n.js").write_text((ROOT / "dist/bundle.js").read_text(encoding="utf8"), encoding="utf8")
