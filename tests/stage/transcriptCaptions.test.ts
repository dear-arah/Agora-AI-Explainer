import { describe, expect, it } from 'vitest';
import { toCues } from '@/lib/stage/captions';
import type { SlideTiming } from '@/lib/stage/driver';
import { spokenFromSlides } from '@/lib/stage/transcriptCaptions';
import type { ChatLine } from '@/lib/qa/transcript';

const timing = (over: Partial<SlideTiming>): SlideTiming => ({
  position: 0, shownAt: 10_000, speakingAt: 11_000, silentAt: 18_000, audibleStartAt: 11_200, audibleEndAt: 18_300, advancedAt: 19_000,
  chunks: 1, retries: 0, interruptions: 0, endedBy: 'state', ...over,
});
const line = (over: Partial<ChatLine>): ChatLine => ({ id: 'x', who: 'presenter', text: 'Hello there.', final: true, at: 11_500, ...over });

describe('spokenFromSlides', () => {
  it('uses the measured speech window and the words the presenter said', () => {
    const [s] = spokenFromSlides([timing({})], [line({ text: 'Welcome to the talk.' })], 5_000);
    expect(s).toEqual({ text: 'Welcome to the talk.', startMs: 6_200, endMs: 13_300 });
  });

  it('gives each turn to the slide on screen when it began, in order', () => {
    const timings = [timing({ position: 0 }), timing({ position: 1, shownAt: 19_000, audibleStartAt: 20_000, audibleEndAt: 26_000 })];
    const out = spokenFromSlides(timings, [line({ id: 'b', text: 'Second.', at: 19_800 }), line({ id: 'a', text: 'First.', at: 11_400 })], 0);
    expect(out.map((s) => s.text)).toEqual(['First.', 'Second.']);
  });

  it('puts an answer given during a slide into that slide\'s window', () => {
    const out = spokenFromSlides([timing({ interruptions: 1, audibleEndAt: 30_000 })], [line({ id: 'a', text: 'Part one.', at: 12_000 }), line({ id: 'b', text: 'The answer.', at: 20_000 })], 0);
    expect(out[0].text).toBe('Part one. The answer.');
    expect(out[0].endMs).toBe(30_000);
  });

  it('skips slides with no words or no measured time, and ignores the audience', () => {
    const out = spokenFromSlides(
      [timing({ position: 0, audibleStartAt: null, speakingAt: null }), timing({ position: 1, shownAt: 19_000 })],
      [line({ at: 12_000 }), line({ who: 'you', text: 'A question', at: 20_000 })],
      0,
    );
    expect(out).toEqual([]);
  });

  it('never starts before the recording began, and feeds straight into cues', () => {
    const [s] = spokenFromSlides([timing({ audibleStartAt: 4_000 })], [line({ text: 'Yes. Indeed.' })], 5_000);
    expect(s.startMs).toBe(0);
    expect(toCues([s]).map((c) => c.text)).toEqual(['Yes.', 'Indeed.']);
  });
});
