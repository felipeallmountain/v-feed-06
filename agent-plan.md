# V-FEED [06] — Agent Plan & Implementation Roadmap
## Interactive Transmedia CRT Installation (6-Screen 2×3 Matrix)

---

### 1. Executive Summary & Vision

**V-FEED [06]** is a transmedia art installation that projects algorithmic vertical video content (YouTube Shorts) across a vertical totem of **6 Cathode Ray Tube (CRT) monitors arranged in a 2×3 matrix** (2 columns × 3 rows). 

The viewer acts as a **human antenna**: through optical tracking (MediaPipe Vision), their physical proximity, stance, and hand gestures tune, distort, or corrupt the analog video stream across the 6 CRT viewports in real time (< 45 ms latency at steady 60 FPS).

Full product requirements document: [`docs/prd.md`](file:///Users/mclovin/Documents/pabellon/v-feed-06/docs/prd.md)  
Original conceptual proposal: [`docs/propuesta.md`](file:///Users/mclovin/Documents/pabellon/v-feed-06/docs/propuesta.md)

---

### 2. Technology Stack

| Layer / Subsystem | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend & Tooling** | Vite 5 + TypeScript 5 (Native ESM) | Instant HMR, zero-bundle overhead, strict typing |
| **Graphics & Postprocessing** | Three.js + Custom GLSL Shaders | 1080×1920 single-pass composite, 2×3 matrix splitting, CRT tube curvature, scanlines, phosphor triads, RGB split, V-Hold roll, RF noise |
| **Computer Vision** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | Wasm-accelerated GPU body pose & hand landmark detection (60 FPS) |
| **Audio Engine** | Web Audio API | Real-time procedural white/pink noise + 15.734 kHz NTSC CRT flyback transformer whistle |
| **Video Pipeline & Ingestion** | Node.js + Express / YouTube Data API v3 | Online Shorts streaming with automatic offline fallback to local `/public/fallback-videos/` MP4 cache |
| **Calibration Interface** | lil-gui (`CalibrationHUD.ts`) | On-screen floating HUD for live tuning of camera sensitivity, bezels, shader intensities, and display presets |
| **Physical Output** | 1080×1920 Extended Canvas | Distributed across 6 CRT monitors via HDMI-to-RCA adapters or video wall controller |

---

### 3. Subsystem Architecture & Implementation Status

```
Capture Layer (Webcam / MediaPipe)  ──►  GestureMapper  ──►  Zustand Store (useAppStore)
                                                                     │
Video Layer (YouTube / MP4 Cache)   ───────────────────────────────► │
                                                                     ▼
Audio Layer (Web Audio Synthesizer) ◄─────────────── SceneManager (Three.js WebGL)
                                                             │
                                                             ▼
                                             CompositeShader (2x3 Matrix Splitter)
                                                             │
                                                             ▼
                                                [ CRT 1 ]    [ CRT 2 ]
                                                [ CRT 3 ]    [ CRT 4 ]
                                                [ CRT 5 ]    [ CRT 6 ]
```

- [x] **Subsystem A: Application Core & State Management (`src/core/`)**
  - [x] Singleton orchestrator loop in [`App.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/App.ts) with graceful WebGL/WebAudio lifecycle cleanup.
  - [x] Vanilla Zustand store in [`StateManager.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/StateManager.ts) managing shader uniforms, tracking telemetry, and display presets.
  - [x] Procedural test patterns and noise texture generation in [`textureUtils.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/textureUtils.ts).

- [x] **Subsystem B: 2×3 Matrix Splitter & GLSL Shader Stack (`src/rendering/`)**
  - [x] Logical 2-column × 3-row grid definitions and quadrant bounds in [`MatrixSplitter.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/MatrixSplitter.ts).
  - [x] Single-pass composite fragment shader in [`CompositeShader.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/shaders/CompositeShader.ts):
    - [x] 6-piece CRT screen partitioning with configurable horizontal/vertical bezels.
    - [x] **4-Corner Pinning & Perspective Keystone**: Closed-form inverse bilinear quad warping for each of the 6 CRT monitors.
    - [x] **Rotation & Flips**: Discrete 90° steps (`0°`, `90° CW`, `180°`, `270° CCW`) + continuous fine angle rotation (`-180°` to `+180°`), plus horizontal (`flipH`) and vertical (`flipV`) inversion.
    - [x] Individual CRT tube glass convexity / barrel curvature per monitor.
    - [x] 3D beveled dark chassis casing with specular tube highlights and rounded glass corners.
    - [x] Adjustable geometric bezel compensation (`uBezelComp`).
    - [x] Per-screen analog sync drift and time variance (`uPerScreenVariance`).
    - [x] Phosphor triads, horizontal scanlines, corner vignettes, and Gaussian RF snow.
    - [x] Hand-targeted electromagnetic ripple distortion (`uRippleCenter`, `uRippleStrength`).
  - [x] High-performance dynamic video texture pipeline in [`VideoTexturePass.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/VideoTexturePass.ts).
  - [x] Animated fallback procedural feed in [`ProceduralFeed.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/ProceduralFeed.ts) with individual green phosphor frames for each of the 6 screens.
  - [x] Real-time phosphor skeleton overlay in [`SkeletonOverlay.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/SkeletonOverlay.ts).

- [x] **Subsystem C: Vision & "Human Antenna" Engine (`src/vision/`)**
  - [x] WebRTC camera manager with mirror flipping and error diagnostics in [`CameraManager.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/vision/CameraManager.ts) and [`cameraDiagnostics.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/vision/cameraDiagnostics.ts).
  - [x] Google MediaPipe Pose & Hand tracking integration in [`MediaPipeTracker.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/vision/MediaPipeTracker.ts).
  - [x] Telemetry-to-shader mapper in [`GestureMapper.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/vision/GestureMapper.ts) (proximity signal lock, velocity fragmentation, and localized hand interference).

- [x] **Subsystem D: Video Queue & Ingestion Server (`src/video/`, `server/`)**
  - [x] Express backend in [`server/index.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/server/index.ts) with `/api/playlist` and `/admin` routes.
  - [x] Seamless playlist preloader with offline cache failover in [`VideoQueue.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/video/VideoQueue.ts).

- [x] **Subsystem E: Reactive Audio Synthesizer (`src/audio/`)**
  - [x] Web Audio API synth in [`AudioEngine.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/audio/AudioEngine.ts) with 15.734 kHz NTSC whistle and motion-modulated RF noise generator.

- [x] **Subsystem F: Calibration HUD & Diagnostics UI (`src/ui/`)**
  - [x] Floating `lil-gui` panel in [`CalibrationHUD.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/ui/CalibrationHUD.ts) (`H` key / `Ctrl+Shift+C`):
    - **Presets**: `6x CRT Totem (Wall)`, `6x Physical Output`, `1x Flat Screen`, `1x CRT Tube`.
    - **2×3 Matrix Controls**: Bezel X/Y gaps, outer chassis frame, bezel compensation, tube corner radius, chassis bevel toggle, and CRT sync drift.
    - **Corner Pinning & Keystone**: 24-point corner offsets with screen dropdown, interactive canvas pointer dragging, and visual alignment guides.
    - **Orientation, Rotation & Flips**: Discrete 90° steps, fine continuous rotation angles, and horizontal/vertical mirroring per-piece and globally.
    - **Display & Glitch**: Curvature, vignette, scanlines, phosphor, RGB split, V-Hold, H-Jitter, noise gain, signal lock.
    - **Skeleton Overlay**: Palette colors, line thickness, opacity, jitter, and joint dots.
    - **Persistence**: Auto-save to `localStorage` (`vfeed-calibration`).
  - [x] 2D camera debug view in [`DebugView.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/ui/DebugView.ts) with 2×3 matrix overlay guides, FPS counter, and user distance telemetry.

---

### 4. Milestones & Progress Tracking

| Milestone | Description | Status |
| :--- | :--- | :--- |
| **M1: Visual Core** | GLSL CRT shaders (curvature, scanlines, RGB split, static) at 60 FPS over vertical video. | **Completed** |
| **M2: Interactive Vision** | MediaPipe body tracking driving proximity tuning, signal lock, and hand ripple interference. | **Completed** |
| **M3: 2×3 Matrix Splitter** | Logical division into 6 CRT monitors, individual tube curvature, bezel compensation, and 6-screen calibration chart. | **Completed** |
| **M4: Ingestion & Resilience** | YouTube playlist queue, offline fallback cache, and procedural feed generator. | **Completed** |
| **M5: In-Situ Hardware Deployment** | Physical 6-CRT totem rack assembly, HDMI-to-RCA distribution, camera positioning (1.8m height / 12° tilt), and 8-hour continuous kiosk burn-in. | **Ready for Deployment** |

---

### 5. Quick Reference & Operational Controls

- **Start Dev Environment**: `npm run dev` (Vite at `http://localhost:5173`)
- **Start Backend API Server**: `npm run server` (Express at `http://localhost:3000`)
- **Build Production Bundle**: `npm run build`
- **Toggle Calibration HUD**: Press `H` or `Ctrl + Shift + C`
- **Alignment Mode**: Switch *Video source* to `grid` in the HUD to display the 6-screen calibration pattern with individual monitor labels (`CRT [01]` to `CRT [06]`), SMPTE bars, and focus crosshairs.
