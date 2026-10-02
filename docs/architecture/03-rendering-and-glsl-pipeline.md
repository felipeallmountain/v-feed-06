# 03 — Rendering Engine & GLSL Shader Pipeline

This document details the graphics architecture, Three.js WebGL setup, 2×3 matrix partitioning, custom GLSL shader stack, and 4-corner keystone quad warping of **V-FEED [06]**.

---

## 1. Architectural Philosophy: The Single-Pass Composite Shader

Many WebGL post-processing pipelines chain multiple rendering passes using Frame Buffer Objects (FBOs) in a "ping-pong" structure (Pass 1: Video → Pass 2: Glitch → Pass 3: Blur → Pass 4: CRT Curvature → Pass 5: Output).

In V-FEED [06], **the entire visual pipeline is executed in a single GLSL fragment shader pass** ([`CompositeShader.ts`](../../src/rendering/shaders/CompositeShader.ts#L8)).

### Why Single-Pass?
1. **Frame Budget (16.6 ms @ 60 FPS)**: Museum kiosks frequently run on compact mini-PCs (e.g. Intel NUC, Mac Mini, or mid-range GPUs). Multi-pass FBO ping-pong causes continuous texture read/write memory bandwidth bottlenecks at 1080×1920 resolution.
2. **Zero Texture Allocation Churn**: A single-pass shader reads directly from the HTML5 `<video>` texture unit (`tDiffuse`) and procedural noise unit (`tNoise`) and writes directly to the canvas frame buffer.
3. **Cohesive Physical Emulation**: Simulating an analog CRT requires optical distortions (barrel curvature) and electronic distortions (horizontal sync jitter, V-Hold roll) to interact naturally. In a single shader, electronic scanlines curve naturally with the glass lens geometry rather than being stamped flat on top.

---

## 2. Three.js Scene Composition (`SceneManager.ts`)

Located in [`src/rendering/SceneManager.ts`](../../src/rendering/SceneManager.ts), the [`SceneManager`](../../src/rendering/SceneManager.ts#L20) sets up an ultra-lightweight WebGL environment:

```
┌───────────────────────────────────────────────────────────┐
│               THREE.WebGLRenderer                         │
│  - canvas: HTMLCanvasElement (#stage)                     │
│  - antialias: false (CRT scanlines provide texturing)     │
│  - outputColorSpace: THREE.SRGBColorSpace                 │
│  - maxPixelRatio: capped at 2.0 via MAX_DEVICE_PIXEL_RATIO│
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│               THREE.OrthographicCamera                    │
│  - left: -1, right: 1, top: 1, bottom: -1                 │
│  - near: 0, far: 1                                        │
│  (Unit quad mapping: Screen space matches NDC [-1, 1])    │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│               THREE.Mesh (Fullscreen Plane)               │
│  - Geometry: THREE.PlaneGeometry(2, 2)                    │
│  - Material: THREE.ShaderMaterial                         │
│    - vertexShader: compositeVertexShader                  │
│    - fragmentShader: compositeFragmentShader              │
└───────────────────────────────────────────────────────────┘
```

### Video Texture Binding (`VideoTexturePass.ts`)
The [`VideoTexturePass`](../../src/rendering/VideoTexturePass.ts#L4) encapsulates the HTML5 `<video>` element into a `THREE.VideoTexture`.
- `minFilter` / `magFilter`: Set to `THREE.LinearFilter` for smooth bilinear interpolation during tube distortion.
- `generateMipmaps`: Disabled (`false`) to prevent expensive per-frame mipmap generation overhead on video playback.

---

## 3. 2×3 Matrix Partitioning Geometry (`MatrixSplitter.ts`)

The logical coordinate space of the 1080×1920 canvas is defined in [`src/rendering/MatrixSplitter.ts`](../../src/rendering/MatrixSplitter.ts).

### UV Coordinate Partitioning
In WebGL, UV coordinates range from `(0, 0)` at the bottom-left to `(1, 1)` at the top-right. The 6 screens map to the following UV quadrants:

```
UV Y: 1.0 ┌───────────────────┬───────────────────┐
          │      CRT 01       │      CRT 02       │
          │   Col 0, Row 2    │   Col 1, Row 2    │
          │    (Top-Left)     │    (Top-Right)    │
UV Y: 0.66├───────────────────┼───────────────────┤
          │      CRT 03       │      CRT 04       │
          │   Col 0, Row 1    │   Col 1, Row 1    │
          │    (Mid-Left)     │    (Mid-Right)    │
UV Y: 0.33├───────────────────┼───────────────────┤
          │      CRT 05       │      CRT 06       │
          │   Col 0, Row 0    │   Col 1, Row 0    │
          │    (Bot-Left)     │    (Bot-Right)    │
UV Y: 0.0 └───────────────────┴───────────────────┘
          UV X: 0.0           UV X: 0.5           UV X: 1.0
```

### Bezel Geometry & Bezel Compensation
When physical CRT monitors are stacked in a rack, their plastic/metal outer casings create gaps.
- `uBezelWidthX`: Normalized width of the vertical bezel gap between column 0 and column 1.
- `uBezelWidthY`: Normalized height of the horizontal bezel gap between rows.
- `uBezelOuter`: Border padding around the outer perimeter of the totem.
- `uBezelComp` (Bezel Compensation): Interpolates between:
  - **`0.0` (Stretched/Uncompensated)**: The entire video is drawn across the visible glass only; objects crossing bezels appear cut or jumping.
  - **`1.0` (Geometric Optical Passthrough)**: The image acts as though the physical bezels are a window grid sitting in front of a continuous screen. Lines and moving bodies maintain continuous geometric angles behind the bezels.

---

## 4. 4-Corner Quad Pinning & Keystone Correction

In physical art installations, CRT monitors are rarely perfectly squared. Older analog tubes exhibit trapezoidal keystone distortion, physical chassis tilt, and analog raster size variations.

To solve this without external hardware, V-FEED [06] implements **per-monitor 4-corner quad pinning** directly inside the GPU fragment shader.

### The Mathematics: Closed-Form Inverse Bilinear Interpolation
Standard affine 2D transformations cannot map an arbitrary convex quadrilateral into a rectangle without perspective distortion. A full 3×3 projective homography matrix requires an expensive 3×3 matrix inversion.

Instead, [`CompositeShader.ts`](../../src/rendering/shaders/CompositeShader.ts#L63-L103) implements a closed-form **Inverse Bilinear Interpolation** function ([`invBilinear`](../../src/rendering/shaders/CompositeShader.ts#L63)):

```glsl
// Closed-form inverse bilinear mapping from screen pixel p to local quad (u, v) in [0, 1]
vec2 invBilinear(vec2 p, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
  vec2 e = p1 - p0;
  vec2 f = p3 - p0;
  vec2 g = p2 - p3 - p1 + p0;
  vec2 q = p - p0;

  float k2 = cross2d(g, f);
  float k1 = cross2d(e, f) + cross2d(q, g);
  float k0 = cross2d(q, e);

  float v = -1.0;
  if (abs(k2) < 0.00001) {
    if (abs(k1) > 0.00001) {
      v = -k0 / k1;
    }
  } else {
    float d = k1 * k1 - 4.0 * k2 * k0;
    if (d >= 0.0) {
      float sqrtD = sqrt(d);
      float v1 = (-k1 - sqrtD) / (2.0 * k2);
      float v2 = (-k1 + sqrtD) / (2.0 * k2);
      if (v1 >= -0.001 && v1 <= 1.001) v = v1;
      else if (v2 >= -0.001 && v2 <= 1.001) v = v2;
    }
  }

  if (v < -0.001 || v > 1.001) return vec2(-1.0);
  v = clamp(v, 0.0, 1.0);

  vec2 denom = e + v * g;
  vec2 num = q - v * f;
  float u = (abs(denom.x) > abs(denom.y)) ? (num.x / denom.x) : (num.y / denom.y);

  if (u < -0.001 || u > 1.001) return vec2(-1.0);
  return vec2(clamp(u, 0.0, 1.0), v);
}
```

### Corner Offsets Array
The shader receives `uniform vec2 uCorners[24]` computed by [`computeAllScreenCorners()`](../../src/rendering/MatrixSplitter.ts#L141). 
Each screen $i \in [0..5]$ has 4 vertex offsets:
- `p0 = Bottom-Left (BL)`
- `p1 = Bottom-Right (BR)`
- `p2 = Top-Right (TR)`
- `p3 = Top-Left (TL)`

Curators can drag any of the 24 corner handles in real time on the [Calibration Console](./07-calibration-and-control-deck.md) to align the projected image precisely to the curved glass bezel of each physical CRT.

---

## 5. GLSL Shader Stack & Visual Emulation

The composite fragment shader integrates three modular GLSL chunks:

```
┌─────────────────────────────────────────────────────────────┐
│                 compositeFragmentShader                     │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  invBilinear() ──► Screen Quadrant Quad Mapping     │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │  CRTShader.ts:                                      │   │
│   │  - Barrel Curvature Lens Distortion                 │   │
│   │  - Sinusoidal Horizontal Scanlines                  │   │
│   │  - RGB Phosphor Triad Shadow Mask                   │   │
│   │  - Corner Vignette Falloff                          │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │  GlitchShader.ts:                                   │   │
│   │  - V-Hold Vertical Frame Roll (fract)               │   │
│   │  - Horizontal Sync Jitter & Tearing                 │   │
│   │  - RGB Chromatic Aberration Channel Split           │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │  NoiseShader.ts:                                    │   │
│   │  - High-Frequency RF Static Noise                   │   │
│   │  - Signal Lock Tuning Modulation (Human Antenna)    │   │
│   │  - Localized Electromagnetic Ripple Wave            │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.1 CRT Physicality ([`CRTShader.ts`](../../src/rendering/shaders/CRTShader.ts#L10))
1. **Barrel Lens Curvature**:
   Analog CRT tubes use curved glass faces. The distortion is calculated using radial polynomial displacement:
   $$\vec{r} = \vec{uv} - 0.5$$
   $$\vec{uv}_{distorted} = 0.5 + \vec{r} \cdot (1.0 + k \cdot |\vec{r}|^2)$$
2. **Scanlines**:
   Cathode ray electron guns trace horizontal raster lines. Modulated via high-frequency sine waves:
   $$\text{scanline} = 1.0 - \text{intensity} \cdot (0.5 + 0.5 \cdot \sin(\vec{uv}.y \cdot \text{lineCount}))$$
3. **Phosphor Shadow Mask Triads**:
   Sub-pixel red, green, and blue phosphor stripes are simulated by sampling an alternating 3-column RGB grid:
   $$\text{mask} = \begin{cases} (1.0, \text{dim}, \text{dim}) & \text{if } x \equiv 0 \pmod 3 \\ (\text{dim}, 1.0, \text{dim}) & \text{if } x \equiv 1 \pmod 3 \\ (\text{dim}, \text{dim}, 1.0) & \text{if } x \equiv 2 \pmod 3 \end{cases}$$

### 5.2 Transmission Glitches ([`GlitchShader.ts`](../../src/rendering/shaders/GlitchShader.ts#L2))
1. **V-Hold Frame Roll**:
   When television vertical synchronization is lost, the frame scrolls vertically:
   $$\vec{uv}.y = \text{fract}(\vec{uv}.y + \text{time} \cdot \text{vHoldSpeed})$$
2. **Horizontal Sync Jitter**:
   Phase drift in the horizontal oscillator causes horizontal tearing on scanlines:
   $$\vec{uv}.x = \vec{uv}.x + \sin(\vec{uv}.y \cdot 120.0 + \text{time} \cdot 30.0) \cdot \text{jitterStrength}$$
3. **RGB Channel Split (Chromatic Aberration)**:
   Color channels are sampled at displaced coordinates to simulate misaligned deflection yokes:
   $$R = \text{sample}(\vec{uv} + \vec{\delta}), \quad G = \text{sample}(\vec{uv}), \quad B = \text{sample}(\vec{uv} - \vec{\delta})$$

### 5.3 Localized Hand Ripple Interference ([`NoiseShader.ts`](../../src/rendering/shaders/NoiseShader.ts#L20-L26))
When a spectator holds their hand in front of a monitor, [`GestureMapper`](../../src/vision/GestureMapper.ts#L8) sets `uRippleCenter` to the hand's normalized coordinate and boosts `uRippleStrength`. The shader calculates `rippleDistort()` in [`NoiseShader.ts`](../../src/rendering/shaders/NoiseShader.ts#L20):
$$\text{dist} = |\vec{uv} - \vec{u}_{\text{rippleCenter}}|$$
$$\vec{uv} = \vec{uv} + \frac{\vec{uv} - \vec{u}_{\text{rippleCenter}}}{\text{dist}} \cdot \sin(\text{dist} \cdot 48.0 - \text{strength} \cdot 12.0) \cdot \text{strength} \cdot 0.02 \cdot e^{-6.0 \cdot \text{dist}}$$

### 5.4 Per-Monitor Transformations & Cover Sampling
To support physical mounting variations and seamless video framing:
- **Flips & Rotations**: `uScreenFlips[6]` (`vec2` per screen) and `uScreenRotations[6]` (float per screen in degrees), alongside global flags `uGlobalFlipH`, `uGlobalFlipV`, and `uGlobalRotation`.
- **Aspect Ratio & Cover Fit**: `uVideoAspect`, `uViewportAspect`, and `uCoverSample` maintain correct 9:16 vertical video proportions across arbitrary display aspect ratios without anamorphic stretching.
- **Bezel Chassis Rendering**: When `uBezelChassis` is enabled, the areas between virtual screens render a dark, metallic chassis bezel texture with rounded inner borders (`uCornerRounding`).

---

## 6. Phosphor Skeleton Overlay (`SkeletonOverlay.ts`)

Located in [`src/rendering/SkeletonOverlay.ts`](../../src/rendering/SkeletonOverlay.ts#L132), this class manages a high-performance 2D canvas (`#skeleton-stage`) layered directly over the WebGL canvas.

### Features
- **Bone Graph**: Connects 33 MediaPipe pose landmarks (shoulders, elbows, wrists, hips, knees, ankles) and 21 hand joints.
- **Palette Presets**:
  - `phosphor`: Monochrome P1 green (`#3ddc97`) with neon glow.
  - `cyan`: Cyberpunk turquoise (`#00f3ff`).
  - `amber`: Monochrome P3 amber (`#ffb000`).
  - `magenta`: Synthwave violet (`#ff007f`).
- **Tube Curvature Conformance**: Skeletons are mathematically warped using the identical barrel curvature formula as the underlying WebGL shader so drawn bones align perfectly with the distorted CRT video image.

---

## 7. Procedural Fallback Feed (`ProceduralFeed.ts`)

Located in [`src/rendering/ProceduralFeed.ts`](../../src/rendering/ProceduralFeed.ts), this module generates a live canvas-based animation when no video files are present or while the video queue is initializing:
- Animated green phosphor oscilloscope sine and Lissajous curves.
- Synchronized timecode, telemetry readouts, and frame counters.
- Discrete monitor identifier tags (`CRT [01]` to `CRT [06]`).
- Audio frequency waveform visualization.

---

*Next Step: Explore [04. Computer Vision & Human Antenna](./04-computer-vision-and-human-antenna.md) to understand how spectator movement is analyzed and mapped.*
