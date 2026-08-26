import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  AudienceDensity,
  ClothingChroma,
  InteractionFeatureState,
  KineticState,
  SemanticPose,
  SpatialProximity,
} from './BroadcastQuerySynthesizer';
import type { TrackerFrame } from './MediaPipeTracker';

interface JointHistoryItem {
  timeMs: number;
  positions: Array<{ x: number; y: number; z: number }>;
}

export class FeatureExtractor {
  private history: JointHistoryItem[] = [];
  private readonly historyWindowMs = 600; // Rolling window for velocity and variance
  private rhythmHistory: Array<{ timeMs: number; vy: number; vx: number }> = [];
  private readonly rhythmWindowMs = 1800; // Rolling window for rhythm / oscillation analysis

  private prevJoints: Array<{ x: number; y: number }> | null = null;
  private smoothedEnergy = 0;
  private stillnessTimerMs = 0;
  private lastSampleTimeMs = 0;

  // Offscreen canvas for sampling clothing chroma
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private lastChroma: ClothingChroma = 'NEUTRAL';
  private lastChromaSampleTime = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = 48;
      this.sampleCanvas.height = 48;
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Main feature extraction pipeline.
   */
  extract(
    frame: TrackerFrame,
    video: HTMLVideoElement | null,
    calibratedDistance: number,
  ): InteractionFeatureState {
    const now = frame.timestampMs;
    const dt = this.lastSampleTimeMs > 0 ? Math.max(1, now - this.lastSampleTimeMs) : 16;
    this.lastSampleTimeMs = now;

    const personCount = frame.personCount;
    const primaryPose = frame.landmarks;

    // 1. Audience Density
    let density: AudienceDensity = 'EMPTY';
    if (personCount === 1) density = 'SOLO';
    else if (personCount === 2) density = 'DUO';
    else if (personCount >= 3) density = 'GROUP';

    // 2. Spatial Proximity
    let proximity: SpatialProximity = 'MEDIUM';
    if (calibratedDistance < 1.2) proximity = 'CLOSE';
    else if (calibratedDistance > 2.2) proximity = 'FAR';

    // 3. Kinetic Energy & Rhythm
    const { energy, kineticState } = this.computeKineticDynamics(frame, now, dt);

    // 4. Semantic Key Poses
    const pose = primaryPose ? this.classifySemanticPose(primaryPose) : 'NONE';

    // 5. Clothing Chroma (sampled from video frame inside chest region)
    const chroma = this.sampleClothingChroma(video, primaryPose, now);

    return {
      pose,
      density,
      kinetics: kineticState,
      proximity,
      chroma,
      personCount,
      kineticEnergy: energy,
      distanceMeters: calibratedDistance,
    };
  }

  /**
   * Tracks joint velocities, displacement variance, and harmonic rhythm.
   */
  private computeKineticDynamics(
    frame: TrackerFrame,
    now: number,
    dt: number,
  ): { energy: number; kineticState: KineticState } {
    if (!frame.present || !frame.landmarks) {
      this.stillnessTimerMs += dt;
      this.smoothedEnergy = lerp(this.smoothedEnergy, 0, 0.1);
      return { energy: this.smoothedEnergy, kineticState: 'STILLNESS' };
    }

    const lm = frame.landmarks;
    // Key joint indices: shoulders (11,12), elbows (13,14), wrists (15,16), hips (23,24)
    const trackedIndices = [11, 12, 13, 14, 15, 16, 23, 24];
    const currentJoints = trackedIndices.map((idx) => ({
      x: lm[idx]?.x ?? 0.5,
      y: lm[idx]?.y ?? 0.5,
      z: lm[idx]?.z ?? 0,
    }));

    // Calculate instantaneous frame-to-frame velocity
    let frameDisplacement = 0;
    if (this.prevJoints) {
      for (let i = 0; i < currentJoints.length; i++) {
        const dx = currentJoints[i].x - this.prevJoints[i].x;
        const dy = currentJoints[i].y - this.prevJoints[i].y;
        frameDisplacement += Math.sqrt(dx * dx + dy * dy);
      }
      frameDisplacement /= currentJoints.length;
    }
    this.prevJoints = currentJoints.map((j) => ({ x: j.x, y: j.y }));

    // Normalize velocity per second
    const instVelocity = (frameDisplacement / (dt / 1000)) * 2.2;
    this.smoothedEnergy = lerp(this.smoothedEnergy, Math.min(1.0, instVelocity), 0.2);

    // Maintain rolling history for variance and rhythm
    this.history.push({ timeMs: now, positions: currentJoints });
    while (this.history.length > 0 && now - this.history[0].timeMs > this.historyWindowMs) {
      this.history.shift();
    }

    // Wrist velocity for rhythm analysis
    const rw = lm[16];
    const lw = lm[15];
    const wristAvgY = ((rw?.y ?? 0.5) + (lw?.y ?? 0.5)) * 0.5;
    const wristAvgX = ((rw?.x ?? 0.5) + (lw?.x ?? 0.5)) * 0.5;
    this.rhythmHistory.push({ timeMs: now, vy: wristAvgY, vx: wristAvgX });
    while (
      this.rhythmHistory.length > 0 &&
      now - this.rhythmHistory[0].timeMs > this.rhythmWindowMs
    ) {
      this.rhythmHistory.shift();
    }

    // Check for Stillness
    if (this.smoothedEnergy < 0.08) {
      this.stillnessTimerMs += dt;
    } else {
      this.stillnessTimerMs = 0;
    }

    // Detect Rhythmic Movement (Harmonic wave / continuous oscillation)
    const isRhythmic = this.detectRhythm();

    let kineticState: KineticState = 'STEADY';
    if (this.stillnessTimerMs > 900) {
      kineticState = 'STILLNESS';
    } else if (this.smoothedEnergy > 0.55) {
      kineticState = 'HIGH_MOTION';
    } else if (isRhythmic && this.smoothedEnergy > 0.18) {
      kineticState = 'RHYTHMIC';
    }

    return {
      energy: this.smoothedEnergy,
      kineticState,
    };
  }

  /**
   * Detects periodic zero-crossings in arm velocity (dance, waving, rhythmic gestures).
   */
  private detectRhythm(): boolean {
    if (this.rhythmHistory.length < 18) return false;

    let dirChangesY = 0;
    let dirChangesX = 0;
    let prevSignY = 0;
    let prevSignX = 0;

    for (let i = 1; i < this.rhythmHistory.length; i++) {
      const dy = this.rhythmHistory[i].vy - this.rhythmHistory[i - 1].vy;
      const dx = this.rhythmHistory[i].vx - this.rhythmHistory[i - 1].vx;

      if (Math.abs(dy) > 0.005) {
        const signY = Math.sign(dy);
        if (prevSignY !== 0 && signY !== prevSignY) {
          dirChangesY++;
        }
        prevSignY = signY;
      }

      if (Math.abs(dx) > 0.005) {
        const signX = Math.sign(dx);
        if (prevSignX !== 0 && signX !== prevSignX) {
          dirChangesX++;
        }
        prevSignX = signX;
      }
    }

    // A consistent periodic motion in ~1.8s produces 3 to 8 direction reversals
    return dirChangesY >= 3 && dirChangesY <= 9 || dirChangesX >= 3 && dirChangesX <= 9;
  }

  /**
   * Classifies semantic key poses from MediaPipe body landmarks.
   */
  private classifySemanticPose(lm: NormalizedLandmark[]): SemanticPose {
    if (lm.length < 25) return 'NONE';

    const nose = lm[0];
    const leftEye = lm[2];
    const rightEye = lm[5];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftElbow = lm[13];
    const rightElbow = lm[14];
    const leftWrist = lm[15];
    const rightWrist = lm[16];

    if (!nose || !leftShoulder || !rightShoulder || !leftWrist || !rightWrist) {
      return 'NONE';
    }

    const headY = Math.min(nose.y, leftEye?.y ?? nose.y, rightEye?.y ?? nose.y);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const shoulderAvgY = (leftShoulder.y + rightShoulder.y) * 0.5;

    // 1. POSE_ANTENNA: Both hands raised pointing upwards above head
    const bothWristsAboveHead = leftWrist.y < headY - 0.04 && rightWrist.y < headY - 0.04;
    const elbowsElevated =
      leftElbow &&
      rightElbow &&
      leftElbow.y < shoulderAvgY + 0.08 &&
      rightElbow.y < shoulderAvgY + 0.08;

    if (bothWristsAboveHead && elbowsElevated) {
      return 'POSE_ANTENNA';
    }

    // 2. POSE_SURPRISE: Hands covering face / gasping posture
    const distLeftToFace = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y);
    const distRightToFace = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y);
    const handsNearFace = distLeftToFace < 0.16 && distRightToFace < 0.16;
    const handsCloseTogether = Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y) < 0.20;

    if (handsNearFace && handsCloseTogether) {
      return 'POSE_SURPRISE';
    }

    // 3. POSE_WINGSUIT: Arms wide open horizontally in a cross / T-pose position
    const wristSpan = Math.abs(leftWrist.x - rightWrist.x);
    const wideSpan = wristSpan > Math.max(shoulderWidth * 2.2, 0.45);

    const leftWristLevel = Math.abs(leftWrist.y - leftShoulder.y) < 0.14;
    const rightWristLevel = Math.abs(rightWrist.y - rightShoulder.y) < 0.14;

    const leftElbowStraight = leftElbow ? Math.abs(leftElbow.y - leftShoulder.y) < 0.12 : true;
    const rightElbowStraight = rightElbow ? Math.abs(rightElbow.y - rightShoulder.y) < 0.12 : true;

    if (wideSpan && leftWristLevel && rightWristLevel && leftElbowStraight && rightElbowStraight) {
      return 'POSE_WINGSUIT';
    }

    return 'NONE';
  }

  /**
   * Samples clothing chroma / dominant hue from the spectator's torso region.
   */
  private sampleClothingChroma(
    video: HTMLVideoElement | null,
    lm: NormalizedLandmark[] | null,
    now: number,
  ): ClothingChroma {
    if (!video || !lm || video.readyState < 2 || !this.sampleCtx || !this.sampleCanvas) {
      return this.lastChroma;
    }

    // Throttle color sampling to once every 250ms for optimal performance
    if (now - this.lastChromaSampleTime < 250) {
      return this.lastChroma;
    }
    this.lastChromaSampleTime = now;

    const lShoulder = lm[11];
    const rShoulder = lm[12];
    const lHip = lm[23];
    const rHip = lm[24];

    if (!lShoulder || !rShoulder || !lHip || !rHip) {
      return this.lastChroma;
    }

    const minX = Math.min(lShoulder.x, rShoulder.x, lHip.x, rHip.x);
    const maxX = Math.max(lShoulder.x, rShoulder.x, lHip.x, rHip.x);
    const minY = Math.min(lShoulder.y, rShoulder.y);
    const maxY = Math.max(lHip.y, rHip.y);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw <= 0 || vh <= 0) return this.lastChroma;

    // Crop torso bounding box in pixel coordinates (inset 15% to avoid background bleed)
    const torsoW = Math.max(10, (maxX - minX) * vw * 0.7);
    const torsoH = Math.max(10, (maxY - minY) * vh * 0.7);
    const torsoX = (minX + (maxX - minX) * 0.15) * vw;
    const torsoY = (minY + (maxY - minY) * 0.15) * vh;

    try {
      this.sampleCtx.drawImage(
        video,
        torsoX,
        torsoY,
        torsoW,
        torsoH,
        0,
        0,
        this.sampleCanvas.width,
        this.sampleCanvas.height,
      );

      const imgData = this.sampleCtx.getImageData(
        0,
        0,
        this.sampleCanvas.width,
        this.sampleCanvas.height,
      );
      const data = imgData.data;

      let totalHue = 0;
      let totalSat = 0;
      let totalVal = 0;
      let validPixels = 0;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;

        const { h, s, v } = rgbToHsv(r, g, b);
        totalHue += h;
        totalSat += s;
        totalVal += v;
        validPixels++;
      }

      if (validPixels === 0) return this.lastChroma;

      const avgH = totalHue / validPixels;
      const avgS = totalSat / validPixels;
      const avgV = totalVal / validPixels;

      let classified: ClothingChroma = 'NEUTRAL';
      if (avgV < 0.26 || avgS < 0.18) {
        classified = 'DARK_NEUTRAL';
      } else if (avgH >= 330 || avgH <= 35) {
        classified = 'WARM_RED';
      } else if (avgH >= 170 && avgH <= 265) {
        classified = 'COOL_BLUE';
      }

      this.lastChroma = classified;
    } catch {
      /* ignore canvas access errors */
    }

    return this.lastChroma;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s, v };
}
