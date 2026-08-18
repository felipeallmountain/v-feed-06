import { createStore } from 'zustand/vanilla';

export type VideoMode = 'live' | 'cache' | 'grid';

export interface HandPoint {
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface ShaderUniformsState {
  tubeCurve: boolean;
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
  distanceScale: number;
  distanceOffset: number;
  minDistance: number;
  maxDistance: number;
}

export type SkeletonStyle = 'phosphor' | 'cyan' | 'amber' | 'magenta';

export interface AppState {
  fps: number;
  debugOverlay: boolean;
  skeletonOverlay: boolean;
  skeletonStyle: SkeletonStyle;
  skeletonThickness: number;
  skeletonLineThickness: number;
  skeletonLineOpacity: number;
  skeletonDotSize: number;
  skeletonDotOpacity: number;
  skeletonShowLines: boolean;
  skeletonShowDots: boolean;
  skeletonJitter: number;
  hudVisible: boolean;
  audioUnlocked: boolean;
  videoMode: VideoMode;
  currentVideoUrl: string | null;
  tracking: TrackingState;
  shaders: ShaderUniformsState;
  setFps: (fps: number) => void;
  setHudVisible: (visible: boolean) => void;
  toggleHud: () => void;
  setDebugOverlay: (visible: boolean) => void;
  setSkeletonOverlay: (enabled: boolean) => void;
  setSkeletonStyle: (style: SkeletonStyle) => void;
  setSkeletonThickness: (thickness: number) => void;
  setSkeletonLineThickness: (v: number) => void;
  setSkeletonLineOpacity: (v: number) => void;
  setSkeletonDotSize: (v: number) => void;
  setSkeletonDotOpacity: (v: number) => void;
  setSkeletonShowLines: (show: boolean) => void;
  setSkeletonShowDots: (show: boolean) => void;
  setSkeletonJitter: (jitter: number) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setVideoMode: (mode: VideoMode) => void;
  setCurrentVideoUrl: (url: string | null) => void;
  patchTracking: (partial: Partial<TrackingState>) => void;
  patchShaders: (partial: Partial<ShaderUniformsState>) => void;
  setHand: (side: 'leftHand' | 'rightHand', point: HandPoint) => void;
}

const idleHand = (): HandPoint => ({ x: 0.5, y: 0.5, z: 0, active: false });

/** Flat monitor defaults — no barrel curve or vignette. */
export const FLAT_DISPLAY_SHADERS: ShaderUniformsState = {
  tubeCurve: false,
  curvature: 0.18,
  scanlineIntensity: 0.08,
  phosphorMask: 0,
  vignette: 0,
  rgbSplit: 0,
  vHold: 0,
  hJitter: 0,
  noiseGain: 1,
  signalLock: 0,
  rippleStrength: 0,
  time: 0,
};

/** CRT tube preset for physical old-TV output. */
export const CRT_TUBE_SHADERS: ShaderUniformsState = {
  tubeCurve: true,
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
};

/** Vanilla Zustand store (no React) — use getState() / subscribe(). */
export const useAppStore = createStore<AppState>((set) => ({
  fps: 0,
  debugOverlay: false,
  skeletonOverlay: true,
  skeletonStyle: 'phosphor',
  skeletonThickness: 2,
  skeletonLineThickness: 2,
  skeletonLineOpacity: 0.85,
  skeletonDotSize: 2.5,
  skeletonDotOpacity: 0.9,
  skeletonShowLines: true,
  skeletonShowDots: true,
  skeletonJitter: 0.35,
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
    distanceScale: 8.5,
    distanceOffset: 2.8,
    minDistance: 1.0,
    maxDistance: 3.0,
  },
  shaders: { ...FLAT_DISPLAY_SHADERS },
  setFps: (fps) => set({ fps }),
  setHudVisible: (hudVisible) => set({ hudVisible }),
  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setDebugOverlay: (debugOverlay) => set({ debugOverlay }),
  setSkeletonOverlay: (skeletonOverlay) => set({ skeletonOverlay }),
  setSkeletonStyle: (skeletonStyle) => set({ skeletonStyle }),
  setSkeletonThickness: (v) => set({ skeletonThickness: v, skeletonLineThickness: v }),
  setSkeletonLineThickness: (v) => set({ skeletonLineThickness: v, skeletonThickness: v }),
  setSkeletonLineOpacity: (v) => set({ skeletonLineOpacity: v }),
  setSkeletonDotSize: (v) => set({ skeletonDotSize: v }),
  setSkeletonDotOpacity: (v) => set({ skeletonDotOpacity: v }),
  setSkeletonShowLines: (skeletonShowLines) => set({ skeletonShowLines }),
  setSkeletonShowDots: (skeletonShowDots) => set({ skeletonShowDots }),
  setSkeletonJitter: (skeletonJitter) => set({ skeletonJitter }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setVideoMode: (videoMode) => set({ videoMode }),
  setCurrentVideoUrl: (currentVideoUrl) => set({ currentVideoUrl }),
  patchTracking: (partial) =>
    set((s) => ({ tracking: { ...s.tracking, ...partial } })),
  patchShaders: (partial) =>
    set((s) => ({ shaders: { ...s.shaders, ...partial } })),
  setHand: (side, point) =>
    set((s) => ({ tracking: { ...s.tracking, [side]: point } })),
}));

export type AppStore = typeof useAppStore;
