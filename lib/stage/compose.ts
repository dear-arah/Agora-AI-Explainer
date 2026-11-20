import { clampLayout, type PresenterLayout } from './layout';

export interface Box { x: number; y: number; w: number; h: number; circle: boolean }
export interface Rect { x: number; y: number; w: number; h: number }

/** Anything drawImage accepts that also reports its size (an image or a decoded bitmap). */
export type Drawable = CanvasImageSource & ({ naturalWidth: number; naturalHeight: number } | { width: number; height: number });

const dims = (s: Drawable) => {
  const o = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { w: o.naturalWidth || o.width || 0, h: o.naturalHeight || o.height || 0 };
};

/**
 * Where the presenter sits on a W x H frame. Mirrors `presenterStyle` (the on-screen preview):
 * 4% in from the top or bottom, 2.5% in from the side, width a percentage of the frame.
 */
export function presenterBox(layout: PresenterLayout, W: number, H: number): Box | null {
  const l = clampLayout(layout);
  if (l.shape === 'hidden') return null;
  const circle = l.shape === 'circle';
  const w = (W * l.sizePct) / 100;
  const h = circle ? w : (w * 9) / 16;
  const [vertical, horizontal] = l.corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  const x = horizontal === 'left' ? W * 0.025 : W - W * 0.025 - w;
  const y = vertical === 'top' ? H * 0.04 : H - H * 0.04 - h;
  return { x, y, w, h, circle };
}

/** Largest rectangle of the source's shape that fits inside W x H, centred (CSS object-fit: contain). */
export function containRect(srcW: number, srcH: number, W: number, H: number): Rect {
  if (!srcW || !srcH) return { x: 0, y: 0, w: W, h: H };
  const scale = Math.min(W / srcW, H / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** The part of the source that fills a w x h box without stretching (CSS object-fit: cover). */
export function coverCrop(srcW: number, srcH: number, w: number, h: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!srcW || !srcH) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const scale = Math.max(w / srcW, h / srcH);
  const sw = w / scale;
  const sh = h / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export interface FrameInput {
  /** The slide picture, or null to show the title on black. */
  slide: Drawable | null;
  title: string;
  layout: PresenterLayout;
  /** The user's picture, or null for the orb. */
  photo: Drawable | null;
  /** Agent voice loudness, 0 to 1. */
  level: number;
}

function shapePath(ctx: CanvasRenderingContext2D, b: Box, radius: number) {
  ctx.beginPath();
  if (b.circle) ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(b.x, b.y, b.w, b.h, radius);
}

/** Draw one video frame: the slide full-frame, the presenter in its corner. */
export function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, input: FrameInput) {
  const level = Math.min(1, Math.max(0, input.level));

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (input.slide) {
    const { w, h } = dims(input.slide);
    const r = containRect(w, h, W, H);
    ctx.drawImage(input.slide, r.x, r.y, r.w, r.h);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(H * 0.07)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(input.title, W / 2, H / 2, W * 0.84);
  }

  const box = presenterBox(input.layout, W, H);
  if (!box) return;
  const k = box.w / 280; // sizes below are the preview's, in a 280 px wide box
  const radius = W * 0.012;

  // Drop shadow under the presenter.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24 * k;
  ctx.shadowOffsetY = 6 * k;
  ctx.fillStyle = '#111';
  shapePath(ctx, box, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  shapePath(ctx, box, radius);
  ctx.clip();
  ctx.fillStyle = '#0b1030';
  ctx.fillRect(box.x, box.y, box.w, box.h);

  if (input.photo) {
    const { w, h } = dims(input.photo);
    const c = coverCrop(w, h, box.w, box.h);
    ctx.drawImage(input.photo, c.sx, c.sy, c.sw, c.sh, box.x, box.y, box.w, box.h);
  } else {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const radiusCore = (Math.min(box.w, box.h) * 0.76 * (1 + level * 0.18)) / 2;
    const g = ctx.createRadialGradient(cx - radiusCore * 0.3, cy - radiusCore * 0.4, 0, cx, cy, radiusCore);
    g.addColorStop(0, '#9cc4ff');
    g.addColorStop(0.6, '#2c4bd6');
    g.addColorStop(1, '#121a4d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusCore, 0, Math.PI * 2);
    ctx.fill();
  }

  // Voice glow: a stroke along the edge whose shadow spreads inward, like the preview's inset shadow.
  ctx.shadowColor = 'rgba(120, 180, 255, 0.85)';
  ctx.shadowBlur = (6 + level * 70) * k;
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.85)';
  ctx.lineWidth = (2 + level * 28) * k;
  shapePath(ctx, box, radius);
  ctx.stroke();
  ctx.restore();
}
