import { StudioTheme } from '../types';

export interface CompositorOptions {
  screenStream: MediaStream;
  webcamStream: MediaStream | null;
  theme: StudioTheme;
  width: number;
  height: number;
  fps: number;
  windowLabel?: string;
}

export interface StudioCompositorHandle {
  canvas: HTMLCanvasElement;
  stream: MediaStream;
  updateTheme: (theme: StudioTheme) => void;
  flashMarker: (label: string) => void;
  destroy: () => void;
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

function drawStudioBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, theme: StudioTheme) {
  if (theme === 'raw') {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (theme === 'cyber') {
    grad.addColorStop(0, '#041f1c');
    grad.addColorStop(0.5, '#071426');
    grad.addColorStop(1, '#092d22');
  } else if (theme === 'midnight') {
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
  } else {
    // sunset
    grad.addColorStop(0, '#2b0f26');
    grad.addColorStop(0.5, '#3b1526');
    grad.addColorStop(1, '#1a1025');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle ambient glow circles
  ctx.save();
  const glow = ctx.createRadialGradient(w * 0.2, h * 0.15, 20, w * 0.2, h * 0.15, w * 0.55);
  glow.addColorStop(0, theme === 'sunset' ? 'rgba(244, 63, 94, 0.22)' : 'rgba(34, 197, 94, 0.16)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Real-time Canvas compositor that merges screen capture, Studio frame,
 * and burned-in webcam PiP into a single MediaStream for MediaRecorder.
 */
export function createStudioCompositor(options: CompositorOptions): StudioCompositorHandle {
  const { screenStream, webcamStream, width, height, fps, windowLabel } = options;
  let currentTheme = options.theme;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const screenVideo = document.createElement('video');
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.srcObject = screenStream;
  screenVideo.play().catch(() => {});

  let webcamVideo: HTMLVideoElement | null = null;
  if (webcamStream) {
    webcamVideo = document.createElement('video');
    webcamVideo.muted = true;
    webcamVideo.playsInline = true;
    webcamVideo.srcObject = webcamStream;
    webcamVideo.play().catch(() => {});
  }

  let activeBanner: { label: string; expiresAt: number } | null = null;
  let destroyed = false;

  const drawFrame = () => {
    if (destroyed) return;

    drawStudioBackdrop(ctx, width, height, currentTheme);

    const hasScreen = screenVideo.readyState >= 2 && screenVideo.videoWidth > 0;
    if (hasScreen) {
      const vw = screenVideo.videoWidth;
      const vh = screenVideo.videoHeight;

      if (currentTheme === 'raw') {
        const scale = Math.min(width / vw, height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(screenVideo, (width - dw) / 2, (height - dh) / 2, dw, dh);
      } else {
        const padX = Math.round(width * 0.045);
        const padY = Math.round(height * 0.055);
        const titleBarH = Math.round(height * 0.036);
        const maxFrameW = width - padX * 2;
        const maxFrameH = height - padY * 2 - titleBarH;

        const scale = Math.min(maxFrameW / vw, maxFrameH / vh);
        const contentW = vw * scale;
        const contentH = vh * scale;
        const frameW = contentW;
        const frameH = contentH + titleBarH;
        const frameX = (width - frameW) / 2;
        const frameY = (height - frameH) / 2;
        const radius = 16;

        // Window drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 45;
        ctx.shadowOffsetY = 18;
        ctx.fillStyle = '#0d1117';
        drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
        ctx.fill();
        ctx.restore();

        // Clip window frame
        ctx.save();
        drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
        ctx.clip();

        // Title bar
        ctx.fillStyle = '#161b22';
        ctx.fillRect(frameX, frameY, frameW, titleBarH);

        // Window dots
        const dotY = frameY + titleBarH / 2;
        const dotR = Math.max(4, Math.round(titleBarH * 0.16));
        const dotStart = frameX + 18;
        const colors = ['#ff5f56', '#ffbd2e', '#27c93f'];
        colors.forEach((col, idx) => {
          ctx.beginPath();
          ctx.arc(dotStart + idx * (dotR * 3.1), dotY, dotR, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
        });

        // Window label
        if (windowLabel) {
          ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
          ctx.font = `600 ${Math.max(11, Math.round(titleBarH * 0.38))}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(windowLabel, frameX + frameW / 2, dotY);
        }

        // Screen video inside frame
        ctx.drawImage(screenVideo, frameX, frameY + titleBarH, contentW, contentH);
        ctx.restore();

        // Crisp subtle border around frame
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, frameX, frameY, frameW, frameH, radius);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Burned-in Webcam PiP
    if (webcamVideo && webcamVideo.readyState >= 2 && webcamVideo.videoWidth > 0) {
      const pipW = Math.round(width * 0.17);
      const pipH = Math.round((pipW * 9) / 16);
      const margin = Math.round(width * 0.025);
      const pipX = width - pipW - margin;
      const pipY = height - pipH - margin;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 24;
      drawRoundedRect(ctx, pipX, pipY, pipW, pipH, 16);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, pipX, pipY, pipW, pipH, 16);
      ctx.clip();
      // Mirror webcam horizontally
      ctx.translate(pipX + pipW, pipY);
      ctx.scale(-1, 1);
      ctx.drawImage(webcamVideo, 0, 0, pipW, pipH);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, pipX, pipY, pipW, pipH, 16);
      ctx.stroke();
      ctx.restore();
    }

    // Optional live event flash banner
    if (activeBanner && Date.now() < activeBanner.expiresAt) {
      const text = activeBanner.label;
      ctx.save();
      ctx.font = '600 16px "JetBrains Mono", monospace';
      const textW = ctx.measureText(text).width;
      const boxW = textW + 36;
      const boxH = 38;
      const bx = (width - boxW) / 2;
      const by = 24;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      drawRoundedRect(ctx, bx, by, boxW, boxH, 999);
      ctx.fill();

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, bx, by, boxW, boxH, 999);
      ctx.stroke();

      ctx.fillStyle = '#fca5a5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, by + boxH / 2);
      ctx.restore();
    }
  };

  // Hybrid loop: interval keeps recording running at steady FPS even when user switches tabs!
  const intervalMs = Math.max(16, Math.round(1000 / fps));
  const timerId = window.setInterval(drawFrame, intervalMs);
  drawFrame();

  const stream = canvas.captureStream(fps);

  return {
    canvas,
    stream,
    updateTheme: (theme: StudioTheme) => {
      currentTheme = theme;
    },
    flashMarker: (label: string) => {
      activeBanner = { label, expiresAt: Date.now() + 2200 };
    },
    destroy: () => {
      destroyed = true;
      window.clearInterval(timerId);
      screenVideo.srcObject = null;
      if (webcamVideo) webcamVideo.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
