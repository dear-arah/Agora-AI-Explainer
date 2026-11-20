import { describe, expect, it } from 'vitest';
import { CUE_MARKER, buildPlaylist, presentCue, resumeCue, talkingPoints, type PlaylistSlide } from '@/lib/stage/playlist';

const slide = (over: Partial<PlaylistSlide> = {}): PlaylistSlide => ({
  position: 0, title: 'Growth', paragraphs: ['Users up 32%'], notes: '', narration: 'Users grew by thirty-two percent this quarter.', skipped: false, ...over,
});

describe('talkingPoints', () => {
  it('prefers the written narration', () => {
    expect(talkingPoints(slide())).toBe('Users grew by thirty-two percent this quarter.');
  });
  it('falls back to the slide text and notes when there is no narration', () => {
    expect(talkingPoints(slide({ narration: '', notes: 'Say thanks.' }))).toBe('Growth. Users up 32%. Say thanks.');
  });
  it('caps a long fallback', () => {
    expect(talkingPoints(slide({ narration: '', paragraphs: ['x'.repeat(2000)] })).length).toBe(600);
  });
});

describe('buildPlaylist', () => {
  const slides = [slide(), slide({ position: 1, title: null, narration: '', paragraphs: [], notes: '' }), slide({ position: 2, skipped: true })];

  it('leaves out skipped slides and slides with nothing to say', () => {
    expect(buildPlaylist(slides, 'script').map((i) => i.position)).toEqual([0]);
  });

  it('script style speaks the narration exactly, with no resume', () => {
    const [item] = buildPlaylist(slides, 'script');
    expect(item.text).toBe('Users grew by thirty-two percent this quarter.');
    expect(item.raw).toBeUndefined();
    expect(item.resumeText).toBeUndefined();
  });

  it('improvise style sends a cue, as one piece, with a resume cue', () => {
    const [item] = buildPlaylist(slides, 'improvise');
    expect(item.raw).toBe(true);
    expect(item.text).toContain(CUE_MARKER);
    expect(item.text).toContain('Present slide 1 of 3 ("Growth")');
    expect(item.text).toContain('Users grew by thirty-two percent');
    expect(item.resumeText).toContain('interrupted during slide 1');
    expect(item.expectedSeconds).toBeGreaterThan(0);
  });

  it('asks for roughly the narration length, within sane limits', () => {
    const short = buildPlaylist([slide({ narration: 'Hi there.' })], 'improvise')[0].text;
    expect(short).toContain('about 15 words');
    const long = buildPlaylist([slide({ narration: 'word '.repeat(300) })], 'improvise')[0].text;
    expect(long).toContain('about 80 words');
  });
});

describe('cues', () => {
  it('tell the presenter not to say the slide number or quiz the audience', () => {
    const c = presentCue({ position: 1, total: 4, title: null, points: 'Pricing.', words: 40 });
    expect(c).toContain('Present slide 2 of 4 now');
    expect(c).toContain('Do not say the slide number');
    expect(c).toContain('Do not ask the audience a question');
  });
  it('keep the resume short', () => {
    expect(resumeCue({ position: 0 })).toContain('at most 30 words');
  });
});
