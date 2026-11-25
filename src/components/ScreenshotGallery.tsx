import React, { useState } from 'react';
import { Camera, Pencil, Copy, Check, Download, Trash2 } from 'lucide-react';
import { CapturedScreenshot } from '../types';
import { copyPngToClipboard } from '../utils/screenshotUtils';

interface ScreenshotGalleryProps {
  screenshots: CapturedScreenshot[];
  onEdit: (screenshot: CapturedScreenshot) => void;
  onRemove: (id: string) => void;
}

export const ScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({
  screenshots,
  onEdit,
  onRemove,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (screenshots.length === 0) return null;

  const handleCopy = async (shot: CapturedScreenshot) => {
    try {
      await copyPngToClipboard(shot.dataUrl);
      setCopiedId(shot.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownload = (shot: CapturedScreenshot, idx: number) => {
    const a = document.createElement('a');
    a.href = shot.dataUrl;
    a.download = `bugcast-screenshot-${idx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="glass-panel p-4 rounded-2xl space-y-3 border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Camera className="w-4 h-4 text-sky-400" />
          <h4 className="text-sm font-semibold text-white">Captured Screenshots</h4>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {screenshots.length} {screenshots.length === 1 ? 'image' : 'images'} (Click to Draw / Blur Secrets)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {screenshots.map((shot, idx) => (
          <div
            key={shot.id}
            className="group relative rounded-xl overflow-hidden bg-dark-900 border border-white/10 hover:border-sky-400/50 transition-all"
          >
            <button
              type="button"
              onClick={() => onEdit(shot)}
              className="w-full aspect-video block overflow-hidden bg-black"
            >
              <img
                src={shot.dataUrl}
                alt={shot.label || `Screenshot ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
              />
            </button>

            <div className="p-2.5 flex items-center justify-between bg-dark-800/80 border-t border-white/5 text-xs">
              <span className="font-mono text-[11px] text-slate-300 truncate">
                {shot.formattedTime ? `⏱ ${shot.formattedTime}` : `Screenshot #${idx + 1}`}
              </span>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onEdit(shot)}
                  title="Annotate / Blur Secrets"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-sky-500/20 text-sky-300 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleCopy(shot)}
                  title="Copy PNG to Clipboard"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-brand-300 transition-colors"
                >
                  {copiedId === shot.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDownload(shot, idx)}
                  title="Download PNG"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onRemove(shot.id)}
                  title="Remove"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
