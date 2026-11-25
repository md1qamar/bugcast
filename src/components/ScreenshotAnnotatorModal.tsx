import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  MousePointer2,
  ArrowUpRight,
  Square,
  Pencil,
  EyeOff,
  Type,
  ImagePlus,
  Crop,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Check,
  Download,
  CheckCircle2,
  RefreshCw,
  ClipboardPaste,
  Upload,
  Monitor,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AnnotationLayer, CapturedScreenshot, ScreenshotCrop, StudioTheme } from '../types';
import {
  captureSingleScreenFrame,
  copyPngToClipboard,
  drawStudioBaseToCanvas,
  measureTextBox,
  readClipboardImageDataUrl,
  readImageFileAsDataUrl,
  RenderedSceneMetrics,
} from '../utils/screenshotUtils';

type ToolType = 'select' | 'arrow' | 'box' | 'blur' | 'pen' | 'text' | 'crop';

type HandleKind =
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'p1'
  | 'p2'
  | 'text-right';

interface DragSession {
  mode: 'create' | 'move' | 'resize' | 'crop';
  handle?: HandleKind;
  layerId?: string;
  startNorm: { x: number; y: number };
  startCanvasPx: { x: number; y: number };
  initialLayer?: AnnotationLayer;
}

interface ScreenshotAnnotatorModalProps {
  screenshot: CapturedScreenshot;
  onSave: (updated: CapturedScreenshot) => void;
  onClose: () => void;
}

const COLORS = ['#ef4444', '#22c55e', '#f59e0b', '#38bdf8', '#a855f7', '#ffffff'];
const THEMES: { id: StudioTheme; label: string }[] = [
  { id: 'cyber', label: 'Cyber' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'raw', label: 'Raw' },
];

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number
) {
  const headLen = Math.max(15, lineWidth * 4.2);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPixelatedBlur(
  ctx: CanvasRenderingContext2D,
  baseCanvas: HTMLCanvasElement,
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const x = Math.max(0, Math.round(Math.min(rx, rx + rw)));
  const y = Math.max(0, Math.round(Math.min(ry, ry + rh)));
  const w = Math.min(baseCanvas.width - x, Math.round(Math.abs(rw)));
  const h = Math.min(baseCanvas.height - y, Math.round(Math.abs(rh)));
  if (w < 4 || h < 4) return;

  const block = Math.max(12, Math.round(baseCanvas.width / 80));
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) return;

  const imgData = baseCtx.getImageData(x, y, w, h);
  const data = imgData.data;

  ctx.save();
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const sampleX = Math.min(w - 1, bx + Math.floor(block / 2));
      const sampleY = Math.min(h - 1, by + Math.floor(block / 2));
      const idx = (sampleY * w + sampleX) * 4;
      ctx.fillStyle = `rgb(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]})`;
      ctx.fillRect(x + bx, y + by, Math.min(block, w - bx), Math.min(block, h - by));
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const ScreenshotAnnotatorModal: React.FC<ScreenshotAnnotatorModalProps> = ({
  screenshot,
  onSave,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const overlayImagesCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const metricsRef = useRef<RenderedSceneMetrics | null>(null);

  const fileUploadRef = useRef<HTMLInputElement>(null);
  const baseUploadRef = useRef<HTMLInputElement>(null);
  const replaceLayerUploadRef = useRef<HTMLInputElement>(null);

  // Non-destructive base image state
  const [rawBaseUrl, setRawBaseUrl] = useState(screenshot.rawDataUrl || screenshot.dataUrl);
  const [theme, setTheme] = useState<StudioTheme>(screenshot.theme || 'cyber');
  const [crop, setCrop] = useState<ScreenshotCrop | null>(screenshot.crop || null);
  const [scalePercent, setScalePercent] = useState<100 | 75 | 50>(screenshot.scalePercent || 100);
  const [baseReady, setBaseReady] = useState(false);

  // Vector annotation layers + undo/redo
  const [layers, setLayers] = useState<AnnotationLayer[]>(screenshot.annotations || []);
  const [undoStack, setUndoStack] = useState<AnnotationLayer[][]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationLayer[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Active tool & style defaults
  const [tool, setTool] = useState<ToolType>('select');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(24);

  // Interactive transient drag / crop / text editor states
  const [draftLayer, setDraftLayer] = useState<AnnotationLayer | null>(null);
  const [cropDraft, setCropDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  const [textModal, setTextModal] = useState<{
    editingLayerId?: string;
    normX: number;
    normY: number;
    value: string;
  } | null>(null);

  const [showReplaceMenu, setShowReplaceMenu] = useState(false);
  const [copiedPng, setCopiedPng] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [sceneSize, setSceneSize] = useState<{ w: number; h: number }>({
    w: screenshot.width,
    h: screenshot.height,
  });

  const selectedLayer = layers.find((l) => l.id === selectedId) || null;

  const commitLayers = useCallback((updater: (prev: AnnotationLayer[]) => AnnotationLayer[]) => {
    setLayers((prev) => {
      const next = updater(prev);
      setUndoStack((u) => [...u.slice(-24), prev]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setLayers((curr) => {
        setRedoStack((r) => [...r, curr]);
        return previous;
      });
      setSelectedId(null);
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const nextState = r[r.length - 1];
      setLayers((curr) => {
        setUndoStack((u) => [...u, curr]);
        return nextState;
      });
      setSelectedId(null);
      return r.slice(0, -1);
    });
  }, []);

  // Load raw base image + build base studio canvas whenever base image, theme, crop, or scale changes
  useEffect(() => {
    setBaseReady(false);
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      const off = document.createElement('canvas');
      const metrics = drawStudioBaseToCanvas(
        off,
        img,
        img.width,
        img.height,
        theme,
        screenshot.windowLabel,
        crop,
        scalePercent
      );
      baseCanvasRef.current = off;
      metricsRef.current = metrics;
      setSceneSize({ w: metrics.canvasWidth, h: metrics.canvasHeight });

      if (canvasRef.current) {
        canvasRef.current.width = metrics.canvasWidth;
        canvasRef.current.height = metrics.canvasHeight;
      }
      setBaseReady(true);
    };
    img.src = rawBaseUrl;
  }, [rawBaseUrl, theme, crop, scalePercent, screenshot.windowLabel]);

  // Preload any image overlay layers
  const ensureOverlayImageLoaded = useCallback((dataUrl: string, onLoad: () => void) => {
    const cache = overlayImagesCacheRef.current;
    if (cache.has(dataUrl)) return cache.get(dataUrl)!;
    const img = new Image();
    img.onload = onLoad;
    img.src = dataUrl;
    cache.set(dataUrl, img);
    return img;
  }, []);

  // Compute pixel bounding box for any layer in current scene coordinates
  const getLayerBoundsPx = useCallback(
    (ctx: CanvasRenderingContext2D, layer: AnnotationLayer, metrics: RenderedSceneMetrics) => {
      const { contentRect: cr } = metrics;
      if (layer.type === 'box' || layer.type === 'blur' || layer.type === 'image') {
        const px = cr.x + layer.x * cr.w;
        const py = cr.y + layer.y * cr.h;
        const pw = layer.w * cr.w;
        const ph = layer.h * cr.h;
        return {
          x: Math.min(px, px + pw),
          y: Math.min(py, py + ph),
          w: Math.abs(pw),
          h: Math.abs(ph),
        };
      }
      if (layer.type === 'arrow') {
        const x1 = cr.x + layer.x1 * cr.w;
        const y1 = cr.y + layer.y1 * cr.h;
        const x2 = cr.x + layer.x2 * cr.w;
        const y2 = cr.y + layer.y2 * cr.h;
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.max(8, Math.abs(x2 - x1)),
          h: Math.max(8, Math.abs(y2 - y1)),
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
        };
      }
      if (layer.type === 'pen') {
        const xs = layer.points.map((p) => cr.x + p.x * cr.w);
        const ys = layer.points.map((p) => cr.y + p.y * cr.h);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, w: Math.max(8, maxX - minX), h: Math.max(8, maxY - minY) };
      }
      // text
      const measured = measureTextBox(ctx, layer, metrics);
      return { x: measured.bx, y: measured.by, w: measured.bw, h: measured.bh };
    },
    []
  );

  // Core scene painter (used both for live editor AND clean export)
  const paintScene = useCallback(
    (targetCanvas: HTMLCanvasElement, activeSelectionId: string | null) => {
      const base = baseCanvasRef.current;
      const metrics = metricsRef.current;
      if (!base || !metrics) return;

      targetCanvas.width = metrics.canvasWidth;
      targetCanvas.height = metrics.canvasHeight;
      const ctx = targetCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      ctx.drawImage(base, 0, 0);

      const { contentRect: cr } = metrics;
      const allLayers = draftLayer ? [...layers, draftLayer] : layers;
      const scaleStroke = Math.max(0.75, cr.w / 1280);

      for (const act of allLayers) {
        if (act.type === 'blur') {
          drawPixelatedBlur(
            ctx,
            base,
            cr.x + act.x * cr.w,
            cr.y + act.y * cr.h,
            act.w * cr.w,
            act.h * cr.h
          );
        } else if (act.type === 'image') {
          const img = ensureOverlayImageLoaded(act.dataUrl, () => {
            if (canvasRef.current) paintScene(canvasRef.current, selectedId);
          });
          if (img.complete && img.naturalWidth > 0) {
            const px = cr.x + Math.min(act.x, act.x + act.w) * cr.w;
            const py = cr.y + Math.min(act.y, act.y + act.h) * cr.h;
            const pw = Math.abs(act.w) * cr.w;
            const ph = Math.abs(act.h) * cr.h;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 14;
            ctx.drawImage(img, px, py, pw, ph);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px, py, pw, ph);
            ctx.restore();
          }
        } else if (act.type === 'box') {
          ctx.save();
          ctx.strokeStyle = act.color;
          ctx.lineWidth = Math.max(2, act.strokeWidth * scaleStroke);
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 6;
          ctx.strokeRect(cr.x + act.x * cr.w, cr.y + act.y * cr.h, act.w * cr.w, act.h * cr.h);
          ctx.restore();
        } else if (act.type === 'arrow') {
          drawArrow(
            ctx,
            cr.x + act.x1 * cr.w,
            cr.y + act.y1 * cr.h,
            cr.x + act.x2 * cr.w,
            cr.y + act.y2 * cr.h,
            act.color,
            Math.max(2, act.strokeWidth * scaleStroke)
          );
        } else if (act.type === 'pen' && act.points.length > 1) {
          ctx.save();
          ctx.strokeStyle = act.color;
          ctx.lineWidth = Math.max(2, act.strokeWidth * scaleStroke);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(cr.x + act.points[0].x * cr.w, cr.y + act.points[0].y * cr.h);
          for (let i = 1; i < act.points.length; i++) {
            ctx.lineTo(cr.x + act.points[i].x * cr.w, cr.y + act.points[i].y * cr.h);
          }
          ctx.stroke();
          ctx.restore();
        } else if (act.type === 'text') {
          const m = measureTextBox(ctx, act, metrics);
          const padX = Math.max(10, Math.round(m.fontPx * 0.65));
          const padY = Math.max(7, Math.round(m.fontPx * 0.45));

          ctx.save();
          ctx.fillStyle = 'rgba(11, 15, 23, 0.92)';
          ctx.beginPath();
          ctx.roundRect(m.bx, m.by, m.bw, m.bh, 8);
          ctx.fill();

          ctx.strokeStyle = act.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${m.fontPx}px Inter, system-ui, sans-serif`;
          ctx.textBaseline = 'top';
          m.lines.forEach((line, idx) => {
            ctx.fillText(line, m.bx + padX, m.by + padY + idx * m.lineHeight);
          });
          ctx.restore();
        }
      }

      // Selection bounding box & resize handles
      if (activeSelectionId) {
        const sel = allLayers.find((l) => l.id === activeSelectionId);
        if (sel) {
          const b = getLayerBoundsPx(ctx, sel, metrics);
          const handleR = Math.max(6, Math.round(metrics.canvasWidth / 170));

          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          if (sel.type !== 'arrow') {
            ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
          }
          ctx.setLineDash([]);

          const drawHandle = (hx: number, hy: number) => {
            ctx.beginPath();
            ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#0284c7';
            ctx.stroke();
          };

          if (sel.type === 'arrow' && 'p1' in b && b.p1 && b.p2) {
            drawHandle(b.p1.x, b.p1.y);
            drawHandle(b.p2.x, b.p2.y);
          } else if (sel.type === 'text') {
            drawHandle(b.x + b.w + 4, b.y + b.h / 2);
          } else if (sel.type !== 'pen') {
            drawHandle(b.x - 4, b.y - 4);
            drawHandle(b.x + b.w + 4, b.y - 4);
            drawHandle(b.x - 4, b.y + b.h + 4);
            drawHandle(b.x + b.w + 4, b.y + b.h + 4);
          }
          ctx.restore();
        }
      }

      // Live Crop rectangle preview
      if (cropDraft) {
        const rx = Math.min(cropDraft.x1, cropDraft.x2);
        const ry = Math.min(cropDraft.y1, cropDraft.y2);
        const rw = Math.abs(cropDraft.x2 - cropDraft.x1);
        const rh = Math.abs(cropDraft.y2 - cropDraft.y1);

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, targetCanvas.width, ry);
        ctx.fillRect(0, ry + rh, targetCanvas.width, targetCanvas.height - (ry + rh));
        ctx.fillRect(0, ry, rx, rh);
        ctx.fillRect(rx + rw, ry, targetCanvas.width - (rx + rw), rh);

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }
    },
    [layers, draftLayer, cropDraft, ensureOverlayImageLoaded, getLayerBoundsPx, selectedId]
  );

  useEffect(() => {
    if (baseReady && canvasRef.current) {
      paintScene(canvasRef.current, selectedId);
    }
  }, [baseReady, paintScene, selectedId]);

  // Add overlay image helper (from file upload or Ctrl+V paste)
  const addOverlayImageLayer = useCallback(
    (dataUrl: string, natW: number, natH: number) => {
      const metrics = metricsRef.current;
      const aspect = natH / Math.max(1, natW);
      const normW = 0.32;
      const normH = metrics ? (normW * metrics.contentRect.w * aspect) / metrics.contentRect.h : 0.32;
      const newLayer: AnnotationLayer = {
        id: `lay_img_${Date.now()}`,
        type: 'image',
        dataUrl,
        x: 0.34,
        y: Math.max(0.1, 0.5 - normH / 2),
        w: normW,
        h: Math.min(0.75, normH),
      };
      commitLayers((prev) => [...prev, newLayer]);
      setSelectedId(newLayer.id);
      setTool('select');
      setStatusMsg('Added movable & resizable image layer');
    },
    [commitLayers]
  );

  // Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+D, Delete/Backspace, Ctrl+V paste image
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        const src = layers.find((l) => l.id === selectedId);
        if (src) {
          const clone: AnnotationLayer = JSON.parse(JSON.stringify(src));
          clone.id = `lay_${Date.now()}`;
          if ('x' in clone) {
            clone.x += 0.025;
            clone.y += 0.025;
          } else if (clone.type === 'arrow') {
            clone.x1 += 0.025;
            clone.y1 += 0.025;
            clone.x2 += 0.025;
            clone.y2 += 0.025;
          }
          commitLayers((prev) => [...prev, clone]);
          setSelectedId(clone.id);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        const delId = selectedId;
        commitLayers((prev) => prev.filter((l) => l.id !== delId));
        setSelectedId(null);
      }
    };

    const onPaste = async (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const img = await readImageFileAsDataUrl(file);
            addOverlayImageLayer(img.dataUrl, img.width, img.height);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [handleUndo, handleRedo, selectedId, layers, commitLayers, addOverlayImageLayer]);

  const eventToCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const metrics = metricsRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return {
      px,
      py,
      nx: (px - metrics.contentRect.x) / metrics.contentRect.w,
      ny: (py - metrics.contentRect.y) / metrics.contentRect.h,
      scaleFactor: canvas.width / Math.max(1, rect.width),
    };
  };

  // Hit-test handle or layer body at canvas pixel point
  const hitTest = (
    px: number,
    py: number,
    scaleFactor: number
  ): { layerId: string; handle: HandleKind } | null => {
    const canvas = canvasRef.current;
    const metrics = metricsRef.current;
    if (!canvas || !metrics) return null;
    const ctx = canvas.getContext('2d')!;
    const hitTol = Math.max(14, 14 * scaleFactor);

    // 1. Check currently selected layer's resize handles first
    if (selectedId) {
      const sel = layers.find((l) => l.id === selectedId);
      if (sel) {
        const b = getLayerBoundsPx(ctx, sel, metrics);
        if (sel.type === 'arrow' && 'p1' in b && b.p1 && b.p2) {
          if (Math.hypot(px - b.p1.x, py - b.p1.y) <= hitTol) return { layerId: sel.id, handle: 'p1' };
          if (Math.hypot(px - b.p2.x, py - b.p2.y) <= hitTol) return { layerId: sel.id, handle: 'p2' };
        } else if (sel.type === 'text') {
          if (Math.hypot(px - (b.x + b.w + 4), py - (b.y + b.h / 2)) <= hitTol) {
            return { layerId: sel.id, handle: 'text-right' };
          }
        } else if (sel.type !== 'pen') {
          if (Math.hypot(px - (b.x - 4), py - (b.y - 4)) <= hitTol) return { layerId: sel.id, handle: 'nw' };
          if (Math.hypot(px - (b.x + b.w + 4), py - (b.y - 4)) <= hitTol) return { layerId: sel.id, handle: 'ne' };
          if (Math.hypot(px - (b.x - 4), py - (b.y + b.h + 4)) <= hitTol) return { layerId: sel.id, handle: 'sw' };
          if (Math.hypot(px - (b.x + b.w + 4), py - (b.y + b.h + 4)) <= hitTol) return { layerId: sel.id, handle: 'se' };
        }
      }
    }

    // 2. Hit test layer bodies top-down
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const b = getLayerBoundsPx(ctx, l, metrics);
      if (l.type === 'arrow' && 'p1' in b && b.p1 && b.p2) {
        if (distToSegment(px, py, b.p1.x, b.p1.y, b.p2.x, b.p2.y) <= hitTol) {
          return { layerId: l.id, handle: 'move' };
        }
      } else if (l.type === 'pen') {
        const hitPt = l.points.some((pt) => {
          const x = metrics.contentRect.x + pt.x * metrics.contentRect.w;
          const y = metrics.contentRect.y + pt.y * metrics.contentRect.h;
          return Math.hypot(px - x, py - y) <= hitTol;
        });
        if (hitPt) return { layerId: l.id, handle: 'move' };
      } else if (l.type === 'box') {
        const inOuter = px >= b.x - hitTol && px <= b.x + b.w + hitTol && py >= b.y - hitTol && py <= b.y + b.h + hitTol;
        if (inOuter) return { layerId: l.id, handle: 'move' };
      } else {
        if (px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) {
          return { layerId: l.id, handle: 'move' };
        }
      }
    }

    return null;
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !metricsRef.current) return;
    const { px, py, nx, ny, scaleFactor } = eventToCoords(e);

    if (tool === 'crop') {
      setSelectedId(null);
      setCropDraft({ x1: px, y1: py, x2: px, y2: py });
      dragRef.current = {
        mode: 'crop',
        startNorm: { x: nx, y: ny },
        startCanvasPx: { x: px, y: py },
      };
      return;
    }

    if (tool === 'select') {
      const hit = hitTest(px, py, scaleFactor);
      if (!hit) {
        setSelectedId(null);
        return;
      }
      setSelectedId(hit.layerId);
      const target = layers.find((l) => l.id === hit.layerId)!;
      dragRef.current = {
        mode: hit.handle === 'move' ? 'move' : 'resize',
        handle: hit.handle,
        layerId: hit.layerId,
        startNorm: { x: nx, y: ny },
        startCanvasPx: { x: px, y: py },
        initialLayer: JSON.parse(JSON.stringify(target)),
      };
      return;
    }

    if (tool === 'text') {
      setSelectedId(null);
      setTextModal({ normX: nx, normY: ny, value: '' });
      return;
    }

    // Creating new arrow, box, blur, or pen
    setSelectedId(null);
    const id = `lay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let initial: AnnotationLayer;
    if (tool === 'arrow') {
      initial = { id, type: 'arrow', color, strokeWidth, x1: nx, y1: ny, x2: nx, y2: ny };
    } else if (tool === 'box') {
      initial = { id, type: 'box', color, strokeWidth, x: nx, y: ny, w: 0, h: 0 };
    } else if (tool === 'blur') {
      initial = { id, type: 'blur', x: nx, y: ny, w: 0, h: 0 };
    } else {
      initial = { id, type: 'pen', color, strokeWidth, points: [{ x: nx, y: ny }] };
    }

    setDraftLayer(initial);
    dragRef.current = {
      mode: 'create',
      layerId: id,
      startNorm: { x: nx, y: ny },
      startCanvasPx: { x: px, y: py },
    };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !metricsRef.current) return;
    const { px, py, nx, ny } = eventToCoords(e);
    const dx = nx - drag.startNorm.x;
    const dy = ny - drag.startNorm.y;

    if (drag.mode === 'crop') {
      setCropDraft((prev) => (prev ? { ...prev, x2: px, y2: py } : null));
      return;
    }

    if (drag.mode === 'create' && draftLayer) {
      if (draftLayer.type === 'arrow') {
        setDraftLayer({ ...draftLayer, x2: nx, y2: ny });
      } else if (draftLayer.type === 'box' || draftLayer.type === 'blur') {
        setDraftLayer({ ...draftLayer, w: nx - draftLayer.x, h: ny - draftLayer.y });
      } else if (draftLayer.type === 'pen') {
        setDraftLayer({ ...draftLayer, points: [...draftLayer.points, { x: nx, y: ny }] });
      }
      return;
    }

    if ((drag.mode === 'move' || drag.mode === 'resize') && drag.initialLayer && drag.layerId) {
      const init = drag.initialLayer;
      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== drag.layerId) return l;

          if (drag.mode === 'move') {
            if (init.type === 'arrow') {
              return {
                ...init,
                x1: init.x1 + dx,
                y1: init.y1 + dy,
                x2: init.x2 + dx,
                y2: init.y2 + dy,
              };
            }
            if (init.type === 'pen') {
              return {
                ...init,
                points: init.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              };
            }
            return { ...init, x: init.x + dx, y: init.y + dy };
          }

          // Resize mode
          if (init.type === 'arrow') {
            if (drag.handle === 'p1') return { ...init, x1: init.x1 + dx, y1: init.y1 + dy };
            if (drag.handle === 'p2') return { ...init, x2: init.x2 + dx, y2: init.y2 + dy };
          }
          if (init.type === 'text' && drag.handle === 'text-right') {
            return { ...init, maxWidth: Math.max(0.12, Math.min(0.95, init.maxWidth + dx)) };
          }
          if (init.type === 'box' || init.type === 'blur' || init.type === 'image') {
            const minS = 0.02;
            const left = Math.min(init.x, init.x + init.w);
            const top = Math.min(init.y, init.y + init.h);
            const width = Math.abs(init.w);
            const height = Math.abs(init.h);

            let nx0 = left;
            let ny0 = top;
            let nw = width;
            let nh = height;

            if (drag.handle === 'se') {
              nw = Math.max(minS, width + dx);
              nh = Math.max(minS, height + dy);
            } else if (drag.handle === 'sw') {
              nx0 = Math.min(left + width - minS, left + dx);
              nw = Math.max(minS, width - dx);
              nh = Math.max(minS, height + dy);
            } else if (drag.handle === 'ne') {
              ny0 = Math.min(top + height - minS, top + dy);
              nw = Math.max(minS, width + dx);
              nh = Math.max(minS, height - dy);
            } else if (drag.handle === 'nw') {
              nx0 = Math.min(left + width - minS, left + dx);
              ny0 = Math.min(top + height - minS, top + dy);
              nw = Math.max(minS, width - dx);
              nh = Math.max(minS, height - dy);
            }
            return { ...init, x: nx0, y: ny0, w: nw, h: nh };
          }
          return l;
        })
      );
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    if (drag.mode === 'create' && draftLayer) {
      let valid = true;
      let normalized = draftLayer;
      if (draftLayer.type === 'box' || draftLayer.type === 'blur') {
        if (Math.abs(draftLayer.w) < 0.01 && Math.abs(draftLayer.h) < 0.01) valid = false;
        normalized = {
          ...draftLayer,
          x: Math.min(draftLayer.x, draftLayer.x + draftLayer.w),
          y: Math.min(draftLayer.y, draftLayer.y + draftLayer.h),
          w: Math.abs(draftLayer.w),
          h: Math.abs(draftLayer.h),
        };
      } else if (draftLayer.type === 'arrow') {
        if (Math.hypot(draftLayer.x2 - draftLayer.x1, draftLayer.y2 - draftLayer.y1) < 0.015) valid = false;
      }

      if (valid) {
        commitLayers((prev) => [...prev, normalized]);
        setSelectedId(normalized.id);
        setTool('select');
      }
      setDraftLayer(null);
      return;
    }

    if ((drag.mode === 'move' || drag.mode === 'resize') && drag.initialLayer) {
      // Push pre-drag snapshot to undo stack
      setLayers((current) => {
        const snapshotBeforeDrag = current.map((l) =>
          l.id === drag.layerId && drag.initialLayer ? drag.initialLayer : l
        );
        setUndoStack((u) => [...u.slice(-24), snapshotBeforeDrag]);
        setRedoStack([]);
        return current;
      });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !metricsRef.current) return;
    const { px, py, scaleFactor } = eventToCoords(e);
    const hit = hitTest(px, py, scaleFactor);
    if (!hit) return;
    const target = layers.find((l) => l.id === hit.layerId);
    if (target && target.type === 'text') {
      setTextModal({
        editingLayerId: target.id,
        normX: target.x,
        normY: target.y,
        value: target.text,
      });
    }
  };

  const handleCommitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textModal) return;
    const clean = textModal.value.trim();
    if (textModal.editingLayerId) {
      if (clean) {
        commitLayers((prev) =>
          prev.map((l) => (l.id === textModal.editingLayerId && l.type === 'text' ? { ...l, text: clean } : l))
        );
      }
    } else if (clean) {
      const id = `lay_txt_${Date.now()}`;
      const newLayer: AnnotationLayer = {
        id,
        type: 'text',
        color,
        fontSize,
        x: textModal.normX,
        y: textModal.normY,
        maxWidth: 0.34,
        text: clean,
      };
      commitLayers((prev) => [...prev, newLayer]);
      setSelectedId(id);
      setTool('select');
    }
    setTextModal(null);
  };

  const applyCropSelection = () => {
    const img = baseImageRef.current;
    const metrics = metricsRef.current;
    if (!img || !metrics || !cropDraft) return;

    const rx = Math.min(cropDraft.x1, cropDraft.x2);
    const ry = Math.min(cropDraft.y1, cropDraft.y2);
    const rw = Math.abs(cropDraft.x2 - cropDraft.x1);
    const rh = Math.abs(cropDraft.y2 - cropDraft.y1);
    if (rw < 20 || rh < 20) {
      setCropDraft(null);
      return;
    }

    const { contentRect: cr } = metrics;
    const prevCrop = crop || { x: 0, y: 0, w: img.width, h: img.height };
    const nx1 = Math.max(0, Math.min(1, (rx - cr.x) / cr.w));
    const ny1 = Math.max(0, Math.min(1, (ry - cr.y) / cr.h));
    const nx2 = Math.max(0, Math.min(1, (rx + rw - cr.x) / cr.w));
    const ny2 = Math.max(0, Math.min(1, (ry + rh - cr.y) / cr.h));

    if (nx2 - nx1 < 0.05 || ny2 - ny1 < 0.05) {
      setCropDraft(null);
      return;
    }

    setCrop({
      x: Math.round(prevCrop.x + nx1 * prevCrop.w),
      y: Math.round(prevCrop.y + ny1 * prevCrop.h),
      w: Math.round((nx2 - nx1) * prevCrop.w),
      h: Math.round((ny2 - ny1) * prevCrop.h),
    });
    setCropDraft(null);
    setTool('select');
    setStatusMsg('Applied crop cleanly (non-destructive)');
  };

  // Replace Base Screenshot handlers
  const handleRecaptureBase = async () => {
    setShowReplaceMenu(false);
    try {
      const res = await captureSingleScreenFrame('raw');
      setRawBaseUrl(res.rawDataUrl);
      setCrop(null);
      setStatusMsg('Replaced base screenshot from screen capture');
    } catch {
      // Canceled
    }
  };

  const handlePasteBase = async () => {
    setShowReplaceMenu(false);
    try {
      const img = await readClipboardImageDataUrl();
      if (!img) {
        setStatusMsg('No image found in clipboard');
        return;
      }
      setRawBaseUrl(img.dataUrl);
      setCrop(null);
      setStatusMsg('Replaced base screenshot from clipboard');
    } catch (err: any) {
      setStatusMsg(err?.message || 'Clipboard read denied');
    }
  };

  // Render clean final image (WITHOUT selection boxes)
  const renderCleanDataUrl = (): string => {
    const outCanvas = document.createElement('canvas');
    paintScene(outCanvas, null);
    return outCanvas.toDataURL('image/png');
  };

  const handleCopyPng = async () => {
    try {
      const url = renderCleanDataUrl();
      await copyPngToClipboard(url);
      setCopiedPng(true);
      confetti({ particleCount: 45, spread: 55, origin: { y: 0.7 } });
      setTimeout(() => setCopiedPng(false), 2200);
    } catch (err: any) {
      setStatusMsg(err?.message || 'Clipboard image copy requires HTTPS or localhost');
    }
  };

  const handleDownloadPng = () => {
    const url = renderCleanDataUrl();
    const a = document.createElement('a');
    a.href = url;
    a.download = `bugcast-screenshot-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSave = () => {
    const finalUrl = renderCleanDataUrl();
    onSave({
      ...screenshot,
      dataUrl: finalUrl,
      rawDataUrl: rawBaseUrl,
      width: sceneSize.w,
      height: sceneSize.h,
      theme,
      crop,
      scalePercent,
      annotations: layers,
    });
    onClose();
  };

  const updateSelectedLayer = (patchFn: (layer: AnnotationLayer) => AnnotationLayer) => {
    if (!selectedId) return;
    commitLayers((prev) => prev.map((l) => (l.id === selectedId ? patchFn(l) : l)));
  };

  const moveLayerOrder = (direction: 'up' | 'down') => {
    if (!selectedId) return;
    commitLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === selectedId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? Math.min(prev.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (targetIdx === idx) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const tools: { id: ToolType; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Move / Edit', icon: <MousePointer2 className="w-3.5 h-3.5" /> },
    { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
    { id: 'box', label: 'Box', icon: <Square className="w-3.5 h-3.5" /> },
    { id: 'blur', label: 'Blur Secret', icon: <EyeOff className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'pen', label: 'Draw', icon: <Pencil className="w-3.5 h-3.5" /> },
    { id: 'crop', label: 'Crop', icon: <Crop className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl max-h-[95vh] glass-panel bg-dark-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Hidden File Inputs */}
        <input
          ref={fileUploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              const img = await readImageFileAsDataUrl(file);
              addOverlayImageLayer(img.dataUrl, img.width, img.height);
            }
          }}
        />
        <input
          ref={baseUploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              const img = await readImageFileAsDataUrl(file);
              setRawBaseUrl(img.dataUrl);
              setCrop(null);
              setStatusMsg('Replaced base image');
            }
          }}
        />
        <input
          ref={replaceLayerUploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file && selectedLayer?.type === 'image') {
              const img = await readImageFileAsDataUrl(file);
              updateSelectedLayer((l) => (l.type === 'image' ? { ...l, dataUrl: img.dataUrl } : l));
              setStatusMsg('Replaced selected overlay image');
            }
          }}
        />

        {/* Primary Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-dark-800/85">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap items-center gap-1 bg-dark-900 border border-white/10 rounded-xl p-1">
              {tools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTool(t.id);
                    if (t.id !== 'crop') setCropDraft(null);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all ${
                    tool === t.id
                      ? t.id === 'blur'
                        ? 'bg-sky-500 text-black font-semibold'
                        : t.id === 'crop'
                          ? 'bg-amber-500 text-black font-semibold'
                          : 'bg-brand-500 text-black font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t.icon}
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              ))}

              <button
                onClick={() => fileUploadRef.current?.click()}
                title="Add movable & resizable overlay image (or press Ctrl+V)"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-all"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span className="hidden md:inline">+ Image</span>
              </button>
            </div>

            {/* Color Picker */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-dark-900 border border-white/10 rounded-xl">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    if (selectedLayer && 'color' in selectedLayer) {
                      updateSelectedLayer((l) => ('color' in l ? { ...l, color: c } : l));
                    }
                  }}
                  style={{ backgroundColor: c }}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    (selectedLayer && 'color' in selectedLayer ? selectedLayer.color : color) === c
                      ? 'scale-125 ring-2 ring-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            {/* Undo / Redo */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-2 rounded-xl bg-dark-900 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-2 rounded-xl bg-dark-900 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* Replace Base Image Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowReplaceMenu((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-dark-900 hover:bg-dark-700 border border-white/10 text-xs font-medium text-slate-200 flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
                <span>Replace Base</span>
              </button>

              {showReplaceMenu && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-dark-800 border border-white/15 shadow-2xl p-1.5 z-30 space-y-1 text-xs">
                  <button
                    onClick={handleRecaptureBase}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-slate-200 flex items-center space-x-2"
                  >
                    <Monitor className="w-3.5 h-3.5 text-brand-400" />
                    <span>Re-capture Screen</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowReplaceMenu(false);
                      baseUploadRef.current?.click();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-slate-200 flex items-center space-x-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upload Image File</span>
                  </button>
                  <button
                    onClick={handlePasteBase}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-slate-200 flex items-center space-x-2"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-purple-400" />
                    <span>Paste Clipboard</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Secondary Strip: Theme, Scale, Crop Confirm, OR Selected Layer Inspector */}
        <div className="px-4 py-2 bg-dark-950/75 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Theme Switcher */}
            <div className="flex items-center space-x-1 bg-dark-800 border border-white/10 rounded-lg p-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    theme === t.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Output Scale / Size */}
            <div className="flex items-center space-x-1 bg-dark-800 border border-white/10 rounded-lg p-0.5 font-mono">
              {([100, 75, 50] as const).map((pct) => (
                <button
                  key={pct}
                  onClick={() => setScalePercent(pct)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                    scalePercent === pct ? 'bg-brand-500 text-black font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <span className="px-2 text-[10px] text-slate-400">
                {sceneSize.w}×{sceneSize.h}
              </span>
            </div>

            {crop && (
              <button
                onClick={() => setCrop(null)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-medium"
              >
                Reset Crop
              </button>
            )}

            {tool === 'crop' && cropDraft && (
              <button
                onClick={applyCropSelection}
                className="px-3 py-1 rounded-lg bg-brand-500 text-black text-[11px] font-bold"
              >
                ✔ Apply Crop
              </button>
            )}
          </div>

          {/* Selected Object Quick Controls */}
          {selectedLayer ? (
            <div className="flex flex-wrap items-center gap-2 bg-sky-500/10 border border-sky-500/30 rounded-xl px-2.5 py-1">
              <span className="text-[11px] font-mono font-semibold text-sky-300 uppercase">
                {selectedLayer.type}
              </span>

              {selectedLayer.type === 'text' && (
                <>
                  <label className="flex items-center space-x-1 text-[11px] text-slate-300">
                    <span>Size</span>
                    <input
                      type="range"
                      min={16}
                      max={54}
                      value={selectedLayer.fontSize}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setFontSize(val);
                        updateSelectedLayer((l) => (l.type === 'text' ? { ...l, fontSize: val } : l));
                      }}
                      className="w-16 accent-brand-500"
                    />
                  </label>
                  <button
                    onClick={() =>
                      setTextModal({
                        editingLayerId: selectedLayer.id,
                        normX: selectedLayer.x,
                        normY: selectedLayer.y,
                        value: selectedLayer.text,
                      })
                    }
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px]"
                  >
                    Edit Text
                  </button>
                </>
              )}

              {(selectedLayer.type === 'arrow' || selectedLayer.type === 'box' || selectedLayer.type === 'pen') && (
                <label className="flex items-center space-x-1 text-[11px] text-slate-300">
                  <span>Stroke</span>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    value={selectedLayer.strokeWidth}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setStrokeWidth(val);
                      updateSelectedLayer((l) =>
                        l.type === 'arrow' || l.type === 'box' || l.type === 'pen'
                          ? { ...l, strokeWidth: val }
                          : l
                      );
                    }}
                    className="w-16 accent-brand-500"
                  />
                </label>
              )}

              {selectedLayer.type === 'image' && (
                <button
                  onClick={() => replaceLayerUploadRef.current?.click()}
                  className="px-2 py-0.5 rounded bg-purple-500/30 hover:bg-purple-500/50 text-purple-100 text-[11px] flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Replace Image</span>
                </button>
              )}

              <button
                onClick={() => moveLayerOrder('up')}
                title="Bring Forward"
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-slate-200 text-[11px]"
              >
                <Layers className="w-3 h-3 inline mr-0.5" />+
              </button>
              <button
                onClick={() => moveLayerOrder('down')}
                title="Send Backward"
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-slate-200 text-[11px]"
              >
                <Layers className="w-3 h-3 inline mr-0.5" />-
              </button>
              <button
                onClick={() => {
                  const delId = selectedLayer.id;
                  commitLayers((prev) => prev.filter((l) => l.id !== delId));
                  setSelectedId(null);
                }}
                title="Delete Layer (Del)"
                className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[11px] flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              {statusMsg || 'Click any object to Move/Resize · Double-click Text to edit · Ctrl+V to paste image'}
            </span>
          )}
        </div>

        {/* Canvas Workspace */}
        <div className="flex-1 overflow-auto p-4 bg-[#06090f] flex items-center justify-center relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            className={`max-w-full max-h-[64vh] rounded-xl shadow-2xl border border-white/10 object-contain ${
              tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
            }`}
          />

          {/* Multi-line Text Callout Editor Overlay */}
          {textModal && (
            <form
              onSubmit={handleCommitText}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 p-3 rounded-2xl bg-dark-900/95 border border-brand-500/60 shadow-2xl w-[90%] max-w-md z-30"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span>{textModal.editingLayerId ? 'Edit Callout Text' : 'Add Auto-Wrapping Text'}</span>
                <span>Size: {fontSize}px</span>
              </div>
              <textarea
                autoFocus
                rows={2}
                value={textModal.value}
                onChange={(e) => setTextModal({ ...textModal, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommitText(e);
                  }
                }}
                placeholder="Type callout text (auto-wraps cleanly, Shift+Enter for new line)..."
                className="bg-dark-800 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-brand-500 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTextModal(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold"
                >
                  {textModal.editingLayerId ? 'Update Text' : 'Stamp Text'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-white/10 bg-dark-800/85">
          <div className="text-[11px] text-slate-400 font-mono">
            {layers.length} layer(s) · Ctrl+Z Undo · Ctrl+D Duplicate · Del Remove
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadPng}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5 text-brand-400" />
              <span>Download .png</span>
            </button>

            <button
              onClick={handleCopyPng}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold shadow-lg shadow-sky-500/20"
            >
              {copiedPng ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPng ? 'Copied PNG!' : 'Copy Image (Ctrl+V)'}</span>
            </button>

            <button
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-black text-xs font-bold shadow-lg shadow-brand-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save &amp; Attach</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
