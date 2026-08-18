import * as THREE from 'three';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../core/constants';

/**
 * Animated vertical canvas feed used when no MP4 cache is present.
 */
export class ProceduralFeed {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private t0 = performance.now();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    const tick = () => {
      if (!this.running) return;
      this.draw((performance.now() - this.t0) / 1000);
      this.texture.needsUpdate = true;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(t: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${(t * 20) % 360}, 35%, 12%)`);
    g.addColorStop(1, `hsl(${(t * 20 + 80) % 360}, 40%, 8%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Scrolling "short" content blocks
    for (let i = 0; i < 6; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col * (w / 2);
      const y = row * (h / 3);
      const cw = w / 2;
      const ch = h / 3;
      ctx.strokeStyle = i % 2 === 0 ? '#3ddc97' : '#f0a500';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 16, y + 16, cw - 32, ch - 32);
      ctx.fillStyle = 'rgba(232,228,217,0.85)';
      ctx.font = '42px monospace';
      ctx.fillText(`FEED ${(i + 1).toString().padStart(2, '0')}`, x + 36, y + 70);
      ctx.font = '22px monospace';
      ctx.fillStyle = 'rgba(232,228,217,0.45)';
      ctx.fillText('V-FEED [06] · procedural', x + 36, y + 110);

      const barY = y + ch * 0.55 + Math.sin(t * 2 + i) * 40;
      ctx.fillStyle = `hsla(${(t * 40 + i * 40) % 360}, 70%, 55%, 0.7)`;
      ctx.fillRect(x + 40, barY, cw - 80, 18);
    }

    // Moving ticker
    ctx.fillStyle = '#e8e4d9';
    ctx.font = '28px monospace';
    const msg = '  HUMAN ANTENNA  ·  ANALOG LOCK  ·  SHORTS → CRT  ·';
    const scroll = ((t * 80) % (ctx.measureText(msg).width + w)) - w;
    ctx.fillText(msg + msg, scroll, h - 48);
  }

  dispose(): void {
    this.stop();
    this.texture.dispose();
  }
}
