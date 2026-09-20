import {
  useAppStore,
  type AudioState,
  type FrameState,
  type ShaderUniformsState,
  type VideoMode,
} from './StateManager';
import type { VideoQueue } from '../video/VideoQueue';
import { synthesizeBroadcastQuery } from '../vision/BroadcastQuerySynthesizer';
import { syncChannel } from './SyncChannel';

const STORAGE_KEY = 'vfeed-calibration';

export interface SavedCalibration {
  shaders: Omit<ShaderUniformsState, 'time' | 'rippleStrength'>;
  tracking: {
    confidenceThreshold: number;
    mirrorCamera: boolean;
    cameraRotation?: number;
    distanceScale?: number;
    distanceOffset?: number;
    minDistance?: number;
    maxDistance?: number;
    maxNumPoses?: number;
    antennaLocalWeight?: number;
    antennaHandBoost?: number;
    antennaSmoothing?: number;
    antennaFalloffRadius?: number;
  };
  videoMode: VideoMode;
  skeleton?: {
    enabled: boolean;
    style: string;
    thickness: number;
    lineThickness?: number;
    lineOpacity?: number;
    dotSize?: number;
    dotOpacity?: number;
    showLines?: boolean;
    showDots?: boolean;
    jitter?: number;
    smoothing?: number;
  };
  frames?: Partial<FrameState>;
  audio?: Partial<AudioState>;
}

export class CalibrationManager {
  private videoQueue: VideoQueue | null = null;

  attach(videoQueue: VideoQueue): void {
    this.videoQueue = videoQueue;
  }

  init(): void {
    this.loadSaved();
  }

  applyPreset(preset: ShaderUniformsState): void {
    const store = useAppStore.getState();
    const { time, rippleStrength, ...rest } = preset;
    void time;
    void rippleStrength;
    store.patchShaders({ ...rest, rippleStrength: store.shaders.rippleStrength });
    this.persist();
  }

  applyCalibrationData(saved: SavedCalibration): void {
    const store = useAppStore.getState();
    if (saved.shaders) {
      store.patchShaders(saved.shaders);
    }
    if (saved.tracking) {
      store.patchTracking(saved.tracking);
    }
    if (saved.videoMode) {
      store.setVideoMode(saved.videoMode);
      localStorage.setItem('vfeed-video-mode', saved.videoMode);
    }
    if (saved.skeleton) {
      store.setSkeletonOverlay(saved.skeleton.enabled);
      if (saved.skeleton.style) {
        store.setSkeletonStyle(saved.skeleton.style as any);
      }
      if (saved.skeleton.lineThickness !== undefined) {
        store.setSkeletonLineThickness(saved.skeleton.lineThickness);
      } else if (saved.skeleton.thickness !== undefined) {
        store.setSkeletonThickness(saved.skeleton.thickness);
      }
      if (saved.skeleton.lineOpacity !== undefined) {
        store.setSkeletonLineOpacity(saved.skeleton.lineOpacity);
      }
      if (saved.skeleton.dotSize !== undefined) {
        store.setSkeletonDotSize(saved.skeleton.dotSize);
      }
      if (saved.skeleton.dotOpacity !== undefined) {
        store.setSkeletonDotOpacity(saved.skeleton.dotOpacity);
      }
      if (saved.skeleton.showLines !== undefined) {
        store.setSkeletonShowLines(saved.skeleton.showLines);
      }
      if (saved.skeleton.showDots !== undefined) {
        store.setSkeletonShowDots(saved.skeleton.showDots);
      }
      if (saved.skeleton.jitter !== undefined) {
        store.setSkeletonJitter(saved.skeleton.jitter);
      }
      if (saved.skeleton.smoothing !== undefined) {
        store.setSkeletonSmoothing(saved.skeleton.smoothing);
      }
    }
    if (saved.frames) {
      store.setFrames(saved.frames);
    }
    if (saved.audio) {
      store.setAudioState(saved.audio);
    }
  }

  loadSaved(): void {
    // 1. Synchronously load from localStorage for zero initial flash
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedCalibration;
        this.applyCalibrationData(saved);
      }
    } catch {
      /* ignore corrupt saves */
    }

    // 2. Asynchronously query backend server for disk-persisted calibration
    fetch('/api/calibration')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.calibration) {
          this.applyCalibrationData(data.calibration as SavedCalibration);
        } else {
          // Check static fallback
          fetch('/calibration.json')
            .then((r) => (r.ok ? r.json() : null))
            .then((staticData) => {
              if (staticData) {
                this.applyCalibrationData(staticData as SavedCalibration);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        fetch('/calibration.json')
          .then((r) => (r.ok ? r.json() : null))
          .then((staticData) => {
            if (staticData) {
              this.applyCalibrationData(staticData as SavedCalibration);
            }
          })
          .catch(() => {});
      });
  }

  getCalibrationPayload(): SavedCalibration {
    const state = useAppStore.getState();
    const { time, rippleStrength, ...shaders } = state.shaders;
    void time;
    void rippleStrength;
    return {
      shaders,
      tracking: {
        confidenceThreshold: state.tracking.confidenceThreshold,
        mirrorCamera: state.tracking.mirrorCamera,
        cameraRotation: state.tracking.cameraRotation ?? 0,
        distanceScale: state.tracking.distanceScale,
        distanceOffset: state.tracking.distanceOffset,
        minDistance: state.tracking.minDistance,
        maxDistance: state.tracking.maxDistance,
        maxNumPoses: state.tracking.maxNumPoses,
        antennaLocalWeight: state.tracking.antennaLocalWeight,
        antennaHandBoost: state.tracking.antennaHandBoost,
        antennaSmoothing: state.tracking.antennaSmoothing,
        antennaFalloffRadius: state.tracking.antennaFalloffRadius,
      },
      videoMode: state.videoMode,
      skeleton: {
        enabled: state.skeletonOverlay,
        style: state.skeletonStyle,
        thickness: state.skeletonLineThickness,
        lineThickness: state.skeletonLineThickness,
        lineOpacity: state.skeletonLineOpacity,
        dotSize: state.skeletonDotSize,
        dotOpacity: state.skeletonDotOpacity,
        showLines: state.skeletonShowLines,
        showDots: state.skeletonShowDots,
        jitter: state.skeletonJitter,
        smoothing: state.skeletonSmoothing,
      },
      frames: state.frames,
      audio: state.audio,
    };
  }

  triggerTestQuery(): void {
    const curInter = useAppStore.getState().interaction;
    const curTrack = useAppStore.getState().tracking;
    const query = synthesizeBroadcastQuery({
      pose: curInter.activePose,
      density: curInter.densityState,
      kinetics: curInter.kineticState,
      proximity: curInter.proximityState,
      chroma: curInter.chromaState,
      personCount: curTrack.personCount,
      kineticEnergy: curInter.kineticEnergy,
      distanceMeters: curTrack.distance,
    });
    void this.videoQueue?.triggerInteractionQuery(query.rawQuery, 'Operator Console Trigger');
  }

  persist(): void {
    const payload = this.getCalibrationPayload();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore storage quota errors */
    }
    syncChannel.sendStatePatch({
      shaders: payload.shaders as any,
      frames: payload.frames,
      audio: payload.audio,
      tracking: payload.tracking,
      videoMode: payload.videoMode,
      skeletonOverlay: payload.skeleton?.enabled,
    });
  }

  async saveToBrowserAndServer(): Promise<void> {
    this.persist();
    const payload = this.getCalibrationPayload();
    try {
      const res = await fetch('/api/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          return;
        }
      }
    } catch (err) {
      console.warn('[v-feed] Server save note:', err);
    }
  }

  dispose(): void {
    this.videoQueue = null;
  }
}
