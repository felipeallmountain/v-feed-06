#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

if [[ ! -d dist ]]; then
  echo "[kiosk] building…"
  npm run build
fi

# Start production server in background if not already up
if ! curl -sf "${URL}/api/health" >/dev/null 2>&1; then
  echo "[kiosk] starting server on :${PORT}"
  NODE_ENV=production npm start &
  SERVER_PID=$!
  trap 'kill ${SERVER_PID} 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    if curl -sf "${URL}/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
fi

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "google-chrome" \
  "chromium" \
  "chromium-browser"; do
  if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then
    CHROME="$c"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "[kiosk] Chrome/Chromium not found. Open ${URL} manually in kiosk mode."
  exit 1
fi

echo "[kiosk] launching ${CHROME} → ${URL}"
exec "$CHROME" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  "${URL}"
