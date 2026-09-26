# V-FEED [06] — Architecture Documentation

Welcome to the comprehensive architecture documentation for **V-FEED [06]**. This guide is designed to give new developers, creative technologists, and system operators a thorough, intuitive, and complete understanding of how the system works—from the hardware totem and computer vision algorithms to the real-time GLSL shader pipeline and automated video ingestion backend.

---

## 1. What is V-FEED [06]?

**V-FEED [06]** is an interactive transmedia art installation that channels algorithmic vertical video content (YouTube Shorts / local vintage archives) through a simulated analog broadcast transmission pipeline.

The physical installation consists of a vertical totem of **6 Cathode Ray Tube (CRT) monitors arranged in a 2×3 matrix** (2 columns × 3 rows). 

```
               [ CAMERA / MEDIAPIPE OPTICAL SENSOR ]
                                 │
     ┌───────────────────────────┴───────────────────────────┐
     │                     2×3 CRT TOTEM                     │
     │                                                       │
     │        ┌──────────────────┐   ┌──────────────────┐    │
     │        │      CRT 01      │   │      CRT 02      │    │
     │        │    (Top-Left)    │   │   (Top-Right)    │    │
     │        └──────────────────┘   └──────────────────┘    │
     │        ┌──────────────────┐   ┌──────────────────┐    │
     │        │      CRT 03      │   │      CRT 04      │    │
     │        │    (Mid-Left)    │   │   (Mid-Right)    │    │
     │        └──────────────────┘   └──────────────────┘    │
     │        ┌──────────────────┐   ┌──────────────────┐    │
     │        │      CRT 05      │   │      CRT 06      │    │
     │        │    (Bot-Left)    │   │   (Bot-Right)    │    │
     │        └──────────────────┘   └──────────────────┘    │
     └───────────────────────────────────────────────────────┘
                                 ▲
                     [ 1080×1920 EXTENDED CANVAS ]
                                 │
                 [ SINGLE-PASS GLSL SHADER PIPELINE ]
                                 ▲
              [ WEBCAM TRACKING + HUMAN ANTENNA ENGINE ]
```

### The "Human Antenna" Core Concept
In vintage television, an analog antenna required physical alignment to resolve radio-frequency static into a clear television image. In V-FEED [06], **the spectator's physical body is the antenna**:
- **No Spectator Present (> 5s)**: The signal loses synchronization. The screens fall into heavy analog snow, RF static noise, and a vertical hold (V-Hold) frame roll.
- **Spectator Approaching (3m → 1m)**: As the spectator walks closer, their presence acts as an antenna capacitor. Static dissipates, audio filters open, and the broadcast locks cleanly into focus.
- **Hand Interference**: Raising a hand into the air directs localized electromagnetic ripple distortions to that specific monitor in 3D space.
- **Fast Movement / Kinetic Bursts**: Rapid jumping, dancing, or waving induces chromatic RGB splitting and horizontal sync jitter tearing across the phosphor grid.
- **Sustained Postures & Semantics**: Posing with rabbit-ear antenna arms, wingsuit spreads, or surprise gestures algorithmically synthesizes and cues tailored archival broadcast video queries.

---

## 2. Technology Stack at a Glance

| Layer | Technologies | Key Responsibilities |
| :--- | :--- | :--- |
| **Frontend Runtime** | [Vite 6](https://vitejs.dev/) + [TypeScript 5](https://www.typescriptlang.org/) | Native ESM dev server, instant HMR, strict type checking, production bundling. |
| **Graphics Engine** | [Three.js 0.172](https://threejs.org/) + Custom GLSL Shaders | Single-pass 1080×1920 rendering, 2×3 matrix viewport partitioning, CRT curvature, scanlines, phosphor triads, keystone quad warping. |
| **Computer Vision** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | Real-time body pose and hand landmark tracking running on GPU/WebAssembly at 60 FPS. |
| **Reactive State** | [Zustand 5 (Vanilla Store)](https://github.com/pmndrs/zustand) | Centralized, reactive state store (`useAppStore`) driving shader uniforms, tracking metrics, and audio levels without UI framework overhead. |
| **Sound Synthesis** | Web Audio API | Procedural white/pink static noise generator, 15.734 kHz NTSC flyback transformer whine, dynamic lowpass filtering. |
| **Cross-Window IPC** | `BroadcastChannel` API + `localStorage` | Zero-latency bidirectional communication between Main Stage (`/`), Calibration Console (`/calibration.html`), and Admin (`/admin`). |
| **Backend & Ingestion** | Node.js (v20+) + Express 4 + `yt-dlp` + `ffmpeg` | Automated YouTube Shorts discovery, daily API quota tracking (`QuotaGuard`), faststart MP4 transcoding, local cache management. |
| **Calibration GUI** | `lil-gui 0.20` + Custom Canvas Visualizer | Real-time on-site operator HUD with 24-point interactive corner quad pinning, keystone calibration, and test patterns. |

---

## 3. Architecture Documentation Map

To make learning the codebase effortless, the architecture is divided into dedicated, topic-specific documents:

```
docs/architecture/
├── README.md                                # This master index & new developer guide
├── 01-system-topology-and-dataflow.md       # End-to-end data pipeline & physical topology
├── 02-frontend-core-and-state.md            # App lifecycle, Zustand store, IPC SyncChannel
├── 03-rendering-and-glsl-pipeline.md        # Three.js scene, 2×3 MatrixSplitter & GLSL shaders
├── 04-computer-vision-and-human-antenna.md  # MediaPipe tracker, FeatureExtractor, QuerySynthesizer
├── 05-audio-synthesis-engine.md             # Web Audio graph, CRT flyback hum, static modulation
├── 06-video-pipeline-and-server.md          # Express backend, YouTube ingestion, QuotaGuard, cache
├── 07-calibration-and-control-deck.md       # Interactive calibration console & /admin deck
└── 08-hardware-deployment-and-operations.md # Physical CRT rack, cabling, kiosk mode, soak tests
```

### Quick Navigation
1. **[01. System Topology & Data Flow](./01-system-topology-and-dataflow.md)**: How the optical camera feed transforms into audio-visual output across 6 CRT viewports.
2. **[02. Frontend Core & State Management](./02-frontend-core-and-state.md)**: Deep dive into [`App.ts`](../../src/core/App.ts#L22), the Zustand store [`useAppStore`](../../src/core/StateManager.ts#L487), and [`SyncChannel`](../../src/core/SyncChannel.ts#L116).
3. **[03. Rendering & GLSL Shader Pipeline](./03-rendering-and-glsl-pipeline.md)**: Single-pass composite fragment shader, closed-form inverse bilinear quad warping, and CRT glass simulation.
4. **[04. Computer Vision & Human Antenna](./04-computer-vision-and-human-antenna.md)**: Optical landmark tracking, feature classification (poses, crowd density, rhythm, clothing chroma), and query synthesis.
5. **[05. Audio Synthesis Engine](./05-audio-synthesis-engine.md)**: Real-time procedural audio graph, 15.734 kHz flyback resonance, and antenna modulation.
6. **[06. Video Pipeline & Server Architecture](./06-video-pipeline-and-server.md)**: Express server routes, YouTube API integration, quota budget enforcement, and offline cache resilience.
7. **[07. Calibration System & Installation Control Deck](./07-calibration-and-control-deck.md)**: Live operator calibration console, keystone dragging, test patterns, and web admin controls.
8. **[08. Hardware Deployment & Operations](./08-hardware-deployment-and-operations.md)**: Physical rack engineering, video distribution, camera placement, kiosk auto-boot, and 8-hour soak testing.

---

## 4. Mental Model for New Developers

To effectively work on V-FEED [06], keep these foundational mental models in mind:

### Mental Model 1: The App Emits One 1080×1920 Output Signal
The application **does not render six separate browser windows or canvases**. The software renders **one single continuous vertical canvas (1080×1920)** at 60 FPS.
The division of the canvas into a 2-column × 3-row grid is calculated entirely inside the GPU fragment shader ([`CompositeShader.ts`](../../src/rendering/shaders/CompositeShader.ts#L8)) using logical boundary definitions from [`MatrixSplitter.ts`](../../src/rendering/MatrixSplitter.ts#L46). Physical splitters or video wall processors distribute this single canvas signal to the 6 physical CRTs.

### Mental Model 2: The Camera Never Stores Video
For spectator privacy and performance, camera video frames are processed **exclusively in volatile memory** by MediaPipe Tasks Vision WebAssembly. Frames are discarded immediately after joint landmark coordinate extraction. No images or videos are ever uploaded to cloud servers or written to disk.

### Mental Model 3: Offline-First & Resilient
Even if the internet goes down, YouTube blocks an API key, or no MP4 files exist on disk, **the installation will never crash or display a black screen**:
- If YouTube API fails: The system automatically plays from the offline local MP4 cache in `public/fallback-videos/`.
- If the local MP4 cache is completely empty: The system switches dynamically to an internal canvas-based procedural feed ([`ProceduralFeed.ts`](../../src/rendering/ProceduralFeed.ts#L6)) displaying animated green phosphor CRT oscilloscope waves, diagnostic telemetry, and matrix frames.

### Mental Model 4: Multi-Window Operator Synchronization
The primary display runs full-screen on the installation totem. Gallery technicians and operators can open a separate calibration window on a laptop or secondary screen ([`calibration.html`](../../calibration.html)). Both windows communicate in real time through [`SyncChannel.ts`](../../src/core/SyncChannel.ts#L116), allowing live keystone dragging, shader tuning, and preset switching without displaying UI overlays on the public art totem.

---

## 5. 5-Minute Developer Quickstart

### Prerequisites
- **Node.js**: v20 or higher (`node -v`)
- **npm**: v10 or higher (`npm -v`)
- **Webcam**: Built-in or external USB webcam
- **Optional Tools**: `ffmpeg` and `yt-dlp` (required only for automated video downloading)

### Step 1: Install Dependencies
```bash
git clone <repo-url>
cd v-feed-06
npm install
```

### Step 2: Configure Environment
Copy the sample environment file:
```bash
cp .env.example .env
```
*(Optional)* Add your `YOUTUBE_API_KEY` to `.env` if you wish to test live YouTube Shorts searching and ingestion. If you do not have an API key, you can still develop all graphics, tracking, and audio features using local fallback videos or the procedural feed.

### Step 3: Generate Local Fallback Video (Optional)
If you have `ffmpeg` installed, you can generate a synthetic 1080×1920 test video in seconds:
```bash
npm run generate:sample
```

### Step 4: Run Development Environment
```bash
npm run dev
```
This runs both the Express backend (`http://localhost:3000`) and the Vite client (`http://localhost:5173`) concurrently:
- **Installation Stage**: [http://localhost:5173](http://localhost:5173)
- **Operator Calibration Console**: [http://localhost:5173/calibration.html](http://localhost:5173/calibration.html)
- **Ingestion & Quota Admin Deck**: [http://localhost:3000/admin](http://localhost:3000/admin)

### Step 5: Essential Keyboard Shortcuts
When focused on the Installation Stage (`http://localhost:5173`):
- **Click anywhere**: Unlocks Web Audio and grants camera permissions.
- **`H`** or **`Ctrl + Shift + C`**: Toggle the floating `lil-gui` Calibration HUD.
- **`Spacebar`**: Toggle Play / Pause on the current video.
- **`Right Arrow` (`→`)**: Advance to the next video in the queue.
- **`Left Arrow` (`←`)**: Return to the previous video.
- **`D`**: Toggle the 2D Vision Debug Overlay (FPS counter & landmark skeleton).
- **`M`**: Cycle video playback modes (`live` → `cache` → `grid`).

---

## 6. Directory Structure Reference

```
v-feed-06/
├── config/                      # Persistent runtime configuration and state
│   ├── calibration.json         # Saved matrix keystone, bezels, and shader parameters
│   ├── quota-tracker.json       # Daily YouTube API unit usage and midnight reset state
│   └── youtube-api-cache.json   # Cached YouTube query responses to minimize API calls
├── docs/                        # Architectural, PRD, and conceptual documentation
│   ├── architecture/            # Comprehensive architectural documentation suite
│   ├── prd.md                   # Product Requirements Document
│   └── propuesta.md             # Original artistic concept and curatorial statement
├── public/                      # Static client assets
│   ├── fallback-videos/         # Faststart vertical MP4 cache & manifest.json
│   └── textures/                # Pre-baked noise and test pattern textures
├── reports/                     # Output directory for 8-hour performance soak tests
├── scripts/                     # Operational automation scripts
│   ├── clear-cache.ts           # Reset API and video caches
│   ├── generate-sample-video.sh # Procedural vertical MP4 generator using ffmpeg
│   ├── kiosk.sh                 # Fullscreen Chromium kiosk boot launcher
│   ├── perf-test.ts             # Automated performance and memory soak test runner
│   └── test-camera-rotation.ts  # Verification test for portrait camera rotation
├── server/                      # Node.js Express backend application
│   ├── index.ts                 # Express server bootstrap & static file routing
│   ├── routes/                  # Express REST API route handlers
│   │   ├── admin.ts             # Web admin console for ingestion and storage
│   │   ├── calibration.ts       # REST endpoints for loading/saving calibration.json
│   │   ├── perf.ts              # Endpoints for tracking runtime performance metrics
│   │   └── playlist.ts          # Endpoints for serving video playlist queues
│   └── services/                # Backend business logic services
│       ├── PerformanceTracker.ts# CPU, memory, and FPS monitoring service
│       ├── QuotaGuard.ts        # YouTube API daily unit quota enforcement
│       ├── VideoIngestService.ts# yt-dlp & ffmpeg automated downloader and pruner
│       └── YouTubeDataService.ts# YouTube Data API v3 search and metadata client
├── src/                         # Frontend TypeScript application source code
│   ├── main.ts                  # Client entry point (instantiates and starts App)
│   ├── calibration.ts           # Client entry point for the Calibration Console
│   ├── assets/                  # Global stylesheets
│   ├── audio/                   # Web Audio API engine
│   │   └── AudioEngine.ts       # Synthesizer (static noise, 15.734 kHz whistle, filters)
│   ├── core/                    # Core application lifecycle & shared state
│   │   ├── App.ts               # Master orchestrator class
│   │   ├── CalibrationManager.ts# Storage & preset persistence manager
│   │   ├── StateManager.ts      # Global reactive Zustand store (useAppStore)
│   │   ├── SyncChannel.ts       # Cross-window BroadcastChannel IPC bridge
│   │   ├── constants.ts         # Global layout and physical constants
│   │   └── textureUtils.ts      # Procedural texture and grid generators
│   ├── rendering/               # Three.js WebGL rendering pipeline
│   │   ├── MatrixSplitter.ts    # 2×3 coordinate math, quadrant geometry & keystone warping
│   │   ├── ProceduralFeed.ts    # Canvas fallback feed when no video is loaded
│   │   ├── SceneManager.ts      # WebGLRenderer, OrthographicCamera, render loop
│   │   ├── SkeletonOverlay.ts   # 2D phosphor skeleton overlay renderer
│   │   ├── VideoTexturePass.ts  # HTML5 video element to WebGL texture bridge
│   │   └── shaders/             # GLSL shader chunks and composite shader
│   │       ├── CRTShader.ts     # Curvature, scanlines, phosphor triads, vignette
│   │       ├── CompositeShader.ts# Master single-pass 2×3 composite fragment shader
│   │       ├── GlitchShader.ts  # RGB split, V-Hold roll, horizontal jitter
│   │       └── NoiseShader.ts   # RF static noise algorithm
│   ├── ui/                      # User interface & debugging overlays
│   │   ├── CalibrationConsole.ts# Operator console for calibration.html
│   │   └── DebugView.ts         # Lightweight 2D canvas debug stats overlay
│   ├── video/                   # Client video playback & queue controller
│   │   ├── VideoQueue.ts        # Seamless video queue, preloading & mode switching
│   │   └── YouTubeService.ts    # Client-side API client for backend playlist endpoints
│   └── vision/                  # Computer vision & "Human Antenna" interaction
│       ├── BroadcastQuerySynthesizer.ts # Feature-to-YouTube query translator
│       ├── CameraManager.ts     # WebRTC getUserMedia manager
│       ├── FeatureExtractor.ts  # Pose, density, kinetics & clothing chroma analysis
│       ├── GestureMapper.ts     # Physical mapping of vision metrics to shader uniforms
│       ├── InteractionController.ts # Priority ladder, hold debouncing & cooldowns
│       ├── MediaPipeTracker.ts  # MediaPipe Tasks Vision wrapper
│       └── cameraDiagnostics.ts # Hardware and browser permission diagnostics
├── calibration.html             # Standalone Operator Calibration Console HTML
├── index.html                   # Main Installation Stage HTML
├── package.json                 # Project dependencies and npm scripts
├── tsconfig.json                # TypeScript compiler configuration
└── vite.config.ts               # Vite build and dev server configuration
```

---

*Next Step: Explore [01. System Topology & Data Flow](./01-system-topology-and-dataflow.md) to understand the complete journey of an optical frame into the multi-CRT display.*
