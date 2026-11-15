#!/bin/bash
# Starts only what the daily automation needs: the backend and n8n.
# No website, no browser. Safe to run any number of times: anything
# already running is left alone. Used by "Medi-Flaw automation.command" at login.
cd "$(dirname "$0")"
mkdir -p logs

if curl -s -o /dev/null --max-time 3 http://127.0.0.1:8000/api/stats; then
  echo "Backend already running   -> http://127.0.0.1:8000"
else
  source .venv/bin/activate
  nohup uvicorn backend.main:app --host 127.0.0.1 --port 8000 > logs/backend.log 2>&1 &
  echo $! > logs/backend.pid
  echo "Backend started           -> http://127.0.0.1:8000"
fi

if curl -s -o /dev/null --max-time 3 http://127.0.0.1:5678/healthz; then
  echo "n8n already running       -> http://localhost:5678"
else
  # an installed n8n starts in seconds; npx may download it first (minutes)
  if command -v n8n >/dev/null 2>&1; then N8N_CMD="n8n"; else N8N_CMD="npx --yes n8n"; fi
  APP_DIR="$(pwd)"
(cd ~ && N8N_RUNNERS_ENABLED=true nohup $N8N_CMD > "$APP_DIR/logs/n8n.log" 2>&1 & echo $! > "$APP_DIR/logs/n8n.pid")
  echo "n8n starting              -> http://localhost:5678 (give it a minute)"
fi

echo ""
echo "Medi-Flaw automation is running in the background. You can close this window."
