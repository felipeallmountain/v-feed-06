import { getViewportSize, MAX_DEVICE_PIXEL_RATIO } from '../core/constants';
import { useAppStore, type SkeletonStyle } from '../core/StateManager';
import { computeAllScreenCorners } from './MatrixSplitter';
import type { TrackerFrame } from '../vision/MediaPipeTracker';
import { SCREEN_POSE_MAP, POSE_DISPLAY_NAMES } from '../vision/BroadcastQuerySynthesizer';

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

interface QuadPoints {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
}

export class SkeletonOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private smoothedPoses: Array<Array<{ x: number; y: number }>> = [];
  private smoothedHands: Array<Array<{ x: number; y: number }>> = [];

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
    if (jitterScale <= 0.005) return { x, y };

    const time = performance.now() * 0.02;
    const amp = jitterScale * 28 * (width / 1080);

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

  /**
   * Draws a multi-stage high-voltage jagged lightning arc between two points.
   */
  private drawLightningArc(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    zapIntensity: number,
    width: number,
    baseColor: string = '#00f0ff',
  ): void {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;

    const nx = -dy / dist;
    const ny = dx / dist;

    const steps = Math.max(4, Math.min(8, Math.round(dist / 35)));
    const amp = zapIntensity * 22 * (width / 1080);

    const pts: Array<{ x: number; y: number }> = [{ x: p1.x, y: p1.y }];
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const offset = (Math.random() - 0.5) * amp * Math.sin(t * Math.PI);
      const jx = (Math.random() - 0.5) * amp * 0.35;
      const jy = (Math.random() - 0.5) * amp * 0.35;
      pts.push({
        x: p1.x + dx * t + nx * offset + jx,
        y: p1.y + dy * t + ny * offset + jy,
      });
    }
    pts.push({ x: p2.x, y: p2.y });

    // Pass 1: Outer Electric Plasma Glow Aura
    this.ctx.save();
    this.ctx.shadowBlur = 18;
    this.ctx.shadowColor = baseColor;
    this.ctx.strokeStyle = baseColor;
    this.ctx.lineWidth = Math.max(2.5, 4.2 * (width / 1080) * zapIntensity);
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      this.ctx.lineTo(pts[i].x, pts[i].y);
    }
    this.ctx.stroke();

    // Pass 2: White-Hot Core Lightning Bolt
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = '#ffffff';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = Math.max(1.2, 2.0 * (width / 1080));
    this.ctx.stroke();

    // 25% chance of secondary branching fork spark
    if (Math.random() < 0.28 && pts.length > 3) {
      const forkIdx = Math.floor(1 + Math.random() * (pts.length - 2));
      const fpt = pts[forkIdx];
      const forkAngle = Math.atan2(dy, dx) + (Math.random() > 0.5 ? 0.7 : -0.7);
      const forkLen = (12 + Math.random() * 24) * (width / 1080) * zapIntensity;
      this.ctx.beginPath();
      this.ctx.moveTo(fpt.x, fpt.y);
      this.ctx.lineTo(
        fpt.x + Math.cos(forkAngle) * forkLen,
        fpt.y + Math.sin(forkAngle) * forkLen,
      );
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = Math.max(0.8, 1.4 * (width / 1080));
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Emits radial plasma sparks and electric bursts around key skeleton joints during zap.
   */
  private drawPlasmaJointSparks(
    pt: { x: number; y: number },
    zapIntensity: number,
    width: number,
    glowColor: string = '#00f0ff',
  ): void {
    const sparkCount = Math.floor(4 + Math.random() * 5);
    const maxR = zapIntensity * 26 * (width / 1080);

    this.ctx.save();
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = glowColor;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = Math.max(0.8, 1.4 * (width / 1080));

    this.ctx.beginPath();
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * maxR;
      const sx = pt.x + Math.cos(angle) * r;
      const sy = pt.y + Math.sin(angle) * r;
      this.ctx.moveTo(pt.x, pt.y);
      this.ctx.lineTo(sx, sy);
    }
    this.ctx.stroke();

    // Hot central plasma core
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(pt.x, pt.y, Math.max(2, 3.5 * (width / 1080)), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Bilinear quad interpolation mapping local (u, v) in [0, 1]^2 to pixel space
   * across the 4 pinned corners (TL, TR, BR, BL).
   */
  private quadBilinear(u: number, v: number, quad: QuadPoints): { x: number; y: number } {
    const topX = quad.tl.x + (quad.tr.x - quad.tl.x) * u;
    const topY = quad.tl.y + (quad.tr.y - quad.tl.y) * u;
    const botX = quad.bl.x + (quad.br.x - quad.bl.x) * u;
    const botY = quad.bl.y + (quad.br.y - quad.bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  }

  /**
   * Computes a point on the screen quad, accounting for TV tube barrel curvature,
   * inset padding, and corner pinning.
   */
  private getCurvedQuadPoint(
    uNorm: number,
    vNorm: number,
    quad: QuadPoints,
    inset: number,
    curvature: number,
    scale = 1.0,
  ): { x: number; y: number } {
    let uc = (uNorm - 0.5) * 2.0;
    let vc = (vNorm - 0.5) * 2.0;

    if (curvature > 0.001) {
      const r2 = uc * uc * 0.55 + vc * vc * 0.45;
      const factor = 1.0 + r2 * curvature * 0.32;
      uc = uc / factor;
      vc = vc / factor;
    }

    // Apply scale and inset margin
    uc *= scale;
    vc *= scale;

    const uEff = inset + (uc * 0.5 + 0.5) * (1.0 - 2.0 * inset);
    const vEff = inset + (vc * 0.5 + 0.5) * (1.0 - 2.0 * inset);

    return this.quadBilinear(uEff, vEff, quad);
  }

  /**
   * Traces a continuous curved path following the convex spherical shape of the CRT tube glass
   * mapped through the 4 pinned corners.
   */
  private traceCurvedTubeQuad(
    quad: QuadPoints,
    inset: number,
    curve: number,
    cr: number,
    scale = 1.0,
  ): void {
    const steps = 14;
    this.ctx.beginPath();

    // Start Top-Left
    let p = this.getCurvedQuadPoint(cr, 0.0, quad, inset, curve, scale);
    this.ctx.moveTo(p.x, p.y);

    // Top edge
    for (let i = 1; i <= steps; i++) {
      const u = cr + ((1.0 - 2.0 * cr) * i) / steps;
      p = this.getCurvedQuadPoint(u, 0.0, quad, inset, curve, scale);
      this.ctx.lineTo(p.x, p.y);
    }

    // TR Corner transition
    p = this.getCurvedQuadPoint(1.0, cr, quad, inset, curve, scale);
    this.ctx.lineTo(p.x, p.y);

    // Right edge
    for (let i = 1; i <= steps; i++) {
      const v = cr + ((1.0 - 2.0 * cr) * i) / steps;
      p = this.getCurvedQuadPoint(1.0, v, quad, inset, curve, scale);
      this.ctx.lineTo(p.x, p.y);
    }

    // BR Corner transition
    p = this.getCurvedQuadPoint(1.0 - cr, 1.0, quad, inset, curve, scale);
    this.ctx.lineTo(p.x, p.y);

    // Bottom edge
    for (let i = 1; i <= steps; i++) {
      const u = 1.0 - cr - ((1.0 - 2.0 * cr) * i) / steps;
      p = this.getCurvedQuadPoint(u, 1.0, quad, inset, curve, scale);
      this.ctx.lineTo(p.x, p.y);
    }

    // BL Corner transition
    p = this.getCurvedQuadPoint(0.0, 1.0 - cr, quad, inset, curve, scale);
    this.ctx.lineTo(p.x, p.y);

    // Left edge
    for (let i = 1; i <= steps; i++) {
      const v = 1.0 - cr - ((1.0 - 2.0 * cr) * i) / steps;
      p = this.getCurvedQuadPoint(0.0, v, quad, inset, curve, scale);
      this.ctx.lineTo(p.x, p.y);
    }

    this.ctx.closePath();
  }

  /**
   * Draws the 6 CRT monitor frames, following the exact corner pinning, curvature, and custom text.
   */
  private drawScreenFrames(w: number, h: number, palette: StyleConfig): void {
    const store = useAppStore.getState();
    const sh = store.shaders;
    const frames = store.frames;
    if (!sh.matrixSplit || !frames.show) return;

    // Compute all 24 pinned corners in UV space [0, 1]^2
    const uvCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    this.ctx.save();
    this.ctx.globalAlpha = Math.min(Math.max(frames.opacity, 0), 1);
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = palette.glow;
    this.ctx.strokeStyle = palette.stroke;
    this.ctx.fillStyle = palette.stroke;

    const lineWidth = Math.max(1.0, frames.thickness * (w / 1080));
    this.ctx.lineWidth = lineWidth;

    const effectiveCurvature =
      frames.followTubeCurvature && sh.tubeCurve
        ? sh.curvature * frames.curvatureScale
        : 0;

    for (let i = 0; i < 6; i++) {
      // Point order in computeAllScreenCorners: 0=BL, 1=BR, 2=TR, 3=TL in WebGL UV (y=0 bottom)
      const uvBL = uvCorners[i * 4 + 0];
      const uvBR = uvCorners[i * 4 + 1];
      const uvTR = uvCorners[i * 4 + 2];
      const uvTL = uvCorners[i * 4 + 3];

      // Convert to 2D canvas pixel space (y=0 top)
      const quad: QuadPoints = {
        tl: { x: uvTL.x * w, y: (1.0 - uvTL.y) * h },
        tr: { x: uvTR.x * w, y: (1.0 - uvTR.y) * h },
        br: { x: uvBR.x * w, y: (1.0 - uvBR.y) * h },
        bl: { x: uvBL.x * w, y: (1.0 - uvBL.y) * h },
      };

      const inset = Math.max(0.005, frames.inset);

      // 1. Draw Selected Frame Shape Style
      if (frames.shapeStyle === 'crt-tube') {
        // Full Curved CRT Tube Glass Profile
        this.traceCurvedTubeQuad(quad, inset, effectiveCurvature, frames.cornerRadius);
        this.ctx.stroke();

        // Subtle inner tube glow
        this.ctx.save();
        this.ctx.globalAlpha = frames.opacity * 0.35;
        this.ctx.lineWidth = lineWidth * 0.5;
        this.traceCurvedTubeQuad(quad, inset, effectiveCurvature, frames.cornerRadius, 0.985);
        this.ctx.stroke();
        this.ctx.restore();
      } else if (frames.shapeStyle === 'rounded-rect') {
        // Pinned Quad with rounded corners
        this.traceCurvedTubeQuad(quad, inset, 0, frames.cornerRadius);
        this.ctx.stroke();
      } else if (frames.shapeStyle === 'industrial-bezel') {
        // Double-stroke Industrial Bezel Frame mapped to pinned quad
        const pTL = this.quadBilinear(inset, inset, quad);
        const pTR = this.quadBilinear(1.0 - inset, inset, quad);
        const pBR = this.quadBilinear(1.0 - inset, 1.0 - inset, quad);
        const pBL = this.quadBilinear(inset, 1.0 - inset, quad);

        this.ctx.beginPath();
        this.ctx.moveTo(pTL.x, pTL.y);
        this.ctx.lineTo(pTR.x, pTR.y);
        this.ctx.lineTo(pBR.x, pBR.y);
        this.ctx.lineTo(pBL.x, pBL.y);
        this.ctx.closePath();
        this.ctx.stroke();

        // Inner gap line
        const ins2 = inset + 0.02;
        const pTL2 = this.quadBilinear(ins2, ins2, quad);
        const pTR2 = this.quadBilinear(1.0 - ins2, ins2, quad);
        const pBR2 = this.quadBilinear(1.0 - ins2, 1.0 - ins2, quad);
        const pBL2 = this.quadBilinear(ins2, 1.0 - ins2, quad);

        this.ctx.save();
        this.ctx.globalAlpha = frames.opacity * 0.45;
        this.ctx.beginPath();
        this.ctx.moveTo(pTL2.x, pTL2.y);
        this.ctx.lineTo(pTR2.x, pTR2.y);
        this.ctx.lineTo(pBR2.x, pBR2.y);
        this.ctx.lineTo(pBL2.x, pBL2.y);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
      }

      // 2. Draw 4 Corner Brackets (if enabled or in bracket-corners style)
      if (frames.showCornerBrackets || frames.shapeStyle === 'bracket-corners') {
        const blen = 0.09;
        const pTL = this.getCurvedQuadPoint(0.0, 0.0, quad, inset, effectiveCurvature);
        const pTL_R = this.getCurvedQuadPoint(blen, 0.0, quad, inset, effectiveCurvature);
        const pTL_B = this.getCurvedQuadPoint(0.0, blen, quad, inset, effectiveCurvature);

        const pTR = this.getCurvedQuadPoint(1.0, 0.0, quad, inset, effectiveCurvature);
        const pTR_L = this.getCurvedQuadPoint(1.0 - blen, 0.0, quad, inset, effectiveCurvature);
        const pTR_B = this.getCurvedQuadPoint(1.0, blen, quad, inset, effectiveCurvature);

        const pBR = this.getCurvedQuadPoint(1.0, 1.0, quad, inset, effectiveCurvature);
        const pBR_L = this.getCurvedQuadPoint(1.0 - blen, 1.0, quad, inset, effectiveCurvature);
        const pBR_T = this.getCurvedQuadPoint(1.0, 1.0 - blen, quad, inset, effectiveCurvature);

        const pBL = this.getCurvedQuadPoint(0.0, 1.0, quad, inset, effectiveCurvature);
        const pBL_R = this.getCurvedQuadPoint(blen, 1.0, quad, inset, effectiveCurvature);
        const pBL_T = this.getCurvedQuadPoint(0.0, 1.0 - blen, quad, inset, effectiveCurvature);

        this.ctx.beginPath();
        // TL bracket
        this.ctx.moveTo(pTL_B.x, pTL_B.y);
        this.ctx.lineTo(pTL.x, pTL.y);
        this.ctx.lineTo(pTL_R.x, pTL_R.y);
        // TR bracket
        this.ctx.moveTo(pTR_L.x, pTR_L.y);
        this.ctx.lineTo(pTR.x, pTR.y);
        this.ctx.lineTo(pTR_B.x, pTR_B.y);
        // BR bracket
        this.ctx.moveTo(pBR_L.x, pBR_L.y);
        this.ctx.lineTo(pBR.x, pBR.y);
        this.ctx.lineTo(pBR_T.x, pBR_T.y);
        // BL bracket
        this.ctx.moveTo(pBL_R.x, pBL_R.y);
        this.ctx.lineTo(pBL.x, pBL.y);
        this.ctx.lineTo(pBL_T.x, pBL_T.y);
        this.ctx.stroke();
      }

      // 3. Draw Center Crosshair Alignment Markers
      if (frames.showCrosshairs) {
        const center = this.quadBilinear(0.5, 0.5, quad);
        const chU = this.quadBilinear(0.52, 0.5, quad);
        const chV = this.quadBilinear(0.5, 0.52, quad);
        const dx = chU.x - center.x;
        const dy = chU.y - center.y;
        const vx = chV.x - center.x;
        const vy = chV.y - center.y;

        this.ctx.beginPath();
        this.ctx.moveTo(center.x - dx, center.y - dy);
        this.ctx.lineTo(center.x + dx, center.y + dy);
        this.ctx.moveTo(center.x - vx, center.y - vy);
        this.ctx.lineTo(center.x + vx, center.y + vy);
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  /**
   * Draws per-screen antenna telemetry metrics (CRT title, ANT%, N%, and signal bar)
   * pinned to each monitor's top-left corner following keystone and rotation.
   * Styled like the clean text badges with individual translucent pills and no outer card container.
   */
  private drawAntennaMetrics(
    w: number,
    h: number,
    palette?: { stroke: string; glow: string },
  ): void {
    const store = useAppStore.getState();
    const sh = store.shaders;
    const frames = store.frames;
    if (!sh.matrixSplit) return;

    const uvCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    const scale = Math.max(0.65, Math.min(1.5, w / 1080));
    const titleSize = Math.max(10, Math.round(11 * scale));
    const metricSize = Math.max(9, Math.round(10 * scale));

    const inset = Math.max(0.005, frames.inset);
    const effectiveCurvature =
      frames.followTubeCurvature && sh.tubeCurve
        ? sh.curvature * frames.curvatureScale
        : 0;

    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    for (let i = 0; i < 6; i++) {
      const base = i * 4;
      const uvBL = uvCorners[base + 0];
      const uvBR = uvCorners[base + 1];
      const uvTR = uvCorners[base + 2];
      const uvTL = uvCorners[base + 3];

      if (!uvBL || !uvBR || !uvTR || !uvTL) continue;

      const quad: QuadPoints = {
        tl: { x: uvTL.x * w, y: (1.0 - uvTL.y) * h },
        tr: { x: uvTR.x * w, y: (1.0 - uvTR.y) * h },
        br: { x: uvBR.x * w, y: (1.0 - uvBR.y) * h },
        bl: { x: uvBL.x * w, y: (1.0 - uvBL.y) * h },
      };

      const lockVal = sh.screenSignalLocks?.[i] ?? sh.signalLock ?? 0;
      const noiseVal = sh.screenNoiseGains?.[i] ?? sh.noiseGain ?? 1;
      const lockPct = Math.round(Math.max(0, Math.min(1, lockVal)) * 100);
      const noisePct = Math.round(Math.max(0, Math.min(1, noiseVal)) * 100);

      const lockColor =
        lockPct > 70 ? '#3ddc97' : lockPct > 30 ? '#ffb703' : '#ff3366';

      const tag = frames.customLabels[i] || `CRT [0${i + 1}]`;
      const metricText = `ANT:${lockPct}% N:${noisePct}%`;

      // Top edge vector & orientation
      const edgeDx = quad.tr.x - quad.tl.x;
      const edgeDy = quad.tr.y - quad.tl.y;
      const textAngle = Math.atan2(edgeDy, edgeDx);

      // Top-left quad anchor (curved point matching screen frame curvature & inset)
      const textPos = this.getCurvedQuadPoint(0.04, 0.04, quad, inset, effectiveCurvature);

      this.ctx.font = `bold ${titleSize}px monospace`;
      const tagW = this.ctx.measureText(tag).width;

      this.ctx.font = `bold ${metricSize}px monospace`;
      const metricW = this.ctx.measureText(metricText).width;

      const barW = Math.max(tagW, metricW);
      const barH = Math.max(3, Math.round(3.5 * scale));

      this.ctx.save();
      this.ctx.translate(textPos.x, textPos.y);
      this.ctx.rotate(textAngle);

      const bgAlpha = Math.min(frames.opacity * 0.85, 0.9);

      // Line 1: CRT Name Badge Pill (Top text)
      this.ctx.save();
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = bgAlpha;
      this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
      this.ctx.fillRect(-4, -2, tagW + 8, titleSize + 6);
      this.ctx.restore();

      this.ctx.fillStyle = palette?.stroke || '#ffaa00';
      this.ctx.font = `bold ${titleSize}px monospace`;
      this.ctx.fillText(tag, 0, titleSize);

      // Line 2: ANT% N% Badge Pill
      const line2Y = titleSize + 8;
      this.ctx.save();
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = bgAlpha;
      this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
      this.ctx.fillRect(-4, line2Y - 2, metricW + 8, metricSize + 6);
      this.ctx.restore();

      this.ctx.fillStyle = lockColor;
      this.ctx.font = `bold ${metricSize}px monospace`;
      this.ctx.fillText(metricText, 0, line2Y + metricSize);

      // Line 3: Signal Reception Bar (Track + Fill)
      const barY = line2Y + metricSize + 7;
      this.ctx.save();
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = bgAlpha;
      this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
      this.ctx.fillRect(-4, barY, barW + 8, barH);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.fillRect(-4, barY, barW + 8, barH);
      this.ctx.restore();

      const fillW = ((barW + 8) * lockPct) / 100;
      if (fillW > 0) {
        this.ctx.fillStyle = lockColor;
        this.ctx.fillRect(-4, barY, fillW, barH);
      }

      this.ctx.restore();
    }

    this.ctx.restore();
  }

  /**
   * Draws the bottom query message banner (▶ LIVE FEED badge and ⚡ QUERY: "...")
   * pinned to the bottom-left corner of each enabled CRT monitor, following
   * keystone, rotation, and tube curvature.
   */
  private drawScreenQueryMessages(
    w: number,
    h: number,
    _palette?: { stroke: string; glow: string },
  ): void {
    const store = useAppStore.getState();
    const sh = store.shaders;
    const frames = store.frames;
    if (!sh.matrixSplit || !frames.showQueryMessage) return;

    const uvCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    const scale = Math.max(0.65, Math.min(1.5, w / 1080));
    const statusFontSize = Math.max(8.5, Math.round(9.5 * scale));
    const queryFontSize = Math.max(8.5, Math.round(9.5 * scale));

    const inset = Math.max(0.005, frames.inset);
    const effectiveCurvature =
      frames.followTubeCurvature && sh.tubeCurve
        ? sh.curvature * frames.curvatureScale
        : 0;

    const videoEl = document.querySelector<HTMLVideoElement>('#feed-video');
    const isPaused = videoEl ? videoEl.paused : false;
    const statusText = isPaused ? '⏸ PAUSED' : '▶ LIVE FEED';
    const statusColor = isPaused ? '#f0a500' : '#3ddc97';

    const inter = store.interaction;
    const curVideoQuery = store.currentVideoQuery;
    const rawQuery =
      frames.customQueryText?.trim() ||
      curVideoQuery ||
      inter.lastQuery ||
      '#shorts retro public access tv host vintage 1950s black and white tv';
    const reasonText =
      inter.lastTriggerReason && inter.lastQuery && rawQuery === inter.lastQuery
        ? ` [${inter.lastTriggerReason}]`
        : '';
    const fullQueryText = `⚡ QUERY: "${rawQuery}"${reasonText}`;

    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    for (let i = 0; i < 6; i++) {
      const isVisibleOnScreen = frames.screenQueryToggles?.[i] ?? true;
      if (!isVisibleOnScreen) continue;

      const base = i * 4;
      const uvBL = uvCorners[base + 0];
      const uvBR = uvCorners[base + 1];
      const uvTR = uvCorners[base + 2];
      const uvTL = uvCorners[base + 3];

      if (!uvBL || !uvBR || !uvTR || !uvTL) continue;

      const quad: QuadPoints = {
        tl: { x: uvTL.x * w, y: (1.0 - uvTL.y) * h },
        tr: { x: uvTR.x * w, y: (1.0 - uvTR.y) * h },
        br: { x: uvBR.x * w, y: (1.0 - uvBR.y) * h },
        bl: { x: uvBL.x * w, y: (1.0 - uvBL.y) * h },
      };

      // Bottom edge vector & orientation
      const edgeDx = quad.br.x - quad.bl.x;
      const edgeDy = quad.br.y - quad.bl.y;
      const screenW = Math.hypot(edgeDx, edgeDy);
      const textAngle = Math.atan2(edgeDy, edgeDx);

      // Bottom-left quad anchor (curved point matching screen frame curvature & inset)
      // vNorm = 0.90 if showLiveFeedBadge (two lines) else 0.93 (single line)
      const vNorm = frames.showLiveFeedBadge ? 0.90 : 0.93;
      const pos = this.getCurvedQuadPoint(0.04, vNorm, quad, inset, effectiveCurvature);

      this.ctx.save();
      this.ctx.translate(pos.x, pos.y);
      this.ctx.rotate(textAngle);

      const bgAlpha = Math.min(frames.opacity * 0.85, 0.9);
      const maxW = Math.max(80, screenW * 0.92);

      let curY = 0;

      // Line 1: ▶ LIVE FEED
      if (frames.showLiveFeedBadge) {
        this.ctx.font = `bold ${statusFontSize}px monospace`;
        const statusW = this.ctx.measureText(statusText).width;

        this.ctx.save();
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = bgAlpha;
        this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
        this.ctx.fillRect(-4, -2, statusW + 8, statusFontSize + 6);
        this.ctx.restore();

        this.ctx.fillStyle = statusColor;
        this.ctx.font = `bold ${statusFontSize}px monospace`;
        this.ctx.fillText(statusText, 0, statusFontSize);

        curY += statusFontSize + 7;
      }

      // Line 2: ⚡ QUERY: "..."
      this.ctx.font = `bold ${queryFontSize}px monospace`;
      let textToRender = fullQueryText;
      if (this.ctx.measureText(textToRender).width > maxW) {
        let lo = 0;
        let hi = textToRender.length;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (this.ctx.measureText(textToRender.slice(0, mid) + '…').width <= maxW) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        textToRender = textToRender.slice(0, lo) + '…';
      }

      const queryW = this.ctx.measureText(textToRender).width;

      this.ctx.save();
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = bgAlpha;
      this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
      this.ctx.fillRect(-4, curY - 2, queryW + 8, queryFontSize + 6);
      this.ctx.restore();

      this.ctx.fillStyle = '#3ddc97';
      this.ctx.font = `bold ${queryFontSize}px monospace`;
      this.ctx.fillText(textToRender, 0, curY + queryFontSize);

      this.ctx.restore();
    }

    this.ctx.restore();
  }

  /**
   * Draws the 6 signature Human Antenna pose guides directly on the 6 CRT monitors.
   * Each pose is rendered as a clean, single-line phosphor vector stick figure
   * transformed through the screen's 4-corner keystone pinning and CRT tube barrel curvature.
   * Highlights in intense phosphor green with a signal lock reticle when the spectator performs that pose.
   */
  private drawScreenPoseGuides(w: number, h: number, palette: StyleConfig): void {
    const store = useAppStore.getState();
    const sh = store.shaders;
    const frames = store.frames;
    const inter = store.interaction;
    if (!sh.matrixSplit || !frames.showPoseGuides) return;

    const uvCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    const inset = Math.max(0.005, frames.inset);
    const effectiveCurvature =
      frames.followTubeCurvature && sh.tubeCurve
        ? sh.curvature * frames.curvatureScale
        : 0;

    // Decoupled, crisp line thickness tuned for low-resolution CRT / composite displays
    const guideScale = Math.max(0.20, Math.min(2.5, frames.poseGuideScale || 0.60));
    const figThick = frames.poseGuideFigureThickness ?? frames.poseGuideThickness ?? 1.2;
    const retThick = frames.poseGuideReticleThickness ?? frames.poseGuideThickness ?? 1.2;

    const baseFigLineWidth = Math.max(0.5, Math.min(4.0, figThick * (w / 1920) * 1.35));
    const baseRetLineWidth = Math.max(0.5, Math.min(4.0, retThick * (w / 1920) * 1.35));
    const now = performance.now();

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    for (let i = 0; i < 6; i++) {
      const base = i * 4;
      const uvBL = uvCorners[base + 0];
      const uvBR = uvCorners[base + 1];
      const uvTR = uvCorners[base + 2];
      const uvTL = uvCorners[base + 3];

      if (!uvBL || !uvBR || !uvTR || !uvTL) continue;

      const quad: QuadPoints = {
        tl: { x: uvTL.x * w, y: (1.0 - uvTL.y) * h },
        tr: { x: uvTR.x * w, y: (1.0 - uvTR.y) * h },
        br: { x: uvBR.x * w, y: (1.0 - uvBR.y) * h },
        bl: { x: uvBL.x * w, y: (1.0 - uvBL.y) * h },
      };

      const pose = SCREEN_POSE_MAP[i];
      if (!pose) continue;
      const poseMeta = POSE_DISPLAY_NAMES[pose] ?? { title: `POSE ${i + 1}`, subtitle: 'ANTENNA' };

      const isScreenActive = inter.activePose === pose;
      const isHoldingThis = inter.candidateState === `POSE:${pose}`;
      const holdProgress = isHoldingThis ? inter.holdProgress : 0;

      // Determine anchor point in normalized screen coordinates (u0, v0)
      let u0 = 0.80;
      let v0 = 0.70;
      if (frames.poseGuidePosition === 'center') {
        u0 = 0.50;
        v0 = 0.50;
      } else if (frames.poseGuidePosition === 'top-right') {
        u0 = 0.80;
        v0 = 0.28;
      } else {
        // bottom-right: if query message is shown, lift slightly
        v0 = frames.showQueryMessage ? 0.66 : 0.74;
      }

      // Apply fine calibration offsets
      u0 += frames.poseGuideOffsetX ?? 0;
      v0 += frames.poseGuideOffsetY ?? 0;

      const s = 0.085 * guideScale;

      // Map a relative offset (du, dv) from anchor (u0, v0) through curved quad mapping
      const p = (du: number, dv: number) => {
        const u = Math.min(0.96, Math.max(0.04, u0 + du));
        const v = Math.min(0.96, Math.max(0.04, v0 + dv));
        return this.getCurvedQuadPoint(u, v, quad, inset, effectiveCurvature);
      };

      // Styling parameters: sharp phosphor styling, minimal blur to prevent composite smearing
      const pulse = isScreenActive ? Math.sin(now * 0.008) * 0.15 + 0.95 : 1.0;
      const alpha = isScreenActive
        ? 1.0
        : Math.min(Math.max(frames.poseGuideOpacity ?? 0.70, 0.1), 1.0);
      const strokeColor = isScreenActive ? '#3ddc97' : palette.stroke;
      const glowColor = isScreenActive ? '#3ddc97' : palette.glow;

      // Controlled line widths
      const figLineWidth = isScreenActive ? baseFigLineWidth * 1.35 * pulse : baseFigLineWidth;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = strokeColor;
      this.ctx.fillStyle = strokeColor;
      this.ctx.lineWidth = figLineWidth;
      // Low shadow blur to keep high-frequency phosphor edges razor sharp on CRT scanlines
      this.ctx.shadowBlur = isScreenActive ? 4 : 0;
      this.ctx.shadowColor = glowColor;

      // --- 1. Draw Reticle / Signal Lock Ring (with ample clearance around figure) ---
      const pCenter = p(0, -0.15 * s);
      const pRetTop = p(0, -1.45 * s);
      const retRadius = Math.hypot(pRetTop.x - pCenter.x, pRetTop.y - pCenter.y);

      const isZapThisScreen = inter.zapActive && inter.zapScreenIndex === i && (inter.zapProgress ?? 0) > 0;

      if (isZapThisScreen) {
        // High-voltage zap shockwave overcharge ring
        const zapProg = inter.zapProgress ?? 1.0;
        const shockRadius = retRadius * (1.12 + (1.0 - zapProg) * 0.45);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(pCenter.x, pCenter.y, shockRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#00f0ff';
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = '#00f0ff';
        this.ctx.lineWidth = Math.max(2.2, baseRetLineWidth * 2.8);
        this.ctx.stroke();

        // 8 radiating electrical discharge spikes around reticle
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = Math.max(1.2, baseRetLineWidth * 1.5);
        this.ctx.beginPath();
        for (let sIdx = 0; sIdx < 8; sIdx++) {
          const a = (sIdx * Math.PI) / 4 + (Math.random() - 0.5) * 0.15;
          const r1 = shockRadius;
          const r2 = shockRadius + (8 + Math.random() * 20) * (w / 1080);
          this.ctx.moveTo(pCenter.x + Math.cos(a) * r1, pCenter.y + Math.sin(a) * r1);
          this.ctx.lineTo(pCenter.x + Math.cos(a) * r2, pCenter.y + Math.sin(a) * r2);
        }
        this.ctx.stroke();
        this.ctx.restore();
      } else if (isScreenActive || isHoldingThis) {
        // Active Signal Lock Ring
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(pCenter.x, pCenter.y, retRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#3ddc97';
        this.ctx.lineWidth = Math.max(1.0, baseRetLineWidth * 1.25);
        this.ctx.stroke();

        // Corner cross ticks on lock ring
        const tick = retRadius * 0.22;
        this.ctx.lineWidth = Math.max(0.8, baseRetLineWidth * 1.0);
        this.ctx.beginPath();
        this.ctx.moveTo(pCenter.x - retRadius - tick, pCenter.y);
        this.ctx.lineTo(pCenter.x - retRadius + tick * 0.4, pCenter.y);
        this.ctx.moveTo(pCenter.x + retRadius - tick * 0.4, pCenter.y);
        this.ctx.lineTo(pCenter.x + retRadius + tick, pCenter.y);
        this.ctx.moveTo(pCenter.x, pCenter.y - retRadius - tick);
        this.ctx.lineTo(pCenter.x, pCenter.y - retRadius + tick * 0.4);
        this.ctx.moveTo(pCenter.x, pCenter.y + retRadius - tick * 0.4);
        this.ctx.lineTo(pCenter.x, pCenter.y + retRadius + tick);
        this.ctx.stroke();

        // Hold Progress Arc Meter
        if (holdProgress > 0) {
          this.ctx.beginPath();
          this.ctx.arc(
            pCenter.x,
            pCenter.y,
            retRadius * 1.18,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * holdProgress,
          );
          this.ctx.strokeStyle = '#ffb703';
          this.ctx.lineWidth = Math.max(1.8, baseRetLineWidth * 1.8);
          this.ctx.stroke();
        }
        this.ctx.restore();
      } else {
        // Inactive: subtle HUD corner brackets leaving the figure silhouette 100% clean
        this.ctx.save();
        this.ctx.globalAlpha = alpha * 0.30;
        this.ctx.lineWidth = Math.max(0.6, baseRetLineWidth * 0.9);
        const bHalf = retRadius * 0.90;
        const bLen = retRadius * 0.25;

        this.ctx.beginPath();
        // Top-Left bracket
        this.ctx.moveTo(pCenter.x - bHalf, pCenter.y - bHalf + bLen);
        this.ctx.lineTo(pCenter.x - bHalf, pCenter.y - bHalf);
        this.ctx.lineTo(pCenter.x - bHalf + bLen, pCenter.y - bHalf);
        // Top-Right bracket
        this.ctx.moveTo(pCenter.x + bHalf - bLen, pCenter.y - bHalf);
        this.ctx.lineTo(pCenter.x + bHalf, pCenter.y - bHalf);
        this.ctx.lineTo(pCenter.x + bHalf, pCenter.y - bHalf + bLen);
        // Bottom-Right bracket
        this.ctx.moveTo(pCenter.x + bHalf, pCenter.y + bHalf - bLen);
        this.ctx.lineTo(pCenter.x + bHalf, pCenter.y + bHalf);
        this.ctx.lineTo(pCenter.x + bHalf - bLen, pCenter.y + bHalf);
        // Bottom-Left bracket
        this.ctx.moveTo(pCenter.x - bHalf + bLen, pCenter.y + bHalf);
        this.ctx.lineTo(pCenter.x - bHalf, pCenter.y + bHalf);
        this.ctx.lineTo(pCenter.x - bHalf, pCenter.y + bHalf - bLen);
        this.ctx.stroke();
        this.ctx.restore();
      }

      // --- 2. Anatomical Anchors (70% upper body allocation for gesture clarity) ---
      // Head: solid filled phosphor circle for maximum contrast on low-resolution scanlines
      const pHead = p(0, -0.68 * s);
      const pHeadTop = p(0, -0.82 * s);
      const headR = Math.max(2.2, Math.hypot(pHeadTop.x - pHead.x, pHeadTop.y - pHead.y));

      this.ctx.beginPath();
      this.ctx.arc(pHead.x, pHead.y, headR, 0, Math.PI * 2);
      this.ctx.fill();

      // Torso & Shoulders
      const pNeck = p(0, -0.48 * s);
      const pPelvis = p(0, +0.08 * s);
      const pLShoulder = p(-0.26 * s, -0.46 * s);
      const pRShoulder = p(+0.26 * s, -0.46 * s);

      // Spine and Shoulder crossbar
      this.ctx.lineWidth = figLineWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(pNeck.x, pNeck.y);
      this.ctx.lineTo(pPelvis.x, pPelvis.y);
      this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
      this.ctx.lineTo(pRShoulder.x, pRShoulder.y);
      this.ctx.stroke();

      // Compact, grounded legs (leaves maximum vertical room for upper-body gestures)
      const pLHip = p(-0.14 * s, +0.08 * s);
      const pRHip = p(+0.14 * s, +0.08 * s);
      const pLKnee = p(-0.20 * s, +0.38 * s);
      const pRKnee = p(+0.20 * s, +0.38 * s);
      const pLFoot = p(-0.28 * s, +0.70 * s);
      const pRFoot = p(+0.28 * s, +0.70 * s);

      this.ctx.beginPath();
      this.ctx.moveTo(pLHip.x, pLHip.y);
      this.ctx.lineTo(pLKnee.x, pLKnee.y);
      this.ctx.lineTo(pLFoot.x, pLFoot.y);
      this.ctx.moveTo(pRHip.x, pRHip.y);
      this.ctx.lineTo(pRKnee.x, pRKnee.y);
      this.ctx.lineTo(pRFoot.x, pRFoot.y);
      this.ctx.stroke();

      // Hand terminal dot helper
      const handDotR = Math.max(1.2, baseFigLineWidth * 1.2);
      const drawHandTerminal = (pt: { x: number; y: number }) => {
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, handDotR, 0, Math.PI * 2);
        this.ctx.fill();
      };

      // --- 3. Distinct Signature Gestures for the 6 TVs ---
      this.ctx.beginPath();
      switch (pose) {
        case 'POSE_ANTENNA': {
          // CRT 01: RABBIT EARS (VHF Dipole)
          // Both arms high in a wide V, with elevated elbows and antenna wave tips
          const pLElbow = p(-0.48 * s, -0.74 * s);
          const pLWrist = p(-0.76 * s, -1.14 * s);
          const pRElbow = p(+0.48 * s, -0.74 * s);
          const pRWrist = p(+0.76 * s, -1.14 * s);

          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pLWrist.x, pLWrist.y);

          this.ctx.moveTo(pRShoulder.x, pRShoulder.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pRWrist.x, pRWrist.y);
          this.ctx.stroke();

          // Hand terminals
          drawHandTerminal(pLWrist);
          drawHandTerminal(pRWrist);

          // Stylized radiating antenna wave ticks above each hand
          this.ctx.save();
          this.ctx.lineWidth = Math.max(0.8, baseFigLineWidth * 0.85);
          this.ctx.beginPath();
          // Left antenna wave
          const pLW1 = p(-0.88 * s, -1.24 * s);
          const pLW2 = p(-0.66 * s, -1.24 * s);
          this.ctx.moveTo(pLW1.x, pLW1.y);
          this.ctx.lineTo(pLW2.x, pLW2.y);
          // Right antenna wave
          const pRW1 = p(+0.66 * s, -1.24 * s);
          const pRW2 = p(+0.88 * s, -1.24 * s);
          this.ctx.moveTo(pRW1.x, pRW1.y);
          this.ctx.lineTo(pRW2.x, pRW2.y);
          this.ctx.stroke();
          this.ctx.restore();
          break;
        }

        case 'POSE_DIAL_TUNER': {
          // CRT 02: DIAL TUNER (Yagi Point)
          // Unmistakably asymmetric: right arm points diagonally up at 45°, left arm bent low at hip
          const pRElbow = p(+0.54 * s, -0.76 * s);
          const pRWrist = p(+0.88 * s, -1.16 * s);
          const pLElbow = p(-0.42 * s, -0.30 * s);
          const pLWrist = p(-0.22 * s, -0.04 * s);

          // Pointing high arm (Right)
          this.ctx.moveTo(pRShoulder.x, pRShoulder.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pRWrist.x, pRWrist.y);

          // Relaxed tuner arm at waist (Left)
          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pLWrist.x, pLWrist.y);
          this.ctx.stroke();

          drawHandTerminal(pRWrist);
          drawHandTerminal(pLWrist);

          // Yagi directional pointer cross-tick at right wrist
          this.ctx.save();
          this.ctx.lineWidth = Math.max(0.8, baseFigLineWidth * 0.85);
          const pTickA = p(+0.96 * s, -1.10 * s);
          const pTickB = p(+0.80 * s, -1.22 * s);
          this.ctx.beginPath();
          this.ctx.moveTo(pTickA.x, pTickA.y);
          this.ctx.lineTo(pTickB.x, pTickB.y);
          this.ctx.stroke();
          this.ctx.restore();
          break;
        }

        case 'POSE_SURPRISE': {
          // CRT 03: TV SHOCK (Commercial Gasp)
          // Elbows flared wide (< o >), hands cupping cheeks with distinct negative clearance
          const pLElbow = p(-0.52 * s, -0.32 * s);
          const pLWrist = p(-0.25 * s, -0.68 * s);
          const pRElbow = p(+0.52 * s, -0.32 * s);
          const pRWrist = p(+0.25 * s, -0.68 * s);

          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pLWrist.x, pLWrist.y);

          this.ctx.moveTo(pRShoulder.x, pRShoulder.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pRWrist.x, pRWrist.y);
          this.ctx.stroke();

          // Hand pads cupping cheeks
          drawHandTerminal(pLWrist);
          drawHandTerminal(pRWrist);

          // Radiating shock exclamation ticks on each side of head
          this.ctx.save();
          this.ctx.lineWidth = Math.max(0.8, baseFigLineWidth * 0.85);
          const pS1 = p(-0.40 * s, -0.78 * s);
          const pS2 = p(-0.50 * s, -0.84 * s);
          const pS3 = p(+0.40 * s, -0.78 * s);
          const pS4 = p(+0.50 * s, -0.84 * s);
          this.ctx.beginPath();
          this.ctx.moveTo(pS1.x, pS1.y);
          this.ctx.lineTo(pS2.x, pS2.y);
          this.ctx.moveTo(pS3.x, pS3.y);
          this.ctx.lineTo(pS4.x, pS4.y);
          this.ctx.stroke();
          this.ctx.restore();
          break;
        }

        case 'POSE_WINGSUIT': {
          // CRT 04: WINGSUIT (Horizontal Dipole / T-Pose)
          // Wide horizontal reach, completely level arms, maximum lateral silhouette contrast
          const pLElbow = p(-0.54 * s, -0.46 * s);
          const pLWrist = p(-1.02 * s, -0.46 * s);
          const pRElbow = p(+0.54 * s, -0.46 * s);
          const pRWrist = p(+1.02 * s, -0.46 * s);

          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pLWrist.x, pLWrist.y);

          this.ctx.moveTo(pRShoulder.x, pRShoulder.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pRWrist.x, pRWrist.y);
          this.ctx.stroke();

          drawHandTerminal(pLWrist);
          drawHandTerminal(pRWrist);

          // Small vertical hand/palm bars at tips
          this.ctx.save();
          this.ctx.lineWidth = Math.max(0.8, baseFigLineWidth * 0.9);
          const pLHandT = p(-1.02 * s, -0.55 * s);
          const pLHandB = p(-1.02 * s, -0.37 * s);
          const pRHandT = p(+1.02 * s, -0.55 * s);
          const pRHandB = p(+1.02 * s, -0.37 * s);
          this.ctx.beginPath();
          this.ctx.moveTo(pLHandT.x, pLHandT.y);
          this.ctx.lineTo(pLHandB.x, pLHandB.y);
          this.ctx.moveTo(pRHandT.x, pRHandT.y);
          this.ctx.lineTo(pRHandB.x, pRHandB.y);
          this.ctx.stroke();
          this.ctx.restore();
          break;
        }

        case 'POSE_LOOP_HALO': {
          // CRT 05: UHF LOOP (Circular Halo)
          // Graceful circular loop overhead with clear clearance above head
          const pLElbow = p(-0.52 * s, -0.72 * s);
          const pRElbow = p(+0.52 * s, -0.72 * s);
          const pLWrist = p(-0.12 * s, -1.06 * s);
          const pRWrist = p(+0.12 * s, -1.06 * s);
          const pTop = p(0, -1.14 * s);

          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pLWrist.x, pLWrist.y);
          this.ctx.lineTo(pTop.x, pTop.y);
          this.ctx.lineTo(pRWrist.x, pRWrist.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pRShoulder.x, pRShoulder.y);
          this.ctx.stroke();

          // Central loop clasp dot
          drawHandTerminal(pTop);
          break;
        }

        case 'POSE_SIGNAL_LOCK': {
          // CRT 06: SIGNAL LOCK (Human Capacitor)
          // Elbows bent wide at mid-torso, forearms meeting horizontally over sternum
          const pLElbow = p(-0.46 * s, -0.30 * s);
          const pRElbow = p(+0.46 * s, -0.30 * s);
          const pChestCenter = p(0, -0.30 * s);

          this.ctx.moveTo(pLShoulder.x, pLShoulder.y);
          this.ctx.lineTo(pLElbow.x, pLElbow.y);
          this.ctx.lineTo(pChestCenter.x, pChestCenter.y);

          this.ctx.moveTo(pRShoulder.x, pRShoulder.y);
          this.ctx.lineTo(pRElbow.x, pRElbow.y);
          this.ctx.lineTo(pChestCenter.x, pChestCenter.y);
          this.ctx.stroke();

          // Capacitor / Lock emblem at center sternum
          const pCapTop = p(0, -0.38 * s);
          const pCapBot = p(0, -0.22 * s);
          const pCapLeft = p(-0.09 * s, -0.30 * s);
          const pCapRight = p(+0.09 * s, -0.30 * s);

          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.moveTo(pCapTop.x, pCapTop.y);
          this.ctx.lineTo(pCapRight.x, pCapRight.y);
          this.ctx.lineTo(pCapBot.x, pCapBot.y);
          this.ctx.lineTo(pCapLeft.x, pCapLeft.y);
          this.ctx.closePath();
          if (isScreenActive) {
            this.ctx.fillStyle = '#3ddc97';
            this.ctx.fill();
          } else {
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = Math.max(0.9, baseFigLineWidth);
            this.ctx.stroke();
          }
          this.ctx.restore();
          break;
        }
      }

      // --- 4. Monospace Pose Badge underneath feet ---
      const edgeDx = quad.tr.x - quad.tl.x;
      const edgeDy = quad.tr.y - quad.tl.y;
      const textAngle = Math.atan2(edgeDy, edgeDx);

      const pLabel = p(0, 1.04 * s);
      const fontSize = Math.max(8, Math.round(9 * (w / 1080) * guideScale));
      const badgeText = isZapThisScreen
        ? (inter.zapDirection === 'random'
            ? `⚡ [0${i + 1}] RANDOM ZAP ⚡`
            : inter.zapDirection === 'prev'
              ? `⚡ [0${i + 1}] PREV VIDEO ⚡`
              : `⚡ [0${i + 1}] NEXT VIDEO ⚡`)
        : `[0${i + 1}] ${poseMeta.title}`;

      this.ctx.save();
      this.ctx.translate(pLabel.x, pLabel.y);
      this.ctx.rotate(textAngle);
      this.ctx.font = `bold ${fontSize}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';

      const labelW = this.ctx.measureText(badgeText).width;

      // Badge background pill
      this.ctx.save();
      this.ctx.shadowBlur = isZapThisScreen ? 12 : 0;
      this.ctx.shadowColor = isZapThisScreen ? '#00f0ff' : 'transparent';
      this.ctx.fillStyle = isZapThisScreen ? 'rgba(0, 40, 60, 0.92)' : 'rgba(5, 7, 10, 0.85)';
      this.ctx.fillRect(-labelW / 2 - 4, -2, labelW + 8, fontSize + 5);
      this.ctx.strokeStyle = isZapThisScreen ? '#00f0ff' : strokeColor;
      this.ctx.lineWidth = isZapThisScreen ? 1.5 : 1;
      this.ctx.strokeRect(-labelW / 2 - 4, -2, labelW + 8, fontSize + 5);
      this.ctx.restore();

      this.ctx.fillStyle = isZapThisScreen ? '#ffffff' : strokeColor;
      this.ctx.fillText(badgeText, 0, 0);
      this.ctx.restore();

      this.ctx.restore();
    }

    this.ctx.restore();
  }

  /**
   * Draws high-contrast corner pinning target guides, bullseye markers, crosshairs,
   * dashed screen bounds, and corner labels (BL, BR, TR, TL) for all 6 screens.
   */
  private drawCornerTargetGuides(w: number, h: number): void {
    const store = useAppStore.getState();
    const sh = store.shaders;

    const uvCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
      sh.screenOffsets,
      sh.screenFlips,
      sh.globalRotation,
      sh.globalFineRotation,
      sh.globalOffsetX,
      sh.globalOffsetY,
    );

    const cornerNames: Array<'BL' | 'BR' | 'TR' | 'TL'> = ['BL', 'BR', 'TR', 'TL'];

    this.ctx.save();

    for (let i = 0; i < 6; i++) {
      const base = i * 4;
      const uvBL = uvCorners[base + 0];
      const uvBR = uvCorners[base + 1];
      const uvTR = uvCorners[base + 2];
      const uvTL = uvCorners[base + 3];

      if (!uvBL || !uvBR || !uvTR || !uvTL) continue;

      const pBL = { x: uvBL.x * w, y: (1.0 - uvBL.y) * h };
      const pBR = { x: uvBR.x * w, y: (1.0 - uvBR.y) * h };
      const pTR = { x: uvTR.x * w, y: (1.0 - uvTR.y) * h };
      const pTL = { x: uvTL.x * w, y: (1.0 - uvTL.y) * h };

      // 1. Pinned quad perimeter dashed boundary
      this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
      this.ctx.lineWidth = Math.max(1.5, 2.0 * (w / 1080));
      this.ctx.setLineDash([8, 6]);
      this.ctx.beginPath();
      this.ctx.moveTo(pTL.x, pTL.y);
      this.ctx.lineTo(pTR.x, pTR.y);
      this.ctx.lineTo(pBR.x, pBR.y);
      this.ctx.lineTo(pBL.x, pBL.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // 2. Screen center crosshair & label
      const cX = (pTL.x + pTR.x + pBR.x + pBL.x) * 0.25;
      const cY = (pTL.y + pTR.y + pBR.y + pBL.y) * 0.25;
      const arm = 14 * (w / 1080);
      this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(cX - arm, cY);
      this.ctx.lineTo(cX + arm, cY);
      this.ctx.moveTo(cX, cY - arm);
      this.ctx.lineTo(cX, cY + arm);
      this.ctx.stroke();

      this.ctx.fillStyle = '#00e5ff';
      this.ctx.font = `bold ${Math.max(11, Math.round(13 * (w / 1080)))}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`CRT [0${i + 1}]`, cX, cY - arm - 8);

      // 3. 4 Corner Target Guides
      const pts = [pBL, pBR, pTR, pTL];
      for (let c = 0; c < 4; c++) {
        const pt = pts[c];
        const name = cornerNames[c];
        const crossLen = 14 * (w / 1080);
        const ringR = 8 * (w / 1080);
        const dotR = 3.5 * (w / 1080);

        // Crosshair lines
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3.5;
        this.ctx.beginPath();
        this.ctx.moveTo(pt.x - crossLen, pt.y);
        this.ctx.lineTo(pt.x + crossLen, pt.y);
        this.ctx.moveTo(pt.x, pt.y - crossLen);
        this.ctx.lineTo(pt.x, pt.y + crossLen);
        this.ctx.stroke();

        this.ctx.strokeStyle = '#ffaa00';
        this.ctx.lineWidth = 1.8;
        this.ctx.beginPath();
        this.ctx.moveTo(pt.x - crossLen, pt.y);
        this.ctx.lineTo(pt.x + crossLen, pt.y);
        this.ctx.moveTo(pt.x, pt.y - crossLen);
        this.ctx.lineTo(pt.x, pt.y + crossLen);
        this.ctx.stroke();

        // Target outer ring
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, ringR, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Bullseye inner dot
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();

        // Corner label badge (e.g. TL, TR, BR, BL)
        const labelOffsetY = c < 2 ? 18 : -18;
        const labelText = `[0${i + 1}] ${name}`;
        const fontSize = Math.max(10, Math.round(11 * (w / 1080)));
        this.ctx.font = `bold ${fontSize}px monospace`;
        const textW = this.ctx.measureText(labelText).width;

        // Badge background box
        this.ctx.fillStyle = 'rgba(7, 9, 14, 0.85)';
        this.ctx.fillRect(pt.x - textW / 2 - 4, pt.y + labelOffsetY - 8, textW + 8, 16);
        this.ctx.strokeStyle = '#ffaa00';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(pt.x - textW / 2 - 4, pt.y + labelOffsetY - 8, textW + 8, 16);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, pt.x, pt.y + labelOffsetY);
      }
    }

    this.ctx.restore();
  }

  draw(frame: TrackerFrame | null): void {
    const store = useAppStore.getState();
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
      skeletonSmoothing,
      shaders,
      interaction: inter,
    } = store;

    const isZapping = inter.zapActive && (inter.zapProgress ?? 0) > 0;
    const zapIntensity = isZapping
      ? (inter.zapProgress ?? 1.0) * (inter.zapVisualIntensity ?? 1.0)
      : 0;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const palette = STYLE_PALETTES[skeletonStyle] || STYLE_PALETTES.phosphor;

    // 1. Draw the 6 Screen Frames (Pinned Quads, Curved CRT Tube, Custom Text)
    this.drawScreenFrames(w, h, palette);

    // 2. Draw Antenna Metrics on the 6 CRT screens (ANT%, N%, bar)
    if (useAppStore.getState().frames.showAntennaMetrics) {
      this.drawAntennaMetrics(w, h, palette);
    }

    // 3. Draw Bottom Query Messages on enabled CRT screens
    if (useAppStore.getState().frames.showQueryMessage) {
      this.drawScreenQueryMessages(w, h, palette);
    }

    // 4. Draw Screen Pose Guides (Single lines following frames on the 6 TVs)
    if (useAppStore.getState().frames.showPoseGuides) {
      this.drawScreenPoseGuides(w, h, palette);
    }

    // 5. Draw Corner Target Guides (When Show Corner Target Guides is enabled in calibration)
    if (shaders.showCornerHandles && shaders.matrixSplit) {
      this.drawCornerTargetGuides(w, h);
    }

    // 2. Draw Skeleton if person is detected and skeleton is enabled
    if (
      !skeletonOverlay ||
      (!skeletonShowLines && !skeletonShowDots) ||
      !frame ||
      !frame.present
    ) {
      this.smoothedPoses = [];
      this.smoothedHands = [];
      return;
    }

    const lineWidth = skeletonLineThickness * (w / 1080);
    const dotRadius = skeletonDotSize * (w / 1080);

    this.ctx.save();
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = palette.glow;

    // Draw Body Pose Skeletons (Multiple Persons)
    const poses =
      frame.poses && frame.poses.length > 0
        ? frame.poses
        : frame.landmarks && frame.landmarks.length > 0
          ? [frame.landmarks]
          : [];

    const smoothing = Math.min(Math.max(skeletonSmoothing ?? 0.5, 0), 0.98);
    const newSmoothedPoses: Array<Array<{ x: number; y: number }>> = [];

    let personSeed = 0;
    let personIdx = 0;
    for (const lm of poses) {
      personSeed += 100;
      const prevLm = this.smoothedPoses[personIdx] || [];
      const currSmoothed: Array<{ x: number; y: number }> = [];

      const jitteredLms = lm.map((p, idx) => {
        let sx = p.x;
        let sy = p.y;
        if (smoothing > 0 && prevLm[idx]) {
          const dx = p.x - prevLm[idx].x;
          const dy = p.y - prevLm[idx].y;
          // Smooth unless movement is large (>0.3 of screen width/height, indicating teleport/new person)
          if (dx * dx + dy * dy < 0.09) {
            sx = prevLm[idx].x * smoothing + p.x * (1 - smoothing);
            sy = prevLm[idx].y * smoothing + p.y * (1 - smoothing);
          }
        }
        currSmoothed[idx] = { x: sx, y: sy };

        const rawX = sx * w;
        const rawY = sy * h;
        return {
          ...p,
          pt: this.getJitteredPoint(rawX, rawY, personSeed + idx, skeletonJitter, w),
        };
      });
      newSmoothedPoses.push(currSmoothed);
      personIdx++;

      // Draw Pose Lines
      if (skeletonShowLines) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonLineOpacity, 0), 1);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (isZapping && zapIntensity > 0.04) {
          // --- ELECTRIC ZAP MODE: Jagged Lightning Arcs along all bones ---
          const arcColor = inter.zapDirection === 'prev' ? '#ffd166' : inter.zapDirection === 'random' ? '#3ddc97' : '#00f0ff';
          for (const [i, j] of POSE_CONNECTIONS) {
            const p1 = jitteredLms[i];
            const p2 = jitteredLms[j];
            if (p1 && p2 && (p1.visibility ?? 1) > 0.1 && (p2.visibility ?? 1) > 0.1) {
              this.drawLightningArc(p1.pt, p2.pt, zapIntensity, w, arcColor);
            }
          }

          // Energetic hand-to-hand arc discharge across the chest/arms
          const lw = jitteredLms[15];
          const rw = jitteredLms[16];
          if (lw && rw && (lw.visibility ?? 1) > 0.12 && (rw.visibility ?? 1) > 0.12) {
            this.drawLightningArc(lw.pt, rw.pt, zapIntensity * 1.35, w, '#ffffff');
          }
        } else {
          // --- STANDARD MODE ---
          this.ctx.strokeStyle = palette.stroke;
          this.ctx.lineWidth = lineWidth;

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
        }
        this.ctx.restore();
      }

      // Draw Pose Dots
      if (skeletonShowDots) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonDotOpacity, 0), 1);
        if (isZapping && zapIntensity > 0.04) {
          // --- ELECTRIC ZAP MODE: Radial Plasma Sparks at Key Joints ---
          const sparkColor = inter.zapDirection === 'prev' ? '#ffd166' : inter.zapDirection === 'random' ? '#00ffa3' : '#00f0ff';
          // Key joints: head (0), shoulders (11,12), elbows (13,14), wrists (15,16), hips (23,24), knees (25,26), ankles (27,28)
          const keyIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
          for (const idx of keyIndices) {
            const p = jitteredLms[idx];
            if (p && (p.visibility ?? 1) > 0.22) {
              this.drawPlasmaJointSparks(p.pt, zapIntensity, w, sparkColor);
            }
          }
        } else {
          // --- STANDARD MODE ---
          this.ctx.fillStyle = palette.joint;
          for (const p of jitteredLms) {
            if ((p.visibility ?? 1) > 0.3) {
              const r = skeletonJitter > 0.05 ? dotRadius * (1.0 + Math.random() * skeletonJitter * 0.4) : dotRadius;
              this.ctx.beginPath();
              this.ctx.arc(p.pt.x, p.pt.y, r, 0, Math.PI * 2);
              this.ctx.fill();

              if (skeletonJitter > 0.3 && Math.random() < skeletonJitter * 0.5) {
                const sparkX = p.pt.x + (Math.random() - 0.5) * 16 * (w / 1080);
                const sparkY = p.pt.y + (Math.random() - 0.5) * 16 * (w / 1080);
                this.ctx.fillRect(sparkX, sparkY, lineWidth, lineWidth);
              }
            }
          }
        }
        this.ctx.restore();
      }
    }
    this.smoothedPoses = newSmoothedPoses;

    // Body-to-Screen Energy Beam (Discharge pulse from spectator towards target CRT)
    if (
      isZapping &&
      zapIntensity > 0.08 &&
      inter.zapScreenIndex !== null &&
      inter.zapScreenIndex !== undefined &&
      inter.zapScreenIndex >= 0 &&
      poses.length > 0
    ) {
      const sh = store.shaders;
      if (sh.matrixSplit) {
        const uvCorners = computeAllScreenCorners(
          sh.bezelWidthX,
          sh.bezelWidthY,
          sh.bezelOuter,
          sh.cornerOffsets,
          sh.screenOffsets,
          sh.screenFlips,
          sh.globalRotation,
          sh.globalFineRotation,
          sh.globalOffsetX,
          sh.globalOffsetY,
        );
        const base = inter.zapScreenIndex * 4;
        const uvBL = uvCorners[base + 0];
        const uvBR = uvCorners[base + 1];
        const uvTR = uvCorners[base + 2];
        const uvTL = uvCorners[base + 3];
        if (uvBL && uvBR && uvTR && uvTL) {
          const quadCenterX = (uvBL.x + uvBR.x + uvTR.x + uvTL.x) * 0.25 * w;
          const quadCenterY = (1.0 - (uvBL.y + uvBR.y + uvTR.y + uvTL.y) * 0.25) * h;
          const primaryLm = poses[0];
          const nose = primaryLm[0];
          const lWrist = primaryLm[15];
          const rWrist = primaryLm[16];
          const originPt = inter.zapDirection === 'prev' ? (lWrist ?? nose) : (rWrist ?? nose);
          if (originPt) {
            const beamColor = inter.zapDirection === 'prev' ? '#ffaa00' : inter.zapDirection === 'random' ? '#00ffa3' : '#00e5ff';
            this.drawLightningArc(
              { x: originPt.x * w, y: originPt.y * h },
              { x: quadCenterX, y: quadCenterY },
              zapIntensity * 1.5,
              w,
              beamColor,
            );
          }
        }
      }
    }

    // Draw Hand Skeletons (All detected hands across all people)
    const hands =
      frame.allHands && frame.allHands.length > 0
        ? frame.allHands.map((h) => h.landmarks)
        : [frame.leftHand, frame.rightHand];

    const newSmoothedHands: Array<Array<{ x: number; y: number }>> = [];
    let handIdx = 1000;
    let handPersonIdx = 0;
    for (const handLms of hands) {
      handIdx += 50;
      if (!handLms || handLms.length === 0) continue;

      const prevH = this.smoothedHands[handPersonIdx] || [];
      const currSmoothedH: Array<{ x: number; y: number }> = [];

      const jitteredHand = handLms.map((p, idx) => {
        let sx = p.x;
        let sy = p.y;
        if (smoothing > 0 && prevH[idx]) {
          const dx = p.x - prevH[idx].x;
          const dy = p.y - prevH[idx].y;
          if (dx * dx + dy * dy < 0.09) {
            sx = prevH[idx].x * smoothing + p.x * (1 - smoothing);
            sy = prevH[idx].y * smoothing + p.y * (1 - smoothing);
          }
        }
        currSmoothedH[idx] = { x: sx, y: sy };

        const rawX = sx * w;
        const rawY = sy * h;
        return {
          ...p,
          pt: this.getJitteredPoint(rawX, rawY, handIdx + idx, skeletonJitter * 0.85, w),
        };
      });
      newSmoothedHands.push(currSmoothedH);
      handPersonIdx++;

      if (skeletonShowLines) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonLineOpacity, 0), 1);
        if (isZapping && zapIntensity > 0.05) {
          const hColor = inter.zapDirection === 'prev' ? '#ffd166' : '#ffffff';
          for (const [i, j] of HAND_CONNECTIONS) {
            const p1 = jitteredHand[i];
            const p2 = jitteredHand[j];
            if (p1 && p2) {
              this.drawLightningArc(p1.pt, p2.pt, zapIntensity * 0.8, w, hColor);
            }
          }
        } else {
          this.ctx.strokeStyle = palette.handStroke;
          this.ctx.lineWidth = lineWidth * 0.85;
          for (const [i, j] of HAND_CONNECTIONS) {
            const p1 = jitteredHand[i];
            const p2 = jitteredHand[j];
            if (p1 && p2) {
              this.drawJitteredLine(p1.pt, p2.pt, skeletonJitter * 0.6, w);
            }
          }
        }
        this.ctx.restore();
      }

      if (skeletonShowDots) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(Math.max(skeletonDotOpacity, 0), 1);
        this.ctx.fillStyle = palette.handJoint;
        for (const p of jitteredHand) {
          const r = skeletonJitter > 0.05 ? dotRadius * 0.7 * (1.0 + Math.random() * skeletonJitter * 0.3) : dotRadius * 0.7;
          this.ctx.beginPath();
          this.ctx.arc(p.pt.x, p.pt.y, r, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      }
    }
    this.smoothedHands = newSmoothedHands;

    this.ctx.restore();
  }
}
