export type CountCheck =
  | { ok: true; includesHidden?: boolean }
  | { ok: false; message: string };

/**
 * PowerPoint leaves hidden slides out of a PDF export by default. Accept both forms:
 * pages == visible slides, or pages == all slides (the caller then drops the hidden pages).
 */
export function checkSlideCount(a: { visible: number; hidden: number; pdfPages: number }): CountCheck {
  if (a.pdfPages === a.visible) return { ok: true };
  if (a.hidden > 0 && a.pdfPages === a.visible + a.hidden) return { ok: true, includesHidden: true };
  return {
    ok: false,
    message: `The deck has ${a.visible} visible slides (${a.hidden} hidden) but the PDF has ${a.pdfPages} pages. Export the same version of the deck, then try again.`,
  };
}

/** Scale factor that makes a page `pageWidth` wide come out `targetWidth` px wide, never below 1. */
export function renderScale(pageWidth: number, targetWidth: number): number {
  return Math.max(1, targetWidth / pageWidth);
}

/** Pick the images that belong to visible slides, whether or not the PDF included hidden ones. */
export function alignImages<T>(slides: { hidden: boolean }[], images: T[]): T[] {
  return images.length === slides.length ? images.filter((_, i) => !slides[i].hidden) : images;
}
