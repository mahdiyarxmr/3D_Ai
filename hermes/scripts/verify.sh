#!/usr/bin/env bash
# Everything CI runs, in the order that fails fastest.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> typecheck"
npx tsc --build --force

echo "==> typescript tests"
npx vitest run

if [ -x .venv/bin/python ]; then
  echo "==> python tests"
  .venv/bin/python -m pytest -q
else
  echo "==> python tests SKIPPED (no .venv — run: python -m venv .venv && .venv/bin/pip install -r services/requirements-dev.txt)"
fi

echo "==> production build"
npm run build --silent

# The Rust crate has never been compiled; see docs/TASKS.md.
if command -v cargo >/dev/null 2>&1; then
  echo "==> cargo check"
  (cd apps/desktop/src-tauri && cargo check)
else
  echo "==> cargo SKIPPED (no Rust toolchain on this machine)"
fi

echo "OK"
