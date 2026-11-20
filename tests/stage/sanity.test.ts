import { describe, expect, it } from 'vitest';
import { SILENT_PEAK, videoWarnings, type SanityInput } from '@/lib/stage/sanity';

const good: SanityInput = { seconds: 42, estimatedSeconds: 40, peakLevel: 0.6, hiddenSeconds: 0, bytes: 9_000_000, ext: 'mp4' };

describe('videoWarnings', () => {
  it('has nothing to say about a normal recording', () => {
    expect(videoWarnings(good)).toEqual([]);
  });

  it('flags a recording with no voice in it', () => {
    const w = videoWarnings({ ...good, peakLevel: SILENT_PEAK - 0.01 });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('No voice');
  });

  it('flags a tiny file', () => {
    expect(videoWarnings({ ...good, bytes: 1000 })[0]).toContain('very small');
  });

  it('flags a backgrounded tab only when it was meaningfully hidden', () => {
    expect(videoWarnings({ ...good, hiddenSeconds: 0.2 })).toEqual([]);
    expect(videoWarnings({ ...good, hiddenSeconds: 4.26 })[0]).toContain('4.3 s');
  });

  it('flags a video far shorter or longer than the narration estimate', () => {
    expect(videoWarnings({ ...good, seconds: 15 })[0]).toContain('0:15 long');
    expect(videoWarnings({ ...good, seconds: 90 })[0]).toContain('estimated at 0:40');
    expect(videoWarnings({ ...good, seconds: 50 })).toEqual([]);
  });

  it('notes the WebM fallback and can report several problems together', () => {
    const w = videoWarnings({ ...good, ext: 'webm', peakLevel: 0 });
    expect(w).toHaveLength(2);
    expect(w.join(' ')).toContain('WebM');
  });
});
