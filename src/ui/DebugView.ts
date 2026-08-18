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

    if (frame?.landmarks) {
      this.ctx.fillStyle = '#3ddc97';
      for (const p of frame.landmarks) {
        this.ctx.beginPath();
        this.ctx.arc(p.x * width, p.y * height, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    const fps = useAppStore.getState().fps;
    this.ctx.fillStyle = '#e8e4d9';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`${fps} FPS`, 8, 16);
    this.ctx.fillText(
      useAppStore.getState().tracking.present ? 'PRESENT' : 'IDLE',
      8,
      32,
    );
  }
}
