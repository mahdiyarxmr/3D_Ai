#!/usr/bin/env bash
#
# Start the dev preview from a cold sandbox.
#
# node_modules/ is excluded from workspace snapshots and the local git history
# can roll back between sessions, while the working tree on disk survives. This
# script restores whichever of those is missing and then serves the app.
#
# It is deliberately conservative: it will NOT reset the branch unless the
# working tree is byte-identical to what is already pushed, so it can never
# throw away uncommitted work.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="arena/01a0de47-3d-ai"

if command -v git >/dev/null && git rev-parse --git-dir >/dev/null 2>&1; then
  if git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    remote="$(git rev-parse FETCH_HEAD)"
    if [ "$(git rev-parse HEAD)" != "$remote" ]; then
      git add -A >/dev/null 2>&1 || true
      if git diff --quiet --cached FETCH_HEAD 2>/dev/null; then
        echo "==> local history rolled back; working tree matches $BRANCH, restoring pointer"
        git reset --hard "$remote" --quiet
      else
        echo "==> WARNING: working tree differs from origin/$BRANCH — leaving history alone."
        echo "    Review with: git diff --cached FETCH_HEAD"
        git reset --quiet
      fi
    fi
  fi
fi

if [ ! -x node_modules/.bin/vite ]; then
  echo "==> node_modules missing (excluded from snapshots), installing"
  npm install --no-audit --no-fund
fi

echo "==> starting Vite on 0.0.0.0:5173"
exec npm run dev
