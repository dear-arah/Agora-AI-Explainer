import { describe, expect, it } from 'vitest';
import { linesFromItems } from '@/lib/ingest/pdf-text';

describe('linesFromItems', () => {
  it('orders lines top to bottom and joins fragments on the same baseline left to right', () => {
    const items = [
      { str: 'second line', x: 50, y: 300 },
      { str: 'Title', x: 50, y: 500 },
      { str: 'part two', x: 200, y: 301 },
      { str: 'part one', x: 100, y: 300 },
    ];
    expect(linesFromItems(items)).toEqual(['Title', 'second line part one part two']);
  });

  it('ignores blank fragments', () => {
    expect(linesFromItems([{ str: '  ', x: 0, y: 10 }, { str: 'Hi', x: 0, y: 20 }])).toEqual(['Hi']);
  });
});

describe('linesFromItems on exported decks', () => {
  it('drops text drawn more than once at the same spot (stacked layers)', () => {
    const copy = { str: 'Building Voice Agents', x: 82.5, y: 417.7 };
    expect(linesFromItems([copy, { ...copy }, { ...copy, x: 82.9 }])).toEqual(['Building Voice Agents']);
  });

  it('keeps the same words when they appear at different places', () => {
    const a = { str: 'Agora', x: 10, y: 300 };
    expect(linesFromItems([a, { ...a, y: 100 }])).toEqual(['Agora', 'Agora']);
  });

  it('closes up letter-spaced text such as "O c t o b e r"', () => {
    expect(
      linesFromItems([
        { str: 'O c t o b e r', x: 82, y: 69 },
        { str: '2 0 2 6', x: 170, y: 69 },
      ]),
    ).toEqual(['October 2026']);
  });

  it('does not collapse ordinary short words', () => {
    expect(linesFromItems([{ str: 'a b', x: 0, y: 0 }])).toEqual(['a b']);
  });
});
