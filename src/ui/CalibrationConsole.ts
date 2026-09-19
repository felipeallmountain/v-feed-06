import GUI from 'lil-gui';
import {
  CRT_6X_PHYSICAL_PRESET,
  CRT_6X_TOTEM_PRESET,
  CRT_TUBE_SHADERS,
  FLAT_DISPLAY_SHADERS,
  useAppStore,
  type AudioState,
  type FrameState,
  type ShaderUniformsState,
  type VideoMode,
} from '../core/StateManager';
import { computeAllScreenCorners, MATRIX_QUADRANTS } from '../rendering/MatrixSplitter';
import { syncChannel, type TelemetryTickPayload } from '../core/SyncChannel';
import { SCREEN_POSE_MAP } from '../vision/BroadcastQuerySynthesizer';

const STORAGE_KEY = 'vfeed-calibration';

export type TestPatternMode = 'none' | 'grid' | 'crosshatch' | 'colorbars' | 'white' | 'black';

interface SavedCalibration {
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
  };
  frames?: Partial<FrameState>;
  audio?: Partial<AudioState>;
}

export class CalibrationConsole {
  private gui: GUI | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private testPattern: TestPatternMode = 'grid';
  private selectedScreen = 0;
  private activeDrag: {
    screenIndex: number;
    corner: 'bl' | 'br' | 'tr' | 'tl';
    startOffset: [number, number];
    startU: number;
    startV: number;
  } | null = null;

  // Controllers for display updates
  private fpsController: { fps: string } | null = null;
  private distController: { dist: string } | null = null;
  private peopleController: { people: string } | null = null;
  private curvatureCtrl: ReturnType<GUI['add']> | null = null;
  private shaderBindings: ShaderUniformsState | null = null;
  private screenReadoutCtrls: Array<ReturnType<GUI['add']>> = [];
  private screenReadouts: Array<{ status: string }> = [];
  private interactionReadouts: {
    pose: string;
    density: string;
    kinetics: string;
    chroma: string;
    hold: string;
    cooldown: string;
    quotaUsage: string;
    quotaSaver: boolean;
    lastQuery: string;
  } | null = null;
  private nowPlayingController: { title: string } | null = null;
  private timeController: { time: string } | null = null;
  private scrubController: { progress: number } | null = null;

  // Corner Pinning sub-controllers
  private cornerState = {
    showHandles: true,
    selectedScreen: 0,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    fineRotation: 0,
    flipH: false,
    flipV: false,
    tlX: 0,
    tlY: 0,
    trX: 0,
    trY: 0,
    brX: 0,
    brY: 0,
    blX: 0,
    blY: 0,
  };
  private showHandlesCtrl?: ReturnType<GUI['add']>;
  private selectedScreenCtrl?: ReturnType<GUI['add']>;
  private offXCtrl?: ReturnType<GUI['add']>;
  private offYCtrl?: ReturnType<GUI['add']>;
  private rotCtrl?: ReturnType<GUI['add']>;
  private fineRotCtrl?: ReturnType<GUI['add']>;
  private flipHCtrl?: ReturnType<GUI['add']>;
  private flipVCtrl?: ReturnType<GUI['add']>;
  private tlXCtrl?: ReturnType<GUI['add']>;
  private tlYCtrl?: ReturnType<GUI['add']>;
  private trXCtrl?: ReturnType<GUI['add']>;
  private trYCtrl?: ReturnType<GUI['add']>;
  private brXCtrl?: ReturnType<GUI['add']>;
  private brYCtrl?: ReturnType<GUI['add']>;
  private blXCtrl?: ReturnType<GUI['add']>;
  private blYCtrl?: ReturnType<GUI['add']>;

  private unsubscribeStore: (() => void) | null = null;
  private unsubscribeSync: (() => void) | null = null;
  private unsubscribeDebugFrame: (() => void) | null = null;
  private rafId = 0;
  private latestTelemetry: TelemetryTickPayload | null = null;

  // Debug Overlay Window state & elements
  private debugWindowEl: HTMLElement | null = null;
  private debugCanvasEl: HTMLCanvasElement | null = null;
  private debugCtx: CanvasRenderingContext2D | null = null;
  private debugToggleBtn: HTMLButtonElement | null = null;
  private debugFeedBadge: HTMLElement | null = null;
  private debugLiveDot: HTMLElement | null = null;
  private debugOfflineMsg: HTMLElement | null = null;
  private debugGuiCtrl: ReturnType<GUI['add']> | null = null;
  private debugModeGuiCtrl: ReturnType<GUI['add']> | null = null;
  private antennaMetricsDebugCtrl?: ReturnType<GUI['add']>;
  private antennaMetricsFrameCtrl?: ReturnType<GUI['add']>;
  private screenTitleBindings: Array<{ title: string }> = [];
  private videoQueryController: { query: string } | null = null;
  private queryFolderVideoQuery: { query: string } | null = null;
  private screenQueryTogglesState = {
    crt1: true,
    crt2: true,
    crt3: true,
    crt4: true,
    crt5: true,
    crt6: true,
  };
  private queryState = {
    showQueryMessage: true,
    showLiveFeedBadge: true,
    customQueryText: '',
    screenQueryToggles: [true, true, true, true, true, true],
  };
  private dbgState: { debugOverlay: boolean; debugViewMode: string } = {
    debugOverlay: false,
    debugViewMode: 'video',
  };
  private isDebugCollapsed = false;
  private lastDebugFrameReceivedTs = 0;

  getTelemetry(): TelemetryTickPayload | null {
    return this.latestTelemetry;
  }

  constructor(canvas: HTMLCanvasElement, guiContainer: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D Canvas unsupported');
    this.ctx = ctx;

    this.initSync();
    this.loadSaved();
    this.initDebugWindow();
    this.initGui(guiContainer);
    this.initCanvasInteractions();
    this.startRenderLoop();
  }

  private initSync(): void {
    syncChannel.startHeartbeat('operator');
    syncChannel.requestInitialState();

    this.unsubscribeSync = syncChannel.onMessage((msg) => {
      if (msg.type === 'TELEMETRY_TICK') {
        this.latestTelemetry = msg.payload;
        this.applyTelemetry(msg.payload);
      } else if (msg.type === 'STATE_PATCH') {
        this.applyIncomingStatePatch(msg.payload);
      } else if (msg.type === 'SEND_INITIAL_STATE') {
        if (msg.payload) {
          this.applyCalibrationData(msg.payload);
        }
      }
    });
  }

  private applyTelemetry(t: TelemetryTickPayload): void {
    if (this.fpsController) {
      this.fpsController.fps = `${t.fps} FPS`;
    }
    if (this.distController) {
      this.distController.dist = `${t.tracking.distance.toFixed(2)} m`;
    }
    if (this.peopleController) {
      this.peopleController.people = `${t.tracking.personCount} detected`;
    }
    if (this.interactionReadouts) {
      const activeP = t.interaction.activePose;
      if (activeP && activeP !== 'NONE') {
        const scr = Object.entries(SCREEN_POSE_MAP).find(([_, p]) => p === activeP);
        this.interactionReadouts.pose = scr
          ? `[CRT 0${Number(scr[0]) + 1}] ${activeP.replace('POSE_', '')}`
          : activeP;
      } else {
        this.interactionReadouts.pose = 'NONE';
      }
      this.interactionReadouts.density = t.interaction.densityState;
      this.interactionReadouts.kinetics = `${t.interaction.kineticState} (${Math.round(t.interaction.kineticEnergy * 100)}%)`;
      this.interactionReadouts.chroma = t.interaction.chromaState;
      this.interactionReadouts.hold = t.interaction.isHolding
        ? `${Math.round(t.interaction.holdProgress * 100)}%`
        : '0%';
      this.interactionReadouts.cooldown =
        t.interaction.cooldownRemainingSec > 0
          ? `${t.interaction.cooldownRemainingSec}s`
          : 'Ready';
      this.interactionReadouts.lastQuery = t.interaction.lastQuery || 'None';
      if (t.quota) {
        this.interactionReadouts.quotaUsage = `${t.quota.percentage}% (${(t.quota.unitsUsed / 1000).toFixed(1)}k/${(t.quota.dailyBudget / 1000).toFixed(1)}k)`;
        this.interactionReadouts.quotaSaver = t.quota.isProtectedMode;
      }
    }

    if (t.video) {
      if (this.nowPlayingController) {
        this.nowPlayingController.title = t.video.title || 'Live Feed';
      }
      if (t.video.query) {
        useAppStore.getState().setCurrentVideoQuery(t.video.query);
        if (this.videoQueryController) {
          this.videoQueryController.query = t.video.query;
        }
        if (this.queryFolderVideoQuery) {
          this.queryFolderVideoQuery.query = t.video.query;
        }
        this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
      }
      if (this.timeController) {
        const cur = this.formatTime(t.video.currentTime);
        const dur = this.formatTime(t.video.duration);
        this.timeController.time = `${cur} / ${dur}`;
      }
      if (this.scrubController && t.video.duration > 0) {
        this.scrubController.progress = (t.video.currentTime / t.video.duration) * 100;
      }
    }

    if (t.tracking.antennaLocks) {
      for (let i = 0; i < 6; i++) {
        const lockPct = Math.round((t.tracking.antennaLocks[i] ?? 0) * 100);
        const noisePct = Math.round((t.tracking.antennaNoises[i] ?? 1) * 100);
        if (this.screenReadouts[i]) {
          this.screenReadouts[i].status = `${lockPct}% lock · ${noisePct}% snow`;
          this.screenReadoutCtrls[i]?.updateDisplay();
        }
      }
    }

    if (useAppStore.getState().debugOverlay && Date.now() - this.lastDebugFrameReceivedTs > 2500) {
      if (this.debugOfflineMsg && this.debugOfflineMsg.style.display !== 'flex') {
        this.debugOfflineMsg.style.display = 'flex';
      }
      if (this.debugLiveDot && !this.debugLiveDot.classList.contains('offline')) {
        this.debugLiveDot.classList.add('offline');
      }
    }
  }

  private formatTime(sec: number): string {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private syncScreenQueryToggles(): void {
    const store = useAppStore.getState();
    const next = [
      this.screenQueryTogglesState.crt1,
      this.screenQueryTogglesState.crt2,
      this.screenQueryTogglesState.crt3,
      this.screenQueryTogglesState.crt4,
      this.screenQueryTogglesState.crt5,
      this.screenQueryTogglesState.crt6,
    ];
    this.queryState.screenQueryToggles = [...next];
    store.setFrames({ screenQueryToggles: next });
    this.broadcastPatch({ frames: { screenQueryToggles: next } });
    this.persist();
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  private setAllScreenQueries(enabled: boolean): void {
    this.screenQueryTogglesState.crt1 = enabled;
    this.screenQueryTogglesState.crt2 = enabled;
    this.screenQueryTogglesState.crt3 = enabled;
    this.screenQueryTogglesState.crt4 = enabled;
    this.screenQueryTogglesState.crt5 = enabled;
    this.screenQueryTogglesState.crt6 = enabled;
    this.syncScreenQueryToggles();
  }

  private applyIncomingStatePatch(patch: any): void {
    const store = useAppStore.getState();
    if (patch.shaders) store.patchShaders(patch.shaders);
    if (patch.frames) {
      store.setFrames(patch.frames);
      if (this.screenTitleBindings.length && patch.frames.customLabels) {
        for (let i = 0; i < 6; i++) {
          if (patch.frames.customLabels[i] !== undefined) {
            this.screenTitleBindings[i].title = patch.frames.customLabels[i];
          }
        }
      }
      if (patch.frames.showQueryMessage !== undefined) {
        this.queryState.showQueryMessage = patch.frames.showQueryMessage;
      }
      if (patch.frames.showLiveFeedBadge !== undefined) {
        this.queryState.showLiveFeedBadge = patch.frames.showLiveFeedBadge;
      }
      if (patch.frames.customQueryText !== undefined) {
        this.queryState.customQueryText = patch.frames.customQueryText;
      }
      if (patch.frames.screenQueryToggles) {
        for (let i = 0; i < 6; i++) {
          if (patch.frames.screenQueryToggles[i] !== undefined) {
            const val = patch.frames.screenQueryToggles[i];
            this.queryState.screenQueryToggles[i] = val;
            (this.screenQueryTogglesState as any)[`crt${i + 1}`] = val;
          }
        }
      }
    }
    if (patch.audio) store.setAudioState(patch.audio);
    if (patch.tracking) store.patchTracking(patch.tracking);
    if (patch.interaction) store.patchInteraction(patch.interaction);
    if (patch.videoMode) store.setVideoMode(patch.videoMode);
    if (patch.skeletonOverlay !== undefined) store.setSkeletonOverlay(patch.skeletonOverlay);
    if (patch.skeletonStyle !== undefined) store.setSkeletonStyle(patch.skeletonStyle);
    if (patch.skeletonLineThickness !== undefined) store.setSkeletonLineThickness(patch.skeletonLineThickness);
    if (patch.skeletonLineOpacity !== undefined) store.setSkeletonLineOpacity(patch.skeletonLineOpacity);
    if (patch.skeletonDotSize !== undefined) store.setSkeletonDotSize(patch.skeletonDotSize);
    if (patch.skeletonDotOpacity !== undefined) store.setSkeletonDotOpacity(patch.skeletonDotOpacity);
    if (patch.skeletonShowLines !== undefined) store.setSkeletonShowLines(patch.skeletonShowLines);
    if (patch.skeletonShowDots !== undefined) store.setSkeletonShowDots(patch.skeletonShowDots);
    if (patch.skeletonJitter !== undefined) store.setSkeletonJitter(patch.skeletonJitter);
    if (patch.debugOverlay !== undefined) {
      store.setDebugOverlay(patch.debugOverlay);
      this.setDebugWindowVisible(patch.debugOverlay, false);
    }
    if (patch.debugViewMode !== undefined) {
      store.setDebugViewMode(patch.debugViewMode);
      this.updateDebugWindowFeedMode(patch.debugViewMode);
    }

    if (this.shaderBindings) {
      Object.assign(this.shaderBindings, useAppStore.getState().shaders);
    }
    this.updateCornerControllers();
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  private initGui(container: HTMLElement): void {
    const store = useAppStore.getState();
    const gui = new GUI({
      title: 'V-FEED [06] Operator Calibration Console',
      container,
      width: container.clientWidth || 360,
    });
    this.gui = gui;

    // --- 1. PRESETS & STORAGE ---
    const presets = gui.addFolder('Presets & Calibration Storage');
    presets.add({ totem: () => this.applyPreset(CRT_6X_TOTEM_PRESET) }, 'totem').name('6x CRT Totem (Wall)');
    presets.add({ physical: () => this.applyPreset(CRT_6X_PHYSICAL_PRESET) }, 'physical').name('6x Physical Output');
    presets.add({ flat: () => this.applyPreset(FLAT_DISPLAY_SHADERS) }, 'flat').name('1x Flat Screen');
    presets.add({ crt: () => this.applyPreset(CRT_TUBE_SHADERS) }, 'crt').name('1x CRT Tube');
    presets.add({ save: () => this.saveToBrowserAndServer() }, 'save').name('💾 Save to Browser & Disk');
    presets.add({ export: () => this.exportCalibrationJson() }, 'export').name('📥 Export File (.json)');
    presets.add({ import: () => this.importCalibrationJson() }, 'import').name('📤 Import File (.json)');
    presets.add({ copy: () => this.copyToClipboard() }, 'copy').name('📋 Copy JSON to Clipboard');
    presets.add({ reset: () => this.applyPreset(CRT_6X_TOTEM_PRESET) }, 'reset').name('Reset defaults');

    this.shaderBindings = { ...store.shaders };
    const sh: ShaderUniformsState = this.shaderBindings;

    // --- 2. 2x3 MATRIX & BEZELS ---
    const matrixFolder = gui.addFolder('2×3 Matrix (6 Screens)');
    matrixFolder
      .add(sh, 'matrixSplit')
      .name('Split into 6 CRT pieces')
      .onChange((v: boolean) => {
        store.patchShaders({ matrixSplit: v });
        this.broadcastPatch({ shaders: { matrixSplit: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelWidthX', 0, 0.1, 0.002)
      .name('Bezel X (Columns)')
      .onChange((v: number) => {
        store.patchShaders({ bezelWidthX: v });
        this.broadcastPatch({ shaders: { bezelWidthX: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelWidthY', 0, 0.1, 0.002)
      .name('Bezel Y (Rows)')
      .onChange((v: number) => {
        store.patchShaders({ bezelWidthY: v });
        this.broadcastPatch({ shaders: { bezelWidthY: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelOuter', 0, 0.08, 0.002)
      .name('Outer Chassis Frame')
      .onChange((v: number) => {
        store.patchShaders({ bezelOuter: v });
        this.broadcastPatch({ shaders: { bezelOuter: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelComp', 0, 1, 0.05)
      .name('Bezel Compensation')
      .onChange((v: number) => {
        store.patchShaders({ bezelComp: v });
        this.broadcastPatch({ shaders: { bezelComp: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'cornerRounding', 0, 0.2, 0.01)
      .name('Tube Corner Radius')
      .onChange((v: number) => {
        store.patchShaders({ cornerRounding: v });
        this.broadcastPatch({ shaders: { cornerRounding: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelChassis')
      .name('Draw CRT Chassis Bevel')
      .onChange((v: boolean) => {
        store.patchShaders({ bezelChassis: v });
        this.broadcastPatch({ shaders: { bezelChassis: v } });
        this.persist();
      });

    matrixFolder
      .add(sh, 'perScreenVariance', 0, 1, 0.05)
      .name('Analog Sync Drift')
      .onChange((v: number) => {
        store.patchShaders({ perScreenVariance: v });
        this.broadcastPatch({ shaders: { perScreenVariance: v } });
        this.persist();
      });

    // --- 3. SCREEN FRAMES & OUTLINES ---
    const framesFolder = gui.addFolder('Screen Frames & TV Outlines');
    const frm = { ...store.frames };

    framesFolder
      .add(frm, 'show')
      .name('Show Screen Frames')
      .onChange((v: boolean) => {
        store.setFrames({ show: v });
        this.broadcastPatch({ frames: { show: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'shapeStyle', [
        'crt-tube',
        'bracket-corners',
        'rounded-rect',
        'industrial-bezel',
        'minimal-ticks',
      ])
      .name('Frame Shape')
      .onChange((v: any) => {
        store.setFrames({ shapeStyle: v });
        this.broadcastPatch({ frames: { shapeStyle: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'followTubeCurvature')
      .name('Follow TV Curvature')
      .onChange((v: boolean) => {
        store.setFrames({ followTubeCurvature: v });
        this.broadcastPatch({ frames: { followTubeCurvature: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'curvatureScale', 0.0, 2.5, 0.05)
      .name('Curvature Scale')
      .onChange((v: number) => {
        store.setFrames({ curvatureScale: v });
        this.broadcastPatch({ frames: { curvatureScale: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'cornerRadius', 0.0, 0.3, 0.01)
      .name('Corner Rounding')
      .onChange((v: number) => {
        store.setFrames({ cornerRadius: v });
        this.broadcastPatch({ frames: { cornerRadius: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'inset', 0.0, 0.12, 0.005)
      .name('Frame Inset (Padding)')
      .onChange((v: number) => {
        store.setFrames({ inset: v });
        this.broadcastPatch({ frames: { inset: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'thickness', 0.5, 8.0, 0.5)
      .name('Line Thickness')
      .onChange((v: number) => {
        store.setFrames({ thickness: v });
        this.broadcastPatch({ frames: { thickness: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'opacity', 0.0, 1.0, 0.05)
      .name('Frame Opacity')
      .onChange((v: number) => {
        store.setFrames({ opacity: v });
        this.broadcastPatch({ frames: { opacity: v } });
        this.persist();
      });

    this.antennaMetricsFrameCtrl = framesFolder
      .add(frm, 'showAntennaMetrics')
      .name('Antenna Metrics (ANT/N/Bar)')
      .onChange((v: boolean) => {
        store.setFrames({ showAntennaMetrics: v });
        this.broadcastPatch({ frames: { showAntennaMetrics: v } });
        this.persist();
        if (this.antennaMetricsDebugCtrl && this.antennaMetricsDebugCtrl.getValue() !== v) {
          this.antennaMetricsDebugCtrl.setValue(v);
        }
      });

    // Screen Titles for Antenna Metrics (CRT 01 - 06)
    const titlesFolder = framesFolder.addFolder('Screen Titles (CRT 01 - 06)');
    titlesFolder.close();
    this.screenTitleBindings = Array.from({ length: 6 }, (_, i) => ({
      title: store.frames.customLabels[i] || `CRT [0${i + 1}]`,
    }));

    const screenPosNames = ['Top-Left', 'Top-Right', 'Mid-Left', 'Mid-Right', 'Bot-Left', 'Bot-Right'];
    for (let i = 0; i < 6; i++) {
      titlesFolder
        .add(this.screenTitleBindings[i], 'title')
        .name(`Screen ${i + 1} (${screenPosNames[i]})`)
        .onChange((v: string) => {
          store.setScreenCustomLabel(i, v);
          this.broadcastPatch({
            frames: {
              customLabels: useAppStore.getState().frames.customLabels,
            },
          });
          this.persist();
          this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
        });
    }

    titlesFolder
      .add(
        {
          resetTitles: () => {
            store.resetScreenLabels();
            const freshFrames = useAppStore.getState().frames;
            for (let i = 0; i < 6; i++) {
              this.screenTitleBindings[i].title = freshFrames.customLabels[i] || `CRT [0${i + 1}]`;
            }
            this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
            this.broadcastPatch({ frames: freshFrames });
            this.persist();
          },
        },
        'resetTitles',
      )
      .name('Reset Default Titles');

    // Screen Pose Guides (CRT 01 - 06)
    const poseGuideFolder = framesFolder.addFolder('Screen Pose Guides (6 TVs)');
    poseGuideFolder.open();

    poseGuideFolder
      .add(frm, 'showPoseGuides')
      .name('Show Pose Guides')
      .onChange((v: boolean) => {
        store.setFrames({ showPoseGuides: v });
        this.broadcastPatch({ frames: { showPoseGuides: v } });
        this.persist();
      });

    poseGuideFolder
      .add(frm, 'poseGuideOpacity', 0.1, 1.0, 0.05)
      .name('Guide Opacity')
      .onChange((v: number) => {
        store.setFrames({ poseGuideOpacity: v });
        this.broadcastPatch({ frames: { poseGuideOpacity: v } });
        this.persist();
      });

    poseGuideFolder
      .add(frm, 'poseGuideScale', 0.25, 1.5, 0.05)
      .name('Guide Scale')
      .onChange((v: number) => {
        store.setFrames({ poseGuideScale: v });
        this.broadcastPatch({ frames: { poseGuideScale: v } });
        this.persist();
      });

    poseGuideFolder
      .add(frm, 'poseGuidePosition', ['bottom-right', 'top-right', 'center'])
      .name('Guide Position')
      .onChange((v: 'bottom-right' | 'top-right' | 'center') => {
        store.setFrames({ poseGuidePosition: v });
        this.broadcastPatch({ frames: { poseGuidePosition: v } });
        this.persist();
      });

    poseGuideFolder
      .add(frm, 'highlightActivePose')
      .name('Highlight Active Pose')
      .onChange((v: boolean) => {
        store.setFrames({ highlightActivePose: v });
        this.broadcastPatch({ frames: { highlightActivePose: v } });
        this.persist();
      });

    // Pose Assignment Roster
    const poseRoster = poseGuideFolder.addFolder('Pose Assignment Roster');
    poseRoster.close();
    const rosterList = [
      { screen: 'CRT [01] (Top-Left)', pose: 'RABBIT EARS (VHF Dipole)' },
      { screen: 'CRT [02] (Top-Right)', pose: 'DIAL TUNER (Yagi Point)' },
      { screen: 'CRT [03] (Mid-Left)', pose: 'TV SHOCK (Commercial Gasp)' },
      { screen: 'CRT [04] (Mid-Right)', pose: 'WINGSUIT (Horizontal Dipole)' },
      { screen: 'CRT [05] (Bot-Left)', pose: 'UHF LOOP (Circular Halo)' },
      { screen: 'CRT [06] (Bot-Right)', pose: 'SIGNAL LOCK (Human Capacitor)' },
    ];
    for (const item of rosterList) {
      poseRoster.add({ info: item.pose }, 'info').name(item.screen).disable();
    }

    // Bottom Query Message (CRT 01 - 06)
    this.queryState = {
      showQueryMessage: store.frames.showQueryMessage ?? true,
      showLiveFeedBadge: store.frames.showLiveFeedBadge ?? true,
      customQueryText: store.frames.customQueryText ?? '',
      screenQueryToggles: store.frames.screenQueryToggles
        ? [...store.frames.screenQueryToggles]
        : [true, true, true, true, true, true],
    };
    for (let i = 0; i < 6; i++) {
      (this.screenQueryTogglesState as any)[`crt${i + 1}`] = this.queryState.screenQueryToggles[i] ?? true;
    }

    const queryFolder = framesFolder.addFolder('Bottom Query Message (CRT 01 - 06)');
    queryFolder.open();
    queryFolder
      .add(this.queryState, 'showQueryMessage')
      .name('Enable All Query Messages')
      .onChange((v: boolean) => {
        store.setFrames({ showQueryMessage: v });
        this.broadcastPatch({ frames: { showQueryMessage: v } });
        this.persist();
        this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
      });

    queryFolder
      .add(this.queryState, 'showLiveFeedBadge')
      .name('Show LIVE FEED Tag')
      .onChange((v: boolean) => {
        store.setFrames({ showLiveFeedBadge: v });
        this.broadcastPatch({ frames: { showLiveFeedBadge: v } });
        this.persist();
        this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
      });

    this.queryFolderVideoQuery = {
      query: this.latestTelemetry?.video?.query || store.currentVideoQuery || 'Detecting...',
    };
    queryFolder
      .add(this.queryFolderVideoQuery, 'query')
      .name('Actual Video Query')
      .disable();

    queryFolder
      .add(this.queryState, 'customQueryText')
      .name('Custom Query Override')
      .onChange((v: string) => {
        store.setFrames({ customQueryText: v });
        this.broadcastPatch({ frames: { customQueryText: v } });
        this.persist();
      });

    // 6 Direct Per-Screen Visibility Toggles
    queryFolder
      .add(this.screenQueryTogglesState, 'crt1')
      .name(`CRT [01] (${screenPosNames[0]})`)
      .onChange(() => this.syncScreenQueryToggles());
    queryFolder
      .add(this.screenQueryTogglesState, 'crt2')
      .name(`CRT [02] (${screenPosNames[1]})`)
      .onChange(() => this.syncScreenQueryToggles());
    queryFolder
      .add(this.screenQueryTogglesState, 'crt3')
      .name(`CRT [03] (${screenPosNames[2]})`)
      .onChange(() => this.syncScreenQueryToggles());
    queryFolder
      .add(this.screenQueryTogglesState, 'crt4')
      .name(`CRT [04] (${screenPosNames[3]})`)
      .onChange(() => this.syncScreenQueryToggles());
    queryFolder
      .add(this.screenQueryTogglesState, 'crt5')
      .name(`CRT [05] (${screenPosNames[4]})`)
      .onChange(() => this.syncScreenQueryToggles());
    queryFolder
      .add(this.screenQueryTogglesState, 'crt6')
      .name(`CRT [06] (${screenPosNames[5]})`)
      .onChange(() => this.syncScreenQueryToggles());

    queryFolder
      .add(
        {
          enableAll: () => this.setAllScreenQueries(true),
        },
        'enableAll',
      )
      .name('Enable All Screens');

    queryFolder
      .add(
        {
          disableAll: () => this.setAllScreenQueries(false),
        },
        'disableAll',
      )
      .name('Disable All Screens');

    framesFolder
      .add(frm, 'showCrosshairs')
      .name('Center Crosshairs')
      .onChange((v: boolean) => {
        store.setFrames({ showCrosshairs: v });
        this.broadcastPatch({ frames: { showCrosshairs: v } });
        this.persist();
      });

    framesFolder
      .add(frm, 'showCornerBrackets')
      .name('Corner Bracket Accents')
      .onChange((v: boolean) => {
        store.setFrames({ showCornerBrackets: v });
        this.broadcastPatch({ frames: { showCornerBrackets: v } });
        this.persist();
      });

    // --- 4. CORNER PINNING, OFFSET & KEYSTONE (6 SCREENS) ---
    const cornerFolder = gui.addFolder('Corner Pinning, Offset & Keystone (6 Screens)');
    const screenMap = {
      'CRT [01] · Top-Left': 0,
      'CRT [02] · Top-Right': 1,
      'CRT [03] · Mid-Left': 2,
      'CRT [04] · Mid-Right': 3,
      'CRT [05] · Bot-Left': 4,
      'CRT [06] · Bot-Right': 5,
    };

    const rotationOptions = {
      '0° (Normal)': 0,
      '90° (Clockwise)': 90,
      '180° (Inverted)': 180,
      '270° (Counter-CW)': 270,
    };

    this.showHandlesCtrl = cornerFolder
      .add(this.cornerState, 'showHandles')
      .name('Show Corner Target Guides')
      .onChange((v: boolean) => {
        store.patchShaders({ showCornerHandles: v });
        this.broadcastPatch({ shaders: { showCornerHandles: v } });
        this.persist();
      });

    this.offXCtrl = cornerFolder
      .add(this.cornerState, 'offsetX', -0.25, 0.25, 0.001)
      .name('Screen X Offset')
      .onChange((v: number) => {
        store.setScreenOffset(this.cornerState.selectedScreen, 0, v);
        this.broadcastPatch({ shaders: { screenOffsets: useAppStore.getState().shaders.screenOffsets } });
        this.persist();
      });

    this.offYCtrl = cornerFolder
      .add(this.cornerState, 'offsetY', -0.25, 0.25, 0.001)
      .name('Screen Y Offset')
      .onChange((v: number) => {
        store.setScreenOffset(this.cornerState.selectedScreen, 1, v);
        this.broadcastPatch({ shaders: { screenOffsets: useAppStore.getState().shaders.screenOffsets } });
        this.persist();
      });

    this.rotCtrl = cornerFolder
      .add(this.cornerState, 'rotation', rotationOptions)
      .name('Rotation (90° Steps)')
      .onChange((v: number) => {
        store.setScreenRotation(this.cornerState.selectedScreen, v);
        this.broadcastPatch({ shaders: { screenFlips: useAppStore.getState().shaders.screenFlips } });
        this.persist();
      });

    this.fineRotCtrl = cornerFolder
      .add(this.cornerState, 'fineRotation', -180, 180, 0.5)
      .name('Fine Angle (°)')
      .onChange((v: number) => {
        store.setScreenFineRotation(this.cornerState.selectedScreen, v);
        this.broadcastPatch({ shaders: { screenFlips: useAppStore.getState().shaders.screenFlips } });
        this.persist();
      });

    this.flipHCtrl = cornerFolder
      .add(this.cornerState, 'flipH')
      .name('Flip Horizontally (Mirror X)')
      .onChange((v: boolean) => {
        store.setScreenFlip(this.cornerState.selectedScreen, 'h', v);
        this.broadcastPatch({ shaders: { screenFlips: useAppStore.getState().shaders.screenFlips } });
        this.persist();
      });

    this.flipVCtrl = cornerFolder
      .add(this.cornerState, 'flipV')
      .name('Flip Vertically (Invert Y)')
      .onChange((v: boolean) => {
        store.setScreenFlip(this.cornerState.selectedScreen, 'v', v);
        this.broadcastPatch({ shaders: { screenFlips: useAppStore.getState().shaders.screenFlips } });
        this.persist();
      });

    const tlFolder = cornerFolder.addFolder('Top-Left (TL)');
    this.tlXCtrl = tlFolder
      .add(this.cornerState, 'tlX', -0.25, 0.25, 0.001)
      .name('TL X Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'tl', 0, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });
    this.tlYCtrl = tlFolder
      .add(this.cornerState, 'tlY', -0.25, 0.25, 0.001)
      .name('TL Y Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'tl', 1, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });

    const trFolder = cornerFolder.addFolder('Top-Right (TR)');
    this.trXCtrl = trFolder
      .add(this.cornerState, 'trX', -0.25, 0.25, 0.001)
      .name('TR X Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'tr', 0, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });
    this.trYCtrl = trFolder
      .add(this.cornerState, 'trY', -0.25, 0.25, 0.001)
      .name('TR Y Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'tr', 1, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });

    const brFolder = cornerFolder.addFolder('Bottom-Right (BR)');
    this.brXCtrl = brFolder
      .add(this.cornerState, 'brX', -0.25, 0.25, 0.001)
      .name('BR X Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'br', 0, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });
    this.brYCtrl = brFolder
      .add(this.cornerState, 'brY', -0.25, 0.25, 0.001)
      .name('BR Y Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'br', 1, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });

    const blFolder = cornerFolder.addFolder('Bottom-Left (BL)');
    this.blXCtrl = blFolder
      .add(this.cornerState, 'blX', -0.25, 0.25, 0.001)
      .name('BL X Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'bl', 0, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });
    this.blYCtrl = blFolder
      .add(this.cornerState, 'blY', -0.25, 0.25, 0.001)
      .name('BL Y Offset')
      .onChange((v: number) => {
        store.setCornerOffset(this.cornerState.selectedScreen, 'bl', 1, v);
        this.broadcastPatch({ shaders: { cornerOffsets: useAppStore.getState().shaders.cornerOffsets } });
        this.persist();
      });

    this.selectedScreenCtrl = cornerFolder
      .add(this.cornerState, 'selectedScreen', screenMap)
      .name('Select Screen')
      .onChange((val: number) => {
        this.selectedScreen = val;
        this.updateCornerControllers();
        document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-screen') === String(val));
        });
      });

    cornerFolder
      .add(
        {
          resetScreen: () => {
            store.resetScreenCorners(this.cornerState.selectedScreen);
            store.resetScreenOffset(this.cornerState.selectedScreen);
            this.updateCornerControllers();
            this.broadcastPatch({
              shaders: {
                cornerOffsets: useAppStore.getState().shaders.cornerOffsets,
                screenOffsets: useAppStore.getState().shaders.screenOffsets,
              },
            });
            this.persist();
          },
        },
        'resetScreen',
      )
      .name('Reset active screen corners & offset');

    cornerFolder
      .add(
        {
          resetAll: () => {
            store.resetAllCorners();
            store.resetAllOffsets();
            this.updateCornerControllers();
            this.broadcastPatch({
              shaders: {
                cornerOffsets: useAppStore.getState().shaders.cornerOffsets,
                screenOffsets: useAppStore.getState().shaders.screenOffsets,
              },
            });
            this.persist();
          },
        },
        'resetAll',
      )
      .name('Reset all 6 screens');

    this.updateCornerControllers();

    // --- 5. GLOBAL TRANSFORMS & FLIPS ---
    const flipFolder = gui.addFolder('Global Orientation & Rotation');
    flipFolder
      .add(sh, 'globalRotation', rotationOptions)
      .name('Global Rotation (90°)')
      .onChange((v: number) => {
        store.setGlobalRotation(v);
        this.broadcastPatch({ shaders: { globalRotation: v } });
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFineRotation', -180, 180, 0.5)
      .name('Global Fine Angle (°)')
      .onChange((v: number) => {
        store.setGlobalFineRotation(v);
        this.broadcastPatch({ shaders: { globalFineRotation: v } });
        this.persist();
      });
    flipFolder
      .add(sh, 'globalOffsetX', -0.5, 0.5, 0.001)
      .name('Global Offset X')
      .onChange((v: number) => {
        store.setGlobalOffset('x', v);
        this.broadcastPatch({ shaders: { globalOffsetX: v } });
        this.persist();
      });
    flipFolder
      .add(sh, 'globalOffsetY', -0.5, 0.5, 0.001)
      .name('Global Offset Y')
      .onChange((v: number) => {
        store.setGlobalOffset('y', v);
        this.broadcastPatch({ shaders: { globalOffsetY: v } });
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFlipH')
      .name('Global Flip Horizontal')
      .onChange((v: boolean) => {
        store.setGlobalFlip('h', v);
        this.broadcastPatch({ shaders: { globalFlipH: v } });
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFlipV')
      .name('Global Flip Vertical')
      .onChange((v: boolean) => {
        store.setGlobalFlip('v', v);
        this.broadcastPatch({ shaders: { globalFlipV: v } });
        this.persist();
      });

    // --- 6. DISPLAY & CRT EFFECTS ---
    const display = gui.addFolder('CRT Tube & Phosphor Shaders');
    display
      .add(sh, 'tubeCurve')
      .name('CRT tube curve')
      .onChange((v: boolean) => {
        store.patchShaders({ tubeCurve: v });
        this.curvatureCtrl?.enable(v);
        this.broadcastPatch({ shaders: { tubeCurve: v } });
        this.persist();
      });

    this.curvatureCtrl = display
      .add(sh, 'curvature', 0, 0.5, 0.01)
      .name('Barrel amount')
      .onChange((v: number) => {
        store.patchShaders({ curvature: v });
        this.broadcastPatch({ shaders: { curvature: v } });
        this.persist();
      });
    this.curvatureCtrl.enable(sh.tubeCurve);

    display
      .add(sh, 'vignette', 0, 1, 0.01)
      .name('Vignette')
      .onChange((v: number) => {
        store.patchShaders({ vignette: v });
        this.broadcastPatch({ shaders: { vignette: v } });
        this.persist();
      });
    display
      .add(sh, 'scanlineIntensity', 0, 1, 0.01)
      .name('Scanlines')
      .onChange((v: number) => {
        store.patchShaders({ scanlineIntensity: v });
        this.broadcastPatch({ shaders: { scanlineIntensity: v } });
        this.persist();
      });
    display
      .add(sh, 'phosphorMask', 0, 1, 0.01)
      .name('Phosphor')
      .onChange((v: number) => {
        store.patchShaders({ phosphorMask: v });
        this.broadcastPatch({ shaders: { phosphorMask: v } });
        this.persist();
      });

    // --- 7. GLITCH / SIGNAL ---
    const glitch = gui.addFolder('Glitch & RF Signal');
    glitch
      .add(sh, 'rgbSplit', 0, 2, 0.01)
      .name('RGB split')
      .onChange((v: number) => {
        store.patchShaders({ rgbSplit: v });
        this.broadcastPatch({ shaders: { rgbSplit: v } });
        this.persist();
      });
    glitch
      .add(sh, 'vHold', 0, 1, 0.01)
      .name('V-Hold')
      .onChange((v: number) => {
        store.patchShaders({ vHold: v });
        this.broadcastPatch({ shaders: { vHold: v } });
        this.persist();
      });
    glitch
      .add(sh, 'hJitter', 0, 1, 0.01)
      .name('H-Jitter')
      .onChange((v: number) => {
        store.patchShaders({ hJitter: v });
        this.broadcastPatch({ shaders: { hJitter: v } });
        this.persist();
      });
    glitch
      .add(sh, 'noiseGain', 0, 1, 0.01)
      .name('Noise')
      .onChange((v: number) => {
        store.patchShaders({ noiseGain: v });
        this.broadcastPatch({ shaders: { noiseGain: v } });
        this.persist();
      });
    glitch
      .add(sh, 'signalLock', 0, 1, 0.01)
      .name('Signal lock')
      .onChange((v: number) => {
        store.patchShaders({ signalLock: v });
        this.broadcastPatch({ shaders: { signalLock: v } });
        this.persist();
      });

    // --- 8. TRACKING & SENSITIVITY ---
    const tracking = gui.addFolder('Tracking & Sensitivity');
    tracking
      .add(store.tracking, 'confidenceThreshold', 0.1, 0.9, 0.01)
      .name('Confidence')
      .onChange((v: number) => {
        store.patchTracking({ confidenceThreshold: v });
        this.broadcastPatch({ tracking: { confidenceThreshold: v } });
        this.persist();
      });
    tracking
      .add(store.tracking, 'mirrorCamera')
      .name('Mirror camera')
      .onChange((v: boolean) => {
        store.patchTracking({ mirrorCamera: v });
        this.broadcastPatch({ tracking: { mirrorCamera: v } });
        this.persist();
      });
    tracking
      .add(store.tracking, 'cameraRotation', {
        '0° (Standard Landscape)': 0,
        '90° (Vertical Clockwise)': 90,
        '180° (Inverted Landscape)': 180,
        '270° (Vertical Counter-Clockwise)': 270,
      })
      .name('Camera Rotation')
      .onChange((v: any) => {
        const rot = Number(v);
        store.patchTracking({ cameraRotation: rot });
        this.broadcastPatch({ tracking: { cameraRotation: rot } });

        // Auto-switch debug overlay to camera feed so user immediately sees rotated camera
        store.setDebugViewMode('camera');
        this.updateDebugWindowFeedMode('camera');
        this.broadcastPatch({ debugViewMode: 'camera' });
        if (this.debugModeGuiCtrl) {
          this.dbgState.debugViewMode = 'camera';
          this.debugModeGuiCtrl.updateDisplay();
        }

        this.persist();
      });

    const distReadout = { liveDistance: `${store.tracking.distance.toFixed(2)} m` };
    this.distController = tracking
      .add(distReadout, 'liveDistance')
      .name('Est. Distance')
      .disable() as any;

    const peopleReadout = { livePeople: `${store.tracking.personCount} detected` };
    this.peopleController = tracking
      .add(peopleReadout, 'livePeople')
      .name('People In View')
      .disable() as any;

    tracking
      .add(store.tracking, 'maxNumPoses', [1, 2, 3, 4, 6])
      .name('Max Detectable People')
      .onChange((v: any) => {
        store.patchTracking({ maxNumPoses: Number(v) });
        this.broadcastPatch({ tracking: { maxNumPoses: Number(v) } });
        this.persist();
      });

    tracking
      .add(store.tracking, 'distanceScale', 1.0, 25.0, 0.5)
      .name('Dist sensitivity')
      .onChange((v: number) => {
        store.patchTracking({ distanceScale: v });
        this.broadcastPatch({ tracking: { distanceScale: v } });
        this.persist();
      });

    tracking
      .add(store.tracking, 'distanceOffset', 1.0, 5.0, 0.1)
      .name('Base dist offset')
      .onChange((v: number) => {
        store.patchTracking({ distanceOffset: v });
        this.broadcastPatch({ tracking: { distanceOffset: v } });
        this.persist();
      });

    tracking
      .add(store.tracking, 'minDistance', 0.5, 3.0, 0.1)
      .name('Min dist (lock 100%)')
      .onChange((v: number) => {
        store.patchTracking({ minDistance: v });
        this.broadcastPatch({ tracking: { minDistance: v } });
        this.persist();
      });

    tracking
      .add(store.tracking, 'maxDistance', 1.5, 6.0, 0.1)
      .name('Max dist (fade 0%)')
      .onChange((v: number) => {
        store.patchTracking({ maxDistance: v });
        this.broadcastPatch({ tracking: { maxDistance: v } });
        this.persist();
      });

    // --- 9. HUMAN ANTENNA RECEPTION ---
    const antennaFolder = gui.addFolder('Human Antenna & Presence (6 Pieces)');
    antennaFolder
      .add(store.tracking, 'antennaLocalWeight', 0.0, 1.0, 0.05)
      .name('Local vs Global Weight')
      .onChange((v: number) => {
        store.patchTracking({ antennaLocalWeight: v });
        this.broadcastPatch({ tracking: { antennaLocalWeight: v } });
        this.persist();
      });

    antennaFolder
      .add(store.tracking, 'antennaHandBoost', 0.5, 3.0, 0.1)
      .name('Hand Antenna Boost')
      .onChange((v: number) => {
        store.patchTracking({ antennaHandBoost: v });
        this.broadcastPatch({ tracking: { antennaHandBoost: v } });
        this.persist();
      });

    antennaFolder
      .add(store.tracking, 'antennaFalloffRadius', 0.2, 1.0, 0.05)
      .name('Antenna Field Radius')
      .onChange((v: number) => {
        store.patchTracking({ antennaFalloffRadius: v });
        this.broadcastPatch({ tracking: { antennaFalloffRadius: v } });
        this.persist();
      });

    antennaFolder
      .add(store.tracking, 'antennaSmoothing', 0.02, 0.5, 0.01)
      .name('Response Smoothing')
      .onChange((v: number) => {
        store.patchTracking({ antennaSmoothing: v });
        this.broadcastPatch({ tracking: { antennaSmoothing: v } });
        this.persist();
      });

    this.screenReadouts = Array.from({ length: 6 }, () => ({
      status: '0% lock · 100% snow',
    }));
    const scrNames = [
      'CRT [01] Top-L',
      'CRT [02] Top-R',
      'CRT [03] Mid-L',
      'CRT [04] Mid-R',
      'CRT [05] Bot-L',
      'CRT [06] Bot-R',
    ];
    this.screenReadoutCtrls = this.screenReadouts.map((ro, i) =>
      antennaFolder.add(ro, 'status').name(scrNames[i]).disable() as any,
    );

    // --- 10. INTERACTION & QUERY SYNTHESIS ---
    const interFolder = gui.addFolder('Interaction & Query Synthesis');
    const interSettings = {
      enabled: store.interaction?.enabled ?? true,
      holdSec: (store.interaction?.holdDurationMs || 1800) / 1000,
      cooldownSec: store.interaction?.cooldownDurationSec || 10,
    };

    interFolder
      .add(interSettings, 'enabled')
      .name('Enable Auto Query Sync')
      .onChange((v: boolean) => {
        store.setInteractionEnabled(v);
        this.broadcastPatch({ interaction: { enabled: v } });
      });

    interFolder
      .add(interSettings, 'holdSec', 0.8, 3.5, 0.1)
      .name('Hold Debounce (s)')
      .onChange((v: number) => {
        store.patchInteraction({ holdDurationMs: Math.round(v * 1000) });
        this.broadcastPatch({ interaction: { holdDurationMs: Math.round(v * 1000) } });
      });

    interFolder
      .add(interSettings, 'cooldownSec', 5, 30, 1)
      .name('Cooldown Lock (s)')
      .onChange((v: number) => {
        store.patchInteraction({ cooldownDurationSec: v });
        this.broadcastPatch({ interaction: { cooldownDurationSec: v } });
      });

    this.interactionReadouts = {
      pose: 'NONE',
      density: 'EMPTY',
      kinetics: 'STEADY',
      chroma: 'NEUTRAL',
      hold: '0%',
      cooldown: 'Ready',
      quotaUsage: '0% (0.0k/9.0k)',
      quotaSaver: store.quota?.isProtectedMode ?? false,
      lastQuery: 'None',
    };

    interFolder.add(this.interactionReadouts, 'pose').name('Active Pose').disable();
    interFolder.add(this.interactionReadouts, 'density').name('Audience Density').disable();
    interFolder.add(this.interactionReadouts, 'kinetics').name('Kinetic Dynamics').disable();
    interFolder.add(this.interactionReadouts, 'chroma').name('Clothing Chroma').disable();
    interFolder.add(this.interactionReadouts, 'hold').name('Hold Progress').disable();
    interFolder.add(this.interactionReadouts, 'cooldown').name('Cooldown Lock').disable();
    interFolder.add(this.interactionReadouts, 'quotaUsage').name('YouTube Quota').disable();
    interFolder
      .add(this.interactionReadouts, 'quotaSaver')
      .name('Quota Saver (Local First)')
      .onChange((v: boolean) => {
        syncChannel.sendCommand('toggle_quota_protection', v);
      });
    interFolder.add(this.interactionReadouts, 'lastQuery').name('Last Query').disable();
    interFolder
      .add(
        {
          triggerTest: () => {
            syncChannel.sendCommand('test_query');
            this.showToast('⚡ Triggered synthetic query on main stage');
          },
        },
        'triggerTest',
      )
      .name('⚡ Trigger Test Query');

    // --- 11. VIDEO & INGESTION ---
    const video = gui.addFolder('Video & Ingestion');
    this.nowPlayingController = { title: 'Connecting to main app...' };
    video.add(this.nowPlayingController, 'title').name('Now Playing').disable();

    this.videoQueryController = { query: 'Connecting to main app...' };
    video.add(this.videoQueryController, 'query').name('Current Video Query').disable();

    this.timeController = { time: '0:00 / 0:00' };
    video.add(this.timeController, 'time').name('Time / Duration').disable();

    this.scrubController = { progress: 0 };
    const scrubCtrl = video.add(this.scrubController, 'progress', 0, 100, 0.5).name('Seek (%)');
    scrubCtrl.onFinishChange((v: number) => {
      syncChannel.sendCommand('seek', v);
    });

    const videoState = {
      mode: store.videoMode as VideoMode,
      togglePlay: () => syncChannel.sendCommand('toggle_play'),
      next: () => syncChannel.sendCommand('next'),
      prev: () => syncChannel.sendCommand('prev'),
      syncYouTube: () => {
        syncChannel.sendCommand('sync_youtube');
        this.showToast('↓ Triggered YouTube sync');
      },
    };

    video
      .add(videoState, 'mode', ['live', 'cache', 'grid'] as VideoMode[])
      .name('Playback Mode')
      .onChange((m: VideoMode) => {
        store.setVideoMode(m);
        this.broadcastPatch({ videoMode: m });
        syncChannel.sendCommand('set_video_mode', m);
        localStorage.setItem('vfeed-video-mode', m);
        this.persist();
      });
    video.add(videoState, 'togglePlay').name('⏯ Play / Pause');
    video.add(videoState, 'next').name('⏭ Next Video');
    video.add(videoState, 'prev').name('⏮ Prev Video');
    video.add(videoState, 'syncYouTube').name('↓ Sync YouTube Now');

    // --- 12. AUDIO & ANTENNA SOUND ---
    const audioFolder = gui.addFolder('Audio & Synth Hum');
    const aud = { ...store.audio };

    audioFolder
      .add(aud, 'masterVolume', 0, 1, 0.05)
      .name('Master Volume')
      .onChange((v: number) => {
        store.setAudioState({ masterVolume: v });
        this.broadcastPatch({ audio: { masterVolume: v } });
        this.persist();
      });

    audioFolder
      .add(aud, 'videoVolume', 0, 1, 0.05)
      .name('Video Volume')
      .onChange((v: number) => {
        store.setAudioState({ videoVolume: v });
        this.broadcastPatch({ audio: { videoVolume: v } });
        this.persist();
      });

    audioFolder
      .add(aud, 'antennaModulation')
      .name('Antenna Tuning Sound')
      .onChange((v: boolean) => {
        store.setAudioState({ antennaModulation: v });
        this.broadcastPatch({ audio: { antennaModulation: v } });
        this.persist();
      });

    audioFolder
      .add(aud, 'noiseVolume', 0, 1, 0.05)
      .name('RF Static Noise')
      .onChange((v: number) => {
        store.setAudioState({ noiseVolume: v });
        this.broadcastPatch({ audio: { noiseVolume: v } });
        this.persist();
      });

    audioFolder
      .add(aud, 'humVolume', 0, 0.1, 0.005)
      .name('15.7kHz Flyback Hum')
      .onChange((v: number) => {
        store.setAudioState({ humVolume: v });
        this.broadcastPatch({ audio: { humVolume: v } });
        this.persist();
      });

    audioFolder
      .add(aud, 'muted')
      .name('Mute Audio')
      .onChange((v: boolean) => {
        store.setAudioState({ muted: v });
        this.broadcastPatch({ audio: { muted: v } });
        this.persist();
      });

    // --- 13. SKELETON OVERLAY ---
    const skel = gui.addFolder('Skeleton Overlay');
    const skelState = {
      enabled: store.skeletonOverlay,
      showLines: store.skeletonShowLines,
      lineThickness: store.skeletonLineThickness,
      lineOpacity: store.skeletonLineOpacity,
      showDots: store.skeletonShowDots,
      dotSize: store.skeletonDotSize,
      dotOpacity: store.skeletonDotOpacity,
      jitter: store.skeletonJitter,
      style: store.skeletonStyle,
    };

    skel
      .add(skelState, 'enabled')
      .name('Show on stage')
      .onChange((v: boolean) => {
        store.setSkeletonOverlay(v);
        this.broadcastPatch({ skeletonOverlay: v });
        this.persist();
      });

    skel
      .add(skelState, 'showLines')
      .name('Show lines')
      .onChange((v: boolean) => {
        store.setSkeletonShowLines(v);
        this.broadcastPatch({ skeletonShowLines: v });
        this.persist();
      });

    skel
      .add(skelState, 'lineThickness', 0.5, 10, 0.5)
      .name('Line thickness')
      .onChange((v: number) => {
        store.setSkeletonLineThickness(v);
        this.broadcastPatch({ skeletonLineThickness: v });
        this.persist();
      });

    skel
      .add(skelState, 'showDots')
      .name('Show dots')
      .onChange((v: boolean) => {
        store.setSkeletonShowDots(v);
        this.broadcastPatch({ skeletonShowDots: v });
        this.persist();
      });

    skel
      .add(skelState, 'style', ['phosphor', 'cyan', 'amber', 'magenta'])
      .name('Color palette')
      .onChange((v: any) => {
        store.setSkeletonStyle(v);
        this.broadcastPatch({ skeletonStyle: v });
        this.persist();
      });

    // --- 14. DEBUG & TELEMETRY ---
    const debug = gui.addFolder('Performance & Stage Debug');
    this.fpsController = { fps: `${store.fps} FPS` };
    debug.add(this.fpsController, 'fps').name('Frame rate').disable();
    this.dbgState = {
      debugOverlay: store.debugOverlay,
      debugViewMode: store.debugViewMode || 'video',
    };
    this.debugGuiCtrl = debug
      .add(this.dbgState, 'debugOverlay')
      .name('Debug Overlay Window')
      .onChange((v: boolean) => {
        this.setDebugWindowVisible(v, true);
      });
    this.debugModeGuiCtrl = debug
      .add(this.dbgState, 'debugViewMode', ['video', 'camera', 'split'])
      .name('Debug Window Feed')
      .onChange((m: any) => {
        store.setDebugViewMode(m);
        this.updateDebugWindowFeedMode(m);
        this.broadcastPatch({ debugViewMode: m });
      });

    const antennaMetricsObj = {
      showAntennaMetrics: store.frames.showAntennaMetrics,
    };
    this.antennaMetricsDebugCtrl = debug
      .add(antennaMetricsObj, 'showAntennaMetrics')
      .name('Stage Antenna Metrics (ANT/N/Bar)')
      .onChange((v: boolean) => {
        store.setFrames({ showAntennaMetrics: v });
        this.broadcastPatch({ frames: { showAntennaMetrics: v } });
        this.persist();
        if (this.antennaMetricsFrameCtrl && this.antennaMetricsFrameCtrl.getValue() !== v) {
          this.antennaMetricsFrameCtrl.setValue(v);
        }
      });

    const debugTitlesFolder = debug.addFolder('Antenna Screen Titles (CRT 01 - 06)');
    debugTitlesFolder.close();
    for (let i = 0; i < 6; i++) {
      debugTitlesFolder
        .add(this.screenTitleBindings[i], 'title')
        .name(`CRT [0${i + 1}] (${screenPosNames[i]})`)
        .onChange((v: string) => {
          store.setScreenCustomLabel(i, v);
          this.broadcastPatch({ frames: useAppStore.getState().frames });
          this.persist();
          this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
        });
    }

    const debugQueryFolder = debug.addFolder('Bottom Query Message (CRT 01 - 06)');
    debugQueryFolder.close();
    debugQueryFolder
      .add(this.queryState, 'showQueryMessage')
      .name('Enable Query Messages')
      .onChange((v: boolean) => {
        store.setFrames({ showQueryMessage: v });
        this.broadcastPatch({ frames: { showQueryMessage: v } });
        this.persist();
        this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
      });

    debugQueryFolder
      .add(this.queryState, 'showLiveFeedBadge')
      .name('Show LIVE FEED Tag')
      .onChange((v: boolean) => {
        store.setFrames({ showLiveFeedBadge: v });
        this.broadcastPatch({ frames: { showLiveFeedBadge: v } });
        this.persist();
        this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
      });

    debugQueryFolder
      .add(this.queryState, 'customQueryText')
      .name('Custom Query Override')
      .onChange((v: string) => {
        store.setFrames({ customQueryText: v });
        this.broadcastPatch({ frames: { customQueryText: v } });
        this.persist();
      });

    // 6 Direct Per-Screen Visibility Toggles
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt1')
      .name(`CRT [01] (${screenPosNames[0]})`)
      .onChange(() => this.syncScreenQueryToggles());
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt2')
      .name(`CRT [02] (${screenPosNames[1]})`)
      .onChange(() => this.syncScreenQueryToggles());
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt3')
      .name(`CRT [03] (${screenPosNames[2]})`)
      .onChange(() => this.syncScreenQueryToggles());
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt4')
      .name(`CRT [04] (${screenPosNames[3]})`)
      .onChange(() => this.syncScreenQueryToggles());
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt5')
      .name(`CRT [05] (${screenPosNames[4]})`)
      .onChange(() => this.syncScreenQueryToggles());
    debugQueryFolder
      .add(this.screenQueryTogglesState, 'crt6')
      .name(`CRT [06] (${screenPosNames[5]})`)
      .onChange(() => this.syncScreenQueryToggles());

    debugQueryFolder
      .add(
        {
          enableAll: () => this.setAllScreenQueries(true),
        },
        'enableAll',
      )
      .name('Enable All Screens');

    debugQueryFolder
      .add(
        {
          disableAll: () => this.setAllScreenQueries(false),
        },
        'disableAll',
      )
      .name('Disable All Screens');

    this.unsubscribeStore = useAppStore.subscribe((state) => {
      if (this.fpsController) {
        this.fpsController.fps = `${state.fps} FPS`;
      }
    });
  }

  private updateCornerControllers(): void {
    const store = useAppStore.getState();
    const current = store.shaders.cornerOffsets[this.cornerState.selectedScreen] ?? {
      tl: [0, 0],
      tr: [0, 0],
      br: [0, 0],
      bl: [0, 0],
    };
    const currentFlip = store.shaders.screenFlips[this.cornerState.selectedScreen] ?? {
      flipH: false,
      flipV: false,
      rotation: 0,
      fineRotation: 0,
    };
    const currentOffset =
      store.shaders.screenOffsets?.[this.cornerState.selectedScreen] ?? [0, 0];

    this.cornerState.showHandles = store.shaders.showCornerHandles;
    this.cornerState.offsetX = currentOffset[0];
    this.cornerState.offsetY = currentOffset[1];
    this.cornerState.rotation = currentFlip.rotation || 0;
    this.cornerState.fineRotation = currentFlip.fineRotation || 0;
    this.cornerState.flipH = currentFlip.flipH;
    this.cornerState.flipV = currentFlip.flipV;
    this.cornerState.tlX = current.tl[0];
    this.cornerState.tlY = current.tl[1];
    this.cornerState.trX = current.tr[0];
    this.cornerState.trY = current.tr[1];
    this.cornerState.brX = current.br[0];
    this.cornerState.brY = current.br[1];
    this.cornerState.blX = current.bl[0];
    this.cornerState.blY = current.bl[1];

    this.showHandlesCtrl?.updateDisplay();
    this.selectedScreenCtrl?.updateDisplay();
    this.offXCtrl?.updateDisplay();
    this.offYCtrl?.updateDisplay();
    this.rotCtrl?.updateDisplay();
    this.fineRotCtrl?.updateDisplay();
    this.flipHCtrl?.updateDisplay();
    this.flipVCtrl?.updateDisplay();
    this.tlXCtrl?.updateDisplay();
    this.tlYCtrl?.updateDisplay();
    this.trXCtrl?.updateDisplay();
    this.trYCtrl?.updateDisplay();
    this.brXCtrl?.updateDisplay();
    this.brYCtrl?.updateDisplay();
    this.blXCtrl?.updateDisplay();
    this.blYCtrl?.updateDisplay();
  }

  private initCanvasInteractions(): void {
    const cornerTypes: Array<'bl' | 'br' | 'tr' | 'tl'> = ['bl', 'br', 'tr', 'tl'];

    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = 1.0 - (e.clientY - rect.top) / rect.height; // UV space (0 at bottom, 1 at top)

      const store = useAppStore.getState();
      const sh = store.shaders;
      const corners = computeAllScreenCorners(
        sh.bezelWidthX,
        sh.bezelWidthY,
        sh.bezelOuter,
        sh.cornerOffsets,
        sh.screenOffsets,
        sh.screenFlips,
        sh.globalRotation,
        sh.globalFineRotation,
        sh.globalOffsetX,
        sh.globalOffsetY,
      );

      let closestDist = Infinity;
      let closestIdx = -1;

      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const dist = Math.hypot(u - c.x, v - c.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      if (closestDist < 0.08 && closestIdx >= 0) {
        const screenIndex = Math.floor(closestIdx / 4);
        const corner = cornerTypes[closestIdx % 4];
        const currentOffset = store.shaders.cornerOffsets[screenIndex]?.[corner] ?? [0, 0];

        this.selectedScreen = screenIndex;
        this.cornerState.selectedScreen = screenIndex;
        this.updateCornerControllers();
        document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-screen') === String(screenIndex));
        });

        this.activeDrag = {
          screenIndex,
          corner,
          startOffset: [currentOffset[0], currentOffset[1]],
          startU: u,
          startV: v,
        };
        e.preventDefault();
      } else {
        // Check if user clicked inside a quadrant to select it
        const clickedCol = u < 0.5 ? 0 : 1;
        const clickedRow = v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2;
        const screenIndex = (2 - clickedRow) * 2 + clickedCol;
        if (screenIndex >= 0 && screenIndex < 6) {
          this.selectedScreen = screenIndex;
          this.cornerState.selectedScreen = screenIndex;
          this.updateCornerControllers();
          document.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-screen') === String(screenIndex));
          });
        }
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.activeDrag) return;
      const rect = this.canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = 1.0 - (e.clientY - rect.top) / rect.height;

      const du = u - this.activeDrag.startU;
      const dv = v - this.activeDrag.startV;

      const newDx = Math.max(-0.35, Math.min(0.35, this.activeDrag.startOffset[0] + du));
      const newDy = Math.max(-0.35, Math.min(0.35, this.activeDrag.startOffset[1] + dv));

      const store = useAppStore.getState();
      store.setCornerOffset(this.activeDrag.screenIndex, this.activeDrag.corner, 0, newDx);
      store.setCornerOffset(this.activeDrag.screenIndex, this.activeDrag.corner, 1, newDy);
      this.updateCornerControllers();

      this.broadcastPatch({
        shaders: {
          cornerOffsets: useAppStore.getState().shaders.cornerOffsets,
        },
      });
    });

    window.addEventListener('pointerup', () => {
      if (this.activeDrag) {
        this.activeDrag = null;
        this.persist();
      }
    });
  }

  private initDebugWindow(): void {
    this.debugWindowEl = document.querySelector<HTMLElement>('#debug-overlay-window');
    this.debugCanvasEl = document.querySelector<HTMLCanvasElement>('#debug-overlay-canvas');
    this.debugCtx = this.debugCanvasEl?.getContext('2d') ?? null;
    this.debugToggleBtn = document.querySelector<HTMLButtonElement>('#btn-toggle-debug');
    this.debugFeedBadge = document.querySelector<HTMLElement>('#debug-feed-badge');
    this.debugLiveDot = document.querySelector<HTMLElement>('#debug-live-dot');
    this.debugOfflineMsg = document.querySelector<HTMLElement>('#debug-offline-msg');

    const feedCycleBtn = document.querySelector<HTMLButtonElement>('#debug-feed-cycle');
    const collapseBtn = document.querySelector<HTMLButtonElement>('#debug-collapse-btn');
    const closeBtn = document.querySelector<HTMLButtonElement>('#debug-close-btn');
    const dragHandle = document.querySelector<HTMLElement>('#debug-window-drag-handle');

    // Subscribe to real-time debug frame stream from main stage
    this.unsubscribeDebugFrame = syncChannel.onDebugFrame((bitmap) => {
      this.handleDebugFrame(bitmap);
    });

    // Toolbar toggle button
    this.debugToggleBtn?.addEventListener('click', () => {
      const current = useAppStore.getState().debugOverlay;
      this.setDebugWindowVisible(!current, true);
    });

    // Feed cycle button in window header
    feedCycleBtn?.addEventListener('click', () => {
      const modes: Array<'video' | 'camera' | 'split'> = ['video', 'camera', 'split'];
      const curMode = useAppStore.getState().debugViewMode || 'video';
      const nextIdx = (modes.indexOf(curMode) + 1) % modes.length;
      const nextMode = modes[nextIdx];
      useAppStore.getState().setDebugViewMode(nextMode);
      this.updateDebugWindowFeedMode(nextMode);
      this.broadcastPatch({ debugViewMode: nextMode });
      if (this.debugModeGuiCtrl) {
        this.dbgState.debugViewMode = nextMode;
        this.debugModeGuiCtrl.updateDisplay();
      }
    });

    // Collapse / Expand toggle
    collapseBtn?.addEventListener('click', () => {
      if (!this.debugWindowEl) return;
      this.isDebugCollapsed = !this.isDebugCollapsed;
      this.debugWindowEl.classList.toggle('collapsed', this.isDebugCollapsed);
      if (collapseBtn) {
        collapseBtn.textContent = this.isDebugCollapsed ? '+' : '−';
      }
    });

    // Close button
    closeBtn?.addEventListener('click', () => {
      this.setDebugWindowVisible(false, true);
    });

    // Draggable window logic
    if (this.debugWindowEl && dragHandle) {
      const win = this.debugWindowEl;
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      dragHandle.addEventListener('pointerdown', (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        const parentRect = win.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
        initialLeft = rect.left - parentRect.left;
        initialTop = rect.top - parentRect.top;
        dragHandle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });

      dragHandle.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, initialLeft + dx);
        const newTop = Math.max(0, initialTop + dy);
        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
        win.style.right = 'auto';
        win.style.bottom = 'auto';
      });

      const stopDrag = (e: PointerEvent) => {
        if (isDragging) {
          isDragging = false;
          try {
            dragHandle.releasePointerCapture(e.pointerId);
          } catch {}
        }
      };

      dragHandle.addEventListener('pointerup', stopDrag);
      dragHandle.addEventListener('pointercancel', stopDrag);
    }

    // Set initial display state from store
    const initialShow = useAppStore.getState().debugOverlay;
    this.setDebugWindowVisible(initialShow, false);
    const initialMode = useAppStore.getState().debugViewMode || 'video';
    this.updateDebugWindowFeedMode(initialMode);
  }

  private debugFallbackImg: HTMLImageElement | null = null;

  private handleDebugFrame(frame: ImageBitmap | string): void {
    this.lastDebugFrameReceivedTs = Date.now();
    if (this.debugCanvasEl && this.debugCtx) {
      if (typeof frame === 'string') {
        if (!this.debugFallbackImg) {
          this.debugFallbackImg = new Image();
        }
        this.debugFallbackImg.onload = () => {
          if (this.debugCanvasEl && this.debugCtx && this.debugFallbackImg) {
            this.debugCtx.drawImage(this.debugFallbackImg, 0, 0, this.debugCanvasEl.width, this.debugCanvasEl.height);
          }
        };
        this.debugFallbackImg.src = frame;
      } else {
        this.debugCtx.drawImage(frame, 0, 0, this.debugCanvasEl.width, this.debugCanvasEl.height);
        try {
          frame.close();
        } catch {}
      }
    }
    if (this.debugOfflineMsg && this.debugOfflineMsg.style.display !== 'none') {
      this.debugOfflineMsg.style.display = 'none';
    }
    if (this.debugLiveDot && this.debugLiveDot.classList.contains('offline')) {
      this.debugLiveDot.classList.remove('offline');
    }
  }

  private setDebugWindowVisible(visible: boolean, broadcast = true): void {
    useAppStore.getState().setDebugOverlay(visible);
    this.dbgState.debugOverlay = visible;

    if (this.debugWindowEl) {
      this.debugWindowEl.style.display = visible ? 'flex' : 'none';
    }
    if (this.debugToggleBtn) {
      this.debugToggleBtn.classList.toggle('active', visible);
    }
    if (this.debugGuiCtrl) {
      this.debugGuiCtrl.updateDisplay();
    }
    if (visible && Date.now() - this.lastDebugFrameReceivedTs > 2000) {
      if (this.debugOfflineMsg) this.debugOfflineMsg.style.display = 'flex';
      if (this.debugLiveDot) this.debugLiveDot.classList.add('offline');
    }
    if (broadcast) {
      this.broadcastPatch({ debugOverlay: visible });
      this.persist();
    }
  }

  private updateDebugWindowFeedMode(mode: string): void {
    if (this.debugFeedBadge) {
      this.debugFeedBadge.textContent = mode.toUpperCase();
    }
    this.dbgState.debugViewMode = mode;
    if (this.debugModeGuiCtrl) {
      this.debugModeGuiCtrl.updateDisplay();
    }
  }

  setTestPattern(pattern: TestPatternMode): void {
    this.testPattern = pattern;
  }

  setSelectedScreen(idx: number): void {
    if (idx >= 0 && idx < 6) {
      this.selectedScreen = idx;
      this.cornerState.selectedScreen = idx;
      this.updateCornerControllers();
    }
  }

  private startRenderLoop(): void {
    const render = () => {
      this.drawCanvasVisualizer();
      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);
  }

  private drawCanvasVisualizer(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = '#07090e';
    this.ctx.fillRect(0, 0, width, height);

    // Draw Test Pattern
    this.drawTestPattern(width, height);

    const store = useAppStore.getState();
    const sh = store.shaders;
    const corners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    const cornerTypes: Array<'BL' | 'BR' | 'TR' | 'TL'> = ['BL', 'BR', 'TR', 'TL'];

    // Draw each of the 6 screens
    for (let i = 0; i < 6; i++) {
      const isSelected = i === this.selectedScreen;
      const baseIdx = i * 4;
      const bl = corners[baseIdx];
      const br = corners[baseIdx + 1];
      const tr = corners[baseIdx + 2];
      const tl = corners[baseIdx + 3];

      if (!bl || !br || !tr || !tl) continue;

      // Convert UV to Canvas coords (UV: 0,0 at bottom-left; Canvas: 0,0 at top-left)
      const pBL = { x: bl.x * width, y: (1.0 - bl.y) * height };
      const pBR = { x: br.x * width, y: (1.0 - br.y) * height };
      const pTR = { x: tr.x * width, y: (1.0 - tr.y) * height };
      const pTL = { x: tl.x * width, y: (1.0 - tl.y) * height };

      // Screen Fill
      this.ctx.beginPath();
      this.ctx.moveTo(pTL.x, pTL.y);
      this.ctx.lineTo(pTR.x, pTR.y);
      this.ctx.lineTo(pBR.x, pBR.y);
      this.ctx.lineTo(pBL.x, pBL.y);
      this.ctx.closePath();

      this.ctx.fillStyle = isSelected
        ? 'rgba(0, 229, 255, 0.12)'
        : 'rgba(255, 255, 255, 0.04)';
      this.ctx.fill();

      this.ctx.strokeStyle = isSelected ? '#00e5ff' : 'rgba(61, 220, 151, 0.6)';
      this.ctx.lineWidth = isSelected ? 2.5 : 1.2;
      this.ctx.stroke();

      // Screen Center
      const cX = (pTL.x + pTR.x + pBR.x + pBL.x) / 4;
      const cY = (pTL.y + pTR.y + pBR.y + pBL.y) / 4;

      // Screen Label & Antenna Status
      const q = MATRIX_QUADRANTS[i];
      this.ctx.fillStyle = isSelected ? '#00e5ff' : '#3ddc97';
      this.ctx.font = 'bold 11px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(store.frames.customLabels[i] || q.name, cX, cY - 8);

      this.ctx.fillStyle = '#8a92a6';
      this.ctx.font = '9px monospace';
      this.ctx.fillText(store.frames.customSubtitles[i] || q.label, cX, cY + 6);

      // Antenna Lock & Noise Meter + Reception Bar
      const lockVal = sh.screenSignalLocks?.[i] ?? sh.signalLock ?? 0;
      const noiseVal = sh.screenNoiseGains?.[i] ?? sh.noiseGain ?? 1;
      const lockPct = Math.round(Math.max(0, Math.min(1, lockVal)) * 100);
      const noisePct = Math.round(Math.max(0, Math.min(1, noiseVal)) * 100);
      const lockColor = lockPct > 70 ? '#3ddc97' : lockPct > 30 ? '#ffb703' : '#ff3366';

      this.ctx.fillStyle = lockColor;
      this.ctx.font = 'bold 9px monospace';
      this.ctx.fillText(`ANT:${lockPct}% N:${noisePct}%`, cX, cY + 20);

      // Mini antenna reception signal bar
      const barW = 56;
      const barH = 3;
      const barX = cX - barW / 2;
      const barY = cY + 25;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(barX, barY, barW, barH);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.lineWidth = 0.5;
      this.ctx.strokeRect(barX, barY, barW, barH);

      const fillW = (barW * lockPct) / 100;
      if (fillW > 0) {
        this.ctx.fillStyle = lockColor;
        this.ctx.fillRect(barX, barY, fillW, barH);
      }

      // Bottom Query Message indicator
      const queryOn = store.frames.showQueryMessage && (store.frames.screenQueryToggles?.[i] ?? true);
      if (queryOn) {
        this.ctx.fillStyle = '#3ddc97';
        this.ctx.font = '8px monospace';
        const qText =
          store.frames.customQueryText?.trim() ||
          this.latestTelemetry?.video?.query ||
          store.currentVideoQuery ||
          'QUERY ON';
        const shortQ = qText.length > 20 ? qText.slice(0, 18) + '…' : qText;
        this.ctx.fillText(`⚡ ${shortQ}`, cX, cY + 38);
      }

      // Draw Draggable Corner Pin Handles
      const cPoints = [pBL, pBR, pTR, pTL];
      for (let c = 0; c < 4; c++) {
        const cp = cPoints[c];
        const isHandleActive =
          this.activeDrag &&
          this.activeDrag.screenIndex === i &&
          this.activeDrag.corner === cornerTypes[c].toLowerCase();

        this.ctx.beginPath();
        this.ctx.arc(cp.x, cp.y, isHandleActive ? 8 : isSelected ? 6 : 4.5, 0, Math.PI * 2);
        this.ctx.fillStyle = isHandleActive
          ? '#ffaa00'
          : isSelected
            ? '#00e5ff'
            : 'rgba(61, 220, 151, 0.85)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        if (isSelected) {
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = '8px monospace';
          this.ctx.fillText(cornerTypes[c], cp.x, cp.y - 8);
        }
      }
    }
  }

  private drawTestPattern(w: number, h: number): void {
    if (this.testPattern === 'none') return;

    if (this.testPattern === 'grid' || this.testPattern === 'crosshatch') {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      this.ctx.lineWidth = 1;
      const step = 20;
      for (let x = 0; x < w; x += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, h);
        this.ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(w, y);
        this.ctx.stroke();
      }

      // 2x3 Matrix guides
      this.ctx.strokeStyle = 'rgba(255, 170, 0, 0.3)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(w / 2, 0);
      this.ctx.lineTo(w / 2, h);
      this.ctx.moveTo(0, h / 3);
      this.ctx.lineTo(w, h / 3);
      this.ctx.moveTo(0, (h * 2) / 3);
      this.ctx.lineTo(w, (h * 2) / 3);
      this.ctx.stroke();
    } else if (this.testPattern === 'colorbars') {
      const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
      const barW = w / colors.length;
      for (let i = 0; i < colors.length; i++) {
        this.ctx.fillStyle = colors[i];
        this.ctx.fillRect(i * barW, 0, barW, h);
      }
    } else if (this.testPattern === 'white') {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, w, h);
    } else if (this.testPattern === 'black') {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, w, h);
    }
  }

  private broadcastPatch(patch: any): void {
    syncChannel.sendStatePatch(patch);
  }

  private applyPreset(preset: ShaderUniformsState): void {
    const store = useAppStore.getState();
    const { time, rippleStrength, ...rest } = preset;
    void time;
    void rippleStrength;
    store.patchShaders({ ...rest, rippleStrength: store.shaders.rippleStrength });
    const freshShaders = useAppStore.getState().shaders;
    if (this.shaderBindings) {
      Object.assign(this.shaderBindings, freshShaders);
    }
    this.curvatureCtrl?.enable(freshShaders.tubeCurve);
    this.updateCornerControllers();
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
    this.broadcastPatch({ shaders: freshShaders });
    syncChannel.sendCommand('apply_preset', preset);
    this.persist();
    this.showToast('✓ Preset applied across all displays');
  }

  private applyCalibrationData(saved: SavedCalibration): void {
    const store = useAppStore.getState();
    if (saved.shaders) {
      store.patchShaders(saved.shaders);
      if (this.shaderBindings) {
        Object.assign(this.shaderBindings, useAppStore.getState().shaders);
      }
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
    }
    if (saved.frames) {
      store.setFrames(saved.frames);
      if (this.screenTitleBindings.length && saved.frames.customLabels) {
        for (let i = 0; i < 6; i++) {
          if (saved.frames.customLabels[i] !== undefined) {
            this.screenTitleBindings[i].title = saved.frames.customLabels[i];
          }
        }
      }
      if (saved.frames.showQueryMessage !== undefined) {
        this.queryState.showQueryMessage = saved.frames.showQueryMessage;
      }
      if (saved.frames.showLiveFeedBadge !== undefined) {
        this.queryState.showLiveFeedBadge = saved.frames.showLiveFeedBadge;
      }
      if (saved.frames.customQueryText !== undefined) {
        this.queryState.customQueryText = saved.frames.customQueryText;
      }
      if (saved.frames.screenQueryToggles) {
        for (let i = 0; i < 6; i++) {
          if (saved.frames.screenQueryToggles[i] !== undefined) {
            const val = saved.frames.screenQueryToggles[i];
            this.queryState.screenQueryToggles[i] = val;
            (this.screenQueryTogglesState as any)[`crt${i + 1}`] = val;
          }
        }
      }
    }
    if (saved.audio) {
      store.setAudioState(saved.audio);
    }
    this.curvatureCtrl?.enable(store.shaders.tubeCurve);
    this.updateCornerControllers();
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  private loadSaved(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedCalibration;
        this.applyCalibrationData(saved);
      }
    } catch {
      /* ignore */
    }

    fetch('/api/calibration')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.calibration) {
          this.applyCalibrationData(data.calibration as SavedCalibration);
        }
      })
      .catch(() => {});
  }

  private getCalibrationPayload(): SavedCalibration {
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
      },
      frames: state.frames,
      audio: state.audio,
    };
  }

  private persist(): void {
    const payload = this.getCalibrationPayload();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
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
          this.showToast('✓ Saved to Browser & Disk (config/calibration.json)');
          syncChannel.sendCommand('save_disk');
          return;
        }
      }
      this.showToast('✓ Saved to Browser localStorage');
    } catch (err) {
      this.showToast('✓ Saved to Browser localStorage');
    }
  }

  exportCalibrationJson(): void {
    const payload = this.getCalibrationPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vfeed-calibration-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('📥 Downloaded vfeed-calibration.json');
  }

  importCalibrationJson(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as SavedCalibration;
        this.applyCalibrationData(data);
        this.broadcastPatch({
          shaders: data.shaders as any,
          frames: data.frames,
          audio: data.audio,
          tracking: data.tracking,
          videoMode: data.videoMode,
        });
        await this.saveToBrowserAndServer();
        this.showToast('✓ Imported & Saved calibration successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.showToast(`✗ Failed to import: ${msg}`);
      }
    };
    input.click();
  }

  async copyToClipboard(): Promise<void> {
    const payload = this.getCalibrationPayload();
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      this.showToast('📋 Copied JSON to clipboard');
    } catch {
      this.showToast('✗ Failed to copy to clipboard');
    }
  }

  private showToast(message: string, duration = 3000): void {
    let toast = document.getElementById('vfeed-hud-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vfeed-hud-toast';
      toast.style.cssText = [
        'position: fixed',
        'top: 24px',
        'left: 50%',
        'transform: translateX(-50%)',
        'background: #121722f0',
        'color: #3ddc97',
        'border: 1px solid rgba(61, 220, 151, 0.6)',
        'padding: 10px 20px',
        'border-radius: 6px',
        'font-family: ui-monospace, Menlo, Monaco, monospace',
        'font-size: 13px',
        'font-weight: 600',
        'letter-spacing: 0.04em',
        'z-index: 9999999',
        'pointer-events: none',
        'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 16px rgba(61, 220, 151, 0.3)',
        'transition: opacity 0.3s ease, transform 0.3s ease',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-10px)';
      }
    }, duration);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.unsubscribeStore?.();
    this.unsubscribeSync?.();
    this.unsubscribeDebugFrame?.();
    this.gui?.destroy();
  }
}
