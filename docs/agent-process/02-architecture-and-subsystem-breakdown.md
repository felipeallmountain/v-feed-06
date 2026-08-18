# 02 — Subsystem Architecture & Data Flow

This document details the architectural layout, core modules, data models, and communication flow across all 5 subsystems of **V-FEED [06]**.

---

## 1. System Topology & Data Flow Diagram

```
                 ┌──────────────────────────────────────────┐
                 │       PHYSICAL INPUT (Webcam Feed)       │
                 └────────────────────┬─────────────────────┘
                                      │
                                      ▼
                 ┌──────────────────────────────────────────┐
                 │    CameraManager & MediaPipeTracker      │
                 │    (Pose & Hand Landmark Detection)      │
                 └────────────────────┬─────────────────────┘
                                      │
                                      ▼ (Normalized Landmarker Frame)
                 ┌──────────────────────────────────────────┐
                 │              GestureMapper               │
                 │   - User Presence & Distance (3m -> 1m)  │
                 │   - Hand Coordinates (X, Y) & Velocity   │
                 └────────────────────┬─────────────────────┘
                                      │
                                      ▼ (Updates State)
                 ┌──────────────────────────────────────────┐
                 │            Zustand Store                 │
                 │   (useAppStore: Shader & Motion State)   │
                 └──────────┬────────────────────┬──────────┘
                            │                    │
        ┌───────────────────┘                    └────────────────────┐
        ▼                                                             ▼
┌───────────────────────────────────────┐            ┌───────────────────────────────────┐
│        SceneManager (Three.js)        │            │     AudioEngine (Web Audio API)   │
│  - VideoTexturePass (YouTube/Canvas)  │            │  - White/Pink Static Noise        │
│  - GlitchShader (RGB Split & V-Hold)  │            │  - 15.734 kHz CRT Flyback Hum     │
│  - NoiseShader (RF Interference)      │            │  - Motion Modulation              │
│  - CRTShader (Scanlines & Barrel)     │            └───────────────────────────────────┘
│  - CompositeShader / Matrix Splitter  │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│     1080x1920 Extended Canvas Output  │
│  (Split 2x3 across 6 CRT Monitors)    │
└───────────────────────────────────────┘
```

---

## 2. Detailed Subsystem Breakdown

### 2.1 Subsystem A: Application & Global State Core (`src/core/`)

- **`App.ts`**: Main orchestration singleton. Boots DOM references (`#stage`, `#feed-video`, `#webcam`), initializes the WebGL renderer, vision tracker, audio engine, calibration HUD, and runs the main `requestAnimationFrame` loop. Handles graceful disposal and hot module replacement (HMR).
- **`StateManager.ts`**: Zustand reactive global store (`useAppStore`). Retains state slices:
  - `shaders`: Active noise gain, V-Hold speed, RGB split offset, scanline intensity, CRT curvature, signal lock percentage.
  - `tracking`: Detection confidence, mirror camera toggle, smoothing factors, current user distance and velocity metrics.
  - `video`: Current video source, playlist index, mute/volume state, network online status.
  - `audio`: Master volume, flyback hum gain, noise generator balance.
- **`textureUtils.ts`**: Utility functions generating procedural fallback noise data URLs (`createNoiseDataUrl`) and resolution-adaptive CRT alignment test grids (`createCalibrationGridDataUrl`).

### 2.2 Subsystem B: Rendering & GLSL Shader Stack (`src/rendering/`)

- **`SceneManager.ts`**: Manages the `THREE.WebGLRenderer`, `THREE.Scene`, orthographic camera, and post-processing pipeline. Switches between live video textures, procedural noise textures, and calibration grids.
- **`VideoTexturePass.ts`**: Binds standard HTML5 `<video>` frames or custom canvas elements to a high-frequency `THREE.VideoTexture`.
- **`CRTShader.ts`**: Emulates CRT physical traits:
  - Barrel curvature distortion (`vec2 uv = distort(uv, u_curvature)`).
  - Horizontal scanline intensity grid (`sin(uv.y * u_scanlineCount)`).
  - Phosphor triad mask & corner vignette.
- **`GlitchShader.ts`**: Emulates electrical transmission failures:
  - Spatial Red/Green/Blue channel separation (`u_rgbSplit`).
  - Vertical synchronization loss scroll (`u_vHold`).
  - Horizontal sync jitter tearing.
- **`NoiseShader.ts`**: High-frequency pseudorandom radio frequency (RF) static generator.
- **`MatrixSplitter.ts`**: Logic for mapping the 1080×1920 vertical canvas to 6 discrete sub-viewports (540×640 px each) with virtual bezel padding compensation.

### 2.3 Subsystem C: Computer Vision & "Human Antenna" Engine (`src/vision/`)

- **`CameraManager.ts`**: Interfaces with standard `navigator.mediaDevices.getUserMedia`. Provides fallback constraints (HD 1080p -> 720p -> standard 480p) and manages video flipping (`setMirror`).
- **`MediaPipeTracker.ts`**: Encapsulates `@mediapipe/tasks-vision` pose and hand landmarkers. Converts camera frames into structured telemetry:
  - `presence`: `boolean`
  - `distance`: normalized `[0.0 - 1.0]` based on shoulder span.
  - `handPos`: `(x, y)` normalized coordinates of primary active hand.
  - `velocity`: inter-frame movement delta speed.
- **`GestureMapper.ts`**: Translates raw vision telemetry into human-antenna parameters:
  - **No User**: Signal unlocks (`signalLock = 0.0`), RF static gain rises to 85%, V-Hold drifts.
  - **User Approaching**: Signal tunes into lock (`signalLock -> 1.0`), static dissipates.
  - **Hand Motion**: Directs localized shader ripples to the specific CRT monitor corresponding to the hand position.
  - **Fast Movement**: Triggers RGB split chromatic aberration bursts.
- **`cameraDiagnostics.ts`**: Probes the runtime environment (browser iframe detection, HTTPS security state, available video devices) to generate human-readable diagnostic reports.

### 2.4 Subsystem D: Video Ingestion & Express Server (`server/`, `src/video/`)

- **`server/index.ts`**: Node.js Express server running on port 3000 (or configured port). Serves local static assets and playlist APIs.
- **`server/routes/playlist.ts`**: Fetches vertical YouTube Shorts playlists via YouTube Data API v3 key or returns local fallback catalog if offline.
- **`VideoQueue.ts`**: Manages video sequencing, preloading next items in background, auto-advancing on video end, and smoothly handling offline transitions.

### 2.5 Subsystem E: Reactive Audio Engine (`src/audio/`)

- **`AudioEngine.ts`**: Web Audio API synth producing continuous ambient CRT audio:
  - **15.734 kHz Sine Oscillator**: Recreates the classic NTSC CRT flyback transformer high-pitched whistle.
  - **White / Pink Noise Node**: Procedural static noise buffer modulated by user motion and static gain uniforms.
  - Dynamic low-pass and high-pass filtering mapped to user proximity.

### 2.6 Subsystem F: Calibration & Diagnostic UI (`src/ui/`)

- **`CalibrationHUD.ts`**: Floating control GUI constructed using `lil-gui`. Allows gallery curators to live-tune shader intensities, tracking thresholds, CRT bezel compensation, video source overrides, and grid test patterns.
- **`DebugView.ts`**: Lightweight 2D canvas overlay drawing real-time FPS counters, frame timing graphs, MediaPipe landmark skeletons, and bounding boxes for on-site debugging.
