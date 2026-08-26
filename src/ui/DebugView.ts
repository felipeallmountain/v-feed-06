import { useAppStore } from '../core/StateManager';
import type { TrackerFrame } from '../vision/MediaPipeTracker';

export class DebugView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fpsFrames: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Debug canvas unsupported');
    this.ctx = ctx;
  }

  markFrame(dtMs: number): void {
    this.fpsFrames.push(1000 / Math.max(dtMs, 0.001));
    if (this.fpsFrames.length > 30) this.fpsFrames.shift();
    const fps =
      this.fpsFrames.reduce((a, b) => a + b, 0) / this.fpsFrames.length;
    useAppStore.getState().setFps(Math.round(fps));
  }

  draw(
    frame: TrackerFrame | null,
    webcam: HTMLVideoElement,
    feedVideo?: HTMLVideoElement | null,
  ): void {
    const state = useAppStore.getState();
    const show = state.debugOverlay;
    this.canvas.classList.toggle('visible', show);
    if (!show) return;

    const mode = state.debugViewMode || 'video';
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#06070a';
    this.ctx.fillRect(0, 0, width, height);

    if (mode === 'split') {
      const halfW = Math.floor(width / 2);
      // Left: Camera
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, halfW, height);
      this.ctx.clip();
      this.drawCamera(0, 0, halfW, height, frame, webcam, state.tracking.mirrorCamera);
      this.ctx.restore();

      // Divider line
      this.ctx.strokeStyle = '#222633';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(halfW, 0);
      this.ctx.lineTo(halfW, height);
      this.ctx.stroke();

      // Right: Video
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(halfW, 0, halfW, height);
      this.ctx.clip();
      this.drawVideo(halfW, 0, halfW, height, feedVideo, state.shaders.matrixSplit);
      this.ctx.restore();

      // Header labels
      this.ctx.font = '10px monospace';
      this.ctx.fillStyle = '#3ddc97';
      this.ctx.fillText('CAM/TRACKING', 6, 14);
      this.ctx.fillStyle = '#00e5ff';
      this.ctx.fillText('YOUTUBE SHORT', halfW + 6, 14);
    } else if (mode === 'video') {
      this.drawVideo(0, 0, width, height, feedVideo, state.shaders.matrixSplit);
    } else {
      this.drawCamera(0, 0, width, height, frame, webcam, state.tracking.mirrorCamera);
    }

    // Telemetry text overlay
    this.drawTelemetry(state);
  }

  private drawCamera(
    x: number,
    y: number,
    w: number,
    h: number,
    frame: TrackerFrame | null,
    webcam: HTMLVideoElement,
    mirror: boolean,
  ): void {
    if (webcam.readyState >= 2) {
      this.ctx.save();
      if (mirror) {
        this.ctx.translate(x + w, y);
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(webcam, 0, 0, w, h);
      } else {
        this.ctx.drawImage(webcam, x, y, w, h);
      }
      this.ctx.restore();
    }

    // Draw 2x3 matrix antenna quadrant guides in camera view
    if (useAppStore.getState().shaders.matrixSplit) {
      this.ctx.strokeStyle = 'rgba(61, 220, 151, 0.25)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x + w * 0.5, y);
      this.ctx.lineTo(x + w * 0.5, y + h);
      this.ctx.moveTo(x, y + h * (1 / 3));
      this.ctx.lineTo(x + w, y + h * (1 / 3));
      this.ctx.moveTo(x, y + h * (2 / 3));
      this.ctx.lineTo(x + w, y + h * (2 / 3));
      this.ctx.stroke();
    }

    const poses =
      frame?.poses && frame.poses.length > 0
        ? frame.poses
        : frame?.landmarks
          ? [frame.landmarks]
          : [];

    for (const lm of poses) {
      this.ctx.fillStyle = '#3ddc97';
      for (const p of lm) {
        this.ctx.beginPath();
        const px = mirror ? x + (1 - p.x) * w : x + p.x * w;
        const py = y + p.y * h;
        this.ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawVideo(
    x: number,
    y: number,
    w: number,
    h: number,
    feedVideo?: HTMLVideoElement | null,
    matrixSplit = true,
  ): void {
    if (feedVideo && feedVideo.readyState >= 2) {
      const vw = feedVideo.videoWidth || 1080;
      const vh = feedVideo.videoHeight || 1920;
      const videoAspect = vw / vh;
      const slotAspect = w / h;

      let drawW = w;
      let drawH = h;
      let drawX = x;
      let drawY = y;

      if (videoAspect < slotAspect) {
        // Vertical video letterboxed horizontally
        drawW = h * videoAspect;
        drawX = x + (w - drawW) / 2;
      } else {
        // Letterboxed vertically
        drawH = w / videoAspect;
        drawY = y + (h - drawH) / 2;
      }

      this.ctx.drawImage(feedVideo, drawX, drawY, drawW, drawH);

      // Draw 2x3 CRT Matrix overlay guide lines
      if (matrixSplit) {
        this.ctx.strokeStyle = 'rgba(240, 165, 0, 0.45)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Vertical center line (2 columns)
        this.ctx.moveTo(drawX + drawW * 0.5, drawY);
        this.ctx.lineTo(drawX + drawW * 0.5, drawY + drawH);
        // Horizontal lines (3 rows)
        this.ctx.moveTo(drawX, drawY + drawH * (1 / 3));
        this.ctx.lineTo(drawX + drawW, drawY + drawH * (1 / 3));
        this.ctx.moveTo(drawX, drawY + drawH * (2 / 3));
        this.ctx.lineTo(drawX + drawW, drawY + drawH * (2 / 3));
        this.ctx.stroke();

        // 6-screen quadrant labels with antenna signal lock meters
        this.ctx.font = '8px monospace';
        const qW = drawW / 2;
        const qH = drawH / 3;
        const sh = useAppStore.getState().shaders;

        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 2; c++) {
            const screenIdx = r * 2 + c;
            const idx = screenIdx + 1;
            const lockPct = Math.round(
              (sh.screenSignalLocks?.[screenIdx] ?? sh.signalLock ?? 0) * 100,
            );
            const noisePct = Math.round(
              (sh.screenNoiseGains?.[screenIdx] ?? sh.noiseGain ?? 1) * 100,
            );

            const qX = drawX + c * qW;
            const qY = drawY + r * qH;

            // Quadrant name
            this.ctx.fillStyle = 'rgba(240, 165, 0, 0.85)';
            this.ctx.fillText(`CRT [0${idx}]`, qX + 4, qY + 10);

            // Antenna Lock % badge with color coding
            const lockColor =
              lockPct > 70 ? '#3ddc97' : lockPct > 30 ? '#ffb703' : '#ff3366';
            this.ctx.fillStyle = lockColor;
            this.ctx.fillText(
              `ANT:${lockPct}% N:${noisePct}%`,
              qX + 4,
              qY + 20,
            );

            // Mini antenna reception signal bar
            const barW = Math.max(20, qW - 12);
            const barH = 2;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(qX + 4, qY + 23, barW, barH);
            this.ctx.fillStyle = lockColor;
            this.ctx.fillRect(qX + 4, qY + 23, (barW * lockPct) / 100, barH);
          }
        }
      }

      // Video status badge
      const isPaused = feedVideo.paused;
      const statusText = isPaused ? '⏸ PAUSED' : '▶ LIVE FEED';
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      this.ctx.fillRect(drawX + 4, drawY + drawH - 18, 120, 14);
      this.ctx.fillStyle = isPaused ? '#f0a500' : '#3ddc97';
      this.ctx.font = '9px monospace';
      this.ctx.fillText(statusText, drawX + 8, drawY + drawH - 7);
    } else {
      // Waiting for video feed
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.fillRect(x, y, w, h);
      this.ctx.fillStyle = '#8a92a6';
      this.ctx.font = '10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('NO ACTIVE VIDEO FEED', x + w / 2, y + h / 2);
      this.ctx.textAlign = 'left';
    }
  }

  private drawTelemetry(state: ReturnType<typeof useAppStore.getState>): void {
    const { width, height } = this.canvas;
    const inter = state.interaction;

    // Bottom telemetry status strip
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(0, height - 24, width, 24);

    this.ctx.fillStyle = '#e8e4d9';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(`${state.fps} FPS`, 6, height - 9);

    const modeLabel = `MODE: ${state.videoMode.toUpperCase()}`;
    this.ctx.fillText(modeLabel, 60, height - 9);

    const peopleCount = state.tracking.personCount || (state.tracking.present ? 1 : 0);
    const trackLabel = state.tracking.present
      ? `PEOPLE: ${peopleCount} (${state.tracking.distance.toFixed(1)}m)`
      : 'USER: IDLE';
    this.ctx.fillStyle = state.tracking.present ? '#3ddc97' : '#8a92a6';
    this.ctx.fillText(trackLabel, width - 130, height - 9);

    // Top interaction telemetry HUD overlay
    if (inter) {
      const topBarH = 26;
      this.ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
      this.ctx.fillRect(0, 0, width, topBarH);

      // 1. Pose Badge
      let poseBadgeColor = '#8a92a6';
      let poseText = 'POSE: NONE';
      if (inter.activePose !== 'NONE') {
        poseBadgeColor = '#ffb703';
        poseText = `POSE: ${inter.activePose.replace('POSE_', '')}`;
      }
      this.ctx.fillStyle = poseBadgeColor;
      this.ctx.font = 'bold 9px monospace';
      this.ctx.fillText(poseText, 6, 17);

      // 2. Density & Kinetics
      this.ctx.fillStyle = '#00e5ff';
      this.ctx.font = '9px monospace';
      const densityStr = `DEN: ${inter.densityState}`;
      const kineticStr = `KIN: ${inter.kineticState} (${Math.round(inter.kineticEnergy * 100)}%)`;
      this.ctx.fillText(`${densityStr} | ${kineticStr}`, 100, 17);

      // 3. Clothing Chroma badge
      let chromaColor = '#8a92a6';
      if (inter.chromaState === 'WARM_RED') chromaColor = '#ff3366';
      else if (inter.chromaState === 'COOL_BLUE') chromaColor = '#00e5ff';
      else if (inter.chromaState === 'DARK_NEUTRAL') chromaColor = '#555566';

      this.ctx.fillStyle = chromaColor;
      this.ctx.fillRect(width - 135, 7, 8, 12);
      this.ctx.fillStyle = '#e8e4d9';
      this.ctx.fillText(`CHROMA: ${inter.chromaState}`, width - 122, 17);

      // 4. Hold & Cooldown Bar (middle overlay when holding or cooling down)
      if (inter.isHolding && inter.holdProgress > 0) {
        const barW = Math.min(220, width - 20);
        const barH = 14;
        const barX = (width - barW) / 2;
        const barY = 32;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(barX, barY, barW, barH);
        this.ctx.strokeStyle = '#3ddc97';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barW, barH);

        this.ctx.fillStyle = 'linear-gradient(90deg, #00e5ff, #3ddc97)';
        this.ctx.fillStyle = '#3ddc97';
        this.ctx.fillRect(barX + 2, barY + 2, (barW - 4) * inter.holdProgress, barH - 4);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
          `HOLDING ${inter.candidateState?.replace('POSE:', '').replace('DENSITY:', '').replace('KINETIC:', '')} (${Math.round(inter.holdProgress * 100)}%)`,
          width / 2,
          barY + 11,
        );
        this.ctx.textAlign = 'left';
      } else if (inter.cooldownRemainingSec > 0) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect((width - 140) / 2, 32, 140, 14);
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.font = '9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`COOLDOWN: ${inter.cooldownRemainingSec}s`, width / 2, 43);
        this.ctx.textAlign = 'left';
      }

      // 5. Last Synthesized Query banner
      if (inter.lastQuery) {
        this.ctx.fillStyle = 'rgba(10, 14, 22, 0.9)';
        this.ctx.fillRect(0, height - 42, width, 18);
        this.ctx.fillStyle = '#3ddc97';
        this.ctx.font = '8.5px monospace';
        this.ctx.fillText(`⚡ QUERY: "${inter.lastQuery}" [${inter.lastTriggerReason || ''}]`, 6, height - 30);
      }
    }
  }
}
