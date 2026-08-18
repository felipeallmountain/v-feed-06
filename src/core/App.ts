import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { getViewportSize } from '../core/constants';
import {
  createCalibrationGridDataUrl,
  createNoiseDataUrl,
} from '../core/textureUtils';
import { useAppStore } from '../core/StateManager';
import { SceneManager } from '../rendering/SceneManager';
import { SkeletonOverlay } from '../rendering/SkeletonOverlay';
import { CalibrationHUD } from '../ui/CalibrationHUD';
import { DebugView } from '../ui/DebugView';
import { VideoQueue } from '../video/VideoQueue';
import {
  formatCameraError,
  probeCameraEnvironment,
} from '../vision/cameraDiagnostics';
import { CameraManager } from '../vision/CameraManager';
import { GestureMapper } from '../vision/GestureMapper';
import { MediaPipeTracker } from '../vision/MediaPipeTracker';

export class App {
  private scene: SceneManager | null = null;
  private camera: CameraManager | null = null;
  private tracker: MediaPipeTracker | null = null;
  private mapper = new GestureMapper();
  private videoQueue = new VideoQueue();
  private audio = new AudioEngine();
  private hud = new CalibrationHUD();
  private debug: DebugView | null = null;
  private skeleton: SkeletonOverlay | null = null;
  private raf = 0;
  private lastTs = 0;
  private running = false;
  private trackerReady = false;
  private unlocking = false;
  private hint: HTMLElement | null = null;
  private allowBtn: HTMLButtonElement | null = null;
  private diagEl: HTMLElement | null = null;
  private gridTex: THREE.Texture | null = null;
  private resizeHandler: (() => void) | null = null;

  async start(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage');
    const skeletonCanvas = document.querySelector<HTMLCanvasElement>('#skeleton-stage');
    const feedVideo = document.querySelector<HTMLVideoElement>('#feed-video');
    const webcam = document.querySelector<HTMLVideoElement>('#webcam');
    const debugCanvas = document.querySelector<HTMLCanvasElement>('#debug-overlay');
    this.hint = document.querySelector<HTMLElement>('#boot-hint');
    this.allowBtn = document.querySelector<HTMLButtonElement>('#allow-camera');
    this.diagEl = document.querySelector<HTMLElement>('#boot-diag');

    if (!canvas || !skeletonCanvas || !feedVideo || !webcam || !debugCanvas) {
      throw new Error('Missing required DOM nodes');
    }

    this.scene = new SceneManager(canvas, feedVideo);
    this.skeleton = new SkeletonOverlay(skeletonCanvas);
    this.scene.setNoiseTexture(createNoiseDataUrl(256));

    const { width, height } = getViewportSize();
    const gridUrl = createCalibrationGridDataUrl(width, height);
    const gridTex = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(gridUrl, resolve, undefined, reject);
    });
    gridTex.colorSpace = THREE.SRGBColorSpace;
    this.gridTex = gridTex;
    this.scene.setGridTexture(gridTex);

    this.resizeHandler = () => {
      void this.refreshGridTexture();
      this.skeleton?.resize();
    };
    window.addEventListener('resize', this.resizeHandler);

    this.camera = new CameraManager(webcam);
    this.tracker = new MediaPipeTracker();
    this.debug = new DebugView(debugCanvas);
    this.hud.attach(this.videoQueue);
    this.hud.init();
    this.videoQueue.attach(this.scene.videoPass, this.scene);

    await this.refreshDiagnostics();
    this.bindUnlock();

    void this.videoQueue.init();

    useAppStore.subscribe((state, prev) => {
      if (state.tracking.mirrorCamera !== prev.tracking.mirrorCamera) {
        this.camera?.setMirror(state.tracking.mirrorCamera);
      }
    });

    this.running = true;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      const dt = ts - this.lastTs;
      this.lastTs = ts;
      this.debug?.markFrame(dt);

      let frame = null;
      if (this.trackerReady && this.tracker && this.camera) {
        frame = this.tracker.detect(
          this.camera.video,
          useAppStore.getState().tracking.mirrorCamera,
        );
        this.mapper.update(frame);
      } else {
        const sh = useAppStore.getState().shaders;
        if (sh.signalLock === 0 && sh.noiseGain < 0.5) {
          useAppStore.getState().patchShaders({
            noiseGain: 0.85,
            vHold: 0.2,
            signalLock: 0.05,
          });
        }
      }

      this.skeleton?.draw(frame);
      this.scene?.render();
      this.debug?.draw(frame, webcam);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private async refreshGridTexture(): Promise<void> {
    if (!this.scene) return;
    const { width, height } = getViewportSize();
    const gridUrl = createCalibrationGridDataUrl(width, height);
    const gridTex = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(gridUrl, resolve, undefined, reject);
    });
    gridTex.colorSpace = THREE.SRGBColorSpace;
    this.gridTex?.dispose();
    this.gridTex = gridTex;
    this.scene.setGridTexture(gridTex);
  }

  private async refreshDiagnostics(): Promise<void> {
    const report = await probeCameraEnvironment();
    if (this.diagEl) {
      this.diagEl.textContent = report.lines.join('\n');
    }
    if (report.likelyPreviewBrowser || report.embedded) {
      this.hint?.classList.add('error');
    }
  }

  private bindUnlock(): void {
    // Explicit button = reliable user activation for getUserMedia.
    // Do NOT use a bubbling window click — that often fails in preview browsers
    // and can race with overlay updates.
    this.allowBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.unlock();
    });
  }

  private async unlock(): Promise<void> {
    if (this.unlocking || !this.camera) return;
    this.unlocking = true;
    if (this.allowBtn) {
      this.allowBtn.disabled = true;
      this.allowBtn.textContent = 'Requesting…';
    }

    // Call getUserMedia immediately inside the button click handler.
    const camResult = await this.camera.start(
      useAppStore.getState().tracking.mirrorCamera,
    );

    await this.refreshDiagnostics();

    if (!camResult.ok) {
      this.unlocking = false;
      if (this.allowBtn) {
        this.allowBtn.disabled = false;
        this.allowBtn.textContent = 'Retry camera';
      }
      if (this.diagEl) {
        this.diagEl.textContent = `${formatCameraError(camResult)}\n\n${this.diagEl.textContent ?? ''}`;
      }
      this.hint?.classList.add('error');
      console.warn('[v-feed] Camera unavailable:', camResult);
      return;
    }

    this.hint?.classList.add('hidden');
    if (!import.meta.env.DEV) {
      document.body.classList.add('kiosk-cursor-hidden');
    }

    try {
      await this.audio.unlock();
    } catch (err) {
      console.warn('[v-feed] Audio unlock failed:', err);
    }

    try {
      await this.tracker?.init();
      this.trackerReady = true;
    } catch (err) {
      console.warn('[v-feed] MediaPipe init failed:', err);
    }

    await this.videoQueue.playCurrent();
    this.unlocking = false;
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.gridTex?.dispose();
    this.hud.dispose();
    this.videoQueue.dispose();
    this.audio.dispose();
    this.tracker?.dispose();
    this.camera?.stop();
    this.scene?.dispose();
  }
}
