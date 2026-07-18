#!/bin/bash
# Reliable, non-interactive local Jekyll server launcher
# Usage: dev/serve.sh [start|stop]
#
# - start (default): Kill any stale process on 4000, start fresh jekyll serve in naponline-jekyll container, poll until ready
# - stop: Kill the jekyll process cleanly

set -e

REPO_PATH="/var/home/napalm/git/naponline.github.io"
CONTAINER="naponline-jekyll"
PORT="4000"
LOG_FILE="/tmp/jekyll-serve.log"
READY_TIMEOUT_SEC=30

command="${1:-start}"

if [ "$command" = "stop" ]; then
  echo "Stopping jekyll serve..."
  podman exec --user napalm "$CONTAINER" bash -lc "pkill -f 'jekyll serve' || true" 2>/dev/null || true
  echo "✓ Stopped (or was not running)"
  exit 0
fi

if [ "$command" != "start" ]; then
  echo "Usage: $0 [start|stop]"
  exit 1
fi

echo "Starting jekyll serve on port $PORT..."

# Kill any existing process on the port (be specific: only jekyll or http.server, never a blind kill)
if lsof -i ":$PORT" 2>/dev/null | grep -E "jekyll|http.server" > /dev/null; then
  PID=$(lsof -i ":$PORT" 2>/dev/null | grep -E "jekyll|http.server" | awk '{print $2}' | head -1)
  if [ -n "$PID" ]; then
    echo "  Found existing process on port $PORT (PID $PID), killing..."
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

# Start jekyll serve detached in the container
echo "  Launching 'bundle exec jekyll serve --host 0.0.0.0 --port $PORT' inside container..."
podman exec -d --user napalm -w "$REPO_PATH" "$CONTAINER" \
  bash -lc 'eval "$(rbenv init - bash)" && exec bundle exec jekyll serve --host 0.0.0.0 --port '"$PORT"' > '"$LOG_FILE"' 2>&1' \
  || { echo "✗ Failed to start jekyll in container"; exit 1; }

# Poll until ready (up to READY_TIMEOUT_SEC)
echo "  Polling for server readiness (timeout: ${READY_TIMEOUT_SEC}s)..."
elapsed=0
while [ $elapsed -lt "$READY_TIMEOUT_SEC" ]; do
  if curl -sf "http://127.0.0.1:$PORT/" > /dev/null 2>&1; then
    echo "✓ Server ready at http://127.0.0.1:$PORT/"
    exit 0
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

echo "✗ Server did not respond after ${READY_TIMEOUT_SEC}s"
echo "  Last few lines from $LOG_FILE:"
tail -10 "$LOG_FILE" | sed 's/^/    /'
exit 1
