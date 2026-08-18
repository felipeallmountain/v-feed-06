import { createNoiseDataUrl, createPhosphorMaskDataUrl } from './textureUtils';

export const CRT_FLYBACK_HZ = 15734;
export const IDLE_TIMEOUT_MS = 5000;
export const DEFAULT_VIDEO_ASPECT = 9 / 16;
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function getViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function getViewportAspect(): number {
  const { width, height } = getViewportSize();
  return width / Math.max(height, 1);
}

export { createNoiseDataUrl, createPhosphorMaskDataUrl };
