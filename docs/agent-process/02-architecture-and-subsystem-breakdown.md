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
- **`MatrixSplitter.ts`**: 
  - 2×3 CRT matrix subdivision and closed-form inverse bilinear keystone quad calculation (`computeAllScreenCorners`).
  - **Calibrated Geometry Engine**: Computes exact 2D convex quads ([`computeCalibratedScreenQuads`](../../src/rendering/MatrixSplitter.ts)), point containment ([`isPointInQuad`](../../src/rendering/MatrixSplitter.ts)), edge distance with soft Gaussian bleed ([`distanceToQuad`](../../src/rendering/MatrixSplitter.ts)), and quad coordinate mapping ([`mapPointToCalibratedScreen`](../../src/rendering/MatrixSplitter.ts)).
- **`SkeletonOverlay.ts`**: High-performance 2D canvas overlay drawing calibrated phosphor bone graphs, hand joints, pose guide reticles, and electric lightning zap arcs with radial plasma bursts.

### 2.3 Subsystem C: Computer Vision & "Human Antenna" Engine (`src/vision/`)

- **`CameraManager.ts`**: Interfaces with standard `navigator.mediaDevices.getUserMedia`. Provides fallback constraints (HD 1080p -> 720p -> standard 480p), camera rotation (`0°`, `90°`, `180°`, `270°`), and video mirroring (`setMirror`).
- **`MediaPipeTracker.ts`**: Encapsulates `@mediapipe/tasks-vision` pose and hand landmarkers running in GPU-accelerated WebAssembly.
- **`FeatureExtractor.ts`**: Semantic analysis of visitor telemetry: crowd density (`SOLO`, `DUO`, `GROUP`), proximity distance, kinetic energy, rhythm, clothing chroma, and 6 signature CRT poses.
- **`InteractionController.ts`**: Enforces priority ladder, 1.8-second hold debouncing, 10-second query cooldown, and **instant Channel Zapping** (`sequential`, `directional`, `random`) with dedicated 400ms–1200ms hold and 2-second cooldown.
- **`GestureMapper.ts`**: Translates raw vision telemetry into human-antenna parameters:
  - Evaluates hand landmark points against `computeCalibratedScreenQuads()` with soft Gaussian edge falloff.
  - Proximity signal lock and RF noise attenuation.
  - Localized ripple distortions directed to specific CRT screens.
  - Zap glitch surges injecting temporary `rgbSplit`, `hJitter`, and `vHold` spikes.
- **`cameraDiagnostics.ts`**: Probes the runtime environment (browser iframe detection, HTTPS security state, available video devices) to generate human-readable diagnostic reports.

### 2.4 Subsystem D: Video Ingestion & Express Server (`server/`, `src/video/`)

- **`server/index.ts`**: Node.js Express server running on port 3000. Serves static production assets, playlist APIs, and the `/admin` control deck.
- **`server/services/MediaBinaries.ts`**: Resolves local `ffmpeg-static` npm binary and standalone `./bin/yt-dlp` executable, generates merged PATH environments, and injects `--ffmpeg-location`.
- **`scripts/setup-binaries.ts`**: Automatically downloads and installs the standalone `yt-dlp` binary on `npm install` (`postinstall`), with CLI commands for manual verification (`npm run setup:binaries`) and force updating (`npm run update:ytdlp`).
- **`server/services/VideoIngestService.ts`**: Automates YouTube Shorts downloading, faststart MP4 transcoding, catalog manifest maintenance, and LRU disk pruning.
- **`server/services/QuotaGuard.ts`**: Tracks daily YouTube Data API v3 quota usage against a 9,000-unit budget with automatic midnight rollover and protected mode fallback.
- **`VideoQueue.ts`**: Manages video sequencing, background preloading, offline failover, and interactive channel navigation.

### 2.5 Subsystem E: Reactive Audio Engine (`src/audio/`)

- **`AudioEngine.ts`**: Web Audio API synth producing continuous ambient CRT audio:
  - **15.734 kHz Sine Oscillator**: Recreates the classic NTSC CRT flyback transformer high-pitched whistle.
  - **White / Pink Noise Node**: Procedural static noise buffer modulated by user motion and static gain uniforms.
  - **Dynamic Low-Pass Filter**: Opens from 1,200 Hz to 18,000 Hz as spectator locks signal.
  - **Analog Rotary Switch Zap Synth (`playZapSound`)**: Sawtooth oscillator synthesizing directional frequency ramps (2,400→450Hz for `prev`, 650→3,200Hz for `next`, 1,200→3,600→500Hz for `random`) with exponential decay.

### 2.6 Subsystem F: Calibration & Diagnostic UI (`src/ui/`)

- **`CalibrationConsole.ts`**: Comprehensive `lil-gui` control console available as an on-screen HUD (`H` / `Ctrl+Shift+C`) and standalone window (`/calibration.html`):
  - Presets, 2×3 matrix geometry, 24-point keystone corner dragging, orientation/flips.
  - Shaders, tracking parameters, frames styling and `resetFrames()`.
  - Interaction and Channel Zap controls (`zapEnabled`, `zapNavMode`, `zapHoldSec`, `zapCooldownSec`, `zapVisualIntensity`).
  - Interactive timeline scrubber with live playback time readout.
  - Live 30 FPS readouts dashboard (FPS, distance, people, pose, density, kinetics, chroma, hold %, cooldown, zap status, quota).
  - Multi-tier JSON persistence (`config/calibration.json`, `public/calibration.json`, `localStorage`, file export/import).
- **`DebugView.ts`**: 2D camera debug overlay drawing calibrated 2×3 matrix screen quads, antenna reception meters, landmark skeletons, and frame timing metrics.
