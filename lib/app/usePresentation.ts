'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayItem, SlideTiming } from '@/lib/stage/driver';
import { SlideDriver } from '@/lib/stage/driver';
import { toCues, toSrt, toVtt } from '@/lib/stage/captions';
import type { PresenterLayout } from '@/lib/stage/layout';
import type { PresentStyle } from '@/lib/stage/playlist';
import { spokenFromSlides } from '@/lib/stage/transcriptCaptions';
import { useStageRecording } from '@/lib/stage/useStageRecording';
import { useStageSession } from '@/lib/stage/useStageSession';
import type { QaSlide } from '@/lib/qa/context';

export type Phase = 'idle' | 'connecting' | 'live' | 'finished' | 'error';

export interface RunSettings {
  playlist: PlayItem[];
  qaContext: QaSlide[];
  slideUrls: string[] | null;
  photoUrl: string | null;
  layout: PresenterLayout;
  slideTitles: string[];
  style: PresentStyle;
  saveVideo: boolean;
  micOn: boolean;
}

export interface CaptionFiles { vttUrl: string; srtUrl: string }

/**
 * Runs the live presentation: connects the presenter, opens the microphone so the audience can break in,
 * records the stage, and walks through the slides, resuming after any conversation. One click starts all of it.
 */
export function usePresentation(settings: RunSettings) {
  const session = useStageSession();
  const rec = useStageRecording();
  const [phase, setPhase] = useState<Phase>('idle');
  const [pos, setPos] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [timings, setTimings] = useState<SlideTiming[] | null>(null);
  const [captionFiles, setCaptionFiles] = useState<CaptionFiles | null>(null);

  // Everything the run reads is kept in refs so a long run never sees stale settings.
  const cfg = useRef(settings);
  cfg.current = settings;
  const frame = useRef({ pos: 0 });
  const transcript = useRef(session.transcript);
  transcript.current = session.transcript;
  const driver = useRef<SlideDriver | null>(null);
  const startedKey = useRef<string | null>(null);

  const dropCaptions = useCallback(() => {
    setCaptionFiles((c) => {
      if (c) { URL.revokeObjectURL(c.vttUrl); URL.revokeObjectURL(c.srtUrl); }
      return null;
    });
  }, []);

  const start = useCallback(async (avatarParam?: string) => {
    if (driver.current || phase === 'connecting') return;
    const c = cfg.current;
    setRunError(null);
    setTimings(null);
    rec.clear();
    dropCaptions();
    setPos(0);
    frame.current.pos = 0;
    setPhase('connecting');

    // The presenter learns the deck when the session starts, so a changed script needs a fresh session.
    const key = JSON.stringify(c.qaContext);
    if (session.status === 'live' && startedKey.current !== key) await session.stop();
    startedKey.current = key;

    const ok = await session.start('orb', avatarParam, c.qaContext);
    if (!ok) { setPhase('error'); return; }
    setPhase('live');
    if (c.micOn) await session.openMic(); // never blocks the talk: without a microphone the audience can still type

    const d = new SlideDriver(
      {
        speak: c.style === 'improvise' ? (text) => session.cue(text) : (text) => session.speak(text, 'INTERRUPT', true),
        showSlide: (p) => { frame.current.pos = p; setPos(p); },
        getLevel: () => session.levelRef.current,
      },
      { interruptions: true },
    );
    driver.current = d;
    const offState = session.onAgentState((s) => d.handleAgentState(s));
    const offUser = session.onUserActivity(() => d.handleUserActivity());
    try {
      if (c.saveVideo) {
        await rec.begin({
          slideUrls: c.slideUrls,
          photoUrl: c.photoUrl,
          audio: session.getAudioStream(),
          getFrame: () => ({
            slideIndex: frame.current.pos,
            title: cfg.current.slideTitles[frame.current.pos] ?? '',
            layout: cfg.current.layout,
            level: session.levelRef.current,
          }),
        });
      }
      const res = await d.play(c.playlist);
      setTimings(res.timings);
      await session.closeMic();
      if (c.saveVideo) {
        if (res.status === 'error') {
          await rec.discard();
        } else {
          const origin = rec.startedAtEpoch();
          await rec.finish();
          const cues = toCues(spokenFromSlides(res.timings, transcript.current, origin));
          if (cues.length > 0) {
            setCaptionFiles({
              vttUrl: URL.createObjectURL(new Blob([toVtt(cues)], { type: 'text/vtt' })),
              srtUrl: URL.createObjectURL(new Blob([toSrt(cues)], { type: 'application/x-subrip' })),
            });
          }
        }
      }
      if (res.status === 'error') setRunError(res.message);
      setPhase(res.status === 'error' ? 'error' : 'finished');
    } catch (e) {
      await rec.discard();
      setRunError((e as Error).message);
      setPhase('error');
    } finally {
      offState();
      offUser();
      driver.current = null;
    }
  }, [phase, rec, session, dropCaptions]);

  /** Stop the talk. What was recorded so far is kept and can be downloaded straight away. */
  const stop = useCallback(() => { driver.current?.stop(); }, []);

  const clearVideo = useCallback(() => { dropCaptions(); rec.clear(); }, [dropCaptions, rec]);

  const endSession = useCallback(async () => {
    driver.current?.stop();
    await session.stop();
  }, [session]);

  // Leaving the page must not leave a talk running.
  useEffect(() => () => { driver.current?.stop(); }, []);
  useEffect(() => { if (session.status === 'idle') driver.current?.stop(); }, [session.status]);

  return { session, rec, phase, pos, setPos, runError, timings, captionFiles, start, stop, clearVideo, endSession };
}
