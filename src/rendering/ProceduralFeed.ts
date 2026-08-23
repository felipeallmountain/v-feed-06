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

    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, w, h);

    const colW = w / 2;
    const rowH = h / 3;
    const pad = Math.min(colW, rowH) * 0.055;
    const innerW = colW - pad * 2;
    const innerH = rowH - pad * 2;
    const lineW = Math.max(2, Math.min(colW, rowH) * 0.008);
    const fontSize = Math.max(13, Math.min(colW, rowH) * 0.065);

    const labels: [string, string][] = [
      ['V-FEED [01]', 'TOP-LEFT · RF-A'],
      ['V-FEED [02]', 'TOP-RIGHT · RF-B'],
      ['V-FEED [03]', 'MID-LEFT · OSC-1'],
      ['V-FEED [04]', 'MID-RIGHT · OSC-2'],
      ['V-FEED [05]', 'BOT-LEFT · SYNC-L'],
      ['V-FEED [06]', 'BOT-RIGHT · SYNC-R'],
    ];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const idx = r * 2 + c;
        const [tag, sub] = labels[idx];
        const cx = c * colW;
        const cy = r * rowH;

        // Subtle gradient background per piece
        const g = ctx.createLinearGradient(cx, cy, cx + colW, cy + rowH);
        g.addColorStop(0, `hsl(${((t * 15 + idx * 45) % 360)}, 30%, 10%)`);
        g.addColorStop(1, `hsl(${((t * 15 + idx * 45 + 50) % 360)}, 35%, 6%)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx + pad * 0.5, cy + pad * 0.5, colW - pad, rowH - pad);

        // Green Phosphor Frame for this piece
        ctx.strokeStyle = '#3ddc97';
        ctx.lineWidth = lineW;
        ctx.strokeRect(cx + pad, cy + pad, innerW, innerH);

        // Corner brackets on each piece's frame
        const bracketLen = Math.min(colW, rowH) * 0.08;
        const corners: [number, number, number, number][] = [
          [cx + pad, cy + pad, 1, 1],
          [cx + colW - pad, cy + pad, -1, 1],
          [cx + pad, cy + rowH - pad, 1, -1],
          [cx + colW - pad, cy + rowH - pad, -1, -1],
        ];
        ctx.strokeStyle = '#3ddc97';
        ctx.lineWidth = lineW * 1.6;
        for (const [bx, by, dx, dy] of corners) {
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + bracketLen * dx, by);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx, by + bracketLen * dy);
          ctx.stroke();
        }

        // Header Title in each piece
        ctx.fillStyle = '#3ddc97';
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillText(tag, cx + pad + 8, cy + pad + fontSize + 4);

        ctx.fillStyle = 'rgba(232, 228, 217, 0.6)';
        ctx.font = `${fontSize * 0.68}px monospace`;
        ctx.fillText(sub, cx + pad + 8, cy + pad + fontSize * 2.0 + 4);

        // Piece-specific procedural graphics
        if (r === 0) {
          // Top Screens: Dynamic animated spectrum bars
          const numBars = 8;
          const barWidth = (innerW - 16) / numBars;
          const baseY = cy + rowH - pad - 12;
          for (let b = 0; b < numBars; b++) {
            const barH = (Math.sin(t * 3.5 + b * 0.8 + idx) * 0.5 + 0.5) * (innerH * 0.35);
            ctx.fillStyle = `hsla(${((t * 25 + b * 20) % 360)}, 75%, 55%, 0.8)`;
            ctx.fillRect(cx + pad + 8 + b * barWidth, baseY - barH, barWidth - 4, barH);
          }
        } else if (r === 1) {
          // Middle Screens: Oscilloscope waveform
          ctx.strokeStyle = '#3ddc97';
          ctx.lineWidth = Math.max(1.5, lineW * 0.8);
          ctx.beginPath();
          const waveMidY = cy + rowH * 0.55;
          const waveAmp = innerH * 0.18;
          for (let x = 0; x < innerW - 16; x += 3) {
            const normX = x / (innerW - 16);
            const y = waveMidY + Math.sin(normX * Math.PI * 4 + t * 4 + idx * 2) * waveAmp * Math.cos(normX * Math.PI + t);
            if (x === 0) ctx.moveTo(cx + pad + 8 + x, y);
            else ctx.lineTo(cx + pad + 8 + x, y);
          }
          ctx.stroke();

          ctx.fillStyle = 'rgba(232, 228, 217, 0.45)';
          ctx.font = `${fontSize * 0.6}px monospace`;
          ctx.fillText('FREQ: 15.734 kHz', cx + pad + 8, cy + rowH - pad - 10);
        } else {
          // Bottom Screens: Scrolling ticker telemetry
          const barY = cy + rowH * 0.52;
          ctx.fillStyle = `hsla(${((t * 30 + idx * 50) % 360)}, 65%, 50%, 0.7)`;
          ctx.fillRect(cx + pad + 8, barY, innerW - 16, fontSize * 0.35);

          ctx.fillStyle = '#e8e4d9';
          ctx.font = `${fontSize * 0.62}px monospace`;
          const msg = ' HUMAN ANTENNA · SIGNAL TUNER · V-FEED [06] ·';
          const scroll = ((t * 40 + idx * 60) % (ctx.measureText(msg).width + innerW)) - (innerW * 0.5);
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx + pad + 8, cy + pad, innerW - 16, innerH);
          ctx.clip();
          ctx.fillText(msg + msg, cx + pad + 8 - scroll, cy + rowH - pad - 12);
          ctx.restore();
        }
      }
    }
  }

  dispose(): void {
    this.stop();
    this.texture.dispose();
  }
}
