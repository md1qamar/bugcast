import { AnnotationLayer, ScreenshotCrop, StudioTheme } from '../types';

export interface ContentRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderedSceneMetrics {
  canvasWidth: number;
  canvasHeight: number;
  contentRect: ContentRect;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Compute output dimensions and inner content rectangle for a given source image + crop + theme + scale.
 */
export function computeSceneMetrics(
  srcW: number,
  srcH: number,
  theme: StudioTheme,
  crop?: ScreenshotCrop | null,
  scalePercent: 100 | 75 | 50 = 100
): RenderedSceneMetrics {
  const scale = scalePercent / 100;
  const cw = Math.max(64, Math.round((crop ? crop.w : srcW) * scale));
  const ch = Math.max(64, Math.round((crop ? crop.h : srcH) * scale));

  if (theme === 'raw') {
    return {
      canvasWidth: cw,
      canvasHeight: ch,
      contentRect: { x: 0, y: 0, w: cw, h: ch },
    };
  }

  const padX = Math.max(28, Math.round(cw * 0.04));
  const padY = Math.max(28, Math.round(ch * 0.05));
  const titleBarH = Math.max(28, Math.round(ch * 0.036));
  return {
    canvasWidth: cw + padX * 2,
    canvasHeight: ch + titleBarH + padY * 2,
    contentRect: { x: padX, y: padY + titleBarH, w: cw, h: ch },
  };
}

/**
 * Render base screenshot (with optional crop, scale, and Studio frame) onto a target canvas.
 */
export function drawStudioBaseToCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  theme: StudioTheme,
  windowLabel?: string,
  crop?: ScreenshotCrop | null,
  scalePercent: 100 | 75 | 50 = 100
): RenderedSceneMetrics {
  const metrics = computeSceneMetrics(srcW, srcH, theme, crop, scalePercent);
  canvas.width = metrics.canvasWidth;
  canvas.height = metrics.canvasHeight;
  const ctx = canvas.getContext('2d')!;

  const sx = crop ? Math.max(0, Math.round(crop.x)) : 0;
  const sy = crop ? Math.max(0, Math.round(crop.y)) : 0;
  const sw = crop ? Math.min(srcW - sx, Math.round(crop.w)) : srcW;
  const sh = crop ? Math.min(srcH - sy, Math.round(crop.h)) : srcH;
  const { x: cx, y: cy, w: cw, h: ch } = metrics.contentRect;

  if (theme === 'raw') {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cw, ch);
    return metrics;
  }

  const grad = ctx.createLinearGradient(0, 0, metrics.canvasWidth, metrics.canvasHeight);
  if (theme === 'cyber') {
    grad.addColorStop(0, '#041f1c');
    grad.addColorStop(0.5, '#071426');
    grad.addColorStop(1, '#092d22');
  } else if (theme === 'midnight') {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
  } else {
    grad.addColorStop(0, '#2b0f26');
    grad.addColorStop(0.5, '#3b1526');
    grad.addColorStop(1, '#1a1025');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, metrics.canvasWidth, metrics.canvasHeight);

  const titleBarH = cy - Math.max(28, Math.round(ch * 0.05));
  const frameX = cx;
  const frameY = cy - titleBarH;
  const frameW = cw;
  const frameH = ch + titleBarH;
  const radius = 14;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#0d1117';
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.clip();

  ctx.fillStyle = '#161b22';
  ctx.fillRect(frameX, frameY, frameW, titleBarH);

  const dotY = frameY + titleBarH / 2;
  const dotR = Math.max(4, Math.round(titleBarH * 0.16));
  const dotStart = frameX + 18;
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((col, idx) => {
    ctx.beginPath();
    ctx.arc(dotStart + idx * (dotR * 3.1), dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });

  if (windowLabel) {
    ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
    ctx.font = `600 ${Math.max(11, Math.round(titleBarH * 0.38))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(windowLabel, frameX + frameW / 2, dotY);
  }

  ctx.drawImage(source, sx, sy, sw, sh, cx, cy, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
  ctx.stroke();
  ctx.restore();

  return metrics;
}

/**
 * Word-wrap text into lines that fit cleanly within maxWidth pixels.
 */
export function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const safeMax = Math.max(60, maxWidth);
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let current = '';

    for (const word of words) {
      if (!word) continue;
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= safeMax) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Break ultra-long unbroken tokens character by character
        if (ctx.measureText(word).width > safeMax) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > safeMax && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Compute pixel bounding box for a Text Callout, clamped cleanly inside the canvas bounds.
 */
export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  layer: Extract<AnnotationLayer, { type: 'text' }>,
  metrics: RenderedSceneMetrics
): { bx: number; by: number; bw: number; bh: number; lines: string[]; fontPx: number; lineHeight: number } {
  const { contentRect: cr, canvasWidth, canvasHeight } = metrics;
  const fontPx = Math.max(14, Math.round(layer.fontSize * (cr.w / 1200)));
  const lineHeight = Math.round(fontPx * 1.32);
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;

  const maxWrapPx = Math.max(100, Math.min(canvasWidth - 36, Math.round(layer.maxWidth * cr.w)));
  const lines = wrapTextLines(ctx, layer.text || 'Text', maxWrapPx);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 40);

  const padX = Math.max(10, Math.round(fontPx * 0.65));
  const padY = Math.max(7, Math.round(fontPx * 0.45));
  const bw = Math.min(canvasWidth - 16, Math.ceil(widest + padX * 2));
  const bh = Math.ceil(lines.length * lineHeight + padY * 2);

  const rawX = cr.x + layer.x * cr.w;
  const rawY = cr.y + layer.y * cr.h;
  const bx = Math.max(8, Math.min(canvasWidth - bw - 8, rawX));
  const by = Math.max(8, Math.min(canvasHeight - bh - 8, rawY));

  return { bx, by, bw, bh, lines, fontPx, lineHeight };
}

/**
 * Capture a single high-resolution screenshot via getDisplayMedia without starting video recording.
 */
export async function captureSingleScreenFrame(
  theme: StudioTheme,
  windowLabel?: string
): Promise<{ dataUrl: string; rawDataUrl: string; width: number; height: number; rawWidth: number; rawHeight: number }> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject);
      };
      video.onerror = () => reject(new Error('Could not decode screen frame'));
    });
    await new Promise((r) => setTimeout(r, 150));

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    // 1. Capture unframed raw surface
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = w;
    rawCanvas.height = h;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
    const rawDataUrl = rawCanvas.toDataURL('image/png');

    // 2. Render initial Studio-framed version
    const framedCanvas = document.createElement('canvas');
    const metrics = drawStudioBaseToCanvas(framedCanvas, rawCanvas, w, h, theme, windowLabel, null, 100);
    return {
      dataUrl: framedCanvas.toDataURL('image/png'),
      rawDataUrl,
      width: metrics.canvasWidth,
      height: metrics.canvasHeight,
      rawWidth: w,
      rawHeight: h,
    };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

/**
 * Snap a PNG screenshot directly from the active Studio Compositor canvas mid-recording.
 */
export function snapFrameFromCompositorCanvas(canvas: HTMLCanvasElement): {
  dataUrl: string;
  rawDataUrl: string;
  width: number;
  height: number;
} {
  const url = canvas.toDataURL('image/png');
  return {
    dataUrl: url,
    rawDataUrl: url,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Read an uploaded image File into a PNG/dataUrl + natural dimensions.
 */
export function readImageFileAsDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => resolve({ dataUrl, width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Try reading an image from the system clipboard (Ctrl+V or Replace from Clipboard).
 */
export async function readClipboardImageDataUrl(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imgType = item.types.find((t) => t.startsWith('image/'));
    if (imgType) {
      const blob = await item.getType(imgType);
      const file = new File([blob], 'clipboard.png', { type: imgType });
      return await readImageFileAsDataUrl(file);
    }
  }
  return null;
}

/**
 * Copy a PNG data URL straight to the system clipboard so users can Ctrl+V into GitHub/Slack/Jira.
 */
export async function copyPngToClipboard(dataUrl: string): Promise<void> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
