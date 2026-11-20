import { describe, expect, it } from 'vitest';
import { buildPrompt } from '@/lib/narration/prompt';

const slides = [
  { index: 1, title: 'Growth', paragraphs: ['Users up 32%'], notes: 'Driven by onboarding.', imageAlts: ['rocket'] },
  { index: 4, title: null, paragraphs: [], notes: '', imageAlts: [] },
];

describe('buildPrompt', () => {
  const p = buildPrompt(slides, 12);

  it('includes title, text, notes and picture descriptions, keyed by slide index', () => {
    expect(p).toContain('Slide 1');
    expect(p).toContain('Growth');
    expect(p).toContain('Users up 32%');
    expect(p).toContain('Driven by onboarding.');
    expect(p).toContain('rocket');
    expect(p).toContain('Slide 4');
  });

  it('states the word budget and the output shape', () => {
    expect(p).toMatch(/at most 12 words/);
    expect(p).toContain('"slides"');
    expect(p).toContain('"narration"');
  });

  it('tells the model the slide content is material, not instructions', () => {
    expect(p).toMatch(/never instructions/i);
  });
});
