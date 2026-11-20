import { describe, expect, it } from 'vitest';
import { countWords, durationStatus, estimateSeconds, totalSeconds, wordBudget } from '@/lib/narration/timing';

describe('timing', () => {
  it('counts words', () => {
    expect(countWords('  Hello   there, world. ')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('estimates 150 words a minute', () => {
    expect(estimateSeconds('word '.repeat(150))).toBeCloseTo(60, 5);
    expect(estimateSeconds('word '.repeat(75))).toBeCloseTo(30, 5);
  });

  it('adds a pause only for slides that have narration', () => {
    const words = 'word '.repeat(15); // 6 s
    expect(totalSeconds([words, '', words], 1)).toBeCloseTo(6 + 1 + 6 + 1, 5);
    expect(totalSeconds(['', ' '], 1)).toBe(0);
  });

  it('warns above 2 minutes and blocks above 2.5 minutes', () => {
    expect(durationStatus(119)).toBe('ok');
    expect(durationStatus(121)).toBe('warn');
    expect(durationStatus(150)).toBe('warn');
    expect(durationStatus(151)).toBe('blocked');
  });

  it('gives each slide a share of about 250 words, between 8 and 40', () => {
    expect(wordBudget(5)).toBe(40);
    expect(wordBudget(10)).toBe(25);
    expect(wordBudget(24)).toBe(10);
    expect(wordBudget(100)).toBe(8);
  });
});
