#!/bin/bash
# Double-click this file in Finder to start Reseller Autopost.
# It frees port 3000 first — the old app grabbing it was a long-running
# source of "my changes aren't showing up" confusion — then updates,
# starts the server, and opens the page.

cd "$(dirname "$0")" || exit 1

echo "Reseller Autopost"
echo "================="

echo "→ freeing port 3000…"
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

echo "→ updating…"
git pull -q 2>/dev/null || echo "  (skipped — no network or local changes)"

if [ ! -d node_modules ]; then
  echo "→ installing dependencies (first run, may take a minute)…"
  npm install --silent
fi

if [ ! -f .env ]; then
  echo "→ creating .env from the example…"
  cp .env.example .env
fi

echo "→ checking connections…"
npm run --silent check

echo
echo "→ starting… the page will open in your browser shortly."
echo "  Leave this window open. Close it to stop the app."
echo

( sleep 3; open "http://127.0.0.1:3000" ) &
npm start
