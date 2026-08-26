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

/**
 * Returns which CRT quadrant contains the normalized point (x, y in [0, 1]).
 * Uses top-down screen coordinates (y=0 top, y=1 bottom) as supplied by vision trackers.
 */
export function getQuadrantForTopDownPoint(x: number, y: number): MatrixQuadrant {
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
