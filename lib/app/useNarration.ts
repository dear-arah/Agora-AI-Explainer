'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SlideContent } from '@/lib/ingest/types';
import { requestNarration } from '@/lib/narration/client';
import { durationStatus, totalSeconds } from '@/lib/narration/timing';
import { NarrationError } from '@/lib/narration/types';

export interface Line { text: string; skip: boolean }

/** The written script: one editable line per slide, drafted by Gemini. */
export function useNarration(slides: SlideContent[], images: Blob[] | null) {
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  // A different deck starts from a clean slate.
  useEffect(() => { setLines({}); setError(null); setSource(null); }, [slides]);

  const narrations = useMemo(() => slides.map((s) => (lines[s.index]?.skip ? '' : (lines[s.index]?.text ?? ''))), [slides, lines]);
  const hasAny = slides.some((s) => lines[s.index]);
  const seconds = totalSeconds(narrations);
  const status = durationStatus(seconds);

  const write = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const out = await requestNarration(slides, images);
      const next: Record<number, Line> = {};
      for (const n of out.narrations) next[n.index] = { text: n.narration, skip: n.narration === '' };
      setLines(next);
      setSource(`${out.provider}${out.model !== 'none' ? ` · ${out.model}` : ''}`);
      return true;
    } catch (e) {
      setError(e instanceof NarrationError ? e.message : `Something went wrong: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [slides, images]);

  const edit = useCallback((index: number, patch: Partial<Line>) => {
    setLines((l) => ({ ...l, [index]: { ...(l[index] ?? { text: '', skip: false }), ...patch } }));
  }, []);

  return { lines, narrations, hasAny, seconds, status, busy, error, source, write, edit };
}
