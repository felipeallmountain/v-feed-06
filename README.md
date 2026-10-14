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

`ffmpeg` (`ffmpeg-static`) and `yt-dlp` (standalone executable in `./bin/yt-dlp`) are bundled and managed automatically as project dependencies during `npm install` via the `postinstall` hook. No manual package installation (`brew` / `apt`) is required.

To manually re-verify or force-update the local `yt-dlp` binary:
```bash
npm run setup:binaries    # Verify or download yt-dlp to ./bin/
npm run update:ytdlp      # Force redownload the latest yt-dlp release
```

Add vertical MP4 files to `public/fallback-videos/` for exhibition playback. Without MP4s the app runs a procedural vertical feed so shaders and tracking can still be developed. You can generate a test video anytime (uses local `ffmpeg-static`):

```bash
npm run generate:sample
```

## Useful Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Run client (Vite on :5173) and backend (Express on :3000) concurrently |
| `npm run dev:client` | Launch Vite frontend server only |
| `npm run dev:server` | Launch Express server in watch mode |
| `npm run build` | TypeScript type-check (`tsc --noEmit`) and Vite production bundle |
| `npm start` | Run production Express server (`http://localhost:3000`) |
| `npm run kiosk` | Run Chromium in locked fullscreen kiosk mode |
| `npm run generate:sample` | Generate a synthetic vertical MP4 test video via local `ffmpeg` |
| `npm run setup:binaries` | Download/verify local standalone `yt-dlp` into `./bin/` |
| `npm run update:ytdlp` | Force-download latest standalone `yt-dlp` release into `./bin/` |
| `npm run test:perf` | Launch 8-hour soak test and FPS / memory performance monitor |
| `npm run clear:cache` | Clean temporary files, download artifacts, and expired video cache |

## YouTube API & Automated Video Ingestion

V-FEED [06] connects to the **YouTube Data API v3** to search for vertical Shorts or ingest curated playlists, downloading and optimizing them into faststart MP4 video files via `yt-dlp` in `public/fallback-videos/` with a persistent metadata manifest.

In `.env`:
- `YOUTUBE_API_KEY`: Google Cloud API Key with YouTube Data API v3 enabled.
- `YOUTUBE_PLAYLIST_ID`: (Optional) Curated playlist ID to ingest.
- `YOUTUBE_SEARCH_QUERY`: (Optional) Search query for automated discovery (default: `vertical synthwave retro shorts #shorts`).
- `YOUTUBE_MAX_VIDEOS`: Max videos to ingest per sync (default: `10`).
- `YOUTUBE_AUTO_SYNC`: Automatically sync and download on server boot (default: `true`).

## Develop

```bash
npm run dev
```

- Installation UI: http://localhost:5173  
- Operator Calibration Console: http://localhost:5173/calibration.html  
- Admin Deck: http://localhost:3000/admin  
- API: http://localhost:3000/api/playlist  

Click once to unlock audio + camera. Press `H` or `Ctrl+Shift+C` for the calibration HUD.

## Production / kiosk

```bash
npm run build
npm start          # http://localhost:3000
npm run kiosk      # Chromium fullscreen kiosk
```

The canvas fills the browser viewport as a **single continuous output signal (1080×1920 @ 60Hz)**. A video wall controller or analog splitter handles the physical 2×3 CRT matrix externally — the app does not simulate six screens in software.

## Interaction (Human Antenna & Channel Zap)

| State / Action | Visual & Audio Response |
| :--- | :--- |
| **No presence (>5s)** | Analog snow + V-Hold roll + 15.734 kHz CRT whistle |
| **Approach (3m→1m)** | RF noise drops, video signal locks in |
| **Hand in air** | Localized electromagnetic ripple at hand position on target CRT quad |
| **Fast motion** | RGB chromatic split + horizontal sync tear |
| **Signature CRT Poses** | Channel Zap navigation (`sequential`, `directional`, or `random`) with lightning body arcs, plasma sparks, and analog rotary switch audio |
| **Calibrated Matrix Mapping** | Hand presence and skeletons dynamically align to 24-point warped CRT quads |

Camera frames are processed in memory only — nothing is stored or uploaded.

## Architecture Documentation

For an in-depth, new-developer-friendly guide to the entire system architecture, see the **[Architecture Documentation Suite](./docs/architecture/README.md)**:
- [01. System Topology & End-to-End Data Flow](./docs/architecture/01-system-topology-and-dataflow.md)
- [02. Frontend Core & State Management](./docs/architecture/02-frontend-core-and-state.md)
- [03. Rendering Engine & GLSL Shader Pipeline](./docs/architecture/03-rendering-and-glsl-pipeline.md)
- [04. Computer Vision & "Human Antenna" Interaction](./docs/architecture/04-computer-vision-and-human-antenna.md)
- [05. Audio Synthesis Engine & Acoustic Design](./docs/architecture/05-audio-synthesis-engine.md)
- [06. Video Ingestion Pipeline & Server Architecture](./docs/architecture/06-video-pipeline-and-server.md)
- [07. Calibration System & Installation Control Deck](./docs/architecture/07-calibration-and-control-deck.md)
- [08. Hardware Deployment, Physical Setup & Operations](./docs/architecture/08-hardware-deployment-and-operations.md)

## Hardware notes

See [docs/prd.md](./docs/prd.md) §6 and [docs/architecture/08-hardware-deployment-and-operations.md](./docs/architecture/08-hardware-deployment-and-operations.md) for CRT rack, adapters, lighting, camera placement (1.8m height / 12° tilt), and multi-tier calibration backup. Software soak tests (8+ hours) should be run on the exhibition machine via `npm run test:perf` before opening.
