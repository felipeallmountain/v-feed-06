# V-FEED [06] — Agent Plan & Implementation Roadmap
## Interactive Transmedia CRT Installation (6-Screen 2×3 Matrix)

---

### 1. Executive Summary & Vision

**V-FEED [06]** is a transmedia art installation that projects algorithmic vertical video content (YouTube Shorts) across a vertical totem of **6 Cathode Ray Tube (CRT) monitors arranged in a 2×3 matrix** (2 columns × 3 rows). 

The viewer acts as a **human antenna**: through optical tracking (MediaPipe Vision), their physical proximity, stance, and hand gestures tune, distort, or corrupt the analog video stream across the 6 CRT viewports in real time (< 45 ms latency at steady 60 FPS).

Full product requirements document: [`docs/prd.md`](./docs/prd.md)  
Original conceptual proposal: [`docs/propuesta.md`](./docs/propuesta.md)

---

### 2. Technology Stack

| Layer / Subsystem | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend & Tooling** | Vite 5 + TypeScript 5 (Native ESM) | Instant HMR, zero-bundle overhead, strict typing |
| **Graphics & Postprocessing** | Three.js + Custom GLSL Shaders | 1080×1920 single-pass composite, 2×3 matrix splitting, CRT tube curvature, scanlines, phosphor triads, RGB split, V-Hold roll, RF noise |
| **Computer Vision** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | Wasm-accelerated GPU body pose & hand landmark detection (60 FPS) |
| **Audio Engine** | Web Audio API | Real-time procedural white/pink noise + 15.734 kHz NTSC CRT flyback transformer whistle |
| **Video Pipeline & Ingestion** | Node.js + Express / YouTube Data API v3 | Online Shorts streaming with automatic offline fallback to local `/public/fallback-videos/` MP4 cache |
| **Calibration Interface** | lil-gui (`CalibrationConsole.ts`) | On-screen floating HUD and standalone console for live tuning of camera sensitivity, bezels, shader intensities, and display presets |
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
  - [x] Singleton orchestrator loop in [`App.ts`](./src/core/App.ts) with graceful WebGL/WebAudio lifecycle cleanup.
  - [x] Vanilla Zustand store in [`StateManager.ts`](./src/core/StateManager.ts) managing shader uniforms, tracking telemetry, and display presets.
  - [x] Procedural test patterns and noise texture generation in [`textureUtils.ts`](./src/core/textureUtils.ts).

- [x] **Subsystem B: 2×3 Matrix Splitter & GLSL Shader Stack (`src/rendering/`)**
  - [x] Logical 2-column × 3-row grid definitions and quadrant bounds in [`MatrixSplitter.ts`](./src/rendering/MatrixSplitter.ts).
  - [x] **Calibrated Screen Geometry**:
    - [x] [`computeCalibratedScreenQuads()`](./src/rendering/MatrixSplitter.ts): Computes exact 2D convex quads (`CalibratedScreenQuad` with `tl`, `tr`, `br`, `bl`, `bounds`, `center`) from calibrated keystone offsets, rotation, scale, and translation.
    - [x] [`isPointInQuad()`](./src/rendering/MatrixSplitter.ts): Cross-product 2D containment test for arbitrary quadrilaterals.
    - [x] [`distanceToQuad()`](./src/rendering/MatrixSplitter.ts): Euclidean distance to nearest quad edge with soft boundary bleed.
    - [x] [`mapPointToCalibratedScreen()`](./src/rendering/MatrixSplitter.ts): Bilinear quad interpolation mapping camera coordinates [0, 1]² to the warped CRT screens.
  - [x] Single-pass composite fragment shader in [`CompositeShader.ts`](./src/rendering/shaders/CompositeShader.ts):
    - [x] 6-piece CRT screen partitioning with configurable horizontal/vertical bezels.
    - [x] **4-Corner Pinning & Perspective Keystone**: Closed-form inverse bilinear quad warping for each of the 6 CRT monitors.
    - [x] **Rotation & Flips**: Discrete 90° steps (`0°`, `90° CW`, `180°`, `270° CCW`) + continuous fine angle rotation (`-180°` to `+180°`), plus horizontal (`flipH`) and vertical (`flipV`) inversion.
    - [x] Individual CRT tube glass convexity / barrel curvature per monitor.
    - [x] 3D beveled dark chassis casing with specular tube highlights and rounded glass corners.
    - [x] Adjustable geometric bezel compensation (`uBezelComp`).
    - [x] Per-screen analog sync drift and time variance (`uPerScreenVariance`).
    - [x] Phosphor triads, horizontal scanlines, corner vignettes, and Gaussian RF snow.
    - [x] Hand-targeted electromagnetic ripple distortion (`uRippleCenter`, `uRippleStrength`).
  - [x] High-performance dynamic video texture pipeline in [`VideoTexturePass.ts`](./src/rendering/VideoTexturePass.ts).
  - [x] Animated fallback procedural feed in [`ProceduralFeed.ts`](./src/rendering/ProceduralFeed.ts) with individual green phosphor frames for each of the 6 screens.
  - [x] Real-time phosphor skeleton overlay in [`SkeletonOverlay.ts`](./src/rendering/SkeletonOverlay.ts):
    - [x] Skeletal joint points mapped 1:1 through `mapPointToCalibratedScreen` to match warped CRT tubes.
    - [x] Dynamic lightning zap arcs (`drawLightningArc`) and radial plasma sparks (`drawPlasmaJointSparks`) connecting joints and projecting arcs to targeted screen centers.

- [x] **Subsystem C: Vision & "Human Antenna" Engine (`src/vision/`)**
  - [x] WebRTC camera manager with mirror flipping and error diagnostics in [`CameraManager.ts`](./src/vision/CameraManager.ts) and [`cameraDiagnostics.ts`](./src/vision/cameraDiagnostics.ts).
  - [x] Google MediaPipe Pose & Hand tracking integration in [`MediaPipeTracker.ts`](./src/vision/MediaPipeTracker.ts).
  - [x] Telemetry-to-shader mapper in [`GestureMapper.ts`](./src/vision/GestureMapper.ts):
    - [x] Per-screen hand dot presence evaluated against `computeCalibratedScreenQuads()` with soft Gaussian edge bleed.
    - [x] Proximity signal lock, velocity fragmentation, and localized hand interference.
    - [x] Zap feedback surging `rgbSplit`, `hJitter`, and `vHold`.
  - [x] Semantic feature extraction in [`FeatureExtractor.ts`](./src/vision/FeatureExtractor.ts) and algorithmic query synthesizer in [`BroadcastQuerySynthesizer.ts`](./src/vision/BroadcastQuerySynthesizer.ts).
  - [x] Interaction decision ladder and channel zap controller in [`InteractionController.ts`](./src/vision/InteractionController.ts) (`zapEnabled`, `zapNavMode`, `zapHoldDurationMs`, `zapCooldownSec`).

- [x] **Subsystem D: Video Queue & Ingestion Server (`src/video/`, `server/`)**
  - [x] Express backend in [`server/index.ts`](./server/index.ts) with `/api/playlist` and `/admin` routes.
  - [x] YouTube Data API v3 integration with automated daily quota budget tracking in [`server/services/QuotaGuard.ts`](./server/services/QuotaGuard.ts).
  - [x] Automated video ingest and disk storage service in [`server/services/VideoIngestService.ts`](./server/services/VideoIngestService.ts).
  - [x] **Consolidated Media Binaries**:
    - [x] Local `ffmpeg` resolution via `ffmpeg-static` in [`server/services/MediaBinaries.ts`](./server/services/MediaBinaries.ts).
    - [x] Automated standalone `yt-dlp` installer in [`scripts/setup-binaries.ts`](./scripts/setup-binaries.ts) (postinstall hook, `npm run setup:binaries`, `npm run update:ytdlp`).
    - [x] Automatic environment PATH merging and `--ffmpeg-location` injection for `yt-dlp` child processes.
  - [x] Seamless playlist preloader with offline cache failover in [`VideoQueue.ts`](./src/video/VideoQueue.ts).

- [x] **Subsystem E: Reactive Audio Synthesizer (`src/audio/`)**
  - [x] Web Audio API synth in [`AudioEngine.ts`](./src/audio/AudioEngine.ts) with 15.734 kHz NTSC whistle and motion-modulated RF noise generator.
  - [x] Analog CRT rotary channel switch zap sound synthesis (`playZapSound`) with directional pitch sweeps and exponential decay.

- [x] **Subsystem F: Calibration HUD & Diagnostics UI (`src/ui/`)**
  - [x] Floating `lil-gui` panel and standalone console in [`CalibrationConsole.ts`](./src/ui/CalibrationConsole.ts) (`H` key / `Ctrl+Shift+C`):
    - **Presets**: `6x CRT Totem (Wall)`, `6x Physical Output`, `1x Flat Screen`, `1x CRT Tube`.
    - **2×3 Matrix Controls**: Bezel X/Y gaps, outer chassis frame, bezel compensation, tube corner radius, chassis bevel toggle, and CRT sync drift.
    - **Corner Pinning & Keystone**: 24-point corner offsets with screen dropdown, interactive canvas pointer dragging, and visual alignment guides.
    - **Orientation, Rotation & Flips**: Discrete 90° steps, fine continuous rotation angles, and horizontal/vertical mirroring per-piece and globally.
    - **Display & Glitch**: Curvature, vignette, scanlines, phosphor, RGB split, V-Hold, H-Jitter, noise gain, signal lock.
    - **Tracking Calibration**: Confidence threshold, camera rotation (`0°`, `90°`, `180°`, `270°`), distance scale/offset, antenna hand boost, and falloff radius.
    - **Interaction & Zap Controls**: Master interaction toggle, ambient hold/cooldown timers, zap enable toggle, zap navigation mode (`sequential`, `directional`, `random`), zap hold/cooldown durations, and zap visual intensity.
    - **Frames & Pose Guides**: Shape styles, curvature scale, pose guide reticles/scale/opacity, and `resetFrames()` action.
    - **Timeline Scrubber**: Interactive video progress scrubbing and duration readout.
    - **Live Readouts**: FPS, Distance, Detected Persons, Interaction state (pose, density, kinetics, chroma, hold %, cooldown, zap status), Quota budget usage, and active video query.
    - **Persistence**: Multi-tier serialization (`config/calibration.json`, `public/calibration.json`, `localStorage`, portable JSON backup).
  - [x] 2D camera debug view in [`DebugView.ts`](./src/ui/DebugView.ts) with calibrated 2×3 matrix quads, antenna lock % meters, FPS counter, and user distance telemetry.

---

### 4. Milestones & Progress Tracking

| Milestone | Description | Status |
| :--- | :--- | :--- |
| **M1: Visual Core** | GLSL CRT shaders (curvature, scanlines, RGB split, static) at 60 FPS over vertical video. | **Completed** |
| **M2: Interactive Vision** | MediaPipe body tracking driving proximity tuning, signal lock, and hand ripple interference. | **Completed** |
| **M3: 2×3 Matrix Splitter** | Logical division into 6 CRT monitors, individual tube curvature, bezel compensation, and 6-screen calibration chart. | **Completed** |
| **M4: Ingestion & Resilience** | YouTube playlist queue, offline fallback cache, procedural feed generator, and local binary consolidation (`ffmpeg-static` + `yt-dlp`). | **Completed** |
| **M5: In-Situ Hardware Deployment** | Physical 6-CRT totem rack assembly, HDMI distribution, camera positioning (1.8m height / 12° tilt), 8-hour continuous kiosk soak test (`npm run test:perf`), and multi-tier calibration backup. | **Ready for Deployment** |

---

### 5. Quick Reference & Operational Controls

- **Start Dev Environment**: `npm run dev` (Vite at `http://localhost:5173` + Express at `http://localhost:3000`)
- **Start Backend API Server Only**: `npm run dev:server` (Express with `tsx watch` at `http://localhost:3000`)
- **Build Production Bundle**: `npm run build`
- **Verify / Setup Media Binaries**: `npm run setup:binaries` (or `npm run update:ytdlp --force`)
- **Generate Test Video**: `npm run generate:sample`
- **Performance & Soak Test**: `npm run test:perf`
- **Clear Temporary Cache**: `npm run clear:cache`
- **Toggle Calibration HUD**: Press `H` or `Ctrl + Shift + C`
- **Standalone Operator Console**: `http://localhost:5173/calibration.html`
- **Alignment Mode**: Switch *Video source* to `grid` in the HUD to display the 6-screen calibration pattern with individual monitor labels (`CRT [01]` to `CRT [06]`), SMPTE bars, and focus crosshairs.
