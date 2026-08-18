/** Procedural textures so the install runs without binary assets. */

export function createNoiseDataUrl(size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createPhosphorMaskDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 3;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const pixels = ctx.createImageData(3, 1);
  pixels.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createCalibrationGridDataUrl(
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, width, height);

  const pad = Math.min(width, height) * 0.04;
  const lineW = Math.max(2, Math.min(width, height) * 0.003);
  const fontSize = Math.max(20, Math.min(width, height) * 0.035);

  ctx.strokeStyle = '#3ddc97';
  ctx.lineWidth = lineW;
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  ctx.strokeStyle = 'rgba(232,228,217,0.35)';
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.moveTo(width / 2, pad);
  ctx.lineTo(width / 2, height - pad);
  ctx.moveTo(pad, height / 2);
  ctx.lineTo(width - pad, height / 2);
  ctx.stroke();

  const markerLen = Math.min(width, height) * 0.06;
  const corners: [number, number, number, number][] = [
    [pad, pad, 1, 1],
    [width - pad, pad, -1, 1],
    [pad, height - pad, 1, -1],
    [width - pad, height - pad, -1, -1],
  ];
  ctx.strokeStyle = '#f0a500';
  ctx.lineWidth = lineW * 1.5;
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + markerLen * dx, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + markerLen * dy);
    ctx.stroke();
  }

  ctx.fillStyle = '#e8e4d9';
  ctx.font = `${fontSize}px monospace`;
  ctx.fillText('CALIBRATION', pad * 2, pad * 2 + fontSize);

  return canvas.toDataURL('image/png');
}
