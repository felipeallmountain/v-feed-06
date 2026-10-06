import * as THREE from 'three';

/**
 * 2x3 Matrix Splitter Definition & Viewport Geometry for V-FEED [06] (FR-05).
 * Maps the 1080x1920 vertical canvas across 6 CRT monitors in a 2-column x 3-row layout.
 */

export interface MatrixQuadrant {
  id: number; // 1 to 6
  name: string; // 'CRT 01'
  label: string; // 'Top-Left'
  col: number; // 0 (Left) or 1 (Right)
  row: number; // 2 (Top), 1 (Mid), 0 (Bot) in UV space
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface ScreenCornerOffsets {
  tl: [number, number]; // [dx, dy] Top-Left
  tr: [number, number]; // [dx, dy] Top-Right
  br: [number, number]; // [dx, dy] Bottom-Right
  bl: [number, number]; // [dx, dy] Bottom-Left
}

export interface ScreenFlipState {
  flipH: boolean; // Mirror horizontal (X-axis)
  flipV: boolean; // Flip vertical (Y-axis)
  rotation: number; // Discrete 90-deg rotation (0, 90, 180, 270)
  fineRotation: number; // Continuous fine rotation in degrees (-180 to +180)
}

export const MATRIX_COLUMNS = 2;
export const MATRIX_ROWS = 3;
export const TOTAL_SCREENS = 6;

/**
 * 6-Quadrant Topology (Top-to-Bottom, Left-to-Right order):
 * CRT 1: [Top-L]  | CRT 2: [Top-R]
 * CRT 3: [Mid-L]  | CRT 4: [Mid-R]
 * CRT 5: [Bot-L]  | CRT 6: [Bot-R]
 */
export const MATRIX_QUADRANTS: readonly MatrixQuadrant[] = [
  {
    id: 1,
    name: 'CRT 01',
    label: 'Top-Left',
    col: 0,
    row: 2,
    bounds: { minX: 0.0, maxX: 0.5, minY: 2 / 3, maxY: 1.0 },
  },
  {
    id: 2,
    name: 'CRT 02',
    label: 'Top-Right',
    col: 1,
    row: 2,
    bounds: { minX: 0.5, maxX: 1.0, minY: 2 / 3, maxY: 1.0 },
  },
  {
    id: 3,
    name: 'CRT 03',
    label: 'Mid-Left',
    col: 0,
    row: 1,
    bounds: { minX: 0.0, maxX: 0.5, minY: 1 / 3, maxY: 2 / 3 },
  },
  {
    id: 4,
    name: 'CRT 04',
    label: 'Mid-Right',
    col: 1,
    row: 1,
    bounds: { minX: 0.5, maxX: 1.0, minY: 1 / 3, maxY: 2 / 3 },
  },
  {
    id: 5,
    name: 'CRT 05',
    label: 'Bot-Left',
    col: 0,
    row: 0,
    bounds: { minX: 0.0, maxX: 0.5, minY: 0.0, maxY: 1 / 3 },
  },
  {
    id: 6,
    name: 'CRT 06',
    label: 'Bot-Right',
    col: 1,
    row: 0,
    bounds: { minX: 0.5, maxX: 1.0, minY: 0.0, maxY: 1 / 3 },
  },
] as const;

export function createDefaultCornerOffsets(): ScreenCornerOffsets[] {
  return Array.from({ length: TOTAL_SCREENS }, () => ({
    tl: [0, 0],
    tr: [0, 0],
    br: [0, 0],
    bl: [0, 0],
  }));
}

export function createDefaultScreenFlips(): ScreenFlipState[] {
  return Array.from({ length: TOTAL_SCREENS }, () => ({
    flipH: false,
    flipV: false,
    rotation: 0,
    fineRotation: 0,
  }));
}

export function createDefaultScreenOffsets(): Array<[number, number]> {
  return Array.from({ length: TOTAL_SCREENS }, () => [0, 0]);
}

function rotatePointUV(
  p: THREE.Vector2,
  origin: THREE.Vector2,
  rad: number,
): THREE.Vector2 {
  if (Math.abs(rad) < 1e-6) return p;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = p.x - origin.x;
  const ry = p.y - origin.y;
  return new THREE.Vector2(
    origin.x + rx * cos - ry * sin,
    origin.y + rx * sin + ry * cos,
  );
}

/**
 * Computes all 24 corner coordinates (4 corners x 6 screens) in WebGL UV space [0, 1]^2,
 * applying bezel geometry, corner pin offsets, per-screen offsets & rotations,
 * and global offsets & rotations for each screen.
 * Point order per screen: [BL, BR, TR, TL]
 */
export function computeAllScreenCorners(
  bezelWidthX: number,
  bezelWidthY: number,
  bezelOuter: number,
  offsets: ScreenCornerOffsets[],
  screenOffsets?: Array<[number, number]>,
  screenFlips?: ScreenFlipState[],
  globalRotation = 0,
  globalFineRotation = 0,
  globalOffsetX = 0,
  globalOffsetY = 0,
): THREE.Vector2[] {
  const bx = bezelWidthX * 0.5;
  const by = bezelWidthY * 0.5;
  const mox = bezelOuter;
  const moy = bezelOuter;

  const totalGlobalRotRad =
    ((globalRotation || 0) + (globalFineRotation || 0)) * (Math.PI / 180.0);
  const globalOrigin = new THREE.Vector2(0.5, 0.5);

  const corners: THREE.Vector2[] = [];

  for (let i = 0; i < TOTAL_SCREENS; i++) {
    const col = i % 2; // 0=Left, 1=Right
    const row = 2 - Math.floor(i / 2); // 2=Top, 1=Mid, 0=Bot

    const xMin = col === 0 ? mox : 0.5 + bx;
    const xMax = col === 0 ? 0.5 - bx : 1.0 - mox;
    const yMin = row === 0 ? moy : (row === 1 ? 1 / 3 + by : 2 / 3 + by);
    const yMax = row === 0 ? 1 / 3 - by : (row === 1 ? 2 / 3 - by : 1.0 - moy);

    const off = offsets[i] ?? { tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] };
    const sOff = screenOffsets?.[i] ?? [0, 0];
    const sFlip = screenFlips?.[i] ?? {
      flipH: false,
      flipV: false,
      rotation: 0,
      fineRotation: 0,
    };
    const sRotRad =
      ((sFlip.rotation || 0) + (sFlip.fineRotation || 0)) * (Math.PI / 180.0);

    // Initial 4 corner points with corner pin offsets
    let pBL = new THREE.Vector2(xMin + off.bl[0], yMin + off.bl[1]);
    let pBR = new THREE.Vector2(xMax + off.br[0], yMin + off.br[1]);
    let pTR = new THREE.Vector2(xMax + off.tr[0], yMax + off.tr[1]);
    let pTL = new THREE.Vector2(xMin + off.tl[0], yMax + off.tl[1]);

    // Screen center in UV space
    const sCenter = new THREE.Vector2(
      (pBL.x + pBR.x + pTR.x + pTL.x) * 0.25,
      (pBL.y + pBR.y + pTR.y + pTL.y) * 0.25,
    );

    // 1. Per-screen rotation around screen center
    if (Math.abs(sRotRad) > 1e-6) {
      pBL = rotatePointUV(pBL, sCenter, sRotRad);
      pBR = rotatePointUV(pBR, sCenter, sRotRad);
      pTR = rotatePointUV(pTR, sCenter, sRotRad);
      pTL = rotatePointUV(pTL, sCenter, sRotRad);
    }

    // 2. Per-screen offset
    if (sOff[0] !== 0 || sOff[1] !== 0) {
      pBL.x += sOff[0];
      pBL.y += sOff[1];
      pBR.x += sOff[0];
      pBR.y += sOff[1];
      pTR.x += sOff[0];
      pTR.y += sOff[1];
      pTL.x += sOff[0];
      pTL.y += sOff[1];
    }

    // 3. Global rotation around canvas center (0.5, 0.5)
    if (Math.abs(totalGlobalRotRad) > 1e-6) {
      pBL = rotatePointUV(pBL, globalOrigin, totalGlobalRotRad);
      pBR = rotatePointUV(pBR, globalOrigin, totalGlobalRotRad);
      pTR = rotatePointUV(pTR, globalOrigin, totalGlobalRotRad);
      pTL = rotatePointUV(pTL, globalOrigin, totalGlobalRotRad);
    }

    // 4. Global offset
    if (globalOffsetX !== 0 || globalOffsetY !== 0) {
      pBL.x += globalOffsetX;
      pBL.y += globalOffsetY;
      pBR.x += globalOffsetX;
      pBR.y += globalOffsetY;
      pTR.x += globalOffsetX;
      pTR.y += globalOffsetY;
      pTL.x += globalOffsetX;
      pTL.y += globalOffsetY;
    }

    // Point 0: Bottom-Left (BL)
    corners.push(pBL);
    // Point 1: Bottom-Right (BR)
    corners.push(pBR);
    // Point 2: Top-Right (TR)
    corners.push(pTR);
    // Point 3: Top-Left (TL)
    corners.push(pTL);
  }

  return corners;
}

export interface CalibratedScreenQuad {
  index: number;
  name: string;
  label: string;
  col: number;
  row: number;
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  center: { x: number; y: number };
}

export interface ShaderGeometryConfig {
  bezelWidthX: number;
  bezelWidthY: number;
  bezelOuter: number;
  cornerOffsets: ScreenCornerOffsets[];
  screenOffsets?: Array<[number, number]>;
  screenFlips?: ScreenFlipState[];
  globalRotation?: number;
  globalFineRotation?: number;
  globalOffsetX?: number;
  globalOffsetY?: number;
}

/**
 * Computes the 6 calibrated screen quadrilaterals in top-down screen coordinates [0, 1]^2
 * (y=0 at top, y=1 at bottom), incorporating bezels, per-screen offsets, corner keystone pinning,
 * rotations, and global offsets.
 */
export function computeCalibratedScreenQuads(
  config: ShaderGeometryConfig,
): CalibratedScreenQuad[] {
  const uvCorners = computeAllScreenCorners(
    config.bezelWidthX,
    config.bezelWidthY,
    config.bezelOuter,
    config.cornerOffsets,
    config.screenOffsets,
    config.screenFlips,
    config.globalRotation ?? 0,
    config.globalFineRotation ?? 0,
    config.globalOffsetX ?? 0,
    config.globalOffsetY ?? 0,
  );

  const quads: CalibratedScreenQuad[] = [];

  for (let i = 0; i < TOTAL_SCREENS; i++) {
    const quadInfo = MATRIX_QUADRANTS[i];
    const base = i * 4;
    // UV space corners: 0=BL, 1=BR, 2=TR, 3=TL (y=0 bottom, y=1 top)
    const uvBL = uvCorners[base + 0];
    const uvBR = uvCorners[base + 1];
    const uvTR = uvCorners[base + 2];
    const uvTL = uvCorners[base + 3];

    // Convert to top-down screen coordinates (y=0 top, y=1 bottom)
    const tl = { x: uvTL.x, y: 1.0 - uvTL.y };
    const tr = { x: uvTR.x, y: 1.0 - uvTR.y };
    const br = { x: uvBR.x, y: 1.0 - uvBR.y };
    const bl = { x: uvBL.x, y: 1.0 - uvBL.y };

    const minX = Math.min(tl.x, tr.x, br.x, bl.x);
    const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
    const minY = Math.min(tl.y, tr.y, br.y, bl.y);
    const maxY = Math.max(tl.y, tr.y, br.y, bl.y);

    const center = {
      x: (tl.x + tr.x + br.x + bl.x) * 0.25,
      y: (tl.y + tr.y + br.y + bl.y) * 0.25,
    };

    quads.push({
      index: i,
      name: quadInfo.name,
      label: quadInfo.label,
      col: quadInfo.col,
      row: quadInfo.row,
      tl,
      tr,
      br,
      bl,
      bounds: { minX, maxX, minY, maxY },
      center,
    });
  }

  return quads;
}

/**
 * Tests if point (px, py) is inside the quadrilateral (tl, tr, br, bl).
 * Uses sign consistency of 2D cross products for clockwise directed edges.
 */
export function isPointInQuad(
  px: number,
  py: number,
  quad: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  },
): boolean {
  const c1 = (quad.tr.x - quad.tl.x) * (py - quad.tl.y) - (quad.tr.y - quad.tl.y) * (px - quad.tl.x);
  const c2 = (quad.br.x - quad.tr.x) * (py - quad.tr.y) - (quad.br.y - quad.tr.y) * (px - quad.tr.x);
  const c3 = (quad.bl.x - quad.br.x) * (py - quad.br.y) - (quad.bl.y - quad.br.y) * (px - quad.br.x);
  const c4 = (quad.tl.x - quad.bl.x) * (py - quad.bl.y) - (quad.tl.y - quad.bl.y) * (px - quad.bl.x);

  const hasPos = c1 > 0 || c2 > 0 || c3 > 0 || c4 > 0;
  const hasNeg = c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0;

  return !(hasPos && hasNeg);
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Calculates Euclidean distance from point (px, py) to the nearest edge of the quad,
 * or returns 0 if the point is inside the quad.
 */
export function distanceToQuad(
  px: number,
  py: number,
  quad: CalibratedScreenQuad,
): number {
  if (isPointInQuad(px, py, quad)) return 0;
  const d1 = distanceToSegment(px, py, quad.tl.x, quad.tl.y, quad.tr.x, quad.tr.y);
  const d2 = distanceToSegment(px, py, quad.tr.x, quad.tr.y, quad.br.x, quad.br.y);
  const d3 = distanceToSegment(px, py, quad.br.x, quad.br.y, quad.bl.x, quad.bl.y);
  const d4 = distanceToSegment(px, py, quad.bl.x, quad.bl.y, quad.tl.x, quad.tl.y);
  return Math.min(d1, d2, d3, d4);
}

/**
 * Maps a point (x, y) in nominal viewport/camera space [0, 1]^2 to the calibrated
 * screen space. If matrixSplit is true, maps (x, y) into the corresponding calibrated screen quad
 * via bilinear quad interpolation.
 */
export function mapPointToCalibratedScreen(
  x: number,
  y: number,
  quads: CalibratedScreenQuad[],
  matrixSplit = true,
): { x: number; y: number } {
  if (!matrixSplit || !quads || quads.length < TOTAL_SCREENS) {
    return { x, y };
  }

  // Determine nominal 2x3 quadrant:
  // x in [0..0.5] -> col 0, x in [0.5..1.0] -> col 1
  // y in [0..1/3] -> row 0 (Top), y in [1/3..2/3] -> row 1 (Mid), y in [2/3..1] -> row 2 (Bot)
  const col = Math.min(1, Math.max(0, x < 0.5 ? 0 : 1));
  const rowIdx = Math.min(2, Math.max(0, y < 1 / 3 ? 0 : y < 2 / 3 ? 1 : 2));
  const screenIdx = rowIdx * 2 + col;
  const quad = quads[screenIdx];
  if (!quad) return { x, y };

  // Normalized local (u, v) in [0, 1]^2 within the nominal quadrant:
  const u = Math.min(1, Math.max(0, (x - col * 0.5) / 0.5));
  const v = Math.min(1, Math.max(0, (y - rowIdx * (1 / 3)) / (1 / 3)));

  // Bilinear interpolation across the 4 corners in top-down space:
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
 * Returns which CRT quadrant contains the normalized point (x, y in [0, 1]).
 * Uses top-down screen coordinates (y=0 top, y=1 bottom).
 * If calibrated quads are provided, checks against the calibrated screen geometries.
 */
export function getQuadrantForTopDownPoint(
  x: number,
  y: number,
  quads?: CalibratedScreenQuad[],
): MatrixQuadrant {
  if (quads && quads.length === TOTAL_SCREENS) {
    for (let i = 0; i < TOTAL_SCREENS; i++) {
      if (isPointInQuad(x, y, quads[i])) {
        return MATRIX_QUADRANTS[i];
      }
    }
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < TOTAL_SCREENS; i++) {
      const d = distanceToQuad(x, y, quads[i]);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }
    return MATRIX_QUADRANTS[closestIdx];
  }

  const col = x < 0.5 ? 0 : 1;
  const row = y < 1 / 3 ? 2 : y < 2 / 3 ? 1 : 0;
  const match = MATRIX_QUADRANTS.find((q) => q.col === col && q.row === row);
  return match ?? MATRIX_QUADRANTS[0];
}

/**
 * Returns which CRT quadrant contains the normalized point (x, y in [0, 1]) in WebGL UV space (y=0 bottom, y=1 top).
 */
export function getQuadrantForUVPoint(u: number, v: number): MatrixQuadrant {
  const col = u < 0.5 ? 0 : 1;
  const row = v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2;
  const match = MATRIX_QUADRANTS.find((q) => q.col === col && q.row === row);
  return match ?? MATRIX_QUADRANTS[0];
}
