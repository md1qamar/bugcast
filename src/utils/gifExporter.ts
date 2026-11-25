import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface GifExportResult {
  gifBlob: Blob;
  gifUrl: string;
  frameCount: number;
  sizeBytes: number;
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = timeSec;
    setTimeout(done, 450);
  });
}

async function resolveVideoDuration(video: HTMLVideoElement, fallbackDurationSec: number): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }
  // Chrome WebM MediaRecorder workaround: seek far ahead to force duration calculation
  await seekVideo(video, 1e6);
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }
  return Math.max(1, fallbackDurationSec);
}

/**
 * Convert a recorded WebM video blob into an optimized GIF directly in the browser.
 */
export async function exportVideoToGif(
  videoBlob: Blob,
  fallbackDurationSec: number,
  options: {
    targetWidth?: number;
    fps?: number;
    maxDurationSec?: number;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<GifExportResult> {
  const {
    targetWidth = 760,
    fps = 10,
    maxDurationSec = 25,
    onProgress,
  } = options;

  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video for GIF conversion'));
    });

    const totalDuration = await resolveVideoDuration(video, fallbackDurationSec);
    const clipDuration = Math.min(totalDuration, maxDurationSec);
    const stepSec = 1 / fps;
    const delayMs = Math.round(1000 / fps);
    const totalFrames = Math.max(2, Math.floor(clipDuration * fps));

    const aspect = (video.videoHeight || 720) / (video.videoWidth || 1280);
    const width = targetWidth;
    const height = Math.max(1, Math.round(targetWidth * aspect));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const gif = GIFEncoder();

    for (let i = 0; i < totalFrames; i++) {
      const t = Math.min(clipDuration - 0.01, i * stepSec);
      await seekVideo(video, t);
      ctx.drawImage(video, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);

      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, width, height, { palette, delay: delayMs });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalFrames) * 100));
      }
      // Yield back to UI thread periodically so progress renders smoothly
      if (i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    gif.finish();
    const bytes = gif.bytes();
    const gifBlob = new Blob([bytes], { type: 'image/gif' });
    const gifUrl = URL.createObjectURL(gifBlob);

    return {
      gifBlob,
      gifUrl,
      frameCount: totalFrames,
      sizeBytes: gifBlob.size,
    };
  } finally {
    URL.revokeObjectURL(videoUrl);
    video.src = '';
  }
}
