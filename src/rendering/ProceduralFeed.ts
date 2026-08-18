import * as THREE from 'three';

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

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture.needsUpdate = true;
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

    const pad = Math.min(w, h) * 0.04;
    ctx.strokeStyle = '#3ddc97';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    const fontSize = Math.max(24, Math.min(w, h) * 0.04);
    ctx.fillStyle = '#e8e4d9';
    ctx.font = `${fontSize}px monospace`;
    ctx.fillText('V-FEED [06]', pad * 2, pad * 2 + fontSize);

    ctx.font = `${fontSize * 0.55}px monospace`;
    ctx.fillStyle = 'rgba(232,228,217,0.45)';
    ctx.fillText('procedural feed', pad * 2, pad * 2 + fontSize * 1.7);

    const barY = h * 0.55 + Math.sin(t * 2) * h * 0.04;
    ctx.fillStyle = `hsla(${(t * 40) % 360}, 70%, 55%, 0.7)`;
    ctx.fillRect(pad * 2, barY, w - pad * 4, fontSize * 0.5);

    ctx.fillStyle = '#e8e4d9';
    ctx.font = `${fontSize * 0.65}px monospace`;
    const msg = '  HUMAN ANTENNA  ·  ANALOG LOCK  ·  SHORTS → CRT  ·';
    const scroll = ((t * 80) % (ctx.measureText(msg).width + w)) - w;
    ctx.fillText(msg + msg, scroll, h - pad * 2);
  }

  dispose(): void {
    this.stop();
    this.texture.dispose();
  }
}
