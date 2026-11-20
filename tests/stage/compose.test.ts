import { describe, expect, it } from 'vitest';
import { containRect, coverCrop, drawFrame, presenterBox, type Drawable } from '@/lib/stage/compose';
import { DEFAULT_LAYOUT } from '@/lib/stage/layout';

describe('presenterBox', () => {
  it('puts the default circle bottom right, 22% wide, square', () => {
    const b = presenterBox(DEFAULT_LAYOUT, 1280, 720)!;
    expect(b.circle).toBe(true);
    expect(b.w).toBeCloseTo(281.6, 1);
    expect(b.h).toBeCloseTo(b.w, 5);
    expect(b.x + b.w).toBeCloseTo(1280 - 1280 * 0.025, 5);
    expect(b.y + b.h).toBeCloseTo(720 - 720 * 0.04, 5);
  });

  it('uses a 16:9 box for a rectangle', () => {
    const b = presenterBox({ shape: 'rect', corner: 'top-left', sizePct: 30 }, 1280, 720)!;
    expect(b.circle).toBe(false);
    expect(b.w / b.h).toBeCloseTo(16 / 9, 5);
    expect(b.x).toBeCloseTo(32, 5);
    expect(b.y).toBeCloseTo(28.8, 5);
  });

  it('is absent when hidden, and clamps absurd sizes like the preview does', () => {
    expect(presenterBox({ shape: 'hidden', corner: 'top-left', sizePct: 22 }, 1280, 720)).toBeNull();
    expect(presenterBox({ shape: 'circle', corner: 'top-left', sizePct: 90 }, 1000, 500)!.w).toBe(400);
  });

  it('scales with the frame so a recording matches the preview at any size', () => {
    const small = presenterBox(DEFAULT_LAYOUT, 640, 360)!;
    const big = presenterBox(DEFAULT_LAYOUT, 1920, 1080)!;
    expect(big.x / 1920).toBeCloseTo(small.x / 640, 6);
    expect(big.y / 1080).toBeCloseTo(small.y / 360, 6);
    expect(big.w / 1920).toBeCloseTo(small.w / 640, 6);
  });
});

describe('containRect and coverCrop', () => {
  it('letterboxes a 4:3 slide inside 16:9', () => {
    const r = containRect(800, 600, 1280, 720);
    expect(r.h).toBe(720);
    expect(r.w).toBe(960);
    expect(r.x).toBe(160);
  });

  it('fills the frame exactly for a 16:9 slide', () => {
    expect(containRect(1920, 1080, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it('crops a wide picture to a square from the centre', () => {
    const c = coverCrop(400, 200, 100, 100);
    expect(c).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 });
  });

  it('survives a source with no size yet', () => {
    expect(containRect(0, 0, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(coverCrop(0, 0, 10, 10)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

/** A canvas context that only writes down what was called on it. */
function fakeCtx() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, prop: string) => {
      if (prop in t) return t[prop];
      if (prop === 'createRadialGradient') return () => ({ addColorStop: () => calls.push('stop') });
      return (...args: unknown[]) => { calls.push(prop); return args; };
    },
    set: (t, prop: string, value) => { t[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const image = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h }) as unknown as Drawable;

describe('drawFrame', () => {
  const base = { title: 'Title', layout: DEFAULT_LAYOUT, photo: null, level: 0.4 };

  it('draws the slide first, then clips and draws the orb', () => {
    const { ctx, calls } = fakeCtx();
    drawFrame(ctx, 1280, 720, { ...base, slide: image(1920, 1080) });
    expect(calls.indexOf('drawImage')).toBeGreaterThan(-1);
    expect(calls.indexOf('drawImage')).toBeLessThan(calls.indexOf('clip'));
    expect(calls).toContain('arc'); // the orb core
    expect(calls.filter((c) => c === 'drawImage')).toHaveLength(1); // slide only, no photo
  });

  it('draws the user picture instead of the orb core', () => {
    const { ctx, calls } = fakeCtx();
    drawFrame(ctx, 1280, 720, { ...base, slide: image(1920, 1080), photo: image(400, 400) });
    expect(calls.filter((c) => c === 'drawImage')).toHaveLength(2);
    expect(calls).not.toContain('arc');
  });

  it('shows the title when there is no slide picture', () => {
    const { ctx, calls } = fakeCtx();
    drawFrame(ctx, 1280, 720, { ...base, slide: null });
    expect(calls).toContain('fillText');
  });

  it('draws no presenter when hidden', () => {
    const { ctx, calls } = fakeCtx();
    drawFrame(ctx, 1280, 720, { ...base, slide: image(1920, 1080), layout: { ...DEFAULT_LAYOUT, shape: 'hidden' } });
    expect(calls).not.toContain('clip');
    expect(calls).not.toContain('stroke');
  });

  it('keeps a loudness outside 0 to 1 from breaking the glow', () => {
    const { ctx } = fakeCtx();
    expect(() => drawFrame(ctx, 1280, 720, { ...base, slide: null, level: 5 })).not.toThrow();
    expect(() => drawFrame(ctx, 1280, 720, { ...base, slide: null, level: -1 })).not.toThrow();
  });
});
