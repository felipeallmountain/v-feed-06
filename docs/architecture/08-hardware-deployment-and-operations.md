# 08 — Hardware Deployment, Physical Setup & Operations

This document details the physical hardware totem engineering, power distribution, signal routing, camera mounting, exhibition kiosk automation, 8-hour soak testing, and operational troubleshooting for **V-FEED [06]**.

---

## 1. Physical Totem Engineering & Structural Design

The physical installation consists of a vertical totem housing **6 vintage Cathode Ray Tube (CRT) monitors in a 2-column by 3-row matrix**:

```
                              [ OPTICAL WEBCAM (1.8m Height, 12° Downward Tilt) ]
                                                       │
                                                       ▼
                             ┌───────────────────────────────────────────────────┐
                             │               WELDED STEEL TOTEM FRAME            │
                             │                                                   │
                             │     ┌──────────────────┐  ┌──────────────────┐    │
                             │     │      CRT 01      │  │      CRT 02      │    │
                             │     │    (Top-Left)    │  │   (Top-Right)    │    │
                             │     │   ~14" - 20" CRT │  │   ~14" - 20" CRT │    │
                             │     └──────────────────┘  └──────────────────┘    │
                             │     ┌──────────────────┐  ┌──────────────────┐    │
                             │     │      CRT 03      │  │      CRT 04      │    │
                             │     │    (Mid-Left)    │  │   (Mid-Right)    │    │
                             │     └──────────────────┘  └──────────────────┘    │
                             │     ┌──────────────────┐  ┌──────────────────┐    │
                             │     │      CRT 05      │  │      CRT 06      │    │
                             │     │    (Bot-Left)    │  │   (Bot-Right)    │    │
                             │     └──────────────────┘  └──────────────────┘    │
                             │                                                   │
                             │  [ VENTILATION FANS / REAR EXHAUST / AIR GAP ]    │
                             │                                                   │
                             │  [ COMPACT HOST PC (Intel NUC / Mac Mini M2) ]    │
                             │  [ POWER DISTRIBUTION UNIT & SEQUENCED RELAYS ]   │
                             │  [ 1-TO-6 VIDEO WALL PROCESSOR / HDMI SPLITTERS ] │
                             └───────────────────────────────────────────────────┘
```

### 1.1 Structural Safety & Weight Distribution
- **Weight**: 14" to 20" color CRT monitors weigh between **12 kg and 25 kg each**. A 6-monitor stack totals **90 kg to 150 kg** of glass, copper deflection coils, and steel chassis.
- **Center of Gravity**: Due to the heavy glass faceplates, CRT monitors are strongly front-heavy. The totem frame must feature a weighted outrigger base plate or be securely bolted to the gallery floor and rear wall.
- **Thermal Management**: 6 vacuum tube monitors generate significant heat (~300W to 600W combined). The rear enclosure must provide open mesh panels and quiet 120mm exhaust fans.

### 1.2 Electrical Power & Inrush Surge Protection
Vintage CRT televisions contain an internal **degaussing coil** that activates automatically upon power-on to demagnetize the shadow mask. 
- **The Inrush Surge Problem**: A single CRT draws up to **10–15 Amperes for several hundred milliseconds** during degaussing. Powering on 6 CRTs simultaneously on a single domestic circuit will immediately trip the circuit breaker.
- **The Solution**: Power the totem using a **sequenced Power Distribution Unit (PDU)** or staggered smart relays that boot each monitor with a 1.5-second delay between screens.

---

## 2. Display Signal Routing & Cabling

The host computer outputs a single vertical HDMI signal at **1080×1920 resolution at 60 Hz**.

```
Host Computer (HDMI Out: 1080×1920 @ 60Hz)
                    │
                    ▼
      ┌───────────────────────────┐
      │ 1-to-6 Hardware Processor │  (e.g. Datapath, Matrox, or Video Wall Controller)
      └─────────────┬─────────────┘
                    │
   ┌────────┬───────┼───────┬────────┬────────┐
   ▼        ▼       ▼       ▼        ▼        ▼
HDMI-1   HDMI-2  HDMI-3  HDMI-4   HDMI-5   HDMI-6
   │        │       │       │        │        │
   ▼        ▼       ▼       ▼        ▼        ▼
 ┌──────────────────────────────────────────────┐
 │  Active HDMI-to-Composite / RCA Converters   │
 └──────────────────────────────────────────────┘
   │        │       │       │        │        │
   ▼ (CVBS Yellow RCA / BNC Analog Video)     ▼
[ CRT 01 ] [ CRT 02 ] [ CRT 03 ] [ CRT 04 ] [ CRT 05 ] [ CRT 06 ]
```

### Video Ground Loops & Hum Bars
When connecting multiple vintage analog monitors to a single computer, ground loops can introduce scrolling dark horizontal hum bars on the CRT display.
- **Mitigation**: Plug all CRTs and the host computer into the same grounded power conditioner. If hum bars persist, install video ground loop isolators on the composite RCA feeds.

---

## 3. Optical Camera Placement & Lighting

Located in [`src/vision/CameraManager.ts`](../../src/vision/CameraManager.ts):

### Ideal Placement
- **Mounting Height**: **1.8 meters** from the floor, positioned directly centered above the top row of CRTs.
- **Downward Tilt**: **12° to 15° downward angle** directed towards the visitor interaction zone (1.0m to 3.0m in front of the totem).
- **Field of View**: A 78° to 90° wide-angle lens allows full body tracking (shoulders to ankles) even when the spectator stands just 1 meter away.

### Gallery Lighting Guidelines
- **Avoid Direct Spotlights on CRTs**: Curved CRT faceplates reflect ambient ceiling lights directly into the webcam, which can confuse MediaPipe landmark detection.
- **Even Frontal Lighting**: Illuminate the visitor interaction zone with diffused, indirect warm/neutral light so spectators stand out against the background.

---

## 4. Production Kiosk Mode Automation (`scripts/kiosk.sh`)

For exhibition runnings, the system must boot automatically without showing the desktop, taskbars, or error popups.

Located in [`scripts/kiosk.sh`](../../scripts/kiosk.sh):

```bash
#!/usr/bin/env bash
# Production Kiosk Launcher for V-FEED [06]
set -euo pipefail

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

# Build production client bundle if missing
if [[ ! -d dist ]]; then
  echo "[kiosk] building production bundle..."
  npm run build
fi

# Start Express server in background if not running
if ! curl -sf "${URL}/api/health" >/dev/null 2>&1; then
  echo "[kiosk] starting server on :${PORT}"
  NODE_ENV=production npm start &
fi

# Launch Chromium in locked fullscreen kiosk
exec google-chrome \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  "${URL}"
```

### Key Chromium Flags
- `--kiosk`: Enforces true fullscreen mode, disabling address bars, tabs, and escape keys.
- `--autoplay-policy=no-user-gesture-required`: Bypasses browser audio autoplay blocks so sound starts automatically on boot.
- `--disable-session-crashed-bubble`: Prevents the "Restore pages?" prompt after an unexpected power outage.

---

## 5. 8-Hour Exhibition Soak Testing (`scripts/perf-test.ts`) & Diagnostic Scripts

Before opening an exhibition to the public, the software must pass an **8-hour continuous soak test** to verify zero memory leaks, steady 60 FPS frame rates, and thermal stability.

Located in [`scripts/perf-test.ts`](../../scripts/perf-test.ts) and backed by [`PerformanceTracker.ts`](../../server/services/PerformanceTracker.ts#L116):

### Running the Soak Test
```bash
# Start backend server
npm start

# In a separate terminal, launch the test runner
npm run test:perf
```

The CLI dashboard displays real-time statistics:
- **Client FPS & Frame Drops**: Tracks 60 FPS stability and 1% low frame times.
- **Node.js Process Memory**: Monitors Heap Used, RSS, and External buffers over hours.
- **Vision Tracking Inference Latency**: Measures MediaPipe Wasm execution time in milliseconds.
- **Automated Report Generation**: When stopped, generates a timestamped report in [`reports/perf-report-<timestamp>.md`](../../reports/) and updates `reports/perf-report-latest.md`.

### Diagnostic & Maintenance Scripts
- **Camera Rotation Verification**: [`scripts/test-camera-rotation.ts`](../../scripts/test-camera-rotation.ts) (`npx tsx scripts/test-camera-rotation.ts`) validates coordinate rotation matrices (0°, 90°, 180°, 270°) for vertical camera rigs.
- **Cache Purge**: [`scripts/clear-cache.ts`](../../scripts/clear-cache.ts) (`npm run clear-cache`) safely cleans temp files, logs, and expired video assets.

---

## 6. Operational Troubleshooting & Runbook

### Issue 1: "Camera Permission Denied" or Black Video
- **Cause**: Browser blocked camera access, or origin is not secure.
- **Resolution**: Ensure you are connecting via `http://localhost:5173` or `https://` (browsers block WebRTC on raw IP addresses like `http://192.168.1.50` without HTTPS). Press `Ctrl+Shift+C` and check the camera diagnostic tab.

### Issue 2: Audio is Silent on Startup
- **Cause**: Browser autoplay policy blocked `AudioContext`.
- **Resolution**: Click anywhere on the screen once to grant user gesture approval. For kiosks, launch via [`scripts/kiosk.sh`](../../scripts/kiosk.sh) with `--autoplay-policy=no-user-gesture-required`.

### Issue 3: Video is Choppy or Drops Below 60 FPS
- **Cause**: WebGL renderer is using integrated GPU or device pixel ratio is uncapped.
- **Resolution**: In [`src/core/constants.ts`](../../src/core/constants.ts), verify that [`MAX_DEVICE_PIXEL_RATIO`](../../src/core/constants.ts#L6) is set to `2.0` (or `1.0` on lower-spec hardware). Ensure hardware acceleration is enabled in Chrome settings (`chrome://settings/system`).

### Issue 4: YouTube API Returns Quota Exceeded (HTTP 403)
- **Cause**: Google Cloud daily quota of 10,000 units was exhausted.
- **Resolution**: The system automatically enters protected mode and serves local videos from `public/fallback-videos/`. Check status at `http://localhost:3000/admin`. The quota resets automatically at UTC midnight.

### Issue 5: Calibration Changes in Console Do Not Affect Main Stage
- **Cause**: Cross-window `BroadcastChannel` is disconnected.
- **Resolution**: Check the connection indicator badge on `calibration.html`. If it reads `○ WAITING FOR MAIN STAGE...`, ensure both windows are running on the same browser origin and that the main stage tab is active and not suspended by background tab throttling.

---

*This concludes the V-FEED [06] Architecture Documentation suite. Return to the [Master Index](./README.md) for navigation.*
