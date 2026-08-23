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

  draw(frame: TrackerFrame | null, webcam: HTMLVideoElement): void {
    const show = useAppStore.getState().debugOverlay;
    this.canvas.classList.toggle('visible', show);
    if (!show) return;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);

    if (webcam.readyState >= 2) {
      this.ctx.save();
      if (useAppStore.getState().tracking.mirrorCamera) {
        this.ctx.translate(width, 0);
        this.ctx.scale(-1, 1);
      }
      this.ctx.drawImage(webcam, 0, 0, width, height);
      this.ctx.restore();
    }

    // Draw 2x3 CRT Matrix overlay guide lines
    if (useAppStore.getState().shaders.matrixSplit) {
      this.ctx.strokeStyle = 'rgba(240, 165, 0, 0.4)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(width * 0.5, 0);
      this.ctx.lineTo(width * 0.5, height);
      this.ctx.moveTo(0, height * (1 / 3));
      this.ctx.lineTo(width, height * (1 / 3));
      this.ctx.moveTo(0, height * (2 / 3));
      this.ctx.lineTo(width, height * (2 / 3));
      this.ctx.stroke();
    }

    if (frame?.landmarks) {
      this.ctx.fillStyle = '#3ddc97';
      for (const p of frame.landmarks) {
        this.ctx.beginPath();
        this.ctx.arc(p.x * width, p.y * height, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    const state = useAppStore.getState();
    const fps = state.fps;
    this.ctx.fillStyle = '#e8e4d9';
    this.ctx.font = '11px monospace';
    this.ctx.fillText(`${fps} FPS`, 8, 16);
    this.ctx.fillText(
      state.tracking.present ? 'PRESENT' : 'IDLE',
      8,
      30,
    );
    this.ctx.fillText(
      `DIST: ${state.tracking.distance.toFixed(2)}m`,
      8,
      44,
    );
  }
}
