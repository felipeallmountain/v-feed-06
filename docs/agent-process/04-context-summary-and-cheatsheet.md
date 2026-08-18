# 04 — High-Density Context Snapshot & Developer Cheatsheet

This document provides a concise, high-density reference sheet for AI agents and human developers maintaining or extending **V-FEED [06]**.

---

## 1. Quick Start Commands

```bash
# Install dependencies
npm install

# Start Vite frontend development server (http://localhost:5173)
npm run dev

# Start Node.js Express backend server (http://localhost:3000)
npm run server

# Build production bundle and check TypeScript errors
npm run build

# Preview production build locally
npm run preview

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
│   └── agent-process/                  # AI agent work process & context documentation
│       ├── README.md                   # Directory index
│       ├── 01-agent-workflow-and-conventions.md
│       ├── 02-architecture-and-subsystem-breakdown.md
│       ├── 03-implementation-roadmap-and-decisions.md
│       └── 04-context-summary-and-cheatsheet.md
├── server/
│   ├── index.ts                        # Express server entry point (port 3000)
│   └── routes/
│       ├── admin.ts                    # Admin & HUD configuration endpoints
│       └── playlist.ts                 # YouTube Data API v3 & cache routes
├── scripts/
│   ├── kiosk.sh                        # Gallery kiosk auto-launch script
│   └── generate-sample-video.sh        # Test video generator (ffmpeg synth pattern)
├── src/
│   ├── main.ts                         # Application boot entry script
│   ├── assets/
│   │   └── styles.css                  # CSS design system, typography, & overlays
│   ├── audio/
│   │   └── AudioEngine.ts              # Web Audio synth (15.734 kHz hum & RF noise)
│   ├── core/
│   │   ├── App.ts                      # Main orchestration controller & loop
│   │   ├── StateManager.ts             # Zustand global state store (`useAppStore`)
│   │   ├── constants.ts                # Viewport & default parameter definitions
│   │   └── textureUtils.ts             # Procedural noise & test grid generators
│   ├── rendering/
│   │   ├── SceneManager.ts             # Three.js scene, renderer, & postprocessing
│   │   ├── SkeletonOverlay.ts          # Full-screen pose & hand skeleton renderer
│   │   ├── VideoTexturePass.ts         # Dynamic HTML5 Video -> WebGL texture pass
│   │   ├── MatrixSplitter.ts           # 2x3 CRT monitor matrix subdivision
│   │   ├── ProceduralFeed.ts           # Fallback procedural video generator
│   │   └── shaders/
│   │       ├── CRTShader.ts            # Barrel curvature, scanlines, phosphor grid
│   │       ├── GlitchShader.ts         # RGB split, V-Hold roll, H-Sync jitter
│   │       ├── NoiseShader.ts          # High-frequency RF white static
│   │       └── CompositeShader.ts      # Multi-pass combination shader
│   ├── ui/
│   │   ├── CalibrationHUD.ts           # lil-gui floating control HUD
│   │   └── DebugView.ts                # 2D Canvas FPS & MediaPipe skeleton overlay
│   └── vision/
│       ├── CameraManager.ts            # webcam stream controller
│       ├── MediaPipeTracker.ts         # `@mediapipe/tasks-vision` pose & hand model
│       ├── GestureMapper.ts            # Vision telemetry -> Shader uniform mapper
│       └── cameraDiagnostics.ts        # Browser security & camera probe utility
```

---

## 3. Zustand Global State Schema (`useAppStore`)

| Store Slice | Key | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `shaders` | `noiseGain` | `number` | `0.15` | Amplitude of static RF white noise `[0.0 - 1.0]`. |
| `shaders` | `vHold` | `number` | `0.0` | Vertical synchronization roll speed `[0.0 - 1.0]`. |
| `shaders` | `rgbSplit` | `number` | `2.0` | Chromatic dispersion magnitude in pixels. |
| `shaders` | `scanlineIntensity` | `number` | `0.35` | Darkness of horizontal scanline raster. |
| `shaders` | `curvature` | `number` | `0.12` | CRT glass barrel curvature coefficient. |
| `shaders` | `signalLock` | `number` | `1.0` | Tuning lock percentage `(1.0 = sharp, 0.0 = total noise)`. |
| `tracking` | `mirrorCamera` | `boolean` | `true` | Mirror camera horizontal axis for natural interaction. |
| `tracking` | `presence` | `boolean` | `false` | True when a user is detected within 3m. |
| `tracking` | `distance` | `number` | `0.0` | User proximity metric `[0.0 (far) - 1.0 (close)]`. |
| `video` | `currentSource` | `string` | `'live'` | `'live'` (YouTube), `'cache'` (local), or `'test-grid'`. |

---

## 4. Operational Troubleshooting Matrix

| Issue / Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| **Black screen with "Camera unavailable" message** | Browser permission blocked or running inside non-HTTPS / embedded preview iframe. | Click `#allow-camera` retry button, inspect diagnostic text in `#boot-diag`, or open directly in Chrome via `http://localhost:5173`. |
| **No audio hum or static sound** | Web Audio Autoplay restrictions in browser. | Sound context unlocks automatically upon clicking the `#allow-camera` button in `App.ts`. |
| **YouTube videos fail to load** | Missing or invalid `YOUTUBE_API_KEY` or offline network state. | Server automatically serves local fallback files from `/public/fallback-videos/`. Set key in `.env`. |
| **Lines misaligned across CRT monitor bezels** | Physical monitor spacing or plastic bezels cutting off frame. | Open HUD (`H` key or `Ctrl+Shift+C`), adjust Virtual Bezel Compensation X/Y offsets, and save config. |
