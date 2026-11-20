import { describe, expect, it } from 'vitest';
import { splitForSpeak } from '@/lib/narration/speak';

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('splitForSpeak', () => {
  it('returns short text as one chunk', () => {
    expect(splitForSpeak('Hello there. How are you?')).toEqual(['Hello there. How are you?']);
  });

  it('splits on sentence boundaries so every chunk fits 512 bytes', () => {
    const sentence = 'This is a sentence of moderate length that keeps going a little. ';
    const chunks = splitForSpeak(sentence.repeat(20));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(512);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(sentence.repeat(20).trim().replace(/\s+/g, ' '));
  });

  it('breaks a single over-long sentence at spaces', () => {
    const long = 'word '.repeat(300).trim();
    const chunks = splitForSpeak(long);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(512);
    expect(chunks.join(' ')).toBe(long);
  });

  it('counts bytes, not characters', () => {
    const chunks = splitForSpeak('é'.repeat(400), 512);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(512);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('returns nothing for blank text', () => {
    expect(splitForSpeak('   ')).toEqual([]);
  });
});
