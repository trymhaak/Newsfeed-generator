#!/usr/bin/env bash
# SessionStart hook — runs at the beginning of every Claude Code session
# (including Claude Code on the web). Ensures the project is in a buildable state.

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Skip if node_modules already exists and is newer than package-lock
if [ -d node_modules ] && [ node_modules -nt package.json ]; then
  echo "deps already installed" >&2
  exit 0
fi

if [ -f package-lock.json ]; then
  npm ci --silent --no-audit --no-fund 2>&1 | tail -5
else
  npm install --silent --no-audit --no-fund 2>&1 | tail -5
fi

echo "session ready" >&2
