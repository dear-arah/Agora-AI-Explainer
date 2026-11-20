'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BLOCK_SECONDS } from '@/lib/narration/timing';
import type { QaSlide } from '@/lib/qa/context';
import { DEFAULT_LAYOUT, type PresenterLayout } from '@/lib/stage/layout';
import { buildPlaylist, type PresentStyle } from '@/lib/stage/playlist';
import { useIngest } from './useIngest';
import { useNarration } from './useNarration';
import { usePresentation } from './usePresentation';

interface Health { set: Record<string, boolean> }

function useAppState() {
  const ingest = useIngest();
  const narr = useNarration(ingest.slides, ingest.images);

  const [consent, setConsent] = useState(false);
  const [layout, setLayout] = useState<PresenterLayout>(DEFAULT_LAYOUT);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<PresentStyle>('improvise');
  const [saveVideo, setSaveVideo] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [pendingWrite, setPendingWrite] = useState(false);

  useEffect(() => { fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => {}); }, []);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const { slides, slideUrls } = ingest;

  const playlist = useMemo(
    () => buildPlaylist(
      slides.map((s, i) => ({
        position: i, title: s.title, paragraphs: s.paragraphs, notes: s.notes,
        narration: narr.lines[s.index]?.text ?? '', skipped: !!narr.lines[s.index]?.skip,
      })),
      style,
    ),
    [slides, narr.lines, style],
  );

  // What the presenter is told about the deck when its session starts, so it can answer questions.
  const qaContext = useMemo<QaSlide[]>(
    () => slides.map((s, i) => ({ title: s.title, text: s.paragraphs, narration: narr.narrations[i] ?? '' })),
    [slides, narr.narrations],
  );

  const present = usePresentation({
    playlist, qaContext, slideUrls, photoUrl, layout, style, saveVideo, micOn,
    slideTitles: slides.map((s) => s.title ?? `Slide ${s.index}`),
  });

  // After a deck loads, draft the script (once, and only if the user agreed to send slide text to Gemini).
  useEffect(() => {
    if (!pendingWrite || slides.length === 0 || ingest.busy) return;
    setPendingWrite(false);
    if (consent) void narr.write();
  }, [pendingWrite, slides, ingest.busy, consent, narr]);

  const openDeck = useCallback(async (files: File[]) => {
    const ok = await ingest.load(files);
    if (ok) setPendingWrite(true);
    return ok;
  }, [ingest]);

  const openSample = useCallback(async (name?: string) => {
    const ok = await ingest.loadSample(name);
    if (ok) setPendingWrite(true);
    return ok;
  }, [ingest]);

  const setPhoto = useCallback((file: File | null) => {
    setPhotoUrl((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null; });
  }, []);

  const reset = useCallback(async () => {
    await present.endSession();
    present.clearVideo();
    ingest.reset();
    setPendingWrite(false);
  }, [present, ingest]);

  const missing = health ? ['AGORA_APP_ID', 'AGORA_APP_CERTIFICATE'].filter((n) => !health.set[n]) : [];
  const preparing = ingest.busy ?? (narr.busy ? 'Writing the script…' : pendingWrite ? 'Preparing…' : null);
  let blockedReason: string | null = null;
  if (missing.length) blockedReason = `Missing Agora setting: ${missing.join(', ')}.`;
  else if (playlist.length === 0) blockedReason = 'There is nothing to present. Edit the script or add text to the slides.';
  else if (narr.seconds > BLOCK_SECONDS) blockedReason = 'The script is too long to record (over 2:30). Shorten it or skip slides.';

  return {
    ...ingest, narr, present, consent, setConsent, layout, setLayout, photoUrl, setPhoto, style, setStyle,
    saveVideo, setSaveVideo, micOn, setMicOn, playlist, preparing, blockedReason, openDeck, openSample, reset,
    ready: ingest.slides.length > 0 && !preparing,
  };
}

type AppApi = ReturnType<typeof useAppState>;
const Ctx = createContext<AppApi | null>(null);

/** One deck, one script and one live session shared by every page. It lives in memory; a reload starts over. */
export function AppProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
