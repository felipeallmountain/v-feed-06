import { getViewportSize, MAX_DEVICE_PIXEL_RATIO } from '../core/constants';
import { useAppStore, type SkeletonStyle } from '../core/StateManager';
import type { TrackerFrame } from '../vision/MediaPipeTracker';

const POSE_CONNECTIONS: Array<[number, number]> = [
  // Torso & Shoulders
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left Arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  // Right Arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  // Left Leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right Leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
  // Face / Neck frame
  [9, 10],
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
];

const HAND_CONNECTIONS: Array<[number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm Base
  [5, 9],
  [9, 13],
  [13, 17],
];

interface StyleConfig {
  stroke: string;
  glow: string;
  joint: string;
  handStroke: string;
  handJoint: string;
  ghostStroke: string;
}

const STYLE_PALETTES: Record<SkeletonStyle, StyleConfig> = {
  phosphor: {
    stroke: '#3ddc97',
    glow: 'rgba(61, 220, 151, 0.7)',
    joint: '#a3ffdb',
    handStroke: '#00ffa3',
    handJoint: '#ffffff',
    ghostStroke: 'rgba(255, 0, 128, 0.4)',
  },
  cyan: {
    stroke: '#00f3ff',
    glow: 'rgba(0, 243, 255, 0.7)',
    joint: '#b3f8ff',
    handStroke: '#70f6ff',
    handJoint: '#ffffff',
    ghostStroke: 'rgba(255, 60, 0, 0.4)',
  },
  amber: {
    stroke: '#ffb703',
    glow: 'rgba(255, 183, 3, 0.7)',
    joint: '#ffe6a7',
    handStroke: '#ff9e00',
    handJoint: '#ffffff',
    ghostStroke: 'rgba(0, 200, 255, 0.4)',
  },
  magenta: {
    stroke: '#ff007f',
    glow: 'rgba(255, 0, 127, 0.7)',
    joint: '#ffb3d9',
    handStroke: '#ff3399',
    handJoint: '#ffffff',
    ghostStroke: 'rgba(0, 255, 150, 0.4)',
  },
};

export class SkeletonOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Skeleton canvas context unsupported');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const { width, height } = getViewportSize();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  private getJitteredPoint(
    x: number,
    y: number,
    idx: number,
    jitterScale: number,
    width: number,
  ): { x: number; y: number } {
    if (jitterScale <= 0) return { x, y };

    const time = performance.now() * 0.02;
    const amp = jitterScale * 28 * (width / 1080);

    // Fast trigonometric + pseudorandom signal displacement
    const jx = Math.sin(time * 1.7 + idx * 5.3) * amp + (Math.random() - 0.5) * amp * 0.7;
    const jy = Math.cos(time * 2.1 + idx * 3.7) * amp + (Math.random() - 0.5) * amp * 0.7;

    return { x: x + jx, y: y + jy };
  }

  private drawJitteredLine(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    jitterScale: number,
    width: number,
  ): void {
    if (jitterScale < 0.15) {
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
      return;
    }

    // Subdivide line with noisy electrical displacement
    const steps = 3;
    const amp = jitterScale * 14 * (width / 1080);
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);

    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const mx = p1.x + (p2.x - p1.x) * t + (Math.random() - 0.5) * amp;
      const my = p1.y + (p2.y - p1.y) * t + (Math.random() - 0.5) * amp;
      this.ctx.lineTo(mx, my);
    }

    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.stroke();
  }

  draw(frame: TrackerFrame | null): void {
    const {
      skeletonOverlay,
      skeletonStyle,
      skeletonLineThickness,
      skeletonLineOpacity,
      skeletonDotSize,
      skeletonDotOpacity,
      skeletonShowLines,
      skeletonShowDots,
      skeletonJitter,
    } = useAppStore.getState();

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (
      !skeletonOverlay ||
      (!skeletonShowLines && !skeletonShowDots) ||
      !frame ||
      !frame.present
    ) {
      return;
    }

    const palette = STYLE_PALETTES[skeletonStyle] || STYLE_PALETTES.phosphor;
    const lineWidth = skeletonLineThickness * (w / 1080);
    const dotRadius = skeletonDotSize * (w / 1080);

    this.ctx.save();
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = palette.glow;

    // 1. Draw Body Pose Skeleton
    if (frame.landmarks && frame.landmarks.length > 0) {
      const lm = frame.landmarks;
      const jitteredLms = lm.map((p, idx) => {
        const rawX = p.x * w;
        const rawY = p.y * h;
        return {
          ...p,
          pt: this.getJitteredPoint(rawX, rawY, idx, skeletonJitter, w),
        };
      });

      // Draw Pose Lines
      if (skeletonShowLines) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonLineOpacity, 0), 1);
        this.ctx.strokeStyle = palette.stroke;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Draw RGB split ghost lines if noise is high
        if (skeletonJitter > 0.4) {
          this.ctx.strokeStyle = palette.ghostStroke;
          const ghostOffset = skeletonJitter * 8 * (w / 1080);
          for (const [i, j] of POSE_CONNECTIONS) {
            const p1 = jitteredLms[i];
            const p2 = jitteredLms[j];
            if (p1 && p2 && (p1.visibility ?? 1) > 0.1 && (p2.visibility ?? 1) > 0.1) {
              const g1 = { x: p1.pt.x + ghostOffset, y: p1.pt.y - ghostOffset * 0.5 };
              const g2 = { x: p2.pt.x + ghostOffset, y: p2.pt.y - ghostOffset * 0.5 };
              this.drawJitteredLine(g1, g2, skeletonJitter * 0.5, w);
            }
          }
          this.ctx.strokeStyle = palette.stroke;
        }

        for (const [i, j] of POSE_CONNECTIONS) {
          const p1 = jitteredLms[i];
          const p2 = jitteredLms[j];
          if (p1 && p2 && (p1.visibility ?? 1) > 0.1 && (p2.visibility ?? 1) > 0.1) {
            this.drawJitteredLine(p1.pt, p2.pt, skeletonJitter, w);
          }
        }
        this.ctx.restore();
      }

      // Draw Pose Dots
      if (skeletonShowDots) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonDotOpacity, 0), 1);
        this.ctx.fillStyle = palette.joint;
        for (const p of jitteredLms) {
          if ((p.visibility ?? 1) > 0.3) {
            const r = dotRadius * (1.0 + Math.random() * skeletonJitter * 0.4);
            this.ctx.beginPath();
            this.ctx.arc(p.pt.x, p.pt.y, r, 0, Math.PI * 2);
            this.ctx.fill();

            // Extra noise spark particles on high jitter
            if (skeletonJitter > 0.3 && Math.random() < skeletonJitter * 0.5) {
              const sparkX = p.pt.x + (Math.random() - 0.5) * 16 * (w / 1080);
              const sparkY = p.pt.y + (Math.random() - 0.5) * 16 * (w / 1080);
              this.ctx.fillRect(sparkX, sparkY, lineWidth, lineWidth);
            }
          }
        }
        this.ctx.restore();
      }
    }

    // 2. Draw Hand Skeletons
    const hands = [frame.leftHand, frame.rightHand];
    let handIdx = 100;
    for (const handLms of hands) {
      handIdx += 50;
      if (!handLms || handLms.length === 0) continue;

      const jitteredHand = handLms.map((p, idx) => {
        const rawX = p.x * w;
        const rawY = p.y * h;
        return {
          ...p,
          pt: this.getJitteredPoint(rawX, rawY, handIdx + idx, skeletonJitter * 0.85, w),
        };
      });

      if (skeletonShowLines) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonLineOpacity, 0), 1);
        this.ctx.strokeStyle = palette.handStroke;
        this.ctx.lineWidth = lineWidth * 0.85;

        for (const [i, j] of HAND_CONNECTIONS) {
          const p1 = jitteredHand[i];
          const p2 = jitteredHand[j];
          if (p1 && p2) {
            this.drawJitteredLine(p1.pt, p2.pt, skeletonJitter * 0.6, w);
          }
        }
        this.ctx.restore();
      }

      if (skeletonShowDots) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonDotOpacity, 0), 1);
        this.ctx.fillStyle = palette.handJoint;
        for (const p of jitteredHand) {
          const r = dotRadius * 0.7 * (1.0 + Math.random() * skeletonJitter * 0.3);
          this.ctx.beginPath();
          this.ctx.arc(p.pt.x, p.pt.y, r, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      }
    }

    this.ctx.restore();
  }
}
