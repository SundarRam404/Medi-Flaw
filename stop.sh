#!/bin/bash
cd "$(dirname "$0")"
for p in backend website n8n; do
  [ -f logs/$p.pid ] && kill $(cat logs/$p.pid) 2>/dev/null && echo "Stopped $p"
  rm -f logs/$p.pid
done
# make sure child processes on these ports are gone too
for port in 8000 3000 5678; do
  pid=$(lsof -ti tcp:$port 2>/dev/null); [ -n "$pid" ] && kill $pid 2>/dev/null
done
echo "Done."
