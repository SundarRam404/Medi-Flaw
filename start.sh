#!/bin/bash
# Starts backend, website and n8n together. Stop with: ./stop.sh
cd "$(dirname "$0")"
mkdir -p logs
source .venv/bin/activate
echo "Starting backend  -> http://localhost:8000"
nohup uvicorn backend.main:app --port 8000 > logs/backend.log 2>&1 &
echo $! > logs/backend.pid
echo "Starting website  -> http://localhost:3000"
(cd frontend && nohup npm run dev > ../logs/website.log 2>&1 & echo $! > ../logs/website.pid)
echo "Starting n8n      -> http://localhost:5678"
# Use an installed n8n when there is one (starts in seconds). npx re-checks and may
# re-download n8n on every start, which can take minutes. Install once: npm install -g n8n
if command -v n8n >/dev/null 2>&1; then N8N_CMD="n8n"; else N8N_CMD="npx --yes n8n"; fi
APP_DIR="$(pwd)"
(cd ~ && N8N_RUNNERS_ENABLED=true nohup $N8N_CMD > "$APP_DIR/logs/n8n.log" 2>&1 & echo $! > "$APP_DIR/logs/n8n.pid")
sleep 8
open http://localhost:3000
echo ""
echo "All started. Logs are in the logs/ folder. Stop everything with: ./stop.sh"
