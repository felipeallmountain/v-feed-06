#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/fallback-videos/sample-short.mp4"

mkdir -p "$(dirname "$OUT")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[sample] ffmpeg not found. Install ffmpeg or copy vertical MP4s into public/fallback-videos/"
  exit 1
fi

# 9:16 vertical color bars + tone, 8 seconds, H.264
ffmpeg -y -f lavfi -i "smptebars=size=1080x1920:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT"

echo "[sample] wrote $OUT"
