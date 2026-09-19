# 07 — Calibration System & Installation Control Deck

This document details the on-site calibration workflows, the standalone Operator Calibration Console, interactive 24-point keystone quad dragging, installation presets, and the backend Administration Deck of **V-FEED [06]**.

---

## 1. Dual-Screen Operator Workflow

In gallery and museum settings, technical adjustments must never ruin the visitor's immersion. Technicians cannot open visible parameter menus directly on the artwork totem.

To solve this, V-FEED [06] implements a **Dual-Screen Architecture**:

```
 ┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
 │       GALLERY AUDIENCE VIEWPORT         │       │        CURATOR / OPERATOR VIEW          │
 │        http://localhost:5173/           │       │  http://localhost:5173/calibration.html │
 │                                         │       │                                         │
 │   - Clean 1080×1920 canvas output       │       │   - Interactive 2×3 Matrix Canvas       │
 │   - Zero UI controls or mouse cursors   │       │   - 24-point corner keystone drag handles│
 │   - Fullscreen kiosk presentation       │       │   - Full lil-gui parameter deck         │
 │   - Role: 'MAIN_STAGE'                  │       │   - Role: 'CALIBRATION_CONSOLE'         │
 └────────────────────┬────────────────────┘       └────────────────────┬────────────────────┘
                      │                                                 │
                      │         BroadcastChannel ('vfeed-sync')         │
                      └───────────────────────►◄────────────────────────┘
```

Operators connect their laptop or tablet to the same local network or use a secondary monitor, opening `/calibration.html`. Any slider moved or corner dragged on the console updates the Main Stage canvas **in real time (< 1 ms)** via [`SyncChannel.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/SyncChannel.ts#L109).

---

## 2. Standalone Operator Console (`calibration.html` & `CalibrationConsole.ts`)

Located in [`calibration.html`](file:///Users/mclovin/Documents/pabellon/v-feed-06/calibration.html) and implemented in [`src/ui/CalibrationConsole.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/ui/CalibrationConsole.ts), the console provides an interactive control environment:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [● MAIN STAGE CONNECTED] [Open Main] [Pop-Out Window] [Save to Server] [Export/Import] │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│                                        │  lil-gui PARAMETER DECK                       │
│     INTERACTIVE 2×3 MATRIX CANVAS      │                                               │
│                                        │  ▼ Display Presets                            │
│     ┌──────────────┬──────────────┐    │    Preset: [ 6x CRT Totem (Wall) ▼ ]          │
│     │  o--------o  │  o--------o  │    │                                               │
│     │  | CRT 01 |  │  | CRT 02 |  │    │  ▼ 2x3 Matrix Geometry                        │
│     │  o--------o  │  o--------o  │    │    Bezel X Gap: [====|===] 0.024              │
│     ├──────────────┼──────────────┤    │    Bezel Y Gap: [====|===] 0.024              │
│     │  o--------o  │  o--------o  │    │    Bezel Comp:  [======|=] 0.65               │
│     │  | CRT 03 |  │  | CRT 04 |  │    │                                               │
│     │  o--------o  │  o--------o  │    │  ▼ CRT & Phosphor Shaders                     │
│     ├──────────────┼──────────────┤    │    Curvature:   [===|====] 0.18               │
│     │  o--------o  │  o--------o  │    │    Scanlines:   [=====|==] 0.45               │
│     │  | CRT 05 |  │  | CRT 06 |  │    │    Phosphor:    [===|====] 0.30               │
│     │  o--------o  │  o--------o  │    │                                               │
│     └──────────────┴──────────────┘    │  ▼ Corner Keystone Offsets                    │
│                                        │    Active Screen: [ CRT 01 ▼ ]                │
│     TEST PATTERNS:                     │    Top-Left:     X: 0.00  Y: 0.00             │
│     [ Grid ] [ SMPTE ] [ Focus ]       │    Top-Right:    X: 0.00  Y: 0.00             │
│     [ Solid ] [ None (Live Feed) ]     │    Bottom-Right: X: 0.00  Y: 0.00             │
│                                        │    Bottom-Left:  X: 0.00  Y: 0.00             │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 2.1 Interactive 24-Point Corner Dragging
Every physical CRT exhibits unique trapezoidal and analog raster distortion. The console canvas renders 24 draggable handles (4 corners per screen × 6 screens).
- Clicking and dragging a handle updates `cornerOffsets` in real time.
- The new vertex quad coordinates are immediately dispatched via [`syncChannel.sendStatePatch()`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/SyncChannel.ts#L123).
- The Main Stage GPU recalculates [`invBilinear()`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/rendering/shaders/CompositeShader.ts#L63) on every pixel in the subsequent frame, warping the video to perfectly match the physical CRT glass.

### 2.2 Independent Screen Rotation & Flips
Depending on rack mounting (e.g. CRTs mounted upside down for cable routing, or rotated 90° vertically):
- **Discrete Rotation**: Supports `0°`, `90° CW`, `180°`, and `270° CCW`.
- **Fine Continuous Rotation**: Sliders allow $-180^\circ$ to $+180^\circ$ continuous alignment.
- **Horizontal / Vertical Flips**: Independent `flipH` and `flipV` toggles per monitor.

### 2.3 Built-in Alignment Test Patterns
The console can override video playback with precision test patterns:
- **Crosshatch Grid**: 10-pixel square grid for verifying straight lines across bezels.
- **SMPTE Color Bars**: Standard broadcast color calibration bars to adjust brightness/contrast knobs on physical CRTs.
- **Focus Crosshairs**: High-contrast concentric rings to tune analog flyback focus pots.
- **Solid Color**: Full white, red, green, or blue field to check tube phosphor purity.

---

## 3. Installation Display Presets

To ensure fast setup across different exhibition venues, [`CalibrationManager`](file:///Users/mclovin/Documents/pabellon/v-feed-06/src/core/CalibrationManager.ts#L46) stores four factory presets:

| Preset Name | Target Deployment | Configuration Highlights |
| :--- | :--- | :--- |
| **`6x CRT Totem (Wall)`** | Physical 2×3 CRT totem rack | `matrixSplit: true`, `bezelChassis: true`, `bezelComp: 0.65`, `perScreenVariance: 0.35`, individual tube curvature enabled. |
| **`6x Physical Output`** | Hardware video wall splitter handling physical bezels externally | `matrixSplit: true`, `bezelWidthX: 0`, `bezelWidthY: 0`, `bezelOuter: 0`, `bezelChassis: false`. |
| **`1x Flat Screen`** | Modern vertical 9:16 LCD/OLED kiosk display | `matrixSplit: false`, `tubeCurve: false`, flat scanlines, minimal vignette. |
| **`1x CRT Tube`** | Single standalone 4:3 or 16:9 vintage CRT television | `matrixSplit: false`, `tubeCurve: true`, heavy barrel distortion and phosphor triad mask. |

---

## 4. Multi-Tier Persistence Architecture

Calibration data is saved across three redundant tiers to guarantee settings are never lost after a gallery power cycle:

```
[ Operator clicks "Save to Server" ]
               │
               ├────────────────────────────────────────┐
               ▼                                        ▼
   Tier 1: Browser Storage                    Tier 2: Server Disk File
   localStorage.setItem(                      POST /api/calibration
     'vfeed-calibration', JSON                 Writes to: config/calibration.json
   )                                          (Survives browser cache wipes)
               │
               ▼
   Tier 3: Portable Backup File
   Operator clicks "Export JSON"
   Downloads: vfeed-calibration-<date>.json
   (Allows migrating settings between machines)
```

---

## 5. Administration & Ingestion Deck (`/admin`)

The Express server includes a dedicated web-based administration console located at `http://localhost:3000/admin` ([`server/routes/admin.ts`](file:///Users/mclovin/Documents/pabellon/v-feed-06/server/routes/admin.ts)):

### Capabilities
- **YouTube API Quota Monitor**: Live gauge showing units consumed today, remaining budget, and protected mode status.
- **Manual Ingestion Triggers**: Input custom YouTube search queries or playlist IDs and trigger immediate background sync.
- **Storage & Disk Pruner**: Live bar chart showing used disk megabytes and catalog video count, with one-click cleanup of temporary files or LRU pruning.
- **Catalog Inspector**: Inspect ingested video titles, channels, durations, and download timestamps.
- **Synthetic Query Simulator**: Fire simulated spectator queries (e.g. `POSE_ANTENNA`) to test video transitions without standing in front of the webcam.

---

*Next Step: Explore [08. Hardware Deployment & Operations](file:///Users/mclovin/Documents/pabellon/v-feed-06/docs/architecture/08-hardware-deployment-and-operations.md) for physical totem assembly and exhibition runbooks.*
