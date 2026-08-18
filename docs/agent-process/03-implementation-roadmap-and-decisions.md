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
- Defined system objectives, aesthetic targets, and physical hardware requirements in [docs/prd.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/prd.md) and [agent-plan.md](file:///home/bricktop/Projects/pabellon/v-feed-06/agent-plan.md).
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
