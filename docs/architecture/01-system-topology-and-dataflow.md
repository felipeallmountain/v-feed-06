# 01 — System Topology & End-to-End Data Flow

This document details the high-level system topology, physical-to-logical viewport mapping, end-to-end execution flow, and inter-process communication architecture of **V-FEED [06]**.

---

## 1. Physical vs. Logical Architecture

A common point of confusion for new developers is whether V-FEED [06] runs six separate browser windows or renders to six physical outputs directly from the software.

### The Single-Signal Invariant
The software generates **a single vertical video signal at 1080×1920 resolution (9:16 aspect ratio)** running at a steady 60 frames per second. 

```
                                      ┌────────────────────────┐
                                      │   Webcam / MediaPipe   │
                                      └───────────┬────────────┘
                                                  │ (Landmarks)
                                                  ▼
                                      ┌────────────────────────┐
                                      │  Interaction Engine    │
                                      └───────────┬────────────┘
                                                  │ (State Uniforms)
                                                  ▼
                                      ┌────────────────────────┐
                                      │ Three.js WebGL Engine  │
                                      │ (Single 1080×1920 Pass)│
                                      └───────────┬────────────┘
                                                  │ (HDMI 1080×1920 @ 60Hz)
                                                  ▼
                                      ┌────────────────────────┐
                                      │ 1-to-6 Hardware Matrix │
                                      │ Splitter / Controller  │
                                      └───────────┬────────────┘
                        ┌─────────────┬───────────┼───────────┬─────────────┐
                        ▼             ▼           ▼           ▼             ▼
                   [ CRT 01 ]    [ CRT 02 ]  [ CRT 03 ]  [ CRT 04 ]    [ CRT 05 ]    [ CRT 06 ]
                   (Top-Left)    (Top-Right) (Mid-Left)  (Mid-Right)   (Bot-Left)    (Bot-Right)
```

The division into 6 discrete CRT viewports occurs **entirely inside the GPU fragment shader** ([`CompositeShader.ts`](../../src/rendering/shaders/CompositeShader.ts#L8)). 

### Physical Matrix Topology
The 6 physical CRT screens are arranged in a 2-column by 3-row vertical totem:

| Monitor | Name | Position | Logical Bounds (UV X, Y) | Target Resolution (Native) |
| :--- | :--- | :--- | :--- | :--- |
| **CRT 01** | Top-Left | Col 0, Row 2 | `X: [0.0, 0.5]`, `Y: [0.666, 1.000]` | ~540 × 640 px |
| **CRT 02** | Top-Right | Col 1, Row 2 | `X: [0.5, 1.0]`, `Y: [0.666, 1.000]` | ~540 × 640 px |
| **CRT 03** | Mid-Left | Col 0, Row 1 | `X: [0.0, 0.5]`, `Y: [0.333, 0.666]` | ~540 × 640 px |
| **CRT 04** | Mid-Right | Col 1, Row 1 | `X: [0.5, 1.0]`, `Y: [0.333, 0.666]` | ~540 × 640 px |
| **CRT 05** | Bot-Left | Col 0, Row 0 | `X: [0.0, 0.5]`, `Y: [0.000, 0.333]` | ~540 × 640 px |
| **CRT 06** | Bot-Right | Col 1, Row 0 | `X: [0.5, 1.0]`, `Y: [0.000, 0.333]` | ~540 × 640 px |

*(Defined in code as [`MATRIX_QUADRANTS`](../../src/rendering/MatrixSplitter.ts#L46) in [`src/rendering/MatrixSplitter.ts`](../../src/rendering/MatrixSplitter.ts)).*

---

## 2. End-to-End Frame Lifecycle & Data Flow

Every 16.6 milliseconds (at 60 FPS), the system processes visual input from the physical gallery and renders a modulated video frame. The complete data pipeline consists of 10 synchronized steps:

```
[ Physical World ]
       │
       ▼ (Light & Movement)
(1) [ CameraManager.ts ] ──► getUserMedia (1080p/720p/480p @ 60 FPS)
       │
       ▼ (HTMLVideoElement <video id="webcam">)
(2) [ MediaPipeTracker.ts ] ──► Pose & Hand Landmarker Wasm Engine
       │
       ▼ (Normalized 3D Landmarks: 33 Pose + 21 Hand Points)
(3) [ FeatureExtractor.ts ] ──► Pose Classification, Crowd Density, Kinetic Energy, Clothing Chroma
       │
       ▼ (InteractionFeatureState)
(4) [ InteractionController.ts ] ──► Priority Ladder, Hold Debounce (1.8s), Cooldown (10s)
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼ (Confirmed Semantic Trigger)           ▼ (Physical Continuous Telemetry)         ▼ (Direct Uniforms)
(5) [ BroadcastQuerySynthesizer.ts ]     (6) [ GestureMapper.ts ]                  (7) [ StateManager.ts ]
       │                                        │                                         │
       ▼ (YouTube Search Query)                 ▼ (Signal Lock, Static, Split)            ▼ (Zustand useAppStore)
    [ VideoQueue.ts ]                           │                                         │
       │                                        │                                         ▼
       ▼                                        └─────────────────────────────────► (8) [ SyncChannel.ts ]
    [ VideoTexturePass.ts ]                                                               │ (Cross-Window IPC)
       │                                                                                  ▼
       │ (HTMLVideoElement <video id="feed-video">)                                [ CalibrationConsole.ts ]
       ▼
(9) [ SceneManager.ts ] ──► Three.js Orthographic Scene
       │
       ▼
    [ CompositeShader.ts ] ──► 2×3 Matrix Split + Keystone Quad Warping + CRT & Glitch Effects
       │
       ▼
[ Output Canvas (#stage) ] ──► HDMI Output (1080×1920 @ 60Hz)

(10) [ AudioEngine.ts ] ◄── Modulated by Signal Lock & Proximity
       │
       ▼
[ Stereo / 2.1 Sound Reinforcement ] ──► 15.734 kHz Hum + Static + Filtered Video Audio
```

### Step-by-Step Breakdown

#### 1. Optical Capture
- Managed by [`CameraManager`](../../src/vision/CameraManager.ts#L5).
- Requests WebRTC video stream via `navigator.mediaDevices.getUserMedia`.
- Employs an adaptive constraint fallback ladder: attempts 1080p, falls back to 720p, and finally 480p if hardware constraints require.
- Applies horizontal mirroring if configured so spectator movement feels natural like a mirror.
- Supports portrait camera rotation (`0°`, `90°`, `180°`, `270°`) for totems with vertically mounted sensors.

#### 2. Computer Vision & Landmark Extraction
- Managed by [`MediaPipeTracker`](../../src/vision/MediaPipeTracker.ts#L24).
- Passes the webcam frame into Google MediaPipe Tasks Vision (`PoseLandmarker` and `HandLandmarker`).
- Runs in Wasm with GPU hardware acceleration.
- Yields 33 normalized body landmark points and 21 hand joint coordinates.
- Calculates presence, torso bounding area, and inter-frame displacement velocity.

#### 3. Feature Extraction
- Handled by [`FeatureExtractor`](../../src/vision/FeatureExtractor.ts#L17).
- Converts raw coordinates into semantic visitor states:
  - **Audience Density**: Classifies spectator presence as `SOLO`, `DUO`, `GROUP`, or `EMPTY`.
  - **Spatial Proximity**: Maps shoulder span geometry to calibrated real-world distance (`CLOSE` < 1.2m, `MEDIUM` 1.2–2.2m, `FAR` > 2.2m).
  - **Kinetic Dynamics & Rhythm**: Evaluates a rolling 600ms velocity buffer and an 1800ms oscillation window to detect `HIGH_MOTION`, `RHYTHMIC`, or `STILLNESS`.
  - **Semantic Key Poses**: Detects signature body postures (`POSE_ANTENNA`, `POSE_DIAL_TUNER`, `POSE_SURPRISE`, `POSE_WINGSUIT`, `POSE_LOOP_HALO`, `POSE_SIGNAL_LOCK`), each mapping directly to one of the 6 CRT screens.
  - **Clothing Chroma**: Samples color data from the visitor's chest region via an offscreen 48×48 canvas to classify wardrobe palette (`WARM_RED`, `COOL_BLUE`, `DARK_NEUTRAL`, `NEUTRAL`).

#### 4. Interaction Control & Conflict Resolution
- Handled by [`InteractionController`](../../src/vision/InteractionController.ts#L20).
- Enforces an unambiguous **Priority Ladder**:
  1. **Key Poses** (highest priority)
  2. **Audience Density Shifts**
  3. **Kinetic Dynamics** (lowest priority)
- Applies a **1.8-second Sustained Hold Debounce** timer. Visitors must hold a pose or kinetic state intentionally before triggering an algorithmic reaction.
- Enforces a **10-second Cooldown Timer** after each trigger to prevent erratic video switching.

#### 5. Algorithmic Video Query Synthesis
- Managed by [`synthesizeBroadcastQuery`](../../src/vision/BroadcastQuerySynthesizer.ts#L174).
- Matches confirmed interaction states with curated vintage TV query matrices (e.g. rabbit-ear antenna tuning, classic late-night monologues, test patterns).
- Appends clothing chroma modifiers (e.g. `1950s black and white tv close up`) to stylistically color-match content.
- Sends query to [`VideoQueue`](../../src/video/VideoQueue.ts#L63), which fetches or matches local videos and seamlessly cues playback.

#### 6. Continuous Physical Mapping (The Human Antenna)
- Handled continuously by [`GestureMapper`](../../src/vision/GestureMapper.ts#L8).
- Translates continuous physical metrics into real-time shader uniforms:
  - **Proximity**: Modulates `signalLock` (0.0 to 1.0) and `noiseGain` (1.0 to 0.0).
  - **Velocity**: Modulates `rgbSplit` (chromatic aberration bursts) and `hJitter` (horizontal sync tear).
  - **Hand Coordinates**: Tracks normalized hand position `(uRippleCenter)` and activates localized ripple distortion `(uRippleStrength)` on the specific CRT quadrant where the hand is pointing.

#### 7. Global State Synchronization
- Centralized in [`useAppStore`](../../src/core/StateManager.ts#L487).
- Updates reactive state slices without triggering React-style DOM re-renders.

#### 8. Cross-Window Synchronization (SyncChannel)
- Managed by [`SyncChannel`](../../src/core/SyncChannel.ts#L116).
- Broadcasts 30 FPS telemetry ticks and state changes to external calibration windows or admin dashboards via the `BroadcastChannel` API.

#### 9. WebGL Rendering & 2×3 Matrix Splitting
- Executed by [`SceneManager`](../../src/rendering/SceneManager.ts#L20) and [`compositeFragmentShader`](../../src/rendering/shaders/CompositeShader.ts#L8).
- Projects the active `<video>` texture across a fullscreen quad.
- Evaluates 6-screen UV partitioning, keystone quad pinning (`invBilinear`), CRT glass curvature, scanlines, phosphor mask, glitch distortions, and bezels in a **single GPU pass**.

#### 10. Web Audio DSP Synthesis
- Managed by [`AudioEngine`](../../src/audio/AudioEngine.ts#L9).
- Dynamically mixes:
  - Video soundtrack (lowpass filter opens as signal locks).
  - Procedural RF TV static noise (attenuates as spectator approaches).
  - 15.734 kHz NTSC CRT flyback transformer whistle.

---

## 3. Multi-Window System Architecture

To allow installation curators to calibrate the screens on-site without revealing UI panels to visitors, V-FEED [06] uses a distributed multi-window architecture connected via [`SyncChannel`](../../src/core/SyncChannel.ts#L116):

```
┌────────────────────────────────────────┐         ┌────────────────────────────────────────┐
│      WINDOW 1: INSTALLATION STAGE      │         │      WINDOW 2: CALIBRATION CONSOLE     │
│       http://localhost:5173/           │         │  http://localhost:5173/calibration.html│
│                                        │         │                                        │
│  - Fullscreen 1080×1920 Clean Canvas   │         │  - Interactive 2×3 Matrix Visualizer   │
│  - MediaPipe Vision Processing         │         │  - 24-Point Corner Keystone Dragging   │
│  - Web Audio Graph Output              │         │  - Full lil-gui Parameter Deck         │
│  - WebGL Single-Pass Shader Pass       │         │  - Video Ingestion & Mode Controls     │
│  - Role: 'MAIN_STAGE'                  │         │  - Role: 'CALIBRATION_CONSOLE'         │
└───────────────────┬────────────────────┘         └───────────────────┬────────────────────┘
                    │                                                  │
                    │         BroadcastChannel ('vfeed-sync')          │
                    │         (Fallback: localStorage Events)          │
                    └───────────────────────►◄─────────────────────────┘
                                            │
                                            │ REST API (JSON)
                                            ▼
                           ┌─────────────────────────────────┐
                           │      NODE.JS EXPRESS SERVER     │
                           │     http://localhost:3000/      │
                           │                                 │
                           │  - /api/playlist & /fallback    │
                           │  - /api/calibration (Save/Load) │
                           │  - /api/perf (Soak Metrics)     │
                           │  - /admin (Ingest Control Deck) │
                           └─────────────────────────────────┘
```

### IPC Message Protocol
The communication bridge is fully typed and handles four primary message types:

1. `STATE_PATCH`: Sent from the Calibration Console to update shader uniforms, tracking thresholds, or frame styles on the Main Stage in real time.
2. `TELEMETRY_TICK`: Sent from the Main Stage at 30 Hz containing live FPS, user presence, distance in meters, active poses, and YouTube quota levels.
3. `REMOTE_COMMAND`: Dispatches operational commands such as `play`, `pause`, `next`, `prev`, `set_video_mode`, or `reset_defaults`.
4. `REQUEST_INITIAL_STATE` / `SEND_INITIAL_STATE`: Handshake protocol when a calibration window opens, pulling full configuration from the active main stage.

---

## 4. Latency Budget & Performance Invariants

To maintain the illusion of an analog physical antenna, latency between spectator movement and visual response must remain imperceptible:

```
[ Optical Capture ] ──────► ~16.6 ms (60 FPS Camera Frame Interval)
[ MediaPipe Tracking ] ───► ~12.0 ms (GPU Wasm Landmarker Inference)
[ Feature & State ] ──────►  ~1.5 ms (FeatureExtractor + GestureMapper)
[ WebGL Render Pass ] ────►  ~8.0 ms (Single-Pass GLSL Composite)
[ Display Scanout ] ──────►  ~6.0 ms (1080×1920 60Hz HDMI Scanout)
──────────────────────────────────────────────────────────────────
TOTAL SYSTEM LATENCY:       ~44.1 ms (< 45 ms Target Threshold)
```

### Key Performance Rules for Developers:
1. **Never create intermediate Render Targets (FBOs)** in the render loop without profiling. Every FBO read/write adds memory bandwidth latency.
2. **Never allocate objects inside the animation loop**. All vectors, arrays, and matrices used in [`App.ts`](../../src/core/App.ts#L22) and [`SkeletonOverlay.ts`](../../src/rendering/SkeletonOverlay.ts#L132) are pre-allocated.
3. **Keep MediaPipe processing asynchronous** from the WebGL render loop so an occasional vision latency spike does not drop graphics frame rates below 60 FPS.

---

*Next Step: Explore [02. Frontend Core & State Management](./02-frontend-core-and-state.md) to dive into application orchestration and state architecture.*
