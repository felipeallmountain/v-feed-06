import { createStore } from 'zustand/vanilla';

export type VideoMode = 'live' | 'cache' | 'grid';

export interface HandPoint {
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface ShaderUniformsState {
  curvature: number;
  scanlineIntensity: number;
  phosphorMask: number;
  vignette: number;
  rgbSplit: number;
  vHold: number;
  hJitter: number;
  noiseGain: number;
  signalLock: number;
  rippleStrength: number;
  time: number;
}

export interface BezelState {
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
}

export interface TrackingState {
  present: boolean;
  distance: number;
  velocity: number;
  torsoArea: number;
  leftHand: HandPoint;
  rightHand: HandPoint;
  confidenceThreshold: number;
  mirrorCamera: boolean;
  lastSeenMs: number;
}

export interface AppState {
  fps: number;
  debugFit: boolean;
  debugOverlay: boolean;
  hudVisible: boolean;
  audioUnlocked: boolean;
  videoMode: VideoMode;
  currentVideoUrl: string | null;
  tracking: TrackingState;
  shaders: ShaderUniformsState;
  bezel: BezelState;
  setFps: (fps: number) => void;
  setHudVisible: (visible: boolean) => void;
  toggleHud: () => void;
  setDebugFit: (fit: boolean) => void;
  setDebugOverlay: (visible: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setVideoMode: (mode: VideoMode) => void;
  setCurrentVideoUrl: (url: string | null) => void;
  patchTracking: (partial: Partial<TrackingState>) => void;
  patchShaders: (partial: Partial<ShaderUniformsState>) => void;
  patchBezel: (partial: Partial<BezelState>) => void;
  setHand: (side: 'leftHand' | 'rightHand', point: HandPoint) => void;
}

const idleHand = (): HandPoint => ({ x: 0.5, y: 0.5, z: 0, active: false });

/** Vanilla Zustand store (no React) — use getState() / subscribe(). */
export const useAppStore = createStore<AppState>((set) => ({
  fps: 0,
  debugFit: true,
  debugOverlay: false,
  hudVisible: false,
  audioUnlocked: false,
  videoMode: 'cache',
  currentVideoUrl: null,
  tracking: {
    present: false,
    distance: 3,
    velocity: 0,
    torsoArea: 0,
    leftHand: idleHand(),
    rightHand: idleHand(),
    confidenceThreshold: 0.5,
    mirrorCamera: true,
    lastSeenMs: 0,
  },
  shaders: {
    curvature: 0.18,
    scanlineIntensity: 0.55,
    phosphorMask: 0.35,
    vignette: 0.45,
    rgbSplit: 0,
    vHold: 0,
    hJitter: 0,
    noiseGain: 1,
    signalLock: 0,
    rippleStrength: 0,
    time: 0,
  },
  bezel: {
    offsetX: 8,
    offsetY: 10,
    gapX: 12,
    gapY: 14,
  },
  setFps: (fps) => set({ fps }),
  setHudVisible: (hudVisible) => set({ hudVisible }),
  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setDebugFit: (debugFit) => set({ debugFit }),
  setDebugOverlay: (debugOverlay) => set({ debugOverlay }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setVideoMode: (videoMode) => set({ videoMode }),
  setCurrentVideoUrl: (currentVideoUrl) => set({ currentVideoUrl }),
  patchTracking: (partial) =>
    set((s) => ({ tracking: { ...s.tracking, ...partial } })),
  patchShaders: (partial) =>
    set((s) => ({ shaders: { ...s.shaders, ...partial } })),
  patchBezel: (partial) => set((s) => ({ bezel: { ...s.bezel, ...partial } })),
  setHand: (side, point) =>
    set((s) => ({ tracking: { ...s.tracking, [side]: point } })),
}));

export type AppStore = typeof useAppStore;
