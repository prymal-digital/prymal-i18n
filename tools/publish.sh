#!/bin/bash
# Commit, push and wait until GitHub Pages has published. Usage: tools/publish.sh "message"
set -u
cd "$(dirname "$0")/.."
python3 tools/build.py
git add -A
printf '%s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' "$1" | git commit -q -F -
git pull -q --rebase origin main
git push -q
SHA=$(git rev-parse HEAD)
REPO=prymal-digital/prymal-i18n
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  RID=$(gh run list --repo "$REPO" --workflow pages.yml --commit "$SHA" --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$RID" ] && break
  python3 -c 'import time; time.sleep(3)'
done
gh run watch "$RID" --repo "$REPO" --exit-status > /dev/null 2>&1
echo "publish exit=$?"
