# 03 — Implementation Roadmap & Architectural Decision Records (ADRs)

This document records the chronological development phases and key Architectural Decision Records (ADRs) established during the creation of **V-FEED [06]**.

---

## 1. Chronological Implementation Phases

```
  Phase 1           Phase 2           Phase 3           Phase 4           Phase 5           Phase 6           Phase 7
┌─────────┐       ┌─────────┐       ┌─────────┐       ┌─────────┐       ┌─────────┐       ┌─────────┐       ┌─────────┐
│ PRD &   │──────>│ Server  │──────>│ Shaders │──────>│ Vision  │──────>│ Audio   │──────>│ HUD &   │──────>│ Kiosk & │
│ Blue-   │       │ & Feed  │       │ & Split │       │ & Antenna│       │ Synth   │       │ Diag    │       │ Deploy  │
│ print   │       │ API     │       │ Engine  │       │ Mapping │       │ Engine  │       │ Overlay │       │ Scripts │
└─────────┘       └─────────┘       └─────────┘       └─────────┘       └─────────┘       └─────────┘       └─────────┘
```

### Phase 1: PRD & System Architecture Blueprint
- Defined system objectives, aesthetic targets, and physical hardware requirements in [docs/prd.md](../prd.md) and [agent-plan.md](../../agent-plan.md).
- Established the 1080×1920 vertical format split into a 2×3 monitor matrix.

### Phase 2: Ingestion Server & Video Management
- Built Node.js + Express backend (`server/index.ts`, `server/routes/playlist.ts`).
- Integrated YouTube Data API v3 client with automatic offline fallback to local `/public/fallback-videos/` directory.
- Created `VideoQueue.ts` for smooth video preloading and seamless looping.

### Phase 3: WebGL Engine & GLSL Multi-Pass Shader Stack
- Scaffolded Three.js scene manager (`SceneManager.ts`) with 1080×1920 canvas target.
- Authored GLSL shaders:
  - `CRTShader.ts`: Barrel curvature, phosphor triads, scanlines.
  - `GlitchShader.ts`: RGB channel displacement, V-Hold vertical loss, H-Sync jitter.
  - `NoiseShader.ts`: Procedural RF static white noise.
- Created procedural grid texture generator (`textureUtils.ts`) for monitor alignment.

### Phase 4: MediaPipe Computer Vision & "Human Antenna" Engine
- Implemented `MediaPipeTracker.ts` using `@mediapipe/tasks-vision` for pose and hand landmark extraction.
- Developed `GestureMapper.ts` to transform raw spatial coordinates and joint movement velocity into reactive shader uniform states (`u_noiseGain`, `u_rgbSplit`, `u_vHold`, `u_handPos`).

### Phase 5: Web Audio API Reactive Soundscape
- Built `AudioEngine.ts` using native Web Audio API oscillators and noise buffers.
- Synthesized 15.734 kHz NTSC flyback hum and velocity-driven white noise modulation.

### Phase 6: Calibration HUD & Environment Diagnostics
- Built `CalibrationHUD.ts` using `lil-gui` for gallery curators to live-adjust shader parameters, tracking thresholds, and bezel offsets.
- Created `cameraDiagnostics.ts` and `DebugView.ts` to surface camera permission issues, browser iframe quirks, and frame timing metrics visually.

### Phase 7: Deployment Automation & Kiosk Scripts
- Developed shell launch automation scripts (`scripts/kiosk.sh`) for unattended boot on exhibition hardware.
- Authored sample video generation utility (`scripts/generate-sample-video.sh`).

### Phase 8: Physical Matrix Calibration, Frames & Interactive Channel Zapping
- Developed `computeCalibratedScreenQuads()`, `isPointInQuad()`, `distanceToQuad()`, and `mapPointToCalibratedScreen()` in `MatrixSplitter.ts` to align webcam vision tracking and skeletal overlays directly to keystoned CRT tube geometries.
- Created snappy pose-based Channel Zapping (`zapEnabled`, `zapNavMode`, `zapHoldDurationMs`, `zapCooldownSec`) with electric lightning body arcs and plasma sparks in `SkeletonOverlay.ts`.
- Synthesized analog CRT rotary channel switch sounds (`playZapSound`) in `AudioEngine.ts`.
- Expanded `CalibrationConsole.ts` with interactive frames controls, timeline scrubber, and comprehensive multi-tier persistence for interaction state.

### Phase 9: Project Dependency Consolidation & Self-Contained Media Binaries
- Bundled `ffmpeg-static` directly in project dependencies.
- Implemented `scripts/setup-binaries.ts` to automatically download platform-specific standalone `yt-dlp` to `./bin/yt-dlp` during `npm install` (`postinstall`).
- Built `MediaBinaries.ts` service with automatic environment PATH merging and `--ffmpeg-location` flag passing, removing all global OS package requirements (`brew` / `apt`).

---

## 2. Architectural Decision Records (ADRs)

### ADR-01: In-Browser WebAssembly MediaPipe vs External Python Server
- **Context**: Computer vision landmark tracking is required at ≥30 FPS to drive human-antenna distortions.
- **Decision**: Use `@mediapipe/tasks-vision` directly in the browser thread / WebWorker via WebAssembly.
- **Rationale**: Eliminates local socket IPC latency, simplifies installation (no Python environment or OpenCV dependencies required on target machine), and runs with native GPU acceleration in WebGL.

### ADR-02: Multi-Pass GLSL Fragment Shaders vs CSS Filters / Canvas 2D
- **Context**: Analog CRT traits (scanlines, barrel curvature, RGB split) require complex pixel manipulation at 1080×1920 @ 60 FPS.
- **Decision**: Implement custom GLSL fragment shaders compiled into Three.js `ShaderPass` postprocessing pipelines.
- **Rationale**: CPU-based canvas pixel operations are far too slow for 1080p @ 60 FPS. WebGL fragment shaders execute across thousands of GPU cores simultaneously with under 2 ms render latency per frame.

### ADR-03: Single 1080×1920 Output Canvas with Virtual Sub-Viewports vs 6 Separate Canvases
- **Context**: The physical setup splits video output across 6 CRT monitors (2×3 grid).
- **Decision**: Render a single 1080×1920 canvas output driven by GPU video output split hardware (e.g. HDMI video wall controller or extended desktop).
- **Rationale**: Avoids maintaining 6 independent WebGL contexts, eliminates synchronization drift across displays, and allows fluid continuous motion across monitor bezels with uniform bezel compensation shaders.

### ADR-04: Explicit Interaction Button for Camera & Audio Unlock
- **Context**: Modern web browsers enforce strict autoplay policies blocking Web Audio context initialization and `getUserMedia` camera access without prior explicit user gesture.
- **Decision**: Provide an un-styled `#boot-hint` overlay with a clear `#allow-camera` button that triggers user activation explicitly.
- **Rationale**: Prevents silent camera rejection, handles embedded iframe restrictions, and ensures Web Audio API context unlocks reliably on first click.

### ADR-05: Consolidated Local Media Binaries vs Global System Package Installations
- **Context**: Exhibition computers frequently run locked-down OS environments without administrative rights or pre-installed package managers (`brew`, `apt`).
- **Decision**: Declare `ffmpeg-static` in `package.json` and download standalone `yt-dlp` into local `./bin/` via a `postinstall` hook and `scripts/setup-binaries.ts`. Resolve binaries dynamically via `server/services/MediaBinaries.ts` with sub-process environment PATH merging.
- **Rationale**: Completely insulates the application from OS-level package quirks, guarantees reproducible deployments, and allows instant offline execution.

### ADR-06: Calibrated Screen Quadrilateral Geometry for Vision & Overlays vs Rigid Viewport Rectangles
- **Context**: Physical CRT monitors exhibit analog raster keystone distortion, physical chassis tilt, and non-uniform bezels. Evaluating visitor hand presence using rigid 2×3 rectangles resulted in dead zones and mismatched overlay alignments.
- **Decision**: Derive exact 2D convex quads (`computeCalibratedScreenQuads`) directly from the operator's calibrated keystone parameters. Use 2D cross-product containment (`isPointInQuad`) with Gaussian boundary bleed in `GestureMapper.ts`, and map joints/arcs into quad space via bilinear interpolation (`mapPointToCalibratedScreen`).
- **Rationale**: Synchronizes the computer vision optical space, 2D canvas overlays, and GLSL fragment warping 1:1 with the physical glass monitors.

### ADR-07: Interactive Channel Zapping with Dual-Track Debouncing
- **Context**: While slow ambient YouTube query synthesis (1.8s hold + 10s cooldown) works well for crowd density and kinetic state shifts, spectators executing intentional CRT signature poses expect immediate, responsive feedback.
- **Decision**: Introduce a dual-track interaction model. Poses trigger an instant Channel Zap with tailored snappy timings (`zapHoldDurationMs` 400ms–1200ms, `zapCooldownSec` 2.0s), high-voltage electric body arcs, and analog rotary switch audio, while preserving ambient query generation for macro gallery states.
- **Rationale**: Dramatically enhances visitor agency and engagement while preserving the installation's contemplative ambient broadcast behavior.

### ADR-08: Unified Multi-Tier State Persistence Architecture
- **Context**: Exhibition gallery power cycles or browser cache clearings could wipe painstakingly calibrated keystone corner offsets, frames styling, and interaction parameters.
- **Decision**: Structure calibration state into a unified, extensible JSON schema saved across three redundant tiers: (1) `localStorage`, (2) server disk file via `POST /api/calibration` writing to `config/calibration.json` and `public/calibration.json`, and (3) operator file export/import. Include interaction and frame settings in the schema.
- **Rationale**: Guarantees zero data loss across power outages, allows migrating configurations between production machines, and provides instant fallback.
