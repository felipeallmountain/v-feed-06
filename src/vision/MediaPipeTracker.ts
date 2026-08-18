import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

export interface TrackerFrame {
  present: boolean;
  landmarks: NormalizedLandmark[] | null;
  leftHand: NormalizedLandmark[] | null;
  rightHand: NormalizedLandmark[] | null;
  timestampMs: number;
}

export class MediaPipeTracker {
  private pose: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private ready = false;
  private lastVideoTime = -1;

  async init(): Promise<void> {
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
      numPoses: 1,
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
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.ready = true;
  }

  detect(video: HTMLVideoElement, mirror: boolean): TrackerFrame {
    const empty: TrackerFrame = {
      present: false,
      landmarks: null,
      leftHand: null,
      rightHand: null,
      timestampMs: performance.now(),
    };

    if (!this.ready || !this.pose || !this.hands) return empty;
    if (video.readyState < 2) return empty;

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) return empty;
    this.lastVideoTime = video.currentTime;

    const poseResult = this.pose.detectForVideo(video, now);
    const handResult = this.hands.detectForVideo(video, now);

    const pose =
      poseResult.landmarks && poseResult.landmarks.length > 0
        ? poseResult.landmarks[0]
        : null;

    let leftHand: NormalizedLandmark[] | null = null;
    let rightHand: NormalizedLandmark[] | null = null;

    if (handResult.landmarks && handResult.handedness) {
      for (let i = 0; i < handResult.landmarks.length; i++) {
        const label = handResult.handedness[i]?.[0]?.categoryName ?? '';
        const lm = handResult.landmarks[i].map((p) =>
          mirror ? { ...p, x: 1 - p.x } : { ...p },
        );
        if (label === 'Left') leftHand = lm;
        else if (label === 'Right') rightHand = lm;
      }
    }

    const landmarks = pose
      ? pose.map((p) => (mirror ? { ...p, x: 1 - p.x } : { ...p }))
      : null;

    return {
      present: landmarks !== null,
      landmarks,
      leftHand,
      rightHand,
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
