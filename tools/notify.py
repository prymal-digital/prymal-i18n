#!/usr/bin/env python3
"""Keep one GitHub issue in step with collected.json. A new issue emails the repo owner.
No Claude tokens are used here: translating only happens when someone asks for it."""
import json, os, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
TITLE = "New website text needs translating"


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout.strip()


data = json.load(open(ROOT / "collected.json", encoding="utf8"))
missing = data["single"]
test = os.environ.get("TEST_NOTICE") == "true"
issues = json.loads(gh("issue", "list", "--state", "open", "--json", "number,title"))
number = next((i["number"] for i in issues if i["title"] == TITLE), None)

if not missing and not test:
    if number:
        gh("issue", "close", str(number), "--comment", "All website text is translated again.")
    print("nothing to translate")
    raise SystemExit

lines = [f"- `{t[:100]}` ({paths[0]})" for t, paths in list(missing.items())[:40]]
if test:
    lines.append("- Test notice: if you got this by email, the alert works. Nothing needs translating.")
body = (f"{len(missing)} piece(s) of text on prymal.world have no translation yet, so they show in English.\n\n"
        + "\n".join(lines)
        + "\n\nAsk Claude to update the translations in this repository.")
if number:
    gh("issue", "edit", str(number), "--body", body)  # silent: no repeat email every week
else:
    print(gh("issue", "create", "--title", TITLE, "--body", body, "--assignee", "prymal-digital"))
