# 01 — AI Agent Workflow & Engineering Conventions

This document outlines the collaborative engineering methodology, architectural principles, and execution guidelines followed by AI agents working on the **V-FEED [06]** codebase.

---

## 1. Collaborative Agent Workflow & Methodology

When developing or modifying V-FEED [06], AI agents must adhere to the following 5-stage lifecycle:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Context      │────>│ 2. Subsystem    │────>│ 3. Strict       │
│    Inspection   │     │    Scaffolding  │     │    Implementation│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐                             ┌─────────────────┐
│ 5. Verification │<────────────────────────────│ 4. Empirical    │
│    & Logging    │                             │    Diagnostics  │
└─────────────────┘                             └─────────────────┘
```

1. **Context Inspection First**: Never write code blindly. AI agents must examine [agent-plan.md](file:///home/bricktop/Projects/pabellon/v-feed-06/agent-plan.md), [docs/prd.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/prd.md), and relevant modules in `src/` or `server/` before proposing modifications.
2. **Subsystem Isolation**: Maintain decoupled modules. For instance, the vision engine (`MediaPipeTracker.ts`) produces normalized metrics and never directly manipulates WebGL objects; instead, `GestureMapper.ts` updates `useAppStore` state, which drives `SceneManager.ts` uniforms.
3. **Strict Type Safety**: Use TypeScript strict mode (`tsconfig.json`). Avoid `any` types for MediaPipe or Three.js objects. Define concrete interfaces for state schemas and GLSL uniform payloads.
4. **Empirical Diagnostics**: Browser security policies (e.g. `getUserMedia` blocking, Web Audio autoplay limits) vary across environments. Agents must embed diagnostic probes (like `src/vision/cameraDiagnostics.ts`) and clear visual DOM fallbacks (`#boot-hint`, retry buttons) rather than throwing uncaught console errors.
5. **Verification & Testing**: Always verify code syntax, type checking (`npm run build` / `tsc`), and server API connectivity after making changes.

---

## 2. Engineering Conventions & Stack Guidelines

### 2.1 Frontend & Rendering Stack
- **Framework & Build**: Vite + TypeScript in native ESM.
- **Rendering Engine**: Three.js (`THREE.WebGLRenderer`, `THREE.EffectComposer`, `THREE.ShaderPass`).
- **Aspect Ratio & Layout**: Global vertical canvas **1080×1920** (9:16 portrait). Divided into a **2×3 matrix** (6 viewports of 540×640 px).
- **CSS Strategy**: Pure Vanilla CSS (`src/assets/styles.css`). Modern dark mode CRT aesthetic with CSS variables (`--bg-primary: #0a0a0c`, `--neon-cyan`, `--warning-red`). Responsive HUD overlays with `pointer-events: none` on canvas backdrops.

### 2.2 GLSL Shader Conventions
- **Uniform Naming Standard**:
  - `u_time` (`float`): Frame timestamp for procedural noise and V-Hold scrolling.
  - `u_resolution` (`vec2`): Total canvas dimensions `(1080.0, 1920.0)`.
  - `u_texture` (`sampler2D`): Base input texture (video frame or procedural fallback).
  - `u_noiseGain` (`float`): Amplitude of RF white static noise `[0.0 - 1.0]`.
  - `u_vHold` (`float`): Vertical sync displacement rate `[0.0 - 1.0]`.
  - `u_rgbSplit` (`float`): Chromatic dispersion pixel offset magnitude `[0.0 - 50.0]`.
  - `u_curvature` (`float`): CRT tube barrel distortion coefficient `[0.0 - 0.5]`.
  - `u_handPos` (`vec2`): Normalized user gesture coordinates `[0.0, 1.0]`.
  - `u_handActive` (`float`): Binary flag `(0.0 / 1.0)` indicating active user proximity.
- **Precision**: Set default precision `precision highp float;` in all fragment shaders to prevent artifacts on mobile or integrated GPUs.

### 2.3 Computer Vision & Tracking Rules
- **Library**: `@mediapipe/tasks-vision` loaded via WebAssembly (`PoseLandmarker`, `HandLandmarker`).
- **Framerate Optimization**: Infer tracking state asynchronously in `requestAnimationFrame` without blocking render calls.
- **Camera Fallback Handling**: Always handle `NotAllowedError`, `NotFoundError`, and `NotReadableError` gracefully by presenting the user with an explicit `#allow-camera` unlock button and detailed diagnostic messages.

### 2.4 Server & Video Ingestion Rules
- **Server Environment**: Node.js + Express + TypeScript (`server/index.ts`).
- **YouTube Service**: YouTube Data API v3 (`/api/playlist` endpoint) with automatic fallback to `/public/fallback-videos/` local MP4 assets if offline or quota exceeded.
- **Cross-Origin Handling**: Set proper CORS headers (`Access-Control-Allow-Origin: *`) to allow Vite dev server (`http://localhost:5173`) to fetch server resources without cross-origin blocks.

---

## 3. Performance & Stability Rules for AI Agents

1. **60 FPS Framerate Budget**: The WebGL render loop in `App.ts` must maintain ≥ 60 FPS. Minimize expensive garbage collection inside `requestAnimationFrame` (reuse `Vector2`, `Color`, and array buffers).
2. **WebGL Context Preservation**: Always call `.dispose()` on Three.js textures, geometries, materials, and render targets when hot-reloading or unmounting.
3. **No Unlocked Autoplay Assumptions**: Browsers prohibit unmuted audio or video stream autoplay without prior user interaction. Agents must ensure the `#boot-hint` overlay explicitly triggers user activation (`this.audio.unlock()` and `camera.start()`).
4. **Mouse Cursor Visibility Scope**: The mouse cursor is kept visible in development mode (`import.meta.env.DEV`), whereas `kiosk-cursor-hidden` hides the cursor only in production kiosk deployments (`npm run preview` / `kiosk.sh`).
