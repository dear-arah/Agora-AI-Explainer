'use client';
import type { SlideImage } from './types';
import { IngestError } from './types';

// Experimental: draws the .pptx in the browser with the pptx-preview library, then snapshots each
// slide to a JPEG. Fidelity is limited (fonts, charts, SmartArt), so the PDF route is the exact one.

const TARGET_WIDTH = 1920;

export async function renderPptxToImages(
  data: ArrayBuffer,
  size: { width: number; height: number },
  onProgress?: (done: number, total: number) => void,
): Promise<SlideImage[]> {
  const [{ init }, { toJpeg }] = await Promise.all([import('pptx-preview'), import('html-to-image')]);

  const width = TARGET_WIDTH;
  const height = Math.round((TARGET_WIDTH * size.height) / size.width);

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;`;
  document.body.appendChild(host);

  try {
    const previewer = init(host, { width, height, mode: 'list' });
    await previewer.preview(data);
    const slides = Array.from(host.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'));
    if (slides.length === 0) {
      throw new IngestError(
        'The browser renderer could not read this deck. Upload a PDF export of it instead.',
      );
    }

    const images: SlideImage[] = [];
    for (let i = 0; i < slides.length; i++) {
      const dataUrl = await toJpeg(slides[i], { quality: 0.88, width, height, pixelRatio: 1, backgroundColor: '#ffffff' });
      images.push({ index: i + 1, blob: await (await fetch(dataUrl)).blob(), width, height });
      onProgress?.(i + 1, slides.length);
    }
    return images;
  } finally {
    host.remove();
  }
}
