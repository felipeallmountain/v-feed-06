import { createStore } from 'zustand/vanilla';

import {
  createDefaultCornerOffsets,
  createDefaultScreenFlips,
  type ScreenCornerOffsets,
  type ScreenFlipState,
} from '../rendering/MatrixSplitter';

export type VideoMode = 'live' | 'cache' | 'grid';

export interface HandPoint {
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface ShaderUniformsState {
  matrixSplit: boolean;
  bezelWidthX: number;
  bezelWidthY: number;
  bezelOuter: number;
  bezelComp: number;
  cornerRounding: number;
  bezelChassis: boolean;
  perScreenVariance: number;
  globalFlipH: boolean;
  globalFlipV: boolean;
  globalRotation: number; // 0, 90, 180, 270
  globalFineRotation: number; // [-180, 180]
  screenFlips: ScreenFlipState[];
  cornerOffsets: ScreenCornerOffsets[];
  showCornerHandles: boolean;
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
  setCornerOffset: (
    screenIndex: number,
    corner: 'tl' | 'tr' | 'br' | 'bl',
    axis: 0 | 1,
    value: number,
  ) => void;
  resetScreenCorners: (screenIndex: number) => void;
  resetAllCorners: () => void;
  setScreenFlip: (screenIndex: number, axis: 'h' | 'v', value: boolean) => void;
  setScreenRotation: (screenIndex: number, rotation: number) => void;
  setScreenFineRotation: (screenIndex: number, fineRotation: number) => void;
  setGlobalFlip: (axis: 'h' | 'v', value: boolean) => void;
  setGlobalRotation: (rotation: number) => void;
  setGlobalFineRotation: (fineRotation: number) => void;
  resetAllFlips: () => void;
  setHand: (side: 'leftHand' | 'rightHand', point: HandPoint) => void;
}

const idleHand = (): HandPoint => ({ x: 0.5, y: 0.5, z: 0, active: false });

/** 6-Screen CRT Totem (Default — simulated 2x3 video wall with bezels & curved CRT tubes). */
export const CRT_6X_TOTEM_PRESET: ShaderUniformsState = {
  matrixSplit: true,
  bezelWidthX: 0.024,
  bezelWidthY: 0.024,
  bezelOuter: 0.018,
  bezelComp: 0.65,
  cornerRounding: 0.08,
  bezelChassis: true,
  perScreenVariance: 0.35,
  globalFlipH: false,
  globalFlipV: false,
  globalRotation: 0,
  globalFineRotation: 0,
  screenFlips: createDefaultScreenFlips(),
  cornerOffsets: createDefaultCornerOffsets(),
  showCornerHandles: false,
  tubeCurve: true,
  curvature: 0.18,
  scanlineIntensity: 0.45,
  phosphorMask: 0.3,
  vignette: 0.4,
  rgbSplit: 0,
  vHold: 0,
  hJitter: 0,
  noiseGain: 1,
  signalLock: 0,
  rippleStrength: 0,
  time: 0,
};

/** 6-Screen Physical Multi-Display Output (Direct signal mapping for 6 external CRT monitors via video wall controller). */
export const CRT_6X_PHYSICAL_PRESET: ShaderUniformsState = {
  matrixSplit: true,
  bezelWidthX: 0.0,
  bezelWidthY: 0.0,
  bezelOuter: 0.0,
  bezelComp: 0.0,
  cornerRounding: 0.0,
  bezelChassis: false,
  perScreenVariance: 0.0,
  globalFlipH: false,
  globalFlipV: false,
  globalRotation: 0,
  globalFineRotation: 0,
  screenFlips: createDefaultScreenFlips(),
  cornerOffsets: createDefaultCornerOffsets(),
  showCornerHandles: false,
  tubeCurve: false,
  curvature: 0.0,
  scanlineIntensity: 0.0,
  phosphorMask: 0.0,
  vignette: 0.0,
  rgbSplit: 0,
  vHold: 0,
  hJitter: 0,
  noiseGain: 1,
  signalLock: 0,
  rippleStrength: 0,
  time: 0,
};

/** Single flat monitor defaults — no barrel curve, vignette or matrix splitting. */
export const FLAT_DISPLAY_SHADERS: ShaderUniformsState = {
  matrixSplit: false,
  bezelWidthX: 0.0,
  bezelWidthY: 0.0,
  bezelOuter: 0.0,
  bezelComp: 0.0,
  cornerRounding: 0.0,
  bezelChassis: false,
  perScreenVariance: 0.0,
  globalFlipH: false,
  globalFlipV: false,
  globalRotation: 0,
  globalFineRotation: 0,
  screenFlips: createDefaultScreenFlips(),
  cornerOffsets: createDefaultCornerOffsets(),
  showCornerHandles: false,
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

/** Single CRT tube preset for physical old-TV output. */
export const CRT_TUBE_SHADERS: ShaderUniformsState = {
  matrixSplit: false,
  bezelWidthX: 0.0,
  bezelWidthY: 0.0,
  bezelOuter: 0.0,
  bezelComp: 0.0,
  cornerRounding: 0.0,
  bezelChassis: false,
  perScreenVariance: 0.0,
  globalFlipH: false,
  globalFlipV: false,
  globalRotation: 0,
  globalFineRotation: 0,
  screenFlips: createDefaultScreenFlips(),
  cornerOffsets: createDefaultCornerOffsets(),
  showCornerHandles: false,
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
  shaders: { ...CRT_6X_TOTEM_PRESET },
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
  setCornerOffset: (screenIndex, corner, axis, value) =>
    set((s) => {
      const nextOffsets = s.shaders.cornerOffsets.map((item, i) => {
        if (i !== screenIndex) return item;
        const nextCorner = [...item[corner]] as [number, number];
        nextCorner[axis] = value;
        return {
          ...item,
          [corner]: nextCorner,
        };
      });
      return {
        shaders: {
          ...s.shaders,
          cornerOffsets: nextOffsets,
        },
      };
    }),
  resetScreenCorners: (screenIndex) =>
    set((s) => {
      const nextOffsets = s.shaders.cornerOffsets.map((item, i) => {
        if (i !== screenIndex) return item;
        return { tl: [0, 0] as [number, number], tr: [0, 0] as [number, number], br: [0, 0] as [number, number], bl: [0, 0] as [number, number] };
      });
      return {
        shaders: {
          ...s.shaders,
          cornerOffsets: nextOffsets,
        },
      };
    }),
  resetAllCorners: () =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        cornerOffsets: createDefaultCornerOffsets(),
      },
    })),
  setScreenFlip: (screenIndex, axis, value) =>
    set((s) => {
      const nextFlips = s.shaders.screenFlips.map((item, i) => {
        if (i !== screenIndex) return item;
        return {
          ...item,
          [axis === 'h' ? 'flipH' : 'flipV']: value,
        };
      });
      return {
        shaders: {
          ...s.shaders,
          screenFlips: nextFlips,
        },
      };
    }),
  setScreenRotation: (screenIndex, rotation) =>
    set((s) => {
      const nextFlips = s.shaders.screenFlips.map((item, i) => {
        if (i !== screenIndex) return item;
        return {
          ...item,
          rotation,
        };
      });
      return {
        shaders: {
          ...s.shaders,
          screenFlips: nextFlips,
        },
      };
    }),
  setScreenFineRotation: (screenIndex, fineRotation) =>
    set((s) => {
      const nextFlips = s.shaders.screenFlips.map((item, i) => {
        if (i !== screenIndex) return item;
        return {
          ...item,
          fineRotation,
        };
      });
      return {
        shaders: {
          ...s.shaders,
          screenFlips: nextFlips,
        },
      };
    }),
  setGlobalFlip: (axis, value) =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        [axis === 'h' ? 'globalFlipH' : 'globalFlipV']: value,
      },
    })),
  setGlobalRotation: (rotation) =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        globalRotation: rotation,
      },
    })),
  setGlobalFineRotation: (fineRotation) =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        globalFineRotation: fineRotation,
      },
    })),
  resetAllFlips: () =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        globalFlipH: false,
        globalFlipV: false,
        globalRotation: 0,
        globalFineRotation: 0,
        screenFlips: createDefaultScreenFlips(),
      },
    })),
  setHand: (side, point) =>
    set((s) => ({ tracking: { ...s.tracking, [side]: point } })),
}));

export type AppStore = typeof useAppStore;
