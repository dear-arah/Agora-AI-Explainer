import { describe, expect, it } from 'vitest';
import { alignImages, checkSlideCount, renderScale } from '@/lib/ingest/match';

describe('checkSlideCount', () => {
  it('accepts a PDF whose page count equals the visible slides', () => {
    expect(checkSlideCount({ visible: 4, hidden: 1, pdfPages: 4 })).toEqual({ ok: true });
  });

  it('accepts a PDF that includes the hidden slides, and says which pages to drop', () => {
    expect(checkSlideCount({ visible: 4, hidden: 1, pdfPages: 5 })).toEqual({
      ok: true,
      includesHidden: true,
    });
  });

  it('explains a mismatch in plain words', () => {
    const r = checkSlideCount({ visible: 4, hidden: 1, pdfPages: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/4 visible slides.*7 pages/);
  });
});

describe('renderScale', () => {
  it('scales a 960pt-wide page to 1920px wide', () => {
    expect(renderScale(960, 1920)).toBe(2);
  });
  it('never scales below 1', () => {
    expect(renderScale(4000, 1920)).toBe(1);
  });
});

describe('alignImages', () => {
  const slides = [{ hidden: false }, { hidden: false }, { hidden: true }, { hidden: false }];

  it('keeps images as they are when the PDF skipped hidden slides', () => {
    expect(alignImages(slides, ['a', 'b', 'd'])).toEqual(['a', 'b', 'd']);
  });

  it('drops the pages that belong to hidden slides when the PDF included them', () => {
    expect(alignImages(slides, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'd']);
  });
});
