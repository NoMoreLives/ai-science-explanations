#!/usr/bin/env bash
# Push committed changes on main to GitHub; the Pages workflow deploys site/.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "On '$branch', not main. Switch to main first." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes present (they won't be published):"
  git status --short
  read -r -p "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

git fetch -q origin main
if [ -z "$(git log origin/main..main --oneline)" ]; then
  echo "Nothing new to publish."
  exit 0
fi

echo "Publishing:"
git log origin/main..main --oneline
git push origin main

echo "Waiting for deploy..."
sleep 5
gh run watch "$(gh run list --workflow pages.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
echo "Live: https://nomorelives.github.io/ai-science-explanations/"
