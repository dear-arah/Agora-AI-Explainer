/** Narration is aimed at about 150 spoken words a minute. Measure it with the chosen voice. */
export const WORDS_PER_MINUTE = 150;
/** Silence between slides that have narration, in seconds. */
export const SLIDE_PAUSE_SECONDS = 0.8;
export const WARN_SECONDS = 120;
/** Above this the render is blocked, so a session stays under the free-tier 3-minute cap. */
export const BLOCK_SECONDS = 150;
/** Total narration the prompt aims for, in words (about 100 seconds). */
const TARGET_TOTAL_WORDS = 250;

export const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

export const estimateSeconds = (text: string, wpm = WORDS_PER_MINUTE): number => (countWords(text) / wpm) * 60;

/** Total video length: speech plus one pause per narrated slide. Slides with no narration add nothing. */
export function totalSeconds(narrations: string[], pause = SLIDE_PAUSE_SECONDS): number {
  return narrations
    .filter((n) => n.trim())
    .reduce((sum, n) => sum + estimateSeconds(n) + pause, 0);
}

export type DurationStatus = 'ok' | 'warn' | 'blocked';

export function durationStatus(seconds: number): DurationStatus {
  if (seconds > BLOCK_SECONDS) return 'blocked';
  if (seconds > WARN_SECONDS) return 'warn';
  return 'ok';
}

/** Words allowed per slide so the whole deck lands near the target, never below 8 or above 40. */
export function wordBudget(slideCount: number): number {
  return Math.min(40, Math.max(8, Math.round(TARGET_TOTAL_WORDS / Math.max(1, slideCount))));
}
