#!/usr/bin/env bash
# Eval setup: give the agent a working copy of the 8bit-science repo (engine, scenes, scripts, docs) in its workspace,
# so a new scene can be built on the real shared engine. Runs in the case's fresh workspace (the current directory).
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
[ -f "$repo/site/engine/engine.js" ] || { echo "repo not found from $repo" >&2; exit 1; }
mkdir -p 8bit-science
cp -R "$repo/site" "$repo/scripts" "$repo/package.json" "$repo/README.md" "$repo/CLAUDE.md" 8bit-science/
[ -d "$repo/node_modules" ] && ln -s "$repo/node_modules" 8bit-science/node_modules
echo "scaffolded 8bit-science/ from $repo"
