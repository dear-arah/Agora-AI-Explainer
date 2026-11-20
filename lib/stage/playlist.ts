import { countWords, estimateSeconds } from '@/lib/narration/timing';
import type { PlayItem } from './driver';

/** Marks a message as a stage direction for the presenter, so the chat can hide it. */
export const CUE_MARKER = '[Stage cue]';

/** improvise: the presenter's own model says each slide in its own words, adapting to the conversation.
 *  script: the written narration is spoken exactly. */
export type PresentStyle = 'improvise' | 'script';

export interface PlaylistSlide {
  position: number;
  title: string | null;
  paragraphs: string[];
  notes: string;
  /** The written narration, or '' when there is none. */
  narration: string;
  skipped: boolean;
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5;

/** The talking points for a slide: the narration, or failing that whatever text the slide has. */
export function talkingPoints(s: PlaylistSlide): string {
  if (s.narration.trim()) return s.narration.trim();
  return [s.title, ...s.paragraphs, s.notes].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

export function presentCue(s: { position: number; total: number; title: string | null; points: string; words: number }): string {
  const n = s.position + 1;
  return (
    `${CUE_MARKER} Present slide ${n} of ${s.total}${s.title ? ` ("${s.title}")` : ''} now. ` +
    `Talking points: ${s.points} ` +
    `Say them naturally in your own words, in about ${s.words} words, as spoken sentences. ` +
    `Do not say the slide number. If the audience asked something earlier, tie it in. Do not ask the audience a question.`
  );
}

export function resumeCue(s: { position: number }): string {
  return (
    `${CUE_MARKER} You were interrupted during slide ${s.position + 1}. ` +
    `In at most 30 words, finish what you had not yet said about it, without repeating your last answer, then stop.`
  );
}

/** What to say, slide by slide, with skipped and empty slides left out. */
export function buildPlaylist(slides: PlaylistSlide[], style: PresentStyle): PlayItem[] {
  const spoken = slides.filter((s) => !s.skipped && talkingPoints(s));
  return spoken.map((s) => {
    const points = talkingPoints(s);
    const expectedSeconds = estimateSeconds(points);
    if (style === 'script') return { position: s.position, text: points, expectedSeconds };
    const words = Math.min(80, Math.max(15, roundTo5(countWords(points))));
    return {
      position: s.position,
      text: presentCue({ position: s.position, total: slides.length, title: s.title, points, words }),
      raw: true,
      resumeText: resumeCue({ position: s.position }),
      expectedSeconds,
    };
  });
}
