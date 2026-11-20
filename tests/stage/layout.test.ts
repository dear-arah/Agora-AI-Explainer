import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, clampLayout, presenterStyle } from '@/lib/stage/layout';

describe('presenterStyle', () => {
  it('defaults to a circle in the bottom-right corner', () => {
    expect(DEFAULT_LAYOUT).toMatchObject({ shape: 'circle', corner: 'bottom-right' });
    const s = presenterStyle(DEFAULT_LAYOUT);
    expect(s.borderRadius).toBe('50%');
    expect(s.aspectRatio).toBe('1 / 1');
    expect(s.bottom).toBeDefined();
    expect(s.right).toBeDefined();
    expect(s.top).toBeUndefined();
    expect(s.left).toBeUndefined();
  });

  it('places each corner on the matching edges', () => {
    const tl = presenterStyle({ ...DEFAULT_LAYOUT, corner: 'top-left' });
    expect(tl.top).toBeDefined();
    expect(tl.left).toBeDefined();
    expect(tl.bottom).toBeUndefined();
  });

  it('draws a rounded 16:9 rectangle for the rect shape', () => {
    const s = presenterStyle({ ...DEFAULT_LAYOUT, shape: 'rect' });
    expect(s.aspectRatio).toBe('16 / 9');
    expect(s.borderRadius).not.toBe('50%');
  });

  it('hides the presenter completely', () => {
    expect(presenterStyle({ ...DEFAULT_LAYOUT, shape: 'hidden' }).display).toBe('none');
  });

  it('sizes the presenter as a percentage of the stage width', () => {
    expect(presenterStyle({ ...DEFAULT_LAYOUT, sizePct: 30 }).width).toBe('30%');
  });
});

describe('clampLayout', () => {
  it('keeps the size between 10% and 40%', () => {
    expect(clampLayout({ ...DEFAULT_LAYOUT, sizePct: 2 }).sizePct).toBe(10);
    expect(clampLayout({ ...DEFAULT_LAYOUT, sizePct: 90 }).sizePct).toBe(40);
    expect(clampLayout({ ...DEFAULT_LAYOUT, sizePct: Number.NaN }).sizePct).toBe(DEFAULT_LAYOUT.sizePct);
  });
});
