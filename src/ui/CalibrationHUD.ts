import GUI from 'lil-gui';
import {
  CRT_TUBE_SHADERS,
  FLAT_DISPLAY_SHADERS,
  useAppStore,
  type ShaderUniformsState,
  type VideoMode,
} from '../core/StateManager';
import type { VideoQueue } from '../video/VideoQueue';

const STORAGE_KEY = 'vfeed-calibration';

interface SavedCalibration {
  shaders: Omit<ShaderUniformsState, 'time' | 'rippleStrength'>;
  tracking: {
    confidenceThreshold: number;
    mirrorCamera: boolean;
    distanceScale?: number;
    distanceOffset?: number;
    minDistance?: number;
    maxDistance?: number;
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
}

export class CalibrationHUD {
  private gui: GUI | null = null;
  private videoQueue: VideoQueue | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private fpsController: { fps: string } | null = null;
  private curvatureCtrl: ReturnType<GUI['add']> | null = null;
  private shaderBindings: ShaderUniformsState | null = null;

  attach(videoQueue: VideoQueue): void {
    this.videoQueue = videoQueue;
  }

  init(): void {
    this.loadSaved();

    const store = useAppStore.getState();
    const gui = new GUI({ title: 'V-FEED [06] Calibration', width: 340 });
    gui.hide();
    this.gui = gui;

    const presets = gui.addFolder('Presets');
    presets.add({ flat: () => this.applyPreset(FLAT_DISPLAY_SHADERS) }, 'flat').name('Flat display');
    presets.add({ crt: () => this.applyPreset(CRT_TUBE_SHADERS) }, 'crt').name('CRT tube');
    presets.add({ save: () => this.persist() }, 'save').name('Save to browser');
    presets.add({ reset: () => this.applyPreset(FLAT_DISPLAY_SHADERS) }, 'reset').name('Reset defaults');

    const display = gui.addFolder('Display');
    this.shaderBindings = { ...store.shaders };
    const sh = this.shaderBindings;

    display
      .add(sh, 'tubeCurve')
      .name('CRT tube curve')
      .onChange((v: boolean) => {
        store.patchShaders({ tubeCurve: v });
        this.curvatureCtrl?.enable(v);
        this.persist();
      });

    this.curvatureCtrl = display
      .add(sh, 'curvature', 0, 0.5, 0.01)
      .name('Barrel amount')
      .onChange((v: number) => {
        store.patchShaders({ curvature: v });
        this.persist();
      });
    this.curvatureCtrl.enable(sh.tubeCurve);

    display
      .add(sh, 'vignette', 0, 1, 0.01)
      .name('Vignette')
      .onChange((v: number) => {
        store.patchShaders({ vignette: v });
        this.persist();
      });
    display
      .add(sh, 'scanlineIntensity', 0, 1, 0.01)
      .name('Scanlines')
      .onChange((v: number) => {
        store.patchShaders({ scanlineIntensity: v });
        this.persist();
      });
    display
      .add(sh, 'phosphorMask', 0, 1, 0.01)
      .name('Phosphor')
      .onChange((v: number) => {
        store.patchShaders({ phosphorMask: v });
        this.persist();
      });

    const glitch = gui.addFolder('Glitch / signal');
    glitch
      .add(sh, 'rgbSplit', 0, 2, 0.01)
      .name('RGB split')
      .onChange((v: number) => {
        store.patchShaders({ rgbSplit: v });
        this.persist();
      });
    glitch
      .add(sh, 'vHold', 0, 1, 0.01)
      .name('V-Hold')
      .onChange((v: number) => {
        store.patchShaders({ vHold: v });
        this.persist();
      });
    glitch
      .add(sh, 'hJitter', 0, 1, 0.01)
      .name('H-Jitter')
      .onChange((v: number) => {
        store.patchShaders({ hJitter: v });
        this.persist();
      });
    glitch
      .add(sh, 'noiseGain', 0, 1, 0.01)
      .name('Noise')
      .onChange((v: number) => {
        store.patchShaders({ noiseGain: v });
        this.persist();
      });
    glitch
      .add(sh, 'signalLock', 0, 1, 0.01)
      .name('Signal lock')
      .onChange((v: number) => {
        store.patchShaders({ signalLock: v });
        this.persist();
      });
    glitch
      .add(sh, 'rippleStrength', 0, 1, 0.01)
      .name('Ripple (manual)')
      .onChange((v: number) => {
        store.patchShaders({ rippleStrength: v });
        this.persist();
      });

    const tracking = gui.addFolder('Tracking & Distance');
    tracking
      .add(store.tracking, 'confidenceThreshold', 0.1, 0.9, 0.01)
      .name('Confidence')
      .onChange((v: number) => {
        store.patchTracking({ confidenceThreshold: v });
        this.persist();
      });
    tracking
      .add(store.tracking, 'mirrorCamera')
      .name('Mirror camera')
      .onChange((v: boolean) => {
        store.patchTracking({ mirrorCamera: v });
        this.persist();
      });

    const distReadout = { liveDistance: `${store.tracking.distance.toFixed(2)} m` };
    const distCtrl = tracking
      .add(distReadout, 'liveDistance')
      .name('Est. Distance')
      .disable();

    tracking
      .add(store.tracking, 'distanceScale', 1.0, 25.0, 0.5)
      .name('Dist sensitivity')
      .onChange((v: number) => {
        store.patchTracking({ distanceScale: v });
        this.persist();
      });

    tracking
      .add(store.tracking, 'distanceOffset', 1.0, 5.0, 0.1)
      .name('Base dist offset')
      .onChange((v: number) => {
        store.patchTracking({ distanceOffset: v });
        this.persist();
      });

    tracking
      .add(store.tracking, 'minDistance', 0.5, 3.0, 0.1)
      .name('Min dist (lock 100%)')
      .onChange((v: number) => {
        store.patchTracking({ minDistance: v });
        this.persist();
      });

    tracking
      .add(store.tracking, 'maxDistance', 1.5, 6.0, 0.1)
      .name('Max dist (fade 0%)')
      .onChange((v: number) => {
        store.patchTracking({ maxDistance: v });
        this.persist();
      });

    const video = gui.addFolder('Video source');
    const videoState = { mode: store.videoMode as VideoMode };
    video
      .add(videoState, 'mode', ['cache', 'live', 'grid'] as VideoMode[])
      .name('Source')
      .onChange((mode: VideoMode) => {
        this.videoQueue?.setMode(mode);
        localStorage.setItem('vfeed-video-mode', mode);
        this.persist();
      });

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
        useAppStore.getState().setSkeletonOverlay(v);
        this.persist();
      });

    skel
      .add(skelState, 'showLines')
      .name('Show lines')
      .onChange((v: boolean) => {
        useAppStore.getState().setSkeletonShowLines(v);
        this.persist();
      });

    skel
      .add(skelState, 'lineThickness', 0.5, 10, 0.5)
      .name('Line thickness')
      .onChange((v: number) => {
        useAppStore.getState().setSkeletonLineThickness(v);
        this.persist();
      });

    skel
      .add(skelState, 'lineOpacity', 0, 1, 0.05)
      .name('Line opacity')
      .onChange((v: number) => {
        useAppStore.getState().setSkeletonLineOpacity(v);
        this.persist();
      });

    skel
      .add(skelState, 'showDots')
      .name('Show dots')
      .onChange((v: boolean) => {
        useAppStore.getState().setSkeletonShowDots(v);
        this.persist();
      });

    skel
      .add(skelState, 'dotSize', 0.5, 10, 0.5)
      .name('Dot size')
      .onChange((v: number) => {
        useAppStore.getState().setSkeletonDotSize(v);
        this.persist();
      });

    skel
      .add(skelState, 'dotOpacity', 0, 1, 0.05)
      .name('Dot opacity')
      .onChange((v: number) => {
        useAppStore.getState().setSkeletonDotOpacity(v);
        this.persist();
      });

    skel
      .add(skelState, 'jitter', 0, 1, 0.05)
      .name('Noise / Jitter')
      .onChange((v: number) => {
        useAppStore.getState().setSkeletonJitter(v);
        this.persist();
      });

    skel
      .add(skelState, 'style', ['phosphor', 'cyan', 'amber', 'magenta'])
      .name('Color palette')
      .onChange((v: any) => {
        useAppStore.getState().setSkeletonStyle(v);
        this.persist();
      });

    const debug = gui.addFolder('Debug');
    this.fpsController = { fps: `${store.fps} FPS` };
    debug.add(this.fpsController, 'fps').name('Frame rate').disable();
    const dbg = { debugOverlay: store.debugOverlay };
    debug.add(dbg, 'debugOverlay').name('Debug camera window').onChange((v: boolean) => {
      useAppStore.getState().setDebugOverlay(v);
      this.persist();
    });

    useAppStore.subscribe((state) => {
      if (this.fpsController) {
        this.fpsController.fps = `${state.fps} FPS`;
      }
      distReadout.liveDistance = `${state.tracking.distance.toFixed(2)} m`;
      distCtrl.updateDisplay();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      const chord =
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c';
      if (e.key.toLowerCase() === 'h' || chord) {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    if (import.meta.env.DEV) {
      this.show();
    }
  }

  private applyPreset(preset: ShaderUniformsState): void {
    const store = useAppStore.getState();
    const { time, rippleStrength, ...rest } = preset;
    void time;
    void rippleStrength;
    store.patchShaders({ ...rest, rippleStrength: store.shaders.rippleStrength });
    if (this.shaderBindings) {
      Object.assign(this.shaderBindings, store.shaders);
    }
    this.curvatureCtrl?.enable(store.shaders.tubeCurve);
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
    this.persist();
  }

  private loadSaved(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedCalibration;
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
      }
    } catch {
      /* ignore corrupt saves */
    }
  }

  private persist(): void {
    const state = useAppStore.getState();
    const { time, rippleStrength, ...shaders } = state.shaders;
    void time;
    void rippleStrength;
    const payload: SavedCalibration = {
      shaders,
      tracking: {
        confidenceThreshold: state.tracking.confidenceThreshold,
        mirrorCamera: state.tracking.mirrorCamera,
        distanceScale: state.tracking.distanceScale,
        distanceOffset: state.tracking.distanceOffset,
        minDistance: state.tracking.minDistance,
        maxDistance: state.tracking.maxDistance,
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private show(): void {
    useAppStore.getState().setHudVisible(true);
    this.gui?.show();
    document.body.classList.remove('kiosk-cursor-hidden');
  }

  toggle(): void {
    const visible = !useAppStore.getState().hudVisible;
    useAppStore.getState().setHudVisible(visible);
    if (!this.gui) return;
    if (visible) {
      this.gui.show();
      document.body.classList.remove('kiosk-cursor-hidden');
    } else {
      this.gui.hide();
      if (!import.meta.env.DEV) {
        document.body.classList.add('kiosk-cursor-hidden');
      }
    }
  }

  dispose(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.gui?.destroy();
    this.gui = null;
  }
}
