# V-FEED [06]

Interactive transmedia CRT installation — YouTube Shorts / local vertical video through a 1080×1920 WebGL CRT pipeline, driven by MediaPipe body tracking (human antenna).

## Stack

- Vite + TypeScript + Three.js (GLSL CRT / glitch / noise)
- `@mediapipe/tasks-vision` (pose + hands)
- Zustand, lil-gui, Web Audio API
- Express server (playlist, cache, `/admin`)

## Setup

```bash
npm install
cp .env.example .env
```

Add vertical MP4 files to `public/fallback-videos/` for exhibition playback. Without MP4s the app runs a procedural vertical feed so shaders and tracking can still be developed. With `ffmpeg` installed:

```bash
npm run generate:sample
```

Optional `.env`:

- `YOUTUBE_API_KEY` / `YOUTUBE_PLAYLIST_ID` — metadata listing only; on-site playback should use the local cache (or a future yt-dlp ingest job).

## Develop

```bash
npm run dev
```

- Installation UI: http://localhost:5173  
- Admin: http://localhost:3000/admin  
- API: http://localhost:3000/api/playlist  

Click once to unlock audio + camera. Press `H` or `Ctrl+Shift+C` for the calibration HUD.

## Production / kiosk

```bash
npm run build
npm start          # http://localhost:3000
npm run kiosk      # Chromium --kiosk at 1080×1920
```

Output canvas is **1080×1920** (2×3 cells of 540×640). Use a video wall controller / multi-HDMI layout to map the extended desktop onto six CRTs. Tune **Bezel compensation** in the HUD so motion bridges physical frames.

## Interaction (Human Antenna)

| State | Visual |
| :--- | :--- |
| No presence (>5s) | Analog snow + V-Hold roll |
| Approach 3m→1m | Noise drops, signal locks |
| Hand in air | Localized ripple on corresponding CRT cell |
| Fast motion | RGB split + horizontal tear |

Camera frames are processed in memory only — nothing is stored or uploaded.

## Hardware notes

See [docs/prd.md](docs/prd.md) §6 for CRT rack, adapters, lighting, and camera placement. Software soak tests (8+ hours) should be run on the exhibition machine before opening.
