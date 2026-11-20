import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSamplePptx } from '../../scripts/sample-deck.mjs';
import { parsePptx, visibleSlides } from '@/lib/ingest/pptx';
import { IngestError, type ParsedDeck } from '@/lib/ingest/types';

let deck: ParsedDeck;

beforeAll(async () => {
  const buf = await buildSamplePptx();
  deck = await parsePptx(buf);
});

describe('parsePptx', () => {
  it('returns every slide in presentation order, hidden ones included', () => {
    expect(deck.slides.map((s) => s.title)).toEqual([
      'Quarterly Product Update',
      'Growth',
      'Pricing',
      'Roadmap',
      'Backup: raw numbers',
    ]);
    expect(deck.slides.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('flags hidden slides and visibleSlides drops them', () => {
    expect(deck.slides.map((s) => s.hidden)).toEqual([false, false, false, false, true]);
    expect(visibleSlides(deck)).toHaveLength(4);
  });

  it('collects body paragraphs without repeating the title', () => {
    expect(deck.slides[1].paragraphs).toEqual([
      'Active users up 32% to 48,000',
      'Churn down to 2.1%',
      'Two new enterprise customers',
    ]);
  });

  it('reads table cells as text', () => {
    const text = deck.slides[2].paragraphs.join(' | ');
    expect(text).toContain('Plan');
    expect(text).toContain('$12');
    expect(text).toContain('Team');
  });

  it('reads speaker notes, and gives an empty string when there are none', () => {
    expect(deck.slides[1].notes).toBe('Growth was driven mostly by the new onboarding flow.');
    expect(deck.slides[2].notes).toBe('');
  });

  it('collects picture alt text', () => {
    expect(deck.slides[3].imageAlts).toEqual(['Illustration of a rocket launching']);
    expect(deck.slides[1].imageAlts).toEqual([]);
  });

  it('reports the slide size for a 16:9 deck', () => {
    expect(deck.size.width / deck.size.height).toBeCloseTo(16 / 9, 2);
  });

  it('rejects files that are not a .pptx with a readable message', async () => {
    await expect(parsePptx(Buffer.from('definitely not a zip'))).rejects.toBeInstanceOf(IngestError);
    await expect(parsePptx(Buffer.from('definitely not a zip'))).rejects.toThrow(/\.pptx/);
  });
});

describe('parsePptx on a deck built from the PowerPoint default template', () => {
  it('reads title, subtitle, multi-paragraph body, table and multi-paragraph notes', async () => {
    const buf = await readFile(new URL('../fixtures/powerpoint-template.pptx', import.meta.url));
    const d = await parsePptx(buf);
    expect(d.slides.map((s) => s.title)).toEqual(['Onboarding Guide', 'Your first week', 'Who to ask']);
    expect(d.slides[0].paragraphs).toEqual(['Welcome to the team']);
    expect(d.slides[1].paragraphs).toEqual(['Day 1: set up your laptop', 'Day 2: meet your buddy', 'Day 3: first small task']);
    expect(d.slides[1].notes).toBe('Mention the buddy system.\nPoint to the wiki.');
    expect(d.slides[2].paragraphs).toEqual(['Topic | Person', 'Payroll | Dana', 'IT | Sam']);
    expect(d.size.width / d.size.height).toBeCloseTo(16 / 9, 2);
  });
});
