import { createStore } from 'zustand/vanilla';

import {
  createDefaultCornerOffsets,
  createDefaultScreenFlips,
  createDefaultScreenOffsets,
  type ScreenCornerOffsets,
  type ScreenFlipState,
} from '../rendering/MatrixSplitter';
import type {
  AudienceDensity,
  ClothingChroma,
  KineticState,
  SemanticPose,
  SpatialProximity,
} from '../vision/BroadcastQuerySynthesizer';

export type VideoMode = 'live' | 'cache' | 'grid';

export interface HandPoint {
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface InteractionState {
  enabled: boolean;
  activePose: SemanticPose;
  densityState: AudienceDensity;
  kineticState: KineticState;
  proximityState: SpatialProximity;
  chromaState: ClothingChroma;
  kineticEnergy: number; // 0..1
  candidateState: string | null;
  holdProgress: number; // 0..1
  isHolding: boolean;
  holdDurationMs: number; // default 1800ms
  cooldownRemainingSec: number; // 0 when ready
  cooldownDurationSec: number; // default 10s
  lastQuery: string | null;
  lastCategory: string | null;
  lastTriggerReason: string | null;
  stillnessDurationSec: number;
  zapActive: boolean;
  zapDirection: 'prev' | 'next' | 'random' | null;
  zapPose: SemanticPose | null;
  zapScreenIndex: number | null;
  zapIntensity: number;
  zapProgress: number;
  zapCooldownSec: number;
  zapHoldDurationMs: number;
  zapVisualIntensity: number;
  zapEnabled: boolean;
  zapNavMode: 'sequential' | 'directional' | 'random';
}

export interface QuotaState {
  unitsUsed: number;
  dailyBudget: number;
  percentage: number;
  isProtectedMode: boolean;
  cacheHits: number;
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
  globalOffsetX: number; // [-0.5, 0.5]
  globalOffsetY: number; // [-0.5, 0.5]
  screenFlips: ScreenFlipState[];
  screenOffsets: Array<[number, number]>;
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
  screenNoiseGains: number[];
  screenSignalLocks: number[];
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
  cameraRotation: number;
  lastSeenMs: number;
  distanceScale: number;
  distanceOffset: number;
  minDistance: number;
  maxDistance: number;
  screenPresences: number[];
  personCount: number;
  maxNumPoses: number;
  antennaLocalWeight: number;
  antennaHandBoost: number;
  antennaSmoothing: number;
  antennaFalloffRadius: number;
}

export type SkeletonStyle = 'phosphor' | 'cyan' | 'amber' | 'magenta';
export type DebugViewMode = 'video' | 'camera' | 'split';
export type FrameShapeStyle =
  | 'crt-tube'
  | 'bracket-corners'
  | 'rounded-rect'
  | 'industrial-bezel'
  | 'minimal-ticks';

export interface ScreenFrameTransform {
  offsetX: number;
  offsetY: number;
  rotation: number; // in degrees (-180 to +180)
}

export interface FrameState {
  show: boolean;
  shapeStyle: FrameShapeStyle;
  followTubeCurvature: boolean;
  curvatureScale: number;
  cornerRadius: number;
  inset: number;
  thickness: number;
  opacity: number;
  showLabels: boolean;
  showAntennaMetrics: boolean;
  showQueryMessage: boolean;
  screenQueryToggles: boolean[];
  showLiveFeedBadge: boolean;
  customQueryText: string;
  showCrosshairs: boolean;
  showCornerBrackets: boolean;
  showPoseGuides: boolean;
  poseGuideOpacity: number;
  poseGuideScale: number;
  poseGuideFigureThickness?: number;
  poseGuideReticleThickness?: number;
  poseGuideThickness?: number;
  poseGuidePosition: 'bottom-right' | 'top-right' | 'center';
  poseGuideOffsetX?: number;
  poseGuideOffsetY?: number;
  highlightActivePose: boolean;
  rotation: number; // Global frame rotation in degrees (-180 to +180)
  offsetX: number; // Global frame X offset (-0.5 to +0.5)
  offsetY: number; // Global frame Y offset (-0.5 to +0.5)
  screenTransforms: ScreenFrameTransform[]; // Per-screen transforms (CRT 01 - 06)
  customLabels: string[];
  customSubtitles: string[];
}

export function createDefaultFrameTransforms(): ScreenFrameTransform[] {
  return Array.from({ length: 6 }, () => ({
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  }));
}

export const DEFAULT_SCREEN_LABELS = [
  'CRT [01]',
  'CRT [02]',
  'CRT [03]',
  'CRT [04]',
  'CRT [05]',
  'CRT [06]',
];

export const DEFAULT_SCREEN_SUBTITLES = [
  'TOP-LEFT',
  'TOP-RIGHT',
  'MID-LEFT',
  'MID-RIGHT',
  'BOT-LEFT',
  'BOT-RIGHT',
];

export interface AudioState {
  masterVolume: number;
  videoVolume: number;
  noiseVolume: number;
  humVolume: number;
  antennaModulation: boolean;
  muted: boolean;
}

export interface AppState {
  fps: number;
  debugOverlay: boolean;
  debugViewMode: DebugViewMode;
  debugVideoAudio: boolean;
  skeletonOverlay: boolean;
  showScreenFrames: boolean;
  screenFrameOpacity: number;
  frames: FrameState;
  audio: AudioState;
  skeletonStyle: SkeletonStyle;
  skeletonThickness: number;
  skeletonLineThickness: number;
  skeletonLineOpacity: number;
  skeletonDotSize: number;
  skeletonDotOpacity: number;
  skeletonShowLines: boolean;
  skeletonShowDots: boolean;
  skeletonJitter: number;
  skeletonSmoothing: number;
  hudVisible: boolean;
  audioUnlocked: boolean;
  videoMode: VideoMode;
  currentVideoUrl: string | null;
  currentVideoQuery: string | null;
  tracking: TrackingState;
  interaction: InteractionState;
  quota: QuotaState;
  shaders: ShaderUniformsState;
  setFps: (fps: number) => void;
  setHudVisible: (visible: boolean) => void;
  toggleHud: () => void;
  setDebugOverlay: (visible: boolean) => void;
  setDebugViewMode: (mode: DebugViewMode) => void;
  setDebugVideoAudio: (enabled: boolean) => void;
  setSkeletonOverlay: (enabled: boolean) => void;
  setShowScreenFrames: (show: boolean) => void;
  setScreenFrameOpacity: (opacity: number) => void;
  setFrames: (partial: Partial<FrameState>) => void;
  setScreenFrameTransform: (
    index: number,
    transform: Partial<ScreenFrameTransform>,
  ) => void;
  setGlobalFrameTransform: (
    transform: Partial<{ rotation: number; offsetX: number; offsetY: number }>,
  ) => void;
  resetScreenFrameTransforms: () => void;
  setScreenCustomLabel: (index: number, title: string, subtitle?: string) => void;
  resetScreenLabels: () => void;
  setAudioState: (partial: Partial<AudioState>) => void;
  setSkeletonStyle: (style: SkeletonStyle) => void;
  setSkeletonThickness: (thickness: number) => void;
  setSkeletonLineThickness: (v: number) => void;
  setSkeletonLineOpacity: (v: number) => void;
  setSkeletonDotSize: (v: number) => void;
  setSkeletonDotOpacity: (v: number) => void;
  setSkeletonShowLines: (show: boolean) => void;
  setSkeletonShowDots: (show: boolean) => void;
  setSkeletonJitter: (jitter: number) => void;
  setSkeletonSmoothing: (smoothing: number) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setVideoMode: (mode: VideoMode) => void;
  setCurrentVideoUrl: (url: string | null) => void;
  setCurrentVideoQuery: (query: string | null) => void;
  patchTracking: (partial: Partial<TrackingState>) => void;
  patchInteraction: (partial: Partial<InteractionState>) => void;
  setInteractionEnabled: (enabled: boolean) => void;
  setQuotaState: (partial: Partial<QuotaState>) => void;
  patchShaders: (partial: Partial<ShaderUniformsState>) => void;
  setCornerOffset: (
    screenIndex: number,
    corner: 'tl' | 'tr' | 'br' | 'bl',
    axis: 0 | 1,
    value: number,
  ) => void;
  resetScreenCorners: (screenIndex: number) => void;
  resetAllCorners: () => void;
  setScreenOffset: (screenIndex: number, axis: 0 | 1, value: number) => void;
  resetScreenOffset: (screenIndex: number) => void;
  setGlobalOffset: (axis: 'x' | 'y', value: number) => void;
  resetAllOffsets: () => void;
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

export const DEFAULT_INTERACTION_STATE: InteractionState = {
  enabled: true,
  activePose: 'NONE',
  densityState: 'EMPTY',
  kineticState: 'STEADY',
  proximityState: 'MEDIUM',
  chromaState: 'NEUTRAL',
  kineticEnergy: 0,
  candidateState: null,
  holdProgress: 0,
  isHolding: false,
  holdDurationMs: 1800,
  cooldownRemainingSec: 0,
  cooldownDurationSec: 10,
  lastQuery: null,
  lastCategory: null,
  lastTriggerReason: null,
  stillnessDurationSec: 0,
  zapActive: false,
  zapDirection: null,
  zapPose: null,
  zapScreenIndex: null,
  zapIntensity: 0,
  zapProgress: 0,
  zapCooldownSec: 2,
  zapHoldDurationMs: 1200,
  zapVisualIntensity: 1.0,
  zapEnabled: true,
  zapNavMode: 'sequential',
};

export const DEFAULT_QUOTA_STATE: QuotaState = {
  unitsUsed: 0,
  dailyBudget: 9000,
  percentage: 0,
  isProtectedMode: false,
  cacheHits: 0,
};

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
  globalOffsetX: 0,
  globalOffsetY: 0,
  screenFlips: createDefaultScreenFlips(),
  screenOffsets: createDefaultScreenOffsets(),
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
  screenNoiseGains: [1, 1, 1, 1, 1, 1],
  screenSignalLocks: [0, 0, 0, 0, 0, 0],
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
  globalOffsetX: 0,
  globalOffsetY: 0,
  screenFlips: createDefaultScreenFlips(),
  screenOffsets: createDefaultScreenOffsets(),
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
  screenNoiseGains: [1, 1, 1, 1, 1, 1],
  screenSignalLocks: [0, 0, 0, 0, 0, 0],
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
  globalOffsetX: 0,
  globalOffsetY: 0,
  screenFlips: createDefaultScreenFlips(),
  screenOffsets: createDefaultScreenOffsets(),
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
  screenNoiseGains: [1, 1, 1, 1, 1, 1],
  screenSignalLocks: [0, 0, 0, 0, 0, 0],
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
  globalOffsetX: 0,
  globalOffsetY: 0,
  screenFlips: createDefaultScreenFlips(),
  screenOffsets: createDefaultScreenOffsets(),
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
  screenNoiseGains: [1, 1, 1, 1, 1, 1],
  screenSignalLocks: [0, 0, 0, 0, 0, 0],
  rippleStrength: 0,
  time: 0,
};

/** Vanilla Zustand store (no React) — use getState() / subscribe(). */
export const useAppStore = createStore<AppState>((set) => ({
  fps: 0,
  debugOverlay: false,
  debugViewMode: 'video',
  debugVideoAudio: false,
  skeletonOverlay: true,
  showScreenFrames: true,
  screenFrameOpacity: 0.85,
  frames: {
    show: true,
    shapeStyle: 'crt-tube',
    followTubeCurvature: true,
    curvatureScale: 1.0,
    cornerRadius: 0.08,
    inset: 0.035,
    thickness: 2.0,
    opacity: 0.85,
    showLabels: false,
    showAntennaMetrics: true,
    showQueryMessage: true,
    screenQueryToggles: [true, true, true, true, true, true],
    showLiveFeedBadge: true,
    customQueryText: '',
    showCrosshairs: true,
    showCornerBrackets: true,
    showPoseGuides: true,
    poseGuideOpacity: 0.70,
    poseGuideScale: 0.60,
    poseGuideFigureThickness: 1.2,
    poseGuideReticleThickness: 1.2,
    poseGuideThickness: 1.2,
    poseGuidePosition: 'bottom-right',
    poseGuideOffsetX: 0.0,
    poseGuideOffsetY: 0.0,
    highlightActivePose: true,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    screenTransforms: createDefaultFrameTransforms(),
    customLabels: [...DEFAULT_SCREEN_LABELS],
    customSubtitles: [...DEFAULT_SCREEN_SUBTITLES],
  },
  audio: {
    masterVolume: 0.8,
    videoVolume: 0.9,
    noiseVolume: 0.35,
    humVolume: 0.02,
    antennaModulation: true,
    muted: false,
  },
  skeletonStyle: 'phosphor',
  skeletonThickness: 2,
  skeletonLineThickness: 2,
  skeletonLineOpacity: 0.85,
  skeletonDotSize: 2.5,
  skeletonDotOpacity: 0.9,
  skeletonShowLines: true,
  skeletonShowDots: true,
  skeletonJitter: 0.05,
  skeletonSmoothing: 0.5,
  hudVisible: false,
  audioUnlocked: false,
  videoMode: 'live',
  currentVideoUrl: null,
  currentVideoQuery: null,
  tracking: {
    present: false,
    distance: 3,
    velocity: 0,
    torsoArea: 0,
    leftHand: idleHand(),
    rightHand: idleHand(),
    confidenceThreshold: 0.5,
    mirrorCamera: true,
    cameraRotation: 0,
    lastSeenMs: 0,
    distanceScale: 8.5,
    distanceOffset: 2.8,
    minDistance: 1.0,
    maxDistance: 3.0,
    screenPresences: [0, 0, 0, 0, 0, 0],
    personCount: 0,
    maxNumPoses: 4,
    antennaLocalWeight: 0.95,
    antennaHandBoost: 1.6,
    antennaSmoothing: 0.22,
    antennaFalloffRadius: 0.45,
  },
  interaction: { ...DEFAULT_INTERACTION_STATE },
  quota: { ...DEFAULT_QUOTA_STATE },
  shaders: { ...CRT_6X_TOTEM_PRESET },
  setFps: (fps) => set({ fps }),
  setHudVisible: (hudVisible) => set({ hudVisible }),
  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setDebugOverlay: (debugOverlay) => set({ debugOverlay }),
  setDebugViewMode: (debugViewMode) => set({ debugViewMode }),
  setDebugVideoAudio: (debugVideoAudio) => set({ debugVideoAudio }),
  setSkeletonOverlay: (skeletonOverlay) => set({ skeletonOverlay }),
  setShowScreenFrames: (showScreenFrames) =>
    set((s) => ({
      showScreenFrames,
      frames: { ...s.frames, show: showScreenFrames },
    })),
  setScreenFrameOpacity: (screenFrameOpacity) =>
    set((s) => ({
      screenFrameOpacity,
      frames: { ...s.frames, opacity: screenFrameOpacity },
    })),
  setFrames: (partial) =>
    set((s) => ({
      frames: {
        ...s.frames,
        ...partial,
        screenTransforms:
          partial.screenTransforms !== undefined
            ? partial.screenTransforms.map((t, i) => ({
                offsetX: t?.offsetX ?? s.frames.screenTransforms?.[i]?.offsetX ?? 0,
                offsetY: t?.offsetY ?? s.frames.screenTransforms?.[i]?.offsetY ?? 0,
                rotation: t?.rotation ?? s.frames.screenTransforms?.[i]?.rotation ?? 0,
              }))
            : s.frames.screenTransforms,
        screenQueryToggles:
          partial.screenQueryToggles !== undefined
            ? [...partial.screenQueryToggles]
            : s.frames.screenQueryToggles,
      },
      showScreenFrames: partial.show !== undefined ? partial.show : s.showScreenFrames,
      screenFrameOpacity: partial.opacity !== undefined ? partial.opacity : s.screenFrameOpacity,
    })),
  setScreenFrameTransform: (index, transform) =>
    set((s) => {
      const nextTransforms = s.frames.screenTransforms.map((item, i) =>
        i === index ? { ...item, ...transform } : item,
      );
      return {
        frames: {
          ...s.frames,
          screenTransforms: nextTransforms,
        },
      };
    }),
  setGlobalFrameTransform: (transform) =>
    set((s) => ({
      frames: {
        ...s.frames,
        ...transform,
      },
    })),
  resetScreenFrameTransforms: () =>
    set((s) => ({
      frames: {
        ...s.frames,
        screenTransforms: createDefaultFrameTransforms(),
      },
    })),
  setScreenCustomLabel: (index, title, subtitle) =>
    set((s) => {
      const nextLabels = [...s.frames.customLabels];
      const nextSubs = [...s.frames.customSubtitles];
      nextLabels[index] = title;
      if (subtitle !== undefined) {
        nextSubs[index] = subtitle;
      }
      return {
        frames: {
          ...s.frames,
          customLabels: nextLabels,
          customSubtitles: nextSubs,
        },
      };
    }),
  resetScreenLabels: () =>
    set((s) => ({
      frames: {
        ...s.frames,
        customLabels: [...DEFAULT_SCREEN_LABELS],
        customSubtitles: [...DEFAULT_SCREEN_SUBTITLES],
      },
    })),
  setAudioState: (partial) =>
    set((s) => ({ audio: { ...s.audio, ...partial } })),
  setSkeletonStyle: (skeletonStyle) => set({ skeletonStyle }),
  setSkeletonThickness: (v) => set({ skeletonThickness: v, skeletonLineThickness: v }),
  setSkeletonLineThickness: (v) => set({ skeletonLineThickness: v, skeletonThickness: v }),
  setSkeletonLineOpacity: (v) => set({ skeletonLineOpacity: v }),
  setSkeletonDotSize: (v) => set({ skeletonDotSize: v }),
  setSkeletonDotOpacity: (v) => set({ skeletonDotOpacity: v }),
  setSkeletonShowLines: (skeletonShowLines) => set({ skeletonShowLines }),
  setSkeletonShowDots: (skeletonShowDots) => set({ skeletonShowDots }),
  setSkeletonJitter: (skeletonJitter) => set({ skeletonJitter }),
  setSkeletonSmoothing: (skeletonSmoothing) => set({ skeletonSmoothing }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setVideoMode: (videoMode) => set({ videoMode }),
  setCurrentVideoUrl: (currentVideoUrl) => set({ currentVideoUrl }),
  setCurrentVideoQuery: (currentVideoQuery) => set({ currentVideoQuery }),
  patchTracking: (partial) =>
    set((s) => ({ tracking: { ...s.tracking, ...partial } })),
  patchInteraction: (partial) =>
    set((s) => ({ interaction: { ...s.interaction, ...partial } })),
  setInteractionEnabled: (enabled) =>
    set((s) => ({ interaction: { ...s.interaction, enabled } })),
  setQuotaState: (partial) =>
    set((s) => ({ quota: { ...s.quota, ...partial } })),
  patchShaders: (partial) =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        ...partial,
        screenOffsets: partial.screenOffsets ?? s.shaders.screenOffsets ?? createDefaultScreenOffsets(),
        screenFlips: partial.screenFlips ?? s.shaders.screenFlips ?? createDefaultScreenFlips(),
        cornerOffsets: partial.cornerOffsets ?? s.shaders.cornerOffsets ?? createDefaultCornerOffsets(),
      },
    })),
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
  setScreenOffset: (screenIndex, axis, value) =>
    set((s) => {
      const nextOffsets = (s.shaders.screenOffsets || createDefaultScreenOffsets()).map(
        (item, i) => {
          if (i !== screenIndex) return item;
          const next: [number, number] = [item[0], item[1]];
          next[axis] = value;
          return next;
        },
      );
      return {
        shaders: {
          ...s.shaders,
          screenOffsets: nextOffsets,
        },
      };
    }),
  resetScreenOffset: (screenIndex) =>
    set((s) => {
      const nextOffsets = (s.shaders.screenOffsets || createDefaultScreenOffsets()).map(
        (item, i) => (i === screenIndex ? ([0, 0] as [number, number]) : item),
      );
      return {
        shaders: {
          ...s.shaders,
          screenOffsets: nextOffsets,
        },
      };
    }),
  setGlobalOffset: (axis, value) =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        [axis === 'x' ? 'globalOffsetX' : 'globalOffsetY']: value,
      },
    })),
  resetAllOffsets: () =>
    set((s) => ({
      shaders: {
        ...s.shaders,
        globalOffsetX: 0,
        globalOffsetY: 0,
        screenOffsets: createDefaultScreenOffsets(),
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
