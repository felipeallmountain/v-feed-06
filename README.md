# V-FEED [06]

Interactive transmedia CRT installation — YouTube Shorts / local vertical video through a full-viewport WebGL CRT pipeline, driven by MediaPipe body tracking (human antenna).

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
npm run kiosk      # Chromium fullscreen kiosk
```

The canvas fills the browser viewport as a **single continuous output signal**. A video wall controller or analog splitter handles the physical 2×3 CRT matrix externally — the app does not simulate six screens in software.

## Interaction (Human Antenna)

| State | Visual |
| :--- | :--- |
| No presence (>5s) | Analog snow + V-Hold roll |
| Approach 3m→1m | Noise drops, signal locks |
| Hand in air | Localized ripple at hand position |
| Fast motion | RGB split + horizontal tear |

Camera frames are processed in memory only — nothing is stored or uploaded.

## Hardware notes

See [docs/prd.md](docs/prd.md) §6 for CRT rack, adapters, lighting, and camera placement. Software soak tests (8+ hours) should be run on the exhibition machine before opening.
