#!/usr/bin/env bash
# Idempotent project setup: install dependencies (only if missing) and seed the
# database (only if absent). Safe to run on every session start.
set -euo pipefail
cd "$(dirname "$0")/.."

need_install=0
[ -d node_modules ] || need_install=1
[ -d server/node_modules ] || need_install=1
[ -d client/node_modules ] || need_install=1

if [ "$need_install" -eq 1 ]; then
  echo "[setup] installing dependencies…"
  npm install --silent
  npm --prefix server install --silent
  npm --prefix client install --silent
else
  echo "[setup] dependencies present"
fi

if [ ! -f server/data/scheduler.db ]; then
  echo "[setup] seeding database…"
  npm --prefix server run seed --silent || true
else
  echo "[setup] database present"
fi

echo "[setup] ready — 'npm run dev' to start"
