#!/usr/bin/env bash
# eval setup: a working copy of the repo in the workspace (shared script one level up)
exec bash "$(dirname "${BASH_SOURCE[0]}")/../scaffold.sh"
