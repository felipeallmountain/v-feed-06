# 04 — Computer Vision & "Human Antenna" Interaction Engine

This document details the optical sensing stack, Google MediaPipe integration, spectator feature classification, algorithmic YouTube query synthesis, and the physical "Human Antenna" interaction model of **V-FEED [06]**.

---

## 1. Conceptual Framework: The Human Antenna

In traditional broadcast engineering, an analog receiver relies on a dipole "rabbit ears" antenna to pick up radio-frequency electromagnetic fields. Minor physical movements around the antenna alter the capacitance and impedance of the circuit, causing static bursts, frame rolls, or crystal-clear signal locks.

In V-FEED [06], **the spectator's physical body is the antenna**:
- As spectators physically move closer, their bodies "tune" the analog receiver.
- Raising arms mimicks antenna dipole prongs.
- Fast motion creates RF interference bursts.
- Sustained postures and collective audience behaviors actively channel-surf through algorithmic vintage broadcast archives.

```
       [ SPECTATOR PRESENCE ]                    [ PHYSICAL CRT RESPONSE ]
────────────────────────────────────────       ─────────────────────────────────────────
Empty Gallery (> 5s inactivity)         ──►    Full RF Snow (100%), V-Hold Frame Roll
Spectator at 3.0 meters (Approaching)   ──►    Signal begins to emerge, 50% static
Spectator at 1.0 meter (Sweet Spot)     ──►    100% Signal Lock, Audio Unfilters, Crisp Video
Spectator raises Hand in front of CRT   ──►    Localized Electromagnetic Ripple on that Screen
Spectator dances / jumps / waves fast   ──►    RGB Chromatic Aberration & Horizontal Jitter
Spectator holds "Rabbit Ears" (1.8s)    ──►    Curated YouTube Query: #shorts retro tv tuning
```

---

## 2. Optical Capture & Hardware Diagnostics (`CameraManager.ts`)

Located in [`src/vision/CameraManager.ts`](../../src/vision/CameraManager.ts) and [`src/vision/cameraDiagnostics.ts`](../../src/vision/cameraDiagnostics.ts):

### Multi-Resolution Fallback Ladder
Different gallery venues provide different camera hardware (from integrated 720p webcams to high-end 4K industrial USB cameras). [`CameraManager`](../../src/vision/CameraManager.ts#L5) handles this gracefully by attempting three progressive WebRTC constraint sets:

```typescript
// Resolution fallback ladder:
// 1. Full HD:  1920×1080 @ 60fps (Ideal precision for large rooms)
// 2. HD:       1280×720  @ 60fps (Balanced performance)
// 3. SD:        640×480  @ 30fps (Guaranteed fallback for older hardware)
```

### Portrait Camera Rotation Support
When the camera sensor is physically mounted vertically (portrait) to match the totem's 9:16 vertical silhouette, [`CameraManager`](../../src/vision/CameraManager.ts#L5) accepts a `rotation` parameter (`0°`, `90° CW`, `180°`, `270° CCW`). An internal offscreen canvas automatically rotates incoming frames before handing them to MediaPipe, ensuring landmark coordinates align correctly with physical space.

### Environment Probing
Before requesting camera access, [`probeCameraEnvironment()`](../../src/vision/cameraDiagnostics.ts#L16) verifies:
1. `isSecureContext`: WebRTC `getUserMedia` is blocked by modern browsers on non-HTTPS origins (except `localhost` and `127.0.0.1`).
2. `isIframe`: Prevents permission denial when embedded without `allow="camera; microphone"`.
3. Device Enumeration: Checks whether at least one video input device is physically connected.

---

## 3. Machine Learning Vision Stack (`MediaPipeTracker.ts`)

Located in [`src/vision/MediaPipeTracker.ts`](../../src/vision/MediaPipeTracker.ts#L24), the vision pipeline is built on **Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)**.

### Model Architecture
The tracker runs two neural models in parallel via WebAssembly with GPU delegation:
1. **PoseLandmarker**: Detects 33 whole-body 3D landmark points per person (shoulders, elbows, wrists, hips, knees, ankles, face keypoints). Supports multi-person detection via `maxNumPoses`.
2. **HandLandmarker**: Detects 21 3D landmarks per hand (wrist, palm, knuckle joints, fingertips) for high-precision fingertip gesture tracking.

```
       HTMLVideoElement (<video id="webcam">)
                         │
                         ▼
        MediaPipe FilesetResolver (Wasm)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   PoseLandmarker                   HandLandmarker
(33 Body Landmarks)              (21 Hand Landmarks)
        │                                 │
        └────────────────┬────────────────┘
                         │
                         ▼
             Structured TrackerFrame:
             - present: boolean
             - landmarks: NormalizedLandmark[]
             - personCount: number
             - leftHand / rightHand: HandPoint
             - velocity: number
             - torsoArea: number
```

---

## 4. Semantic Feature Extraction (`FeatureExtractor.ts`)

Located in [`src/vision/FeatureExtractor.ts`](../../src/vision/FeatureExtractor.ts#L17), this class transforms raw joint coordinates into semantic visitor states.

### 4.1 Calibrated Distance Estimation
Physical distance is calculated using the optical geometry of human anatomy: the human shoulder span (distance between landmark 11 and 12) remains constant in physical space (~40 cm). By measuring normalized screen width:
$$\text{span} = \|\vec{P}_{\text{leftShoulder}} - \vec{P}_{\text{rightShoulder}}\|$$
$$\text{distanceMeters} = \frac{k_{\text{scale}}}{\max(0.05, \text{span})} + k_{\text{offset}}$$
The resulting distance is categorized into spatial zones:
- `CLOSE`: $< 1.2\text{ meters}$
- `MEDIUM`: $1.2\text{ to }2.2\text{ meters}$
- `FAR`: $> 2.2\text{ meters}$

### 4.2 Audience Density Classification
The number of active poses detected by MediaPipe classifies the crowd:
- `EMPTY`: 0 visitors.
- `SOLO`: Exactly 1 visitor.
- `DUO`: Exactly 2 visitors.
- `GROUP`: 3 or more visitors.

### 4.3 Kinetic Dynamics & Harmonic Rhythm
To distinguish between erratic flailing, smooth dancing, and stillness:
1. **Rolling Joint Velocity (600 ms window)**: Tracks the sum of Cartesian displacements across wrists and ankles.
2. **Harmonic Rhythm Oscillation (1800 ms window)**: Performs frequency zero-crossing analysis on vertical wrist velocities. If vertical reversals occur at a rhythmic cadence (1.2 Hz to 2.5 Hz), the state is flagged as `RHYTHMIC`.
3. **Kinetic Classification**:
   - `HIGH_MOTION`: High energy, non-rhythmic bursts.
   - `RHYTHMIC`: Continuous rhythmic motion (dancing, aerobic waving).
   - `STILLNESS`: Inactivity or frozen posture.
   - `STEADY`: Natural, calm walking.

### 4.4 Semantic Key Pose Recognition & Matrix Mapping
The installation recognizes **6 signature semantic poses**, directly mapped 1:1 to the 6 physical CRT screens via `SCREEN_POSE_MAP`:

| Screen | Target Pose | Geometric Trigger Rule | Physical Analogy |
| :--- | :--- | :--- | :--- |
| **CRT 01** (Top-Left) | `POSE_ANTENNA` | Both wrists elevated above head ($Y_{\text{wrist}} < Y_{\text{head}} - 0.04$) with wide span $> 1.05\times$ shoulder width. | "Rabbit Ears" VHF dipole antenna posture. |
| **CRT 02** (Top-Right) | `POSE_DIAL_TUNER` | Asymmetric diagonal pointing ($|Y_{\text{wristL}} - Y_{\text{wristR}}| > 0.26$, high arm extended, low arm relaxed). | Rotary channel dial knob tuning / Yagi point. |
| **CRT 03** (Mid-Left) | `POSE_SURPRISE` | Both wrists brought close to face ($D_{\text{wrist,face}} < 0.17$, wrist span $< 0.22$, hands above shoulders). | Commercial shock gasp / Hands to face. |
| **CRT 04** (Mid-Right) | `POSE_WINGSUIT` | Arms spread wide horizontally ($|Y_{\text{wrist}} - Y_{\text{shoulder}}| < 0.13$, total span $> 2.1\times$ shoulder width). | Horizontal dipole / Wingsuit / T-pose. |
| **CRT 05** (Bot-Left) | `POSE_LOOP_HALO` | Both wrists curved overhead and touching in a loop ($Y_{\text{wrist}} < Y_{\text{head}} - 0.02, D_{\text{wrists}} < 0.17$, elbows out). | UHF circular loop antenna halo. |
| **CRT 06** (Bot-Right) | `POSE_SIGNAL_LOCK` | Both hands clasped over center sternum ($D_{\text{wrists}} < 0.15$, centered at chest within $\pm 0.12$). | Human capacitor grounding / Receiver signal lock. |

### 4.5 Clothing Chroma Color Sampling
To match video aesthetics with the audience's wardrobe, an offscreen 48×48 canvas samples the RGB pixel average in the bounding box between the visitor's chest landmarks (shoulders to hips). 
- Converts RGB to HSV space.
- Categorizes clothing color into:
  - `WARM_RED`: High saturation, red/orange hue.
  - `COOL_BLUE`: High saturation, cyan/blue hue.
  - `DARK_NEUTRAL`: Value $< 0.25$ (black, dark grey).
  - `NEUTRAL`: Low saturation (white, beige, light grey).

---

## 5. Interaction Controller & Decision Ladder (`InteractionController.ts`)

Located in [`src/vision/InteractionController.ts`](../../src/vision/InteractionController.ts#L20):

### The Conflict Resolution Priority Ladder
When multiple features occur simultaneously (e.g. two people dancing while one raises an arm), the controller resolves the conflict strictly according to priority:

```
[ EXTRACTED FEATURES ]
         │
         ▼
[ Priority 1: Key Poses ] ──────────► If pose != 'NONE' ─────────► PROCEED TO HOLD TIMER
         │ (No Pose Detected)
         ▼
[ Priority 2: Audience Density ] ───► If density != 'EMPTY' ─────► PROCEED TO HOLD TIMER
         │ (Density is Default)
         ▼
[ Priority 3: Kinetic Dynamics ] ───► If kinetics != 'STEADY' ───► PROCEED TO HOLD TIMER
```

### The 1.8-Second Sustained Hold Debounce
Accidental gestures must not switch videos. The visitor must sustain the state continuously for **1.8 seconds (1800 ms)**:
- `holdProgress` ramps smoothly from `0.0` to `1.0`.
- The [Skeleton Overlay](./03-rendering-and-glsl-pipeline.md) renders a glowing circular progress gauge around the visitor's head.
- If the visitor breaks the pose before 1.8s, `holdTimeMs` resets immediately.

### Cooldown Timer
Once a query is triggered, a **10-second cooldown timer** locks further query triggers while continuing to update continuous antenna noise and signal lock.

---

## 6. Algorithmic Query Synthesis (`BroadcastQuerySynthesizer.ts`)

Located in [`src/vision/BroadcastQuerySynthesizer.ts`](../../src/vision/BroadcastQuerySynthesizer.ts):

When a gesture completes its 1.8-second hold, [`synthesizeBroadcastQuery()`](../../src/vision/BroadcastQuerySynthesizer.ts#L174) synthesizes a YouTube Shorts query centered on **Media Archaeology, Vintage Television, and Archival Broadcasts**:

```
                                  ┌───────────────────────────┐
                                  │   Interaction State       │
                                  │   - Active Pose           │
                                  │   - Audience Density      │
                                  │   - Kinetic Rhythm        │
                                  │   - Clothing Chroma       │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ BroadcastQuerySynthesizer │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
       [ Curated Base Query ]                                        [ Chroma Color Tone ]
   e.g. "#shorts tuning vintage tv                                e.g. "1950s black and white
         rabbit ears"                                                   tv close up"
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │
                                                ▼
                                   [ Final Synthesized Query ]
                    "#shorts tuning vintage tv rabbit ears 1950s black and white tv close up"
                                                │
                                                ▼
                                 Dispatched to VideoQueue.ts
```

### Query Template Matrix

| Category | Target Trigger | Sample Base Query |
| :--- | :--- | :--- |
| **`POSE_ANTENNA`** | Spectator raises rabbit ears (VHF Dipole) | `#shorts tuning vintage tv rabbit ears` |
| **`POSE_DIAL_TUNER`** | Asymmetric pointing (Channel Knob / Yagi) | `#shorts vintage tv channel dial knob click` |
| **`POSE_SURPRISE`** | Spectator holds cheeks (Commercial Gasp) | `#shorts classic tv news bloopers live` |
| **`POSE_WINGSUIT`** | Arms spread wide (Horizontal Dipole) | `#shorts skydiving vintage tv broadcast` |
| **`POSE_LOOP_HALO`** | Hands overhead loop (UHF Halo Antenna) | `#shorts uhf antenna tv broadcast vintage` |
| **`POSE_SIGNAL_LOCK`** | Hands over sternum (Human Capacitor) | `#shorts tv emergency broadcast system signal lock` |
| **`SOLO`** | One spectator in gallery | `#shorts retro news anchor monologue` |
| **`DUO`** | Two spectators in gallery | `#shorts retro sitcom dynamic duo scene` |
| **`GROUP`** | Three or more spectators | `#shorts live studio audience laugh track` |
| **`HIGH_MOTION`** | Fast jumping / waving | `#shorts vintage dance tv show 80s` |
| **`RHYTHMIC`** | Cadenced dancing | `#shorts soul train line vintage dance` |
| **`STILLNESS`** | Gallery frozen / quiet | `#shorts vintage television test pattern` |

---

## 7. Continuous Hardware-Level Mapping (`GestureMapper.ts`)

Located in [`src/vision/GestureMapper.ts`](../../src/vision/GestureMapper.ts#L8), this module translates continuous physical movement directly into GLSL uniforms and Web Audio levels every frame:

### Signal Lock & Static Dissipation
$$\text{lock} = \text{clamp}\left(1.0 - \frac{\text{distance} - 1.0}{2.0}, 0.0, 1.0\right)$$
$$\text{noiseGain} = 1.0 - \text{lock}$$
As a visitor steps from 3m to 1m, RF static noise drops linearly to 0% and the video locks into focus.

### Velocity Chromatic Aberration
$$\text{rgbSplit} = \min(0.08, \text{velocity} \times 0.25)$$
Sudden physical movements produce horizontal color fringes on phosphor lines.

### Hand Interference Targeting
Normalized hand coordinates are translated directly to the 2×3 matrix:
$$\text{uRippleCenter} = (X_{\text{hand}}, Y_{\text{hand}})$$
If the hand is held steady, the wave ripples outward specifically on the CRT quadrant containing the hand.

---

*Next Step: Explore [05. Audio Synthesis Engine](./05-audio-synthesis-engine.md) to understand how the analog soundscape is generated.*
