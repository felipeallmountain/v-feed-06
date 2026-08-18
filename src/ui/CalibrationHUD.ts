import GUI from 'lil-gui';
import { useAppStore, type VideoMode } from '../core/StateManager';
import type { VideoQueue } from '../video/VideoQueue';

export class CalibrationHUD {
  private gui: GUI | null = null;
  private videoQueue: VideoQueue | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  attach(videoQueue: VideoQueue): void {
    this.videoQueue = videoQueue;
  }

  init(): void {
    const store = useAppStore.getState();
    const gui = new GUI({ title: 'V-FEED [06] Calibration', width: 320 });
    gui.hide();
    this.gui = gui;

    const tracking = gui.addFolder('Tracking');
    tracking
      .add(store.tracking, 'confidenceThreshold', 0.1, 0.9, 0.01)
      .name('Confidence')
      .onChange((v: number) => store.patchTracking({ confidenceThreshold: v }));
    tracking
      .add(store.tracking, 'mirrorCamera')
      .name('Mirror camera')
      .onChange((v: boolean) => store.patchTracking({ mirrorCamera: v }));

    const shaders = gui.addFolder('Shaders');
    const sh = { ...store.shaders };
    shaders.add(sh, 'curvature', 0, 0.5, 0.01).onChange((v: number) => store.patchShaders({ curvature: v }));
    shaders.add(sh, 'scanlineIntensity', 0, 1, 0.01).name('Scanlines').onChange((v: number) => store.patchShaders({ scanlineIntensity: v }));
    shaders.add(sh, 'phosphorMask', 0, 1, 0.01).name('Phosphor').onChange((v: number) => store.patchShaders({ phosphorMask: v }));
    shaders.add(sh, 'vignette', 0, 1, 0.01).onChange((v: number) => store.patchShaders({ vignette: v }));
    shaders.add(sh, 'rgbSplit', 0, 2, 0.01).name('RGB split').onChange((v: number) => store.patchShaders({ rgbSplit: v }));
    shaders.add(sh, 'vHold', 0, 1, 0.01).name('V-Hold').onChange((v: number) => store.patchShaders({ vHold: v }));
    shaders.add(sh, 'hJitter', 0, 1, 0.01).name('H-Jitter').onChange((v: number) => store.patchShaders({ hJitter: v }));
    shaders.add(sh, 'noiseGain', 0, 1, 0.01).name('Noise').onChange((v: number) => store.patchShaders({ noiseGain: v }));
    shaders.add(sh, 'signalLock', 0, 1, 0.01).name('Signal lock').onChange((v: number) => store.patchShaders({ signalLock: v }));

    const bezel = gui.addFolder('Bezel compensation');
    const bz = { ...store.bezel };
    bezel.add(bz, 'offsetX', 0, 40, 1).onChange((v: number) => store.patchBezel({ offsetX: v }));
    bezel.add(bz, 'offsetY', 0, 40, 1).onChange((v: number) => store.patchBezel({ offsetY: v }));
    bezel.add(bz, 'gapX', 0, 40, 1).onChange((v: number) => store.patchBezel({ gapX: v }));
    bezel.add(bz, 'gapY', 0, 40, 1).onChange((v: number) => store.patchBezel({ gapY: v }));

    const video = gui.addFolder('Video source');
    const videoState = { mode: store.videoMode as VideoMode };
    video
      .add(videoState, 'mode', ['cache', 'live', 'grid'] as VideoMode[])
      .name('Source')
      .onChange((mode: VideoMode) => {
        this.videoQueue?.setMode(mode);
        localStorage.setItem('vfeed-video-mode', mode);
      });

    const debug = gui.addFolder('Debug');
    const dbg = {
      debugFit: store.debugFit,
      debugOverlay: store.debugOverlay,
    };
    debug.add(dbg, 'debugFit').name('Fit to window').onChange((v: boolean) => {
      useAppStore.getState().setDebugFit(v);
      window.dispatchEvent(new Event('resize'));
    });
    debug.add(dbg, 'debugOverlay').name('Skeleton overlay').onChange((v: boolean) => {
      useAppStore.getState().setDebugOverlay(v);
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
      document.body.classList.add('kiosk-cursor-hidden');
    }
  }

  dispose(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.gui?.destroy();
    this.gui = null;
  }
}
