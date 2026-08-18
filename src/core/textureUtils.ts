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
  // R G B aperture grille triad
  pixels.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createCalibrationGridDataUrl(
  width = 1080,
  height = 1920,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, width, height);

  const cols = 2;
  const rows = 3;
  const cellW = width / cols;
  const cellH = height / rows;
  const labels = ['CRT 1', 'CRT 2', 'CRT 3', 'CRT 4', 'CRT 5', 'CRT 6'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * cellW;
      const y = r * cellH;
      ctx.strokeStyle = i % 2 === 0 ? '#3ddc97' : '#f0a500';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 8, y + 8, cellW - 16, cellH - 16);

      ctx.fillStyle = '#e8e4d9';
      ctx.font = '48px monospace';
      ctx.fillText(labels[i], x + 40, y + 80);

      ctx.beginPath();
      ctx.moveTo(x, y + cellH / 2);
      ctx.lineTo(x + cellW, y + cellH / 2);
      ctx.moveTo(x + cellW / 2, y);
      ctx.lineTo(x + cellW / 2, y + cellH);
      ctx.strokeStyle = 'rgba(232,228,217,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}
