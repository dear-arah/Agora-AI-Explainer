'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { alignImages, checkSlideCount } from '@/lib/ingest/match';
import { extractPdfText, pdfPageCount, renderPdfToImages } from '@/lib/ingest/pdf';
import { parsePptx } from '@/lib/ingest/pptx';
import { renderPptxToImages } from '@/lib/ingest/pptx-render';
import { IngestError, type ParsedDeck } from '@/lib/ingest/types';

export type ImageSource = 'pdf' | 'powerpoint' | null;

/** Reads a deck and turns every slide into a picture, all in the browser. */
export function useIngest() {
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  const [images, setImages] = useState<Blob[] | null>(null);
  const [imageSource, setImageSource] = useState<ImageSource>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const slides = useMemo(() => (deck ? deck.slides.filter((s) => !s.hidden) : []), [deck]);
  const slideUrls = useMemo(() => (images ? images.map((b) => URL.createObjectURL(b)) : null), [images]);
  useEffect(() => () => slideUrls?.forEach((u) => URL.revokeObjectURL(u)), [slideUrls]);

  const reset = useCallback(() => {
    setDeck(null); setImages(null); setImageSource(null); setFileName('');
    setBusy(null); setError(null); setWarning(null);
  }, []);

  /** Load a .pptx and/or a .pdf. Resolves true when there is a deck to present. */
  const load = useCallback(async (files: File[]): Promise<boolean> => {
    setError(null);
    setWarning(null);
    setImages(null);
    setImageSource(null);
    try {
      const pptx = files.find((f) => /\.pptx$/i.test(f.name));
      const pdf = files.find((f) => /\.pdf$/i.test(f.name));
      if (!pptx && !pdf) throw new IngestError('Choose a PowerPoint (.pptx) or a PDF.');

      let parsed: ParsedDeck | null = null;
      let pptxBuf: ArrayBuffer | null = null;
      if (pptx) {
        setBusy('Reading your slides…');
        pptxBuf = await pptx.arrayBuffer();
        parsed = await parsePptx(pptxBuf);
      }

      let out: Blob[] | null = null;
      let source: ImageSource = null;
      if (pdf) {
        const buf = await pdf.arrayBuffer();
        if (!parsed) {
          // PDF only: the text comes from the PDF itself, and there are no speaker notes.
          const { pages, size } = await extractPdfText(buf);
          parsed = {
            size: { width: size.width * 12700, height: size.height * 12700 },
            slides: pages.map((lines, i) => ({ index: i + 1, title: null, paragraphs: lines, notes: '', imageAlts: [], hidden: false })),
          };
        }
        const visible = parsed.slides.filter((s) => !s.hidden).length;
        const check = checkSlideCount({ visible, hidden: parsed.slides.length - visible, pdfPages: await pdfPageCount(buf) });
        if (!check.ok) throw new IngestError(check.message);
        setBusy('Preparing your slides…');
        out = alignImages(parsed.slides, await renderPdfToImages(buf, (d, t) => setBusy(`Preparing your slides… ${d}/${t}`))).map((i) => i.blob);
        source = 'pdf';
      } else if (parsed && pptxBuf) {
        setBusy('Drawing your slides…');
        try {
          const drawn = await renderPptxToImages(pptxBuf, parsed.size, (d, t) => setBusy(`Drawing your slides… ${d}/${t}`));
          out = alignImages(parsed.slides, drawn).map((i) => i.blob);
          source = 'powerpoint';
        } catch (e) {
          setWarning(e instanceof IngestError ? e.message : 'The slides could not be drawn. Add a PDF export of the deck for slide pictures.');
        }
      }

      setDeck(parsed);
      setImages(out);
      setImageSource(source);
      setFileName((pptx ?? pdf)!.name);
      setBusy(null);
      return true;
    } catch (e) {
      setError(e instanceof IngestError ? e.message : `Something went wrong: ${(e as Error).message}`);
      setBusy(null);
      return false;
    }
  }, []);

  /** Developer aid: load a bundled sample (or ?deck=deckN from public/local-test). */
  const loadSample = useCallback(async (name = 'sample') => {
    const local = /^deck\d+$/.test(name);
    const pptx = await fetch(local ? `/local-test/${name}.pptx` : `/samples/${name}.pptx`).then((r) => r.arrayBuffer());
    const files = [new File([pptx], `${name}.pptx`)];
    if (name === 'sample') files.push(new File([await fetch('/samples/sample.pdf').then((r) => r.arrayBuffer())], 'sample.pdf'));
    return load(files);
  }, [load]);

  return { deck, slides, images, slideUrls, imageSource, fileName, busy, error, warning, load, loadSample, reset };
}
