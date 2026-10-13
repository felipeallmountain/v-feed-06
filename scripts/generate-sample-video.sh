#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/fallback-videos/sample-short.mp4"

mkdir -p "$(dirname "$OUT")"

FFMPEG_BIN="ffmpeg"
if ! command -v ffmpeg >/dev/null 2>&1; then
  if [[ -x "$ROOT/node_modules/ffmpeg-static/ffmpeg" ]]; then
    FFMPEG_BIN="$ROOT/node_modules/ffmpeg-static/ffmpeg"
  else
    echo "[sample] ffmpeg not found in PATH or node_modules/ffmpeg-static. Run 'npm install' or install ffmpeg."
    exit 1
  fi
fi

# 9:16 vertical color bars + tone, 8 seconds, H.264
"$FFMPEG_BIN" -y -f lavfi -i "smptebars=size=1080x1920:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT"

echo "[sample] wrote $OUT"
