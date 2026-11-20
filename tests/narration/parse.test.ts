import { describe, expect, it } from 'vitest';
import { parseNarration } from '@/lib/narration/parse';
import { NarrationError } from '@/lib/narration/types';

describe('parseNarration', () => {
  it('reads the documented object shape', () => {
    const raw = JSON.stringify({ slides: [{ index: 1, narration: ' Hello. ' }, { index: 2, narration: 'Bye.' }] });
    expect(parseNarration(raw, [1, 2])).toEqual([
      { index: 1, narration: 'Hello.' },
      { index: 2, narration: 'Bye.' },
    ]);
  });

  it('accepts a bare array and code fences', () => {
    const raw = '```json\n[{"index":1,"narration":"Hi"}]\n```';
    expect(parseNarration(raw, [1])).toEqual([{ index: 1, narration: 'Hi' }]);
  });

  it('fills missing slides with empty narration and ignores unknown indexes', () => {
    const raw = JSON.stringify({ slides: [{ index: 2, narration: 'Two' }, { index: 9, narration: 'Stray' }] });
    expect(parseNarration(raw, [1, 2])).toEqual([
      { index: 1, narration: '' },
      { index: 2, narration: 'Two' },
    ]);
  });

  it('turns non-string narration into an empty string', () => {
    const raw = JSON.stringify({ slides: [{ index: 1, narration: null }] });
    expect(parseNarration(raw, [1])).toEqual([{ index: 1, narration: '' }]);
  });

  it('throws a readable error when there is no JSON', () => {
    expect(() => parseNarration('Sorry, I cannot do that.', [1])).toThrow(NarrationError);
    expect(() => parseNarration('Sorry, I cannot do that.', [1])).toThrow(/valid JSON/);
  });
});
