import { describe, expect, it } from 'vitest';
import { toCues, toSrt, toVtt } from '@/lib/stage/captions';

describe('toCues', () => {
  it('gives a one-sentence slide the whole time it was spoken', () => {
    expect(toCues([{ text: 'Hello there.', startMs: 1750, endMs: 8800 }])).toEqual([{ startMs: 1750, endMs: 8800, text: 'Hello there.' }]);
  });

  it('splits sentences in proportion to their words and ends exactly where speech ended', () => {
    const cues = toCues([{ text: 'One two. Three four five six.', startMs: 0, endMs: 6000 }]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 0, endMs: 2000, text: 'One two.' });
    expect(cues[1]).toEqual({ startMs: 2000, endMs: 6000, text: 'Three four five six.' });
  });

  it('keeps cues in slide order, never overlapping', () => {
    const cues = toCues([
      { text: 'First one. First two.', startMs: 1000, endMs: 5000 },
      { text: 'Second.', startMs: 6000, endMs: 9000 },
    ]);
    for (let i = 1; i < cues.length; i++) expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].endMs);
    expect(cues.map((c) => c.text)).toEqual(['First one.', 'First two.', 'Second.']);
  });

  it('skips slides with no text or no measured time', () => {
    expect(toCues([{ text: '   ', startMs: 0, endMs: 1000 }, { text: 'Hi.', startMs: 5000, endMs: 5000 }])).toEqual([]);
  });

  it('handles text with no final full stop', () => {
    expect(toCues([{ text: 'Hello. And welcome', startMs: 0, endMs: 3000 }]).map((c) => c.text)).toEqual(['Hello.', 'And welcome']);
  });
});

describe('toVtt and toSrt', () => {
  const cues = [{ startMs: 1750, endMs: 8800, text: 'Hello there.' }, { startMs: 3_723_005, endMs: 3_725_000, text: 'Later.' }];

  it('writes WebVTT with dot milliseconds and a header', () => {
    expect(toVtt(cues)).toBe('WEBVTT\n\n00:00:01.750 --> 00:00:08.800\nHello there.\n\n01:02:03.005 --> 01:02:05.000\nLater.\n');
  });

  it('writes SRT with numbered cues and comma milliseconds', () => {
    expect(toSrt(cues)).toBe('1\n00:00:01,750 --> 00:00:08,800\nHello there.\n\n2\n01:02:03,005 --> 01:02:05,000\nLater.\n');
  });
});
