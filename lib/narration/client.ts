'use client';
import { accessHeaders } from '../access-client';
import type { SlideContent } from '@/lib/ingest/types';
import { NarrationError, type Narration } from './types';

/** Shrink a slide image so a whole deck fits in one request (Vercel caps request bodies at 4.5 MB). */
async function downscale(blob: Blob, maxWidth: number, quality: number): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', quality),
  );
  const dataUrl = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(out);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

const MAX_BODY_CHARS = 3_500_000;

async function encodeImages(images: Blob[]): Promise<string[]> {
  for (const [width, quality] of [[768, 0.6], [512, 0.5], [384, 0.45]] as const) {
    const all = await Promise.all(images.map((b) => downscale(b, width, quality)));
    if (all.reduce((n, s) => n + s.length, 0) <= MAX_BODY_CHARS) return all;
  }
  throw new NarrationError('The slide images are too large to send together. Turn off "Send slide images".', 413);
}

export interface NarrateResponse {
  narrations: Narration[];
  provider: string;
  model: string;
}

export async function requestNarration(
  slides: SlideContent[],
  images: Blob[] | null,
  signal?: AbortSignal,
): Promise<NarrateResponse> {
  const encoded = images && images.length === slides.length ? await encodeImages(images) : null;
  const res = await fetch('/api/narrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({
      slides: slides.map((s, i) => ({
        index: s.index,
        title: s.title,
        paragraphs: s.paragraphs,
        notes: s.notes,
        imageAlts: s.imageAlts,
        imageBase64: encoded?.[i],
      })),
    }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new NarrationError(body.error ?? `The narration request failed (HTTP ${res.status}).`, res.status);
  return body as NarrateResponse;
}
