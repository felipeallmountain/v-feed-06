import { createNoiseDataUrl, createPhosphorMaskDataUrl } from './textureUtils';

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;
export const MATRIX_COLS = 2;
export const MATRIX_ROWS = 3;
export const CELL_WIDTH = CANVAS_WIDTH / MATRIX_COLS;
export const CELL_HEIGHT = CANVAS_HEIGHT / MATRIX_ROWS;
export const CRT_FLYBACK_HZ = 15734;
export const IDLE_TIMEOUT_MS = 5000;

export function cellIndexFromNormalized(x: number, y: number): number {
  const col = Math.min(MATRIX_COLS - 1, Math.max(0, Math.floor(x * MATRIX_COLS)));
  const row = Math.min(MATRIX_ROWS - 1, Math.max(0, Math.floor(y * MATRIX_ROWS)));
  return row * MATRIX_COLS + col;
}

export function cellCenter(index: number): { x: number; y: number } {
  const col = index % MATRIX_COLS;
  const row = Math.floor(index / MATRIX_COLS);
  return {
    x: (col + 0.5) / MATRIX_COLS,
    y: (row + 0.5) / MATRIX_ROWS,
  };
}

export { createNoiseDataUrl, createPhosphorMaskDataUrl };
