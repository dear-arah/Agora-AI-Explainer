import type { ChatLine } from '@/lib/qa/transcript';
import type { SpokenSlide } from './captions';
import type { SlideTiming } from './driver';

/**
 * Captions from what the presenter actually said. The driver measures when each slide's speech began and
 * ended (to within a fraction of a second); the transcript supplies the words. A transcript turn belongs to
 * the slide on screen when the turn began. If the audience broke in, the slide's window includes the answer,
 * so the sentences inside it are spread by length and only the window's edges are exact.
 *
 * The transcript's own timestamps are not used for timing: they are not reliable enough to caption from.
 */
export function spokenFromSlides(timings: SlideTiming[], lines: ChatLine[], originMs: number): SpokenSlide[] {
  const presenter = lines.filter((l) => l.who === 'presenter').sort((a, b) => a.at - b.at);
  const out: SpokenSlide[] = [];
  timings.forEach((t, i) => {
    const from = t.shownAt;
    const until = timings[i + 1]?.shownAt ?? Infinity;
    const text = presenter.filter((l) => l.at >= from && l.at < until).map((l) => l.text).join(' ').trim();
    const start = t.audibleStartAt ?? t.speakingAt;
    const end = t.audibleEndAt ?? t.silentAt;
    if (!text || start === null || end === null) return;
    const startMs = Math.max(0, start - originMs);
    const endMs = end - originMs;
    if (endMs > startMs) out.push({ text, startMs, endMs });
  });
  return out;
}
