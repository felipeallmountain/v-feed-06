import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

export interface HandDetection {
  landmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right' | string;
}

export interface TrackerFrame {
  present: boolean;
  personCount: number;
  landmarks: NormalizedLandmark[] | null;
  poses: NormalizedLandmark[][];
  leftHand: NormalizedLandmark[] | null;
  rightHand: NormalizedLandmark[] | null;
  allHands: HandDetection[];
  timestampMs: number;
}

export class MediaPipeTracker {
  private pose: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private ready = false;
  private lastVideoTime = -1;
  private currentMaxPoses = 4;

  async init(maxPoses = 4): Promise<void> {
    this.currentMaxPoses = maxPoses;
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
    );

    this.pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: maxPoses,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: Math.min(Math.max(maxPoses * 2, 2), 8),
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.ready = true;
  }

  async setMaxNumPoses(numPoses: number): Promise<void> {
    if (this.currentMaxPoses === numPoses) return;
    this.currentMaxPoses = numPoses;
    if (!this.pose || !this.hands) return;
    try {
      await this.pose.setOptions({ numPoses });
      await this.hands.setOptions({ numHands: Math.min(Math.max(numPoses * 2, 2), 8) });
    } catch (err) {
      console.warn('[v-feed] Failed to update maxNumPoses:', err);
    }
  }

  detect(video: HTMLVideoElement, mirror: boolean): TrackerFrame {
    const empty: TrackerFrame = {
      present: false,
      personCount: 0,
      landmarks: null,
      poses: [],
      leftHand: null,
      rightHand: null,
      allHands: [],
      timestampMs: performance.now(),
    };

    if (!this.ready || !this.pose || !this.hands) return empty;
    if (video.readyState < 2) return empty;

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) return empty;
    this.lastVideoTime = video.currentTime;

    const poseResult = this.pose.detectForVideo(video, now);
    const handResult = this.hands.detectForVideo(video, now);

    const poses: NormalizedLandmark[][] = [];
    if (poseResult.landmarks && poseResult.landmarks.length > 0) {
      for (const p of poseResult.landmarks) {
        poses.push(p.map((pt) => (mirror ? { ...pt, x: 1 - pt.x } : { ...pt })));
      }
    }

    const allHands: HandDetection[] = [];
    let leftHand: NormalizedLandmark[] | null = null;
    let rightHand: NormalizedLandmark[] | null = null;

    if (handResult.landmarks && handResult.handedness) {
      for (let i = 0; i < handResult.landmarks.length; i++) {
        const label = handResult.handedness[i]?.[0]?.categoryName ?? '';
        const lm = handResult.landmarks[i].map((p) =>
          mirror ? { ...p, x: 1 - p.x } : { ...p },
        );
        allHands.push({ landmarks: lm, handedness: label });
        if (label === 'Left' && !leftHand) leftHand = lm;
        else if (label === 'Right' && !rightHand) rightHand = lm;
      }
    }

    const landmarks = poses.length > 0 ? poses[0] : null;

    return {
      present: poses.length > 0,
      personCount: poses.length,
      landmarks,
      poses,
      leftHand,
      rightHand,
      allHands,
      timestampMs: now,
    };
  }

  dispose(): void {
    this.pose?.close();
    this.hands?.close();
    this.pose = null;
    this.hands = null;
    this.ready = false;
  }
}
