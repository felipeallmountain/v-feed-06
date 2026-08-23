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

  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, width, height);

  const colW = width / 2;
  const rowH = height / 3;
  const lineW = Math.max(1.5, Math.min(width, height) * 0.002);
  const fontSize = Math.max(12, Math.min(colW, rowH) * 0.055);

  const screenLabels: [string, string][] = [
    ['CRT [01]', 'TOP-LEFT'],
    ['CRT [02]', 'TOP-RIGHT'],
    ['CRT [03]', 'MID-LEFT'],
    ['CRT [04]', 'MID-RIGHT'],
    ['CRT [05]', 'BOT-LEFT'],
    ['CRT [06]', 'BOT-RIGHT'],
  ];

  const smpteColors = [
    '#ffffff', // White
    '#e5e500', // Yellow
    '#00e5e5', // Cyan
    '#00e500', // Green
    '#e500e5', // Magenta
    '#e50000', // Red
    '#0000e5', // Blue
    '#1a1a1a', // Black
  ];

  // Draw each of the 6 CRT screens
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      const [crtTag, crtPos] = screenLabels[idx];
      const cx = col * colW;
      const cy = row * rowH;
      const pad = Math.min(colW, rowH) * 0.06;
      const innerW = colW - pad * 2;
      const innerH = rowH - pad * 2;

      // Cell outer border
      ctx.strokeStyle = 'rgba(232, 228, 217, 0.25)';
      ctx.lineWidth = lineW;
      ctx.strokeRect(cx + 1, cy + 1, colW - 2, rowH - 2);

      // Safe-area screen frame
      ctx.strokeStyle = '#3ddc97';
      ctx.lineWidth = lineW;
      ctx.strokeRect(cx + pad, cy + pad, innerW, innerH);

      // Cell center crosshair
      const midX = cx + colW * 0.5;
      const midY = cy + rowH * 0.5;
      ctx.strokeStyle = 'rgba(61, 220, 151, 0.4)';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(midX, cy + pad);
      ctx.lineTo(midX, cy + rowH - pad);
      ctx.moveTo(cx + pad, midY);
      ctx.lineTo(cx + colW - pad, midY);
      ctx.stroke();

      // Centering circle
      const circleR = Math.min(colW, rowH) * 0.14;
      ctx.beginPath();
      ctx.arc(midX, midY, circleR, 0, Math.PI * 2);
      ctx.stroke();

      // Corner alignment brackets
      const bracketLen = Math.min(colW, rowH) * 0.08;
      const corners: [number, number, number, number][] = [
        [cx + pad, cy + pad, 1, 1],
        [cx + colW - pad, cy + pad, -1, 1],
        [cx + pad, cy + rowH - pad, 1, -1],
        [cx + colW - pad, cy + rowH - pad, -1, -1],
      ];
      ctx.strokeStyle = '#f0a500';
      ctx.lineWidth = lineW * 1.5;
      for (const [bx, by, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bracketLen * dx, by);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, by + bracketLen * dy);
        ctx.stroke();
      }

      // SMPTE Color Bars strip
      const barH = Math.max(8, rowH * 0.06);
      const barY = cy + rowH - pad - barH * 1.6;
      const barW = innerW / smpteColors.length;
      for (let b = 0; b < smpteColors.length; b++) {
        ctx.fillStyle = smpteColors[b];
        ctx.fillRect(cx + pad + b * barW, barY, barW, barH);
      }

      // Linear grating stripes (Frequency focus pattern)
      ctx.strokeStyle = 'rgba(232, 228, 217, 0.18)';
      ctx.lineWidth = 1;
      const gratingW = innerW * 0.35;
      const gratingX = midX - gratingW * 0.5;
      const gratingY = cy + pad + fontSize * 1.8;
      const numLines = 14;
      for (let l = 0; l <= numLines; l++) {
        const lx = gratingX + (l / numLines) * gratingW;
        ctx.beginPath();
        ctx.moveTo(lx, gratingY);
        ctx.lineTo(lx, gratingY + barH * 1.2);
        ctx.stroke();
      }

      // Text labels
      ctx.fillStyle = '#3ddc97';
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.fillText(crtTag, cx + pad + 8, cy + pad + fontSize + 4);

      ctx.fillStyle = '#e8e4d9';
      ctx.font = `${fontSize * 0.75}px monospace`;
      ctx.fillText(crtPos, cx + pad + 8, cy + pad + fontSize * 2.1 + 4);

      ctx.fillStyle = 'rgba(232, 228, 217, 0.5)';
      ctx.font = `${fontSize * 0.6}px monospace`;
      ctx.fillText('540×640 · NTSC · 60Hz', cx + pad + 8, barY - 6);
    }
  }

  // Global matrix split reference lines
  ctx.strokeStyle = 'rgba(240, 165, 0, 0.6)';
  ctx.lineWidth = lineW * 1.5;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 0);
  ctx.lineTo(width * 0.5, height);
  ctx.moveTo(0, height * (1 / 3));
  ctx.lineTo(width, height * (1 / 3));
  ctx.moveTo(0, height * (2 / 3));
  ctx.lineTo(width, height * (2 / 3));
  ctx.stroke();

  // Header Title
  const titleSize = Math.max(14, Math.min(width, height) * 0.02);
  ctx.fillStyle = '#f0a500';
  ctx.font = `bold ${titleSize}px monospace`;
  ctx.fillText('V-FEED [06] · 2×3 CRT MATRIX ALIGNMENT', width * 0.04, titleSize * 1.4);

  return canvas.toDataURL('image/png');
}
