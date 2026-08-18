import { IDLE_TIMEOUT_MS } from '../core/constants';
import { useAppStore, type HandPoint } from '../core/StateManager';
import type { TrackerFrame } from './MediaPipeTracker';

/**
 * Maps MediaPipe telemetry → Human Antenna shader uniforms (FR-03).
 */
export class GestureMapper {
  private prevWrist = { x: 0.5, y: 0.5 };
  private smoothedVelocity = 0;
  private smoothedDistance = 3;

  update(frame: TrackerFrame): void {
    const store = useAppStore.getState();
    const now = frame.timestampMs;
    const threshold = store.tracking.confidenceThreshold;

    if (!frame.present || !frame.landmarks) {
      const since = now - (store.tracking.lastSeenMs || now);
      const idle = store.tracking.lastSeenMs > 0 && since > IDLE_TIMEOUT_MS;

      if (idle) {
        // FR-03.1 Idle / Search Mode
        store.patchShaders({
          noiseGain: 1,
          signalLock: 0,
          vHold: 0.85,
          hJitter: 0.4,
          rgbSplit: 0.2,
          rippleStrength: 0,
        });
        store.patchTracking({
          present: false,
          distance: 3,
          velocity: 0,
          leftHand: inactiveHand(),
          rightHand: inactiveHand(),
        });
      }
      return;
    }

    store.patchTracking({ lastSeenMs: now, present: true });

    const lm = frame.landmarks;
    // Shoulders 11, 12 and hips 23, 24 for torso area / proximity
    const lShoulder = lm[11];
    const rShoulder = lm[12];
    const lHip = lm[23];
    const rHip = lm[24];

    const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
    const torsoHeight = Math.abs(
      (lShoulder.y + rShoulder.y) * 0.5 - (lHip.y + rHip.y) * 0.5,
    );
    const torsoArea = shoulderWidth * torsoHeight;

    const scale = store.tracking.distanceScale ?? 8.5;
    const offset = store.tracking.distanceOffset ?? 2.8;
    const minD = store.tracking.minDistance ?? 1.0;
    const maxD = store.tracking.maxDistance ?? 3.0;

    // Map torso area → approximate distance meters based on user calibration
    const rawDistance = THREE_CLAMP(offset - torsoArea * scale, minD - 0.2, maxD + 0.2);
    this.smoothedDistance = lerp(this.smoothedDistance, rawDistance, 0.15);

    const leftWrist = lm[15];
    const rightWrist = lm[16];
    const activeWrist =
      (rightWrist?.visibility ?? 0) >= threshold ? rightWrist : leftWrist;

    let velocity = 0;
    if (activeWrist) {
      const dx = activeWrist.x - this.prevWrist.x;
      const dy = activeWrist.y - this.prevWrist.y;
      velocity = Math.sqrt(dx * dx + dy * dy) * 60; // approx per-second
      this.prevWrist = { x: activeWrist.x, y: activeWrist.y };
    }
    this.smoothedVelocity = lerp(this.smoothedVelocity, velocity, 0.25);

    const leftHand = landmarksToHand(frame.leftHand ?? null, lm[15], threshold);
    const rightHand = landmarksToHand(
      frame.rightHand ?? null,
      lm[16],
      threshold,
    );

    store.patchTracking({
      distance: this.smoothedDistance,
      velocity: this.smoothedVelocity,
      torsoArea,
      leftHand,
      rightHand,
    });

    // Proximity Tuning based on calibrated min/max distance thresholds
    const distRange = Math.max(maxD - minD, 0.1);
    const proximity = THREE_CLAMP(1 - (this.smoothedDistance - minD) / distRange, 0, 1);
    const signalLock = proximity * proximity;
    const noiseGain = THREE_CLAMP(1 - signalLock * 0.95, 0.02, 1);

    // FR-03.4 Velocity Fragmentation
    const velNorm = THREE_CLAMP(this.smoothedVelocity / 1.2, 0, 1);
    const rgbSplit = velNorm * 1.4;
    const hJitter = velNorm * 0.9;
    const vHold = (1 - signalLock) * 0.35;

    // FR-03.3 Localized Hand Interference
    const handActive = leftHand.active || rightHand.active;
    const rippleStrength = handActive ? 0.35 + velNorm * 0.65 : 0;

    store.patchShaders({
      signalLock,
      noiseGain,
      rgbSplit,
      hJitter,
      vHold,
      rippleStrength,
    });
  }
}

function landmarksToHand(
  handLm: { x: number; y: number; z: number }[] | null,
  wristFallback: { x: number; y: number; z: number; visibility?: number } | null,
  threshold: number,
): HandPoint {
  if (handLm && handLm[8]) {
    // index fingertip
    return {
      x: THREE_CLAMP(handLm[8].x, 0, 1),
      y: THREE_CLAMP(handLm[8].y, 0, 1),
      z: handLm[8].z,
      active: true,
    };
  }
  if (wristFallback && (wristFallback.visibility ?? 1) >= threshold) {
    return {
      x: THREE_CLAMP(wristFallback.x, 0, 1),
      y: THREE_CLAMP(wristFallback.y, 0, 1),
      z: wristFallback.z,
      active: true,
    };
  }
  return inactiveHand();
}

function inactiveHand(): HandPoint {
  return { x: 0.5, y: 0.5, z: 0, active: false };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function THREE_CLAMP(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
