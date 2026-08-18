import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  MATRIX_COLS,
  MATRIX_ROWS,
} from '../core/constants';

export interface BezelOffsets {
  offsetX: number;
  offsetY: number;
  gapX: number;
  gapY: number;
}

/**
 * Logical 2×3 viewport splitter helpers for bezel compensation and hand→CRT mapping.
 */
export class MatrixSplitter {
  readonly width = CANVAS_WIDTH;
  readonly height = CANVAS_HEIGHT;
  readonly cols = MATRIX_COLS;
  readonly rows = MATRIX_ROWS;
  readonly cellWidth = CELL_WIDTH;
  readonly cellHeight = CELL_HEIGHT;

  toUniforms(bezel: BezelOffsets): {
    uBezelOffset: [number, number];
    uBezelGap: [number, number];
  } {
    return {
      uBezelOffset: [bezel.offsetX, bezel.offsetY],
      uBezelGap: [bezel.gapX, bezel.gapY],
    };
  }

  /** Map normalized hand coords to CRT cell index 0–5. */
  cellFromHand(x: number, y: number): number {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x * this.cols)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y * this.rows)));
    return row * this.cols + col;
  }

  cellUvCenter(index: number): { x: number; y: number } {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return {
      x: (col + 0.5) / this.cols,
      y: (row + 0.5) / this.rows,
    };
  }
}
