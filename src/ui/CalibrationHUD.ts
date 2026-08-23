import GUI from 'lil-gui';
import {
  CRT_6X_PHYSICAL_PRESET,
  CRT_6X_TOTEM_PRESET,
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
    presets.add({ totem: () => this.applyPreset(CRT_6X_TOTEM_PRESET) }, 'totem').name('6x CRT Totem (Wall)');
    presets.add({ physical: () => this.applyPreset(CRT_6X_PHYSICAL_PRESET) }, 'physical').name('6x Physical Output');
    presets.add({ flat: () => this.applyPreset(FLAT_DISPLAY_SHADERS) }, 'flat').name('1x Flat Screen');
    presets.add({ crt: () => this.applyPreset(CRT_TUBE_SHADERS) }, 'crt').name('1x CRT Tube');
    presets.add({ save: () => this.persist() }, 'save').name('Save to browser');
    presets.add({ reset: () => this.applyPreset(CRT_6X_TOTEM_PRESET) }, 'reset').name('Reset defaults');

    this.shaderBindings = { ...store.shaders };
    const sh: ShaderUniformsState = this.shaderBindings;

    const matrixFolder = gui.addFolder('2×3 Matrix (6 Screens)');
    matrixFolder
      .add(sh, 'matrixSplit')
      .name('Split into 6 CRT pieces')
      .onChange((v: boolean) => {
        store.patchShaders({ matrixSplit: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelWidthX', 0, 0.1, 0.002)
      .name('Bezel X (Columns)')
      .onChange((v: number) => {
        store.patchShaders({ bezelWidthX: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelWidthY', 0, 0.1, 0.002)
      .name('Bezel Y (Rows)')
      .onChange((v: number) => {
        store.patchShaders({ bezelWidthY: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelOuter', 0, 0.08, 0.002)
      .name('Outer Chassis Frame')
      .onChange((v: number) => {
        store.patchShaders({ bezelOuter: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelComp', 0, 1, 0.05)
      .name('Bezel Compensation')
      .onChange((v: number) => {
        store.patchShaders({ bezelComp: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'cornerRounding', 0, 0.2, 0.01)
      .name('Tube Corner Radius')
      .onChange((v: number) => {
        store.patchShaders({ cornerRounding: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'bezelChassis')
      .name('Draw CRT Chassis Bevel')
      .onChange((v: boolean) => {
        store.patchShaders({ bezelChassis: v });
        this.persist();
      });

    matrixFolder
      .add(sh, 'perScreenVariance', 0, 1, 0.05)
      .name('Analog Sync Drift')
      .onChange((v: number) => {
        store.patchShaders({ perScreenVariance: v });
        this.persist();
      });

    const cornerFolder = gui.addFolder('Corner Pinning / Keystone (6 Screens)');
    const cornerState = {
      showHandles: store.shaders.showCornerHandles,
      selectedScreen: 0,
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

    cornerFolder
      .add(cornerState, 'showHandles')
      .name('Show Corner Target Guides')
      .onChange((v: boolean) => {
        store.patchShaders({ showCornerHandles: v });
        this.persist();
      });

    const rotCtrl = cornerFolder
      .add(cornerState, 'rotation', rotationOptions)
      .name('Rotation (90° Steps)')
      .onChange((v: number) => {
        store.setScreenRotation(cornerState.selectedScreen, v);
        this.persist();
      });

    const fineRotCtrl = cornerFolder
      .add(cornerState, 'fineRotation', -180, 180, 0.5)
      .name('Fine Angle (°)')
      .onChange((v: number) => {
        store.setScreenFineRotation(cornerState.selectedScreen, v);
        this.persist();
      });

    const flipHCtrl = cornerFolder.add(cornerState, 'flipH').name('Flip Horizontally (Mirror X)').onChange((v: boolean) => {
      store.setScreenFlip(cornerState.selectedScreen, 'h', v);
      this.persist();
    });
    const flipVCtrl = cornerFolder.add(cornerState, 'flipV').name('Flip Vertically (Invert Y)').onChange((v: boolean) => {
      store.setScreenFlip(cornerState.selectedScreen, 'v', v);
      this.persist();
    });

    const tlFolder = cornerFolder.addFolder('Top-Left (TL)');
    const tlXCtrl = tlFolder.add(cornerState, 'tlX', -0.25, 0.25, 0.001).name('TL X Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'tl', 0, v);
      this.persist();
    });
    const tlYCtrl = tlFolder.add(cornerState, 'tlY', -0.25, 0.25, 0.001).name('TL Y Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'tl', 1, v);
      this.persist();
    });

    const trFolder = cornerFolder.addFolder('Top-Right (TR)');
    const trXCtrl = trFolder.add(cornerState, 'trX', -0.25, 0.25, 0.001).name('TR X Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'tr', 0, v);
      this.persist();
    });
    const trYCtrl = trFolder.add(cornerState, 'trY', -0.25, 0.25, 0.001).name('TR Y Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'tr', 1, v);
      this.persist();
    });

    const brFolder = cornerFolder.addFolder('Bottom-Right (BR)');
    const brXCtrl = brFolder.add(cornerState, 'brX', -0.25, 0.25, 0.001).name('BR X Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'br', 0, v);
      this.persist();
    });
    const brYCtrl = brFolder.add(cornerState, 'brY', -0.25, 0.25, 0.001).name('BR Y Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'br', 1, v);
      this.persist();
    });

    const blFolder = cornerFolder.addFolder('Bottom-Left (BL)');
    const blXCtrl = blFolder.add(cornerState, 'blX', -0.25, 0.25, 0.001).name('BL X Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'bl', 0, v);
      this.persist();
    });
    const blYCtrl = blFolder.add(cornerState, 'blY', -0.25, 0.25, 0.001).name('BL Y Offset').onChange((v: number) => {
      store.setCornerOffset(cornerState.selectedScreen, 'bl', 1, v);
      this.persist();
    });

    const updateCornerControllers = () => {
      const current = store.shaders.cornerOffsets[cornerState.selectedScreen] ?? {
        tl: [0, 0],
        tr: [0, 0],
        br: [0, 0],
        bl: [0, 0],
      };
      const currentFlip = store.shaders.screenFlips[cornerState.selectedScreen] ?? {
        flipH: false,
        flipV: false,
        rotation: 0,
        fineRotation: 0,
      };
      cornerState.rotation = currentFlip.rotation || 0;
      cornerState.fineRotation = currentFlip.fineRotation || 0;
      cornerState.flipH = currentFlip.flipH;
      cornerState.flipV = currentFlip.flipV;
      cornerState.tlX = current.tl[0];
      cornerState.tlY = current.tl[1];
      cornerState.trX = current.tr[0];
      cornerState.trY = current.tr[1];
      cornerState.brX = current.br[0];
      cornerState.brY = current.br[1];
      cornerState.blX = current.bl[0];
      cornerState.blY = current.bl[1];
      rotCtrl.updateDisplay();
      fineRotCtrl.updateDisplay();
      flipHCtrl.updateDisplay();
      flipVCtrl.updateDisplay();
      tlXCtrl.updateDisplay();
      tlYCtrl.updateDisplay();
      trXCtrl.updateDisplay();
      trYCtrl.updateDisplay();
      brXCtrl.updateDisplay();
      brYCtrl.updateDisplay();
      blXCtrl.updateDisplay();
      blYCtrl.updateDisplay();
    };

    cornerFolder
      .add(cornerState, 'selectedScreen', screenMap)
      .name('Select Screen')
      .onChange(() => {
        updateCornerControllers();
      });

    cornerFolder.add({
      resetScreen: () => {
        store.resetScreenCorners(cornerState.selectedScreen);
        updateCornerControllers();
        this.persist();
      },
    }, 'resetScreen').name('Reset active screen corners');

    cornerFolder.add({
      resetAll: () => {
        store.resetAllCorners();
        updateCornerControllers();
        this.persist();
      },
    }, 'resetAll').name('Reset all 6 screens');

    updateCornerControllers();

    const flipFolder = gui.addFolder('Screen Orientation, Rotation & Flips (6 Pieces)');
    flipFolder
      .add(sh, 'globalRotation', rotationOptions)
      .name('Global Rotation (90°)')
      .onChange((v: number) => {
        store.setGlobalRotation(v);
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFineRotation', -180, 180, 0.5)
      .name('Global Fine Angle (°)')
      .onChange((v: number) => {
        store.setGlobalFineRotation(v);
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFlipH')
      .name('Global Flip Horizontal')
      .onChange((v: boolean) => {
        store.setGlobalFlip('h', v);
        this.persist();
      });
    flipFolder
      .add(sh, 'globalFlipV')
      .name('Global Flip Vertical')
      .onChange((v: boolean) => {
        store.setGlobalFlip('v', v);
        this.persist();
      });

    const perScreenFlipsFolder = flipFolder.addFolder('Per-Piece Orientation Matrix (CRT 01 - 06)');
    const flipBindings = {
      crt1Rot: store.shaders.screenFlips[0]?.rotation ?? 0,
      crt1Fine: store.shaders.screenFlips[0]?.fineRotation ?? 0,
      crt1H: store.shaders.screenFlips[0]?.flipH ?? false,
      crt1V: store.shaders.screenFlips[0]?.flipV ?? false,

      crt2Rot: store.shaders.screenFlips[1]?.rotation ?? 0,
      crt2Fine: store.shaders.screenFlips[1]?.fineRotation ?? 0,
      crt2H: store.shaders.screenFlips[1]?.flipH ?? false,
      crt2V: store.shaders.screenFlips[1]?.flipV ?? false,

      crt3Rot: store.shaders.screenFlips[2]?.rotation ?? 0,
      crt3Fine: store.shaders.screenFlips[2]?.fineRotation ?? 0,
      crt3H: store.shaders.screenFlips[2]?.flipH ?? false,
      crt3V: store.shaders.screenFlips[2]?.flipV ?? false,

      crt4Rot: store.shaders.screenFlips[3]?.rotation ?? 0,
      crt4Fine: store.shaders.screenFlips[3]?.fineRotation ?? 0,
      crt4H: store.shaders.screenFlips[3]?.flipH ?? false,
      crt4V: store.shaders.screenFlips[3]?.flipV ?? false,

      crt5Rot: store.shaders.screenFlips[4]?.rotation ?? 0,
      crt5Fine: store.shaders.screenFlips[4]?.fineRotation ?? 0,
      crt5H: store.shaders.screenFlips[4]?.flipH ?? false,
      crt5V: store.shaders.screenFlips[4]?.flipV ?? false,

      crt6Rot: store.shaders.screenFlips[5]?.rotation ?? 0,
      crt6Fine: store.shaders.screenFlips[5]?.fineRotation ?? 0,
      crt6H: store.shaders.screenFlips[5]?.flipH ?? false,
      crt6V: store.shaders.screenFlips[5]?.flipV ?? false,
    };

    const addFlipPair = (
      id: number,
      name: string,
      rotKey: keyof typeof flipBindings,
      fineKey: keyof typeof flipBindings,
      hKey: keyof typeof flipBindings,
      vKey: keyof typeof flipBindings,
    ) => {
      const f = perScreenFlipsFolder.addFolder(name);
      f.add(flipBindings, rotKey, rotationOptions).name('Rotation (90°)').onChange((v: number) => {
        store.setScreenRotation(id, v);
        updateCornerControllers();
        this.persist();
      });
      f.add(flipBindings, fineKey, -180, 180, 0.5).name('Fine Angle (°)').onChange((v: number) => {
        store.setScreenFineRotation(id, v);
        updateCornerControllers();
        this.persist();
      });
      f.add(flipBindings, hKey).name('Flip H (Mirror)').onChange((v: boolean) => {
        store.setScreenFlip(id, 'h', v);
        updateCornerControllers();
        this.persist();
      });
      f.add(flipBindings, vKey).name('Flip V (Invert)').onChange((v: boolean) => {
        store.setScreenFlip(id, 'v', v);
        updateCornerControllers();
        this.persist();
      });
    };

    addFlipPair(0, 'CRT [01] · Top-Left', 'crt1Rot', 'crt1Fine', 'crt1H', 'crt1V');
    addFlipPair(1, 'CRT [02] · Top-Right', 'crt2Rot', 'crt2Fine', 'crt2H', 'crt2V');
    addFlipPair(2, 'CRT [03] · Mid-Left', 'crt3Rot', 'crt3Fine', 'crt3H', 'crt3V');
    addFlipPair(3, 'CRT [04] · Mid-Right', 'crt4Rot', 'crt4Fine', 'crt4H', 'crt4V');
    addFlipPair(4, 'CRT [05] · Bot-Left', 'crt5Rot', 'crt5Fine', 'crt5H', 'crt5V');
    addFlipPair(5, 'CRT [06] · Bot-Right', 'crt6Rot', 'crt6Fine', 'crt6H', 'crt6V');

    flipFolder.add({
      resetFlips: () => {
        store.resetAllFlips();
        sh.globalFlipH = false;
        sh.globalFlipV = false;
        sh.globalRotation = 0;
        sh.globalFineRotation = 0;
        Object.keys(flipBindings).forEach((k) => {
          (flipBindings as any)[k] = k.endsWith('Rot') || k.endsWith('Fine') ? 0 : false;
        });
        updateCornerControllers();
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        this.persist();
      },
    }, 'resetFlips').name('Reset all orientations, rotations & flips');

    const display = gui.addFolder('Display');

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

    this.setupInteractiveCornerDragging(updateCornerControllers);

    if (import.meta.env.DEV) {
      this.show();
    }
  }

  private setupInteractiveCornerDragging(updateGui: () => void): void {
    let activeDrag: {
      screenIndex: number;
      corner: 'bl' | 'br' | 'tr' | 'tl';
      startOffset: [number, number];
      startU: number;
      startV: number;
    } | null = null;

    const cornerTypes: Array<'bl' | 'br' | 'tr' | 'tl'> = ['bl', 'br', 'tr', 'tl'];

    window.addEventListener('pointerdown', (e: PointerEvent) => {
      const store = useAppStore.getState();
      if (!store.hudVisible && !store.shaders.showCornerHandles) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const u = e.clientX / w;
      const v = 1.0 - e.clientY / h;

      // Compute all 24 corner coordinates
      const corners = (window as any).__vfeed_last_corners ?? [];
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

      if (closestDist < 0.05 && closestIdx >= 0) {
        const screenIndex = Math.floor(closestIdx / 4);
        const corner = cornerTypes[closestIdx % 4];
        const currentOffset = store.shaders.cornerOffsets[screenIndex]?.[corner] ?? [0, 0];

        activeDrag = {
          screenIndex,
          corner,
          startOffset: [currentOffset[0], currentOffset[1]],
          startU: u,
          startV: v,
        };
        e.preventDefault();
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!activeDrag) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const u = e.clientX / w;
      const v = 1.0 - e.clientY / h;

      const du = u - activeDrag.startU;
      const dv = v - activeDrag.startV;

      const newDx = Math.max(-0.35, Math.min(0.35, activeDrag.startOffset[0] + du));
      const newDy = Math.max(-0.35, Math.min(0.35, activeDrag.startOffset[1] + dv));

      useAppStore.getState().setCornerOffset(activeDrag.screenIndex, activeDrag.corner, 0, newDx);
      useAppStore.getState().setCornerOffset(activeDrag.screenIndex, activeDrag.corner, 1, newDy);
      updateGui();
    });

    window.addEventListener('pointerup', () => {
      if (activeDrag) {
        activeDrag = null;
        this.persist();
      }
    });
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
