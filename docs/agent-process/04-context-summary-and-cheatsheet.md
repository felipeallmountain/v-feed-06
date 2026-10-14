# 04 — High-Density Context Snapshot & Developer Cheatsheet

This document provides a concise, high-density reference sheet for AI agents and human developers maintaining or extending **V-FEED [06]**.

---

## 1. Quick Start Commands

```bash
# Install dependencies & auto-download local yt-dlp binary
npm install

# Start development environment (Vite client :5173 + Express backend :3000 concurrently)
npm run dev

# Start frontend client only
npm run dev:client

# Start backend server only in watch mode
npm run dev:server

# Build production bundle and check TypeScript errors
npm run build

# Start production server
npm start

# Verify or force-update local media binaries
npm run setup:binaries
npm run update:ytdlp

# Generate a synthetic vertical MP4 test video via bundled ffmpeg
npm run generate:sample

# Run 8-hour soak test & real-time telemetry benchmark
npm run test:perf

# Clean temporary cache and download artifacts
npm run clear:cache

# Execute Kiosk Mode runner script
./scripts/kiosk.sh
```

---

## 2. Directory & Component Quick Reference

```
/v-feed-06
├── agent-plan.md                       # High-level PRD summary & technology matrix
├── docs/
│   ├── prd.md                          # Full Product Requirements Document (PRD)
│   ├── propuesta.md                    # Original Spanish artistic concept & proposal
│   ├── architecture/                   # Comprehensive 8-part architecture documentation suite
│   └── agent-process/                  # AI agent work process & context documentation
│       ├── README.md                   # Directory index
│       ├── 01-agent-workflow-and-conventions.md
│       ├── 02-architecture-and-subsystem-breakdown.md
│       ├── 03-implementation-roadmap-and-decisions.md
│       └── 04-context-summary-and-cheatsheet.md
├── bin/                                # Local standalone binaries (git-ignored)
│   └── yt-dlp                          # Executable downloaded via scripts/setup-binaries.ts
├── server/
│   ├── index.ts                        # Express server entry point (port 3000)
│   ├── routes/
│   │   ├── admin.ts                    # Admin deck API & telemetry endpoints
│   │   └── playlist.ts                 # Video catalog, manifest, & quota routes
│   └── services/
│       ├── MediaBinaries.ts            # ffmpeg-static + ./bin/yt-dlp resolver & env merger
│       ├── VideoIngestService.ts       # Automated YouTube Shorts download & MP4 transcoder
│       ├── QuotaGuard.ts               # YouTube Data API v3 daily quota enforcement
│       ├── PerformanceTracker.ts       # Memory, FPS, and process metrics tracker
│       └── YouTubeDataService.ts       # Google YouTube API client
├── scripts/
│   ├── kiosk.sh                        # Gallery kiosk auto-launch script
│   ├── setup-binaries.ts               # Automated yt-dlp download & verification script
│   ├── generate-sample-video.sh        # Test video generator (ffmpeg synth pattern)
│   ├── perf-test.ts                    # 8-hour continuous soak test runner
│   └── clear-cache.ts                  # Cache cleaner
├── src/
│   ├── main.ts                         # Application boot entry script
│   ├── assets/
│   │   └── styles.css                  # CSS design system, typography, & overlays
│   ├── audio/
│   │   └── AudioEngine.ts              # Web Audio synth (15.734 kHz hum, RF noise, rotary zap)
│   ├── core/
│   │   ├── App.ts                      # Main orchestration controller & loop
│   │   ├── StateManager.ts             # Zustand global state store (`useAppStore`)
│   │   ├── CalibrationManager.ts       # Multi-tier calibration serializer (disk, localStorage)
│   │   ├── SyncChannel.ts              # BroadcastChannel cross-window IPC
│   │   ├── constants.ts                # Viewport & default parameter definitions
│   │   └── textureUtils.ts             # Procedural noise & test grid generators
│   ├── rendering/
│   │   ├── SceneManager.ts             # Three.js scene, renderer, & postprocessing
│   │   ├── SkeletonOverlay.ts          # Calibrated joint graph, pose reticles, lightning zap arcs
│   │   ├── VideoTexturePass.ts         # Dynamic HTML5 Video -> WebGL texture pass
│   │   ├── MatrixSplitter.ts           # 2x3 CRT matrix quads (computeCalibratedScreenQuads)
│   │   ├── ProceduralFeed.ts           # Fallback procedural video generator
│   │   └── shaders/
│   │       ├── CRTShader.ts            # Barrel curvature, scanlines, phosphor grid
│   │       ├── GlitchShader.ts         # RGB split, V-Hold roll, H-Sync jitter
│   │       ├── NoiseShader.ts          # High-frequency RF white static & hand ripple
│   │       └── CompositeShader.ts      # Multi-pass combination shader with invBilinear
│   ├── ui/
│   │   ├── CalibrationConsole.ts       # lil-gui floating HUD & standalone console
│   │   └── DebugView.ts                # 2D Canvas FPS & calibrated matrix screen quads
│   └── vision/
│       ├── CameraManager.ts            # WebRTC stream controller (0°, 90°, 180°, 270°)
│       ├── MediaPipeTracker.ts         # `@mediapipe/tasks-vision` pose & hand model
│       ├── FeatureExtractor.ts         # Crowd density, proximity, kinetics, signature poses
│       ├── InteractionController.ts    # Decision ladder, pose zap triggers, query debouncer
│       ├── BroadcastQuerySynthesizer.ts# YouTube Shorts query synthesis
│       ├── GestureMapper.ts            # Calibrated quad containment -> shader uniform mapper
│       └── cameraDiagnostics.ts        # Browser security & camera probe utility
```

---

## 3. Zustand Global State Schema (`useAppStore`)

| Store Slice | Key | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `shaders` | `matrixSplit` | `boolean` | `true` | Toggles 2×3 physical CRT matrix vs single flat screen. |
| `shaders` | `noiseGain` | `number` | `0.15` | Amplitude of static RF white noise `[0.0 - 1.0]`. |
| `shaders` | `vHold` | `number` | `0.0` | Vertical synchronization roll speed `[0.0 - 1.0]`. |
| `shaders` | `rgbSplit` | `number` | `2.0` | Chromatic dispersion magnitude in pixels. |
| `shaders` | `scanlineIntensity` | `number` | `0.35` | Darkness of horizontal scanline raster. |
| `shaders` | `curvature` | `number` | `0.12` | CRT glass barrel curvature coefficient. |
| `shaders` | `signalLock` | `number` | `1.0` | Tuning lock percentage `(1.0 = sharp, 0.0 = total noise)`. |
| `shaders` | `cornerOffsets` | `ScreenCornerOffsets[]` | `0.0` | 24-point (4 corners × 6 monitors) keystone offsets. |
| `tracking` | `mirrorCamera` | `boolean` | `true` | Mirror camera horizontal axis for natural interaction. |
| `tracking` | `cameraRotation` | `number` | `0` | Orientation rotation `0 | 90 | 180 | 270` degrees. |
| `tracking` | `presence` | `boolean` | `false` | True when a user is detected within 3m. |
| `tracking` | `distance` | `number` | `0.0` | User proximity metric in meters. |
| `interaction` | `enabled` | `boolean` | `true` | Master toggle for algorithmic interaction. |
| `interaction` | `zapEnabled` | `boolean` | `true` | Toggles instant pose-based channel switching. |
| `interaction` | `zapNavMode` | `string` | `'sequential'` | Channel navigation mode: `'sequential' \| 'directional' \| 'random'`. |
| `interaction` | `zapHoldDurationMs` | `number` | `1200` | Required hold duration for pose zap trigger (ms). |
| `interaction` | `zapCooldownSec` | `number` | `2` | Cooldown period between channel zaps (sec). |
| `interaction` | `holdDurationMs` | `number` | `1800` | Required hold duration for ambient query trigger (ms). |
| `interaction` | `cooldownDurationSec`| `number`| `10` | Cooldown period after query synthesis (sec). |
| `frames` | `show` | `boolean` | `true` | Master toggle for screen frame and HUD overlays. |
| `frames` | `shapeStyle` | `string` | `'crt-tube'` | Frame silhouette: `'crt-tube' \| 'bracket-corners' \| ...`. |
| `video` | `videoMode` | `string` | `'live'` | Playback source: `'live'`, `'cache'`, or `'grid'`. |

---

## 4. Operational Troubleshooting Matrix

| Issue / Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| **Black screen with "Camera unavailable" message** | Browser permission blocked or running inside non-HTTPS / embedded preview iframe. | Click `#allow-camera` retry button, inspect diagnostic text in `#boot-diag`, or open directly in Chrome via `http://localhost:5173`. |
| **No audio hum or static sound** | Web Audio Autoplay restrictions in browser. | Sound context unlocks automatically upon clicking the `#allow-camera` button in `App.ts`. |
| **Missing or broken media tools (`yt-dlp` / `ffmpeg`)** | Standalone `./bin/yt-dlp` missing or `ffmpeg-static` unlinked. | Run `npm run setup:binaries` (or `npm run update:ytdlp --force`) and verify `ffmpeg-static` in `node_modules`. |
| **YouTube videos fail to load** | Missing or invalid `YOUTUBE_API_KEY` or offline network state. | Server automatically serves local fallback files from `/public/fallback-videos/`. Set key in `.env`. |
| **Lines misaligned across CRT monitor bezels** | Physical monitor spacing, rotation, or analog tube keystone distortion. | Open Calibration Console (`H` or `/calibration.html`), adjust 24-point corner quads, rotations, and save to server. |
