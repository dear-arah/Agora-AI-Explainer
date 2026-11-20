'use client';
import type { SlideImage } from './types';
import { IngestError } from './types';
import { renderScale } from './match';
import { linesFromItems } from './pdf-text';

// Renders each page of a PDF to a JPEG with pdf.js. Runs in the browser; the PDF is never uploaded.

const TARGET_WIDTH = 1920;
const JPEG_QUALITY = 0.88;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

export async function pdfPageCount(data: ArrayBuffer): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: data.slice(0) });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

export async function renderPdfToImages(
  data: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<SlideImage[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: data.slice(0) });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    throw new IngestError('This PDF could not be read. Try exporting it again from PowerPoint.');
  }
  const images: SlideImage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale(base.width, TARGET_WIDTH) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      images.push({ index: i, blob: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height });
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return images;
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new IngestError('Could not encode the slide image.'))), 'image/jpeg', JPEG_QUALITY),
  );
}

/** Text of every page as reading-order lines, plus the first page's size in PDF points. */
export async function extractPdfText(data: ArrayBuffer): Promise<{ pages: string[][]; size: { width: number; height: number } }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: data.slice(0) });
  try {
    const doc = await task.promise;
    const pages: string[][] = [];
    let size = { width: 16, height: 9 };
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (i === 1) {
        const v = page.getViewport({ scale: 1 });
        size = { width: v.width, height: v.height };
      }
      const content = await page.getTextContent();
      const items = content.items.flatMap((it) =>
        'str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5] }] : [],
      );
      pages.push(linesFromItems(items));
      page.cleanup();
    }
    return { pages, size };
  } catch {
    throw new IngestError('This PDF could not be read. Try exporting it again from PowerPoint.');
  } finally {
    await task.destroy();
  }
}
