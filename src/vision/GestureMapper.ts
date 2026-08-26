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
  private smoothedPresences: number[] = [0, 0, 0, 0, 0, 0];
  private smoothedScreenLocks: number[] = [0, 0, 0, 0, 0, 0];
  private smoothedScreenNoises: number[] = [1, 1, 1, 1, 1, 1];

  update(frame: TrackerFrame): void {
    const store = useAppStore.getState();
    const now = frame.timestampMs;
    const threshold = store.tracking.confidenceThreshold;
    const smoothing = store.tracking.antennaSmoothing ?? 0.18;

    if (!frame.present || !frame.landmarks) {
      const since = now - (store.tracking.lastSeenMs || now);
      const idle = store.tracking.lastSeenMs > 0 && since > IDLE_TIMEOUT_MS;

      if (idle) {
        // FR-03.1 Idle / Search Mode: Decay all screens to full static white noise
        for (let i = 0; i < 6; i++) {
          this.smoothedPresences[i] = lerp(this.smoothedPresences[i], 0, smoothing);
          this.smoothedScreenLocks[i] = lerp(this.smoothedScreenLocks[i], 0, smoothing);
          this.smoothedScreenNoises[i] = lerp(this.smoothedScreenNoises[i], 1, smoothing);
        }

        store.patchShaders({
          noiseGain: 1,
          signalLock: 0,
          screenNoiseGains: [...this.smoothedScreenNoises],
          screenSignalLocks: [...this.smoothedScreenLocks],
          vHold: 0.85,
          hJitter: 0.4,
          rgbSplit: 0.2,
          rippleStrength: 0,
        });
        store.patchTracking({
          present: false,
          distance: 3,
          velocity: 0,
          screenPresences: [...this.smoothedPresences],
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

    // Global Proximity Tuning based on calibrated min/max distance thresholds
    const distRange = Math.max(maxD - minD, 0.1);
    const globalProximity = THREE_CLAMP(1 - (this.smoothedDistance - minD) / distRange, 0, 1);

    // --- PER-PIECE HUMAN ANTENNA COUPLING (6 CRT Screens by Landmark Dot Presence) ---
    const handBoost = store.tracking.antennaHandBoost ?? 1.6;

    // 6-Screen Bounding Boxes in top-down camera space [x in 0..1, y in 0..1]
    const screenBoxes = [
      { minX: 0.0, maxX: 0.5, minY: 0.0, maxY: 1 / 3 }, // CRT 01 [Top-L]
      { minX: 0.5, maxX: 1.0, minY: 0.0, maxY: 1 / 3 }, // CRT 02 [Top-R]
      { minX: 0.0, maxX: 0.5, minY: 1 / 3, maxY: 2 / 3 }, // CRT 03 [Mid-L]
      { minX: 0.5, maxX: 1.0, minY: 1 / 3, maxY: 2 / 3 }, // CRT 04 [Mid-R]
      { minX: 0.0, maxX: 0.5, minY: 2 / 3, maxY: 1.0 }, // CRT 05 [Bot-L]
      { minX: 0.5, maxX: 1.0, minY: 2 / 3, maxY: 1.0 }, // CRT 06 [Bot-R]
    ];

    // Collect all active landmark dots with their coordinates and weights from ALL people
    const dots: Array<{ x: number; y: number; weight: number }> = [];

    // 1. Hand landmark dots (from all detected hands across all people)
    const handList =
      frame.allHands && frame.allHands.length > 0
        ? frame.allHands.map((h) => h.landmarks)
        : [frame.leftHand, frame.rightHand];

    for (const handLms of handList) {
      if (handLms && handLms.length > 0) {
        for (const pt of handLms) {
          if (pt) dots.push({ x: pt.x, y: pt.y, weight: 0.10 * handBoost });
        }
      }
    }

    // 2. Pose landmark dots (from all detected people)
    const poseList =
      frame.poses && frame.poses.length > 0
        ? frame.poses
        : frame.landmarks && frame.landmarks.length > 0
          ? [frame.landmarks]
          : [];

    for (const personLm of poseList) {
      for (let idx = 0; idx < personLm.length; idx++) {
        const pt = personLm[idx];
        if (!pt || (pt.visibility ?? 1) < threshold) continue;

        let w = 0.15;
        if (idx <= 10) {
          // Head / Face landmarks
          w = 0.12;
        } else if (idx === 11 || idx === 12 || idx === 23 || idx === 24) {
          // Shoulders and Hips
          w = 0.35;
        } else if (idx === 13 || idx === 14 || idx === 15 || idx === 16) {
          // Elbows and Wrists
          w = 0.25;
        } else {
          // Legs / Feet
          w = 0.18;
        }
        dots.push({ x: pt.x, y: pt.y, weight: w });
      }
    }

    const nextPresences: number[] = [];
    const nextLocks: number[] = [];
    const nextNoises: number[] = [];

    for (let i = 0; i < 6; i++) {
      const box = screenBoxes[i];
      let screenDotScore = 0;

      for (const dot of dots) {
        // Check if dot is inside this screen's bounding box
        if (
          dot.x >= box.minX &&
          dot.x <= box.maxX &&
          dot.y >= box.minY &&
          dot.y <= box.maxY
        ) {
          screenDotScore += dot.weight;
        } else {
          // Soft boundary bleed (only within 0.08 margin of the screen edge)
          const clampX = THREE_CLAMP(dot.x, box.minX, box.maxX);
          const clampY = THREE_CLAMP(dot.y, box.minY, box.maxY);
          const edgeDist = Math.hypot(dot.x - clampX, (dot.y - clampY) * 1.5);
          if (edgeDist < 0.08) {
            const bleed = Math.exp(-(edgeDist * edgeDist) / (2 * 0.035 * 0.035));
            screenDotScore += dot.weight * bleed * 0.4;
          }
        }
      }

      // Compute presence on this screen from dots and local antenna weight
      const localWeight = store.tracking.antennaLocalWeight ?? 0.95;
      const rawPresence = THREE_CLAMP(
        (1.0 - localWeight) * globalProximity + localWeight * screenDotScore,
        0,
        1,
      );
      const targetLock = rawPresence * rawPresence;
      const targetNoise = THREE_CLAMP(1.0 - targetLock * 0.96, 0.04, 1.0);

      this.smoothedPresences[i] = lerp(this.smoothedPresences[i], rawPresence, smoothing);
      this.smoothedScreenLocks[i] = lerp(this.smoothedScreenLocks[i], targetLock, smoothing);
      this.smoothedScreenNoises[i] = lerp(this.smoothedScreenNoises[i], targetNoise, smoothing);

      nextPresences.push(this.smoothedPresences[i]);
      nextLocks.push(this.smoothedScreenLocks[i]);
      nextNoises.push(this.smoothedScreenNoises[i]);
    }

    // Average global lock for single-screen fallback and master audio resonance
    const avgLock = nextLocks.reduce((a, b) => a + b, 0) / 6;
    const avgNoise = nextNoises.reduce((a, b) => a + b, 0) / 6;

    // FR-03.4 Velocity Fragmentation
    const velNorm = THREE_CLAMP(this.smoothedVelocity / 1.2, 0, 1);
    const rgbSplit = velNorm * 1.4;
    const hJitter = velNorm * 0.9;
    const vHold = (1 - avgLock) * 0.35;

    // FR-03.3 Localized Hand Interference
    const handActive = leftHand.active || rightHand.active;
    const rippleStrength = handActive ? 0.35 + velNorm * 0.65 : 0;

    store.patchTracking({
      personCount: poseList.length,
      distance: this.smoothedDistance,
      velocity: this.smoothedVelocity,
      torsoArea,
      leftHand,
      rightHand,
      screenPresences: nextPresences,
    });

    store.patchShaders({
      signalLock: avgLock,
      noiseGain: avgNoise,
      screenSignalLocks: nextLocks,
      screenNoiseGains: nextNoises,
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
