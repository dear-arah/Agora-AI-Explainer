import { NextResponse } from 'next/server';
import { guard } from '@/lib/access';
import { generateNarration } from '@/lib/narration/providers';
import { NarrationError, type SlideInput } from '@/lib/narration/types';

export const maxDuration = 60;

const MAX_SLIDES = 40;
const MAX_IMAGE_BASE64 = 250_000;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Accept only the fields we use, with caps, so a bad client cannot send arbitrary payloads on. */
function clean(body: unknown): SlideInput[] | null {
  const list = (body as { slides?: unknown })?.slides;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_SLIDES) return null;
  const slides: SlideInput[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    if (typeof raw?.index !== 'number' || !Number.isInteger(raw.index)) return null;
    const image = typeof raw.imageBase64 === 'string' && raw.imageBase64.length <= MAX_IMAGE_BASE64 ? raw.imageBase64 : undefined;
    slides.push({
      index: raw.index,
      title: raw.title ? str(raw.title, 300) : null,
      paragraphs: Array.isArray(raw.paragraphs) ? raw.paragraphs.slice(0, 60).map((p) => str(p, 500)) : [],
      notes: str(raw.notes, 4000),
      imageAlts: Array.isArray(raw.imageAlts) ? raw.imageAlts.slice(0, 10).map((p) => str(p, 300)) : [],
      imageBase64: image,
    });
  }
  return slides;
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const slides = clean(await req.json().catch(() => null));
  if (!slides) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_SLIDES} slides.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await generateNarration(slides), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof NarrationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'The narration service failed. Try again.' }, { status: 502 });
  }
}
