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
import { CalibrationManager } from './CalibrationManager';
import { DebugView } from '../ui/DebugView';
import { VideoQueue } from '../video/VideoQueue';
import { formatCameraError, probeCameraEnvironment } from '../vision/cameraDiagnostics';
import { CameraManager } from '../vision/CameraManager';
import { GestureMapper } from '../vision/GestureMapper';
import { InteractionController } from '../vision/InteractionController';
import { MediaPipeTracker } from '../vision/MediaPipeTracker';
import { syncChannel } from '../core/SyncChannel';

export class App {
  private scene: SceneManager | null = null;
  private camera: CameraManager | null = null;
  private tracker: MediaPipeTracker | null = null;
  private mapper = new GestureMapper();
  private interaction = new InteractionController();
  private videoQueue = new VideoQueue();
  private audio = new AudioEngine();
  private calibration = new CalibrationManager();
  private debug: DebugView | null = null;
  private debugCanvas: HTMLCanvasElement | null = null;
  private sendingDebugFrame = false;
  private lastDebugFrameTs = 0;
  private skeleton: SkeletonOverlay | null = null;
  private raf = 0;
  private lastTs = 0;
  private lastTelemetryTs = 0;
  private unsubscribeSync: (() => void) | null = null;
  private running = false;
  private trackerReady = false;
  private unlocking = false;
  private hint: HTMLElement | null = null;
  private allowBtn: HTMLButtonElement | null = null;
  private diagEl: HTMLElement | null = null;
  private gridTex: THREE.Texture | null = null;
  private resizeHandler: (() => void) | null = null;
  private perfBadgeEl: HTMLElement | null = null;
  private perfPollTimer: number | null = null;
  private perfKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  async start(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage');
    const skeletonCanvas = document.querySelector<HTMLCanvasElement>('#skeleton-stage');
    const feedVideo = document.querySelector<HTMLVideoElement>('#feed-video');
    const webcam = document.querySelector<HTMLVideoElement>('#webcam');
    this.hint = document.querySelector<HTMLElement>('#boot-hint');
    this.allowBtn = document.querySelector<HTMLButtonElement>('#allow-camera');
    this.diagEl = document.querySelector<HTMLElement>('#boot-diag');

    if (!canvas || !skeletonCanvas || !feedVideo || !webcam) {
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

    // Offscreen debug canvas used for streaming to calibration console
    this.debugCanvas = document.createElement('canvas');
    this.debugCanvas.width = 400;
    this.debugCanvas.height = 300;
    this.debug = new DebugView(this.debugCanvas);
    this.calibration.attach(this.videoQueue);
    this.calibration.init();
    this.videoQueue.attach(this.scene.videoPass, this.scene);

    // Register query synthesizer event dispatcher → VideoQueue YouTube ingestion & playback
    this.interaction.onQuerySynthesized((query) => {
      void this.videoQueue.triggerInteractionQuery(query.rawQuery, query.sourceTrigger);
    });

    // Cross-window sync bridge (Main Stage Role)
    syncChannel.startHeartbeat('main');
    this.unsubscribeSync = syncChannel.onMessage((msg) => {
      if (msg.type === 'REQUEST_INITIAL_STATE') {
        syncChannel.sendInitialState(this.calibration.getCalibrationPayload());
        this.sendTelemetryTick(feedVideo);
      } else if (msg.type === 'REMOTE_COMMAND') {
        const { action, value } = msg.payload;
        if (action === 'play') {
          void feedVideo.play();
        } else if (action === 'pause') {
          feedVideo.pause();
        } else if (action === 'toggle_play') {
          if (feedVideo.paused) {
            void feedVideo.play();
          } else {
            feedVideo.pause();
          }
        } else if (action === 'next') {
          void this.videoQueue.next();
        } else if (action === 'prev') {
          void this.videoQueue.prev();
        } else if (action === 'seek') {
          if (feedVideo.duration) {
            feedVideo.currentTime = (value / 100) * feedVideo.duration;
          }
        } else if (action === 'sync_youtube') {
          void this.videoQueue.syncYouTube();
        } else if (action === 'test_query') {
          this.calibration.triggerTestQuery();
        } else if (action === 'set_video_mode') {
          this.videoQueue.setMode(value);
        } else if (action === 'toggle_quota_protection') {
          void this.videoQueue.toggleQuotaProtection(value);
        } else if (action === 'apply_preset') {
          this.calibration.applyPreset(value);
        } else if (action === 'save_disk') {
          this.calibration.loadSaved();
        }
      } else if (msg.type === 'STATE_PATCH') {
        const patch = msg.payload;
        const store = useAppStore.getState();
        if (patch.shaders) store.patchShaders(patch.shaders);
        if (patch.frames) store.setFrames(patch.frames);
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
        if (patch.debugOverlay !== undefined) store.setDebugOverlay(patch.debugOverlay);
        if (patch.debugViewMode !== undefined) store.setDebugViewMode(patch.debugViewMode);
      }
    });

    // Keyboard shortcut 'O' / 'Ctrl+Shift+O' to pop out parallel calibration console
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const chord = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o';
      if (e.key.toLowerCase() === 'o' || chord) {
        e.preventDefault();
        window.open('/calibration.html', 'vfeed_calib_window', 'width=1200,height=880');
      }
    });

    this.bindPerfControls();

    await this.refreshDiagnostics();
    this.bindUnlock();

    // Unlock audio on initial user gesture or screen interaction
    const unlockAudioOnGesture = async () => {
      try {
        await this.audio.unlock(feedVideo);
      } catch (err) {
        console.warn('[v-feed] Audio gesture unlock warning:', err);
      }
    };
    window.addEventListener('click', unlockAudioOnGesture, { once: true });
    window.addEventListener('keydown', unlockAudioOnGesture, { once: true });
    window.addEventListener('pointerdown', unlockAudioOnGesture, { once: true });

    void this.videoQueue.init();

    useAppStore.subscribe((state, prev) => {
      if (state.tracking.mirrorCamera !== prev.tracking.mirrorCamera) {
        this.camera?.setMirror(state.tracking.mirrorCamera);
      }
      if (state.tracking.cameraRotation !== prev.tracking.cameraRotation) {
        this.camera?.setRotation(state.tracking.cameraRotation);
      }
      if (state.tracking.maxNumPoses !== prev.tracking.maxNumPoses) {
        void this.tracker?.setMaxNumPoses(state.tracking.maxNumPoses);
      }
    });

    this.running = true;
    this.lastTs = performance.now();
    this.lastTelemetryTs = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      const dt = ts - this.lastTs;
      this.lastTs = ts;
      this.debug?.markFrame(dt);

      let frame = null;
      const trackingState = useAppStore.getState().tracking;
      const camSource = this.camera ? this.camera.updateFrame(trackingState.cameraRotation) : null;

      if (this.trackerReady && this.tracker && camSource) {
        frame = this.tracker.detect(
          camSource,
          trackingState.mirrorCamera,
        );
        this.interaction.update(frame, camSource);
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

      // Stream live telemetry tick to operator console every 50ms (20Hz)
      if (ts - this.lastTelemetryTs > 50) {
        this.lastTelemetryTs = ts;
        this.sendTelemetryTick(feedVideo);
      }

      this.skeleton?.draw(frame);
      this.scene?.render();

      // Debug overlay rendering & cross-window streaming to calibration console
      const curStore = useAppStore.getState();
      if (curStore.debugOverlay && this.debug && this.debugCanvas) {
        const now = performance.now();
        if (!this.sendingDebugFrame && now - this.lastDebugFrameTs >= 33) {
          this.lastDebugFrameTs = now;
          this.sendingDebugFrame = true;
          this.debug.draw(frame, camSource, feedVideo);
          createImageBitmap(this.debugCanvas)
            .then((bmp) => {
              try {
                syncChannel.sendDebugFrame(bmp);
              } catch {
                const dataUrl = this.debugCanvas?.toDataURL('image/jpeg', 0.65);
                if (dataUrl) syncChannel.sendDebugFrame(dataUrl);
              }
            })
            .catch(() => {
              try {
                const dataUrl = this.debugCanvas?.toDataURL('image/jpeg', 0.65);
                if (dataUrl) syncChannel.sendDebugFrame(dataUrl);
              } catch {}
            })
            .finally(() => {
              this.sendingDebugFrame = false;
            });
        }
      }

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
    const trackingState = useAppStore.getState().tracking;
    const camResult = await this.camera.start(
      trackingState.mirrorCamera,
      trackingState.cameraRotation,
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
      const fv = document.querySelector<HTMLVideoElement>('#feed-video') ?? undefined;
      await this.audio.unlock(fv);
    } catch (err) {
      console.warn('[v-feed] Audio unlock failed:', err);
    }

    try {
      const maxPoses = useAppStore.getState().tracking.maxNumPoses || 4;
      await this.tracker?.init(maxPoses);
      this.trackerReady = true;
    } catch (err) {
      console.warn('[v-feed] MediaPipe init failed:', err);
    }

    await this.videoQueue.playCurrent();
    this.unlocking = false;
  }

  private sendTelemetryTick(feedVideo: HTMLVideoElement): void {
    const curState = useAppStore.getState();
    const curInter = curState.interaction;
    const curSh = curState.shaders;
    syncChannel.sendTelemetry({
      fps: curState.fps,
      tracking: {
        present: curState.tracking.present,
        distance: curState.tracking.distance,
        personCount: curState.tracking.personCount,
        screenPresences: curState.tracking.screenPresences,
        antennaLocks: curSh.screenSignalLocks || Array(6).fill(curSh.signalLock),
        antennaNoises: curSh.screenNoiseGains || Array(6).fill(curSh.noiseGain),
      },
      interaction: {
        activePose: curInter.activePose,
        densityState: curInter.densityState,
        kineticState: curInter.kineticState,
        chromaState: curInter.chromaState,
        kineticEnergy: curInter.kineticEnergy,
        holdProgress: curInter.holdProgress,
        isHolding: curInter.isHolding,
        cooldownRemainingSec: curInter.cooldownRemainingSec,
        lastQuery: curInter.lastQuery,
        lastTriggerReason: curInter.lastTriggerReason,
      },
      quota: curState.quota,
      video: {
        title: this.videoQueue.currentTitle,
        channelTitle: this.videoQueue.currentItem?.channelTitle,
        currentTime: feedVideo.currentTime || 0,
        duration: feedVideo.duration || 0,
        paused: feedVideo.paused,
        videoMode: curState.videoMode,
        url: this.videoQueue.currentItem?.url,
        query: this.videoQueue.currentQuery,
      },
    });
  }

  private bindPerfControls(): void {
    // 1. Keyboard shortcut 'Q' to stop active performance test
    this.perfKeyHandler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        void this.handlePerfStopAction();
      }
    };
    window.addEventListener('keydown', this.perfKeyHandler);

    // 2. Floating on-screen Stop Test button / status indicator
    this.perfBadgeEl = document.createElement('button');
    this.perfBadgeEl.id = 'perf-stop-badge';
    this.perfBadgeEl.style.cssText = [
      'position: fixed',
      'bottom: 18px',
      'right: 18px',
      'z-index: 99999',
      'background: #ff0055',
      'color: #ffffff',
      'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-size: 11px',
      'font-weight: bold',
      'letter-spacing: 0.05em',
      'padding: 8px 14px',
      'border-radius: 4px',
      'border: 1px solid rgba(255, 255, 255, 0.4)',
      'box-shadow: 0 4px 12px rgba(255, 0, 85, 0.4)',
      'cursor: pointer',
      'display: none',
      'transition: transform 0.15s ease',
    ].join('; ');
    this.perfBadgeEl.textContent = '⏹ STOP PERF TEST [Q]';
    this.perfBadgeEl.onclick = () => void this.handlePerfStopAction();
    document.body.appendChild(this.perfBadgeEl);

    // Check status every 4 seconds to show/hide badge
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/perf/status');
        if (res.ok) {
          const data = await res.json();
          if (this.perfBadgeEl) {
            this.perfBadgeEl.style.display = data?.status?.isRunning ? 'block' : 'none';
          }
        }
      } catch {
        /* ignore */
      }
    };
    void checkStatus();
    this.perfPollTimer = window.setInterval(checkStatus, 4000);
  }

  private async handlePerfStopAction(): Promise<void> {
    try {
      const statusRes = await fetch('/api/perf/status');
      if (!statusRes.ok) return;
      const statusData = await statusRes.json();

      if (!statusData?.status?.isRunning) {
        this.showToast('ℹ️ Performance test is idle. Run "npm run test:perf" to start a test.', 3000);
        return;
      }

      const stopRes = await fetch('/api/perf/stop', { method: 'POST' });
      if (stopRes.ok) {
        const stopData = await stopRes.json();
        if (this.perfBadgeEl) this.perfBadgeEl.style.display = 'none';
        const filename = stopData.reportPath ? stopData.reportPath.split('/').pop() : 'perf-report-latest.md';
        this.showToast(`🛑 Performance Test Stopped! Report saved: ${filename}`, 8000);
        console.log(`[v-feed perf] Test stopped via 'q' key. Report saved to: ${stopData.reportPath}`);
      }
    } catch (err) {
      console.warn('[v-feed perf] Failed to stop test session:', err);
    }
  }

  private showToast(message: string, durationMs = 4000): void {
    const existing = document.querySelector('#vfeed-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'vfeed-toast';
    toast.style.cssText = [
      'position: fixed',
      'top: 24px',
      'left: 50%',
      'transform: translateX(-50%)',
      'z-index: 100000',
      'background: #12141a',
      'color: #3ddc97',
      'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-size: 13px',
      'padding: 10px 20px',
      'border-radius: 6px',
      'border: 1px solid #3ddc97',
      'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6)',
      'pointer-events: none',
      'transition: opacity 0.3s ease',
    ].join('; ');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.perfKeyHandler) {
      window.removeEventListener('keydown', this.perfKeyHandler);
    }
    if (this.perfPollTimer) {
      clearInterval(this.perfPollTimer);
    }
    if (this.perfBadgeEl) {
      this.perfBadgeEl.remove();
      this.perfBadgeEl = null;
    }
    this.unsubscribeSync?.();
    this.gridTex?.dispose();
    this.calibration.dispose();
    this.videoQueue.dispose();
    this.audio.dispose();
    this.interaction.reset();
    this.tracker?.dispose();
    this.camera?.stop();
    this.scene?.dispose();
    if (this.debugCanvas) {
      this.debugCanvas.width = 0;
      this.debugCanvas.height = 0;
      this.debugCanvas = null;
    }
    this.debug = null;
  }
}
