'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { drawFrame, type Drawable } from './compose';
import type { PresenterLayout } from './layout';
import { StageRecorder, pickFormat } from './recorder';

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const VIDEO_FPS = 30;
/** A moment of picture before the first word, and after the last one. */
const LEAD_MS = 500;
const TAIL_MS = 1000;

export interface FrameState {
  slideIndex: number;
  title: string;
  layout: PresenterLayout;
  level: number;
}

export interface BeginOptions {
  /** One picture per slide, or null when there is no PDF (titles are drawn instead). */
  slideUrls: string[] | null;
  photoUrl: string | null;
  /** What to draw right now. Called every frame. */
  getFrame: () => FrameState;
  /** The agent's audio, or null to record without sound. */
  audio: MediaStream | null;
}

export interface RecordingResult {
  url: string;
  filename: string;
  ext: 'mp4' | 'webm';
  mime: string;
  bytes: number;
  seconds: number;
  /** Seconds the tab was in the background; the picture can stutter while that is happening. */
  hiddenSeconds: number;
  /** Loudest the agent's voice got during the take, 0 to 1. */
  peakLevel: number;
  /** Date.now() when recording began, to line up measured speech times with the file. */
  startedAtEpoch: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Records the stage (slide plus presenter, drawn on a canvas) and the agent's audio to one file. */
export function useStageRecording() {
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const live = useRef<{
    recorder: StageRecorder;
    stream: MediaStream;
    raf: number;
    startedAt: number;
    hiddenSince: number | null;
    hiddenMs: number;
    peak: number;
    epoch: number;
    onVisibility: () => void;
  } | null>(null);

  const clear = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setResult(null);
  }, []);

  const halt = useCallback(() => {
    const s = live.current;
    live.current = null;
    if (!s) return null;
    cancelAnimationFrame(s.raf);
    document.removeEventListener('visibilitychange', s.onVisibility);
    s.stream.getVideoTracks().forEach((t) => t.stop());
    setRecording(false);
    return s;
  }, []);

  const begin = useCallback(async (o: BeginOptions) => {
    clear();
    setError(null);
    if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video. Use a recent Chrome, Edge or Safari.');
    const format = pickFormat((m) => MediaRecorder.isTypeSupported(m));
    if (!format) throw new Error('This browser cannot record video. Use a recent Chrome, Edge or Safari.');

    const slides: Drawable[] | null = o.slideUrls ? await Promise.all(o.slideUrls.map(loadImage)) : null;
    const photo = o.photoUrl ? await loadImage(o.photoUrl) : null;

    const canvas = document.createElement('canvas');
    canvas.width = VIDEO_WIDTH;
    canvas.height = VIDEO_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the video frame.');

    const draw = () => {
      const f = o.getFrame();
      if (live.current) live.current.peak = Math.max(live.current.peak, f.level);
      drawFrame(ctx, VIDEO_WIDTH, VIDEO_HEIGHT, { slide: slides?.[f.slideIndex] ?? null, title: f.title, layout: f.layout, photo, level: f.level });
    };
    draw();

    const stream = canvas.captureStream(VIDEO_FPS);
    o.audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
    const recorder = new StageRecorder(stream, format);

    const state = {
      recorder, stream, raf: 0, startedAt: performance.now(), hiddenSince: null as number | null, hiddenMs: 0, peak: 0, epoch: 0,
      onVisibility: () => {
        if (document.visibilityState === 'hidden') state.hiddenSince = performance.now();
        else if (state.hiddenSince !== null) { state.hiddenMs += performance.now() - state.hiddenSince; state.hiddenSince = null; }
      },
    };
    const loop = () => { draw(); state.raf = requestAnimationFrame(loop); };
    document.addEventListener('visibilitychange', state.onVisibility);
    if (document.visibilityState === 'hidden') state.onVisibility();
    live.current = state;
    recorder.start();
    state.startedAt = performance.now();
    state.epoch = Date.now();
    state.raf = requestAnimationFrame(loop);
    setRecording(true);
    await sleep(LEAD_MS);
  }, [clear]);

  /** Stop after a short tail and publish the file. */
  const finish = useCallback(async () => {
    const s = live.current;
    if (!s) return;
    try {
      await sleep(TAIL_MS);
      const seconds = (performance.now() - s.startedAt) / 1000;
      if (s.hiddenSince !== null) s.onVisibility();
      const blob = await s.recorder.stop();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const { ext, mime } = s.recorder.format;
      setResult({ url, ext, mime, bytes: blob.size, seconds, hiddenSeconds: s.hiddenMs / 1000, peakLevel: s.peak, startedAtEpoch: s.epoch, filename: `slide-narrator-${stamp()}.${ext}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      halt();
    }
  }, [halt]);

  /** Throw the take away (the presentation stopped or failed). */
  const discard = useCallback(async () => {
    const s = halt();
    if (s) await s.recorder.stop().catch(() => {});
  }, [halt]);

  useEffect(() => () => { void discard(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, [discard]);

  /** Date.now() at the moment the current recording began (0 when none is running). */
  const startedAtEpoch = useCallback(() => live.current?.epoch ?? 0, []);

  return { result, recording, error, begin, finish, discard, clear, startedAtEpoch };
}
