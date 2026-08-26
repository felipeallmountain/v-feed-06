import { getViewportSize, MAX_DEVICE_PIXEL_RATIO } from '../core/constants';
import { useAppStore, type SkeletonStyle } from '../core/StateManager';
import { computeAllScreenCorners } from './MatrixSplitter';
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

interface QuadPoints {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
}

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
      const tag = frames.customLabels[i] || `CRT [0${i + 1}]`;
      const sub = frames.customSubtitles[i] || '';

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

      // 4. Draw Custom Screen Labels & Badges
      if (frames.showLabels) {
        const fontSize = Math.max(10, Math.round(11 * (w / 1080)));
        this.ctx.font = `bold ${fontSize}px monospace`;

        const textPos = this.getCurvedQuadPoint(0.04, 0.04, quad, inset, effectiveCurvature);

        // Compute angle along the top edge of the quad
        const edgeDx = quad.tr.x - quad.tl.x;
        const edgeDy = quad.tr.y - quad.tl.y;
        const textAngle = Math.atan2(edgeDy, edgeDx);

        const fullText = sub && sub.trim().length > 0 ? `${tag} · ${sub}` : tag;
        const textWidth = this.ctx.measureText(fullText).width;

        this.ctx.save();
        this.ctx.translate(textPos.x, textPos.y);
        this.ctx.rotate(textAngle);

        // Background pill badge for high contrast
        this.ctx.save();
        this.ctx.globalAlpha = Math.min(frames.opacity * 0.85, 0.9);
        this.ctx.fillStyle = 'rgba(5, 7, 10, 0.75)';
        this.ctx.fillRect(-4, -2, textWidth + 8, fontSize + 6);
        this.ctx.restore();

        this.ctx.fillText(fullText, 0, fontSize);
        this.ctx.restore();
      }
    }

    this.ctx.restore();
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

    const palette = STYLE_PALETTES[skeletonStyle] || STYLE_PALETTES.phosphor;

    // 1. Draw the 6 Screen Frames (Pinned Quads, Curved CRT Tube, Custom Text)
    this.drawScreenFrames(w, h, palette);

    // 2. Draw Skeleton if person is detected and skeleton is enabled
    if (
      !skeletonOverlay ||
      (!skeletonShowLines && !skeletonShowDots) ||
      !frame ||
      !frame.present
    ) {
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

    let personSeed = 0;
    for (const lm of poses) {
      personSeed += 100;
      const jitteredLms = lm.map((p, idx) => {
        const rawX = p.x * w;
        const rawY = p.y * h;
        return {
          ...p,
          pt: this.getJitteredPoint(rawX, rawY, personSeed + idx, skeletonJitter, w),
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

    // Draw Hand Skeletons (All detected hands across all people)
    const hands =
      frame.allHands && frame.allHands.length > 0
        ? frame.allHands.map((h) => h.landmarks)
        : [frame.leftHand, frame.rightHand];

    let handIdx = 1000;
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
