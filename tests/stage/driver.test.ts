import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlideDriver, summarizeTimings, type DriverOptions } from '@/lib/stage/driver';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

interface Fake {
  driver: SlideDriver;
  spoken: string[];
  shown: number[];
  level: { value: number };
}

/**
 * A pretend agent: each /speak call starts speaking after `startMs` and goes silent after `talkMs`,
 * while the audio level follows the speech and trails off `lagMs` after the end signal.
 */
function fake(opts: {
  startMs?: number;
  talkMs?: number;
  lagMs?: number;
  stateEvents?: boolean;
  failFirst?: number;
  neverStart?: boolean;
  options?: Partial<DriverOptions>;
} = {}): Fake {
  const { startMs = 300, talkMs = 2000, lagMs = 0, stateEvents = true, neverStart = false } = opts;
  let failures = opts.failFirst ?? 0;
  const spoken: string[] = [];
  const shown: number[] = [];
  const level = { value: 0 };
  const driver: SlideDriver = new SlideDriver(
    {
      showSlide: (p) => shown.push(p),
      getLevel: () => level.value,
      speak: async (text) => {
        if (failures > 0) { failures -= 1; throw new Error('boom'); }
        spoken.push(text);
        if (neverStart) return;
        setTimeout(() => { if (stateEvents) driver.handleAgentState('speaking'); level.value = 0.5; }, startMs);
        setTimeout(() => { if (stateEvents) driver.handleAgentState('silent'); }, startMs + talkMs);
        setTimeout(() => { level.value = 0; }, startMs + talkMs + lagMs);
      },
    },
    opts.options,
  );
  return { driver, spoken, shown, level };
}

const run = async (f: Fake, items: { position: number; text: string }[]) => {
  const p = f.driver.play(items);
  await vi.runAllTimersAsync();
  return p;
};

describe('SlideDriver', () => {
  it('shows each slide, speaks its narration, and moves on after the speech ends', async () => {
    const f = fake();
    const res = await run(f, [{ position: 0, text: 'First.' }, { position: 2, text: 'Second.' }]);
    expect(res.status).toBe('done');
    expect(f.shown).toEqual([0, 2]);
    expect(f.spoken).toEqual(['First.', 'Second.']);
    const [a, b] = res.timings;
    expect(a.endedBy).toBe('state');
    expect(a.advancedAt!).toBeGreaterThanOrEqual(a.silentAt! + 800);
    expect(b.shownAt).toBe(a.advancedAt);
  });

  it('does not change the slide while the audio is still playing after the end signal', async () => {
    const f = fake({ lagMs: 1200 });
    const res = await run(f, [{ position: 0, text: 'First.' }, { position: 1, text: 'Second.' }]);
    const t = res.timings[0];
    expect(t.audibleEndAt!).toBeGreaterThanOrEqual(t.silentAt! + 1200);
    expect(t.advancedAt!).toBeGreaterThanOrEqual(t.audibleEndAt! + 800);
    expect(summarizeTimings(res.timings)[0].endLagMs).toBeGreaterThanOrEqual(1200);
  });

  it('sends a long narration in sequential chunks, each after the last one finished', async () => {
    const f = fake();
    const long = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i + 1} of the narration.`).join(' ');
    const res = await run(f, [{ position: 0, text: long }]);
    expect(res.status).toBe('done');
    expect(f.spoken.length).toBeGreaterThan(1);
    expect(f.spoken.every((c) => new TextEncoder().encode(c).length <= 512)).toBe(true);
    expect(res.timings[0].chunks).toBe(f.spoken.length);
  });

  it('retries a failed /speak call and carries on', async () => {
    const f = fake({ failFirst: 1 });
    const res = await run(f, [{ position: 0, text: 'Hello.' }]);
    expect(res.status).toBe('done');
    expect(res.timings[0].retries).toBe(1);
    expect(f.spoken).toEqual(['Hello.']);
  });

  it('stops with an error, and does not advance, when the presenter never speaks', async () => {
    const f = fake({ neverStart: true });
    const res = await run(f, [{ position: 0, text: 'Hello.' }, { position: 1, text: 'Next.' }]);
    expect(res.status).toBe('error');
    expect(res.status === 'error' && res.message).toContain('slide 1');
    expect(f.shown).toEqual([0]);
  });

  it('moves on when the end signal never arrives, at a ceiling based on the text length', async () => {
    const f = fake({ talkMs: 600_000 });
    const res = await run(f, [{ position: 0, text: 'Short line here.' }, { position: 1, text: 'Next.' }]);
    expect(res.status).toBe('done');
    expect(res.timings[0].endedBy).toBe('timeout');
    expect(res.timings[0].advancedAt! - res.timings[0].shownAt).toBeLessThan(30_000);
  });

  it('falls back to the audio level when no state events arrive', async () => {
    const f = fake({ stateEvents: false });
    // The level goes up at 300 ms and down at 2300 ms; level-only mode waits 1.5 s of quiet after that.
    const res = await run(f, [{ position: 0, text: 'Hello there.' }]);
    expect(res.status).toBe('done');
    expect(res.timings[0].endedBy).toBe('level');
    expect(res.timings[0].speakingAt).toBeNull();
  });

  it('stops promptly when asked, mid-speech', async () => {
    const f = fake({ talkMs: 30_000 });
    const p = f.driver.play([{ position: 0, text: 'Long one.' }, { position: 1, text: 'Never.' }]);
    await vi.advanceTimersByTimeAsync(2000);
    f.driver.stop();
    await vi.advanceTimersByTimeAsync(10);
    const res = await p;
    expect(res.status).toBe('stopped');
    expect(f.shown).toEqual([0]);
  });

  it('ignores a stale end signal that arrives before this chunk started speaking', async () => {
    const f = fake({ startMs: 1500 });
    const p = f.driver.play([{ position: 0, text: 'Hello.' }]);
    await vi.advanceTimersByTimeAsync(100);
    f.driver.handleAgentState('silent'); // left over from an earlier chunk
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.timings[0].speakingAt).not.toBeNull();
    expect(res.timings[0].silentAt!).toBeGreaterThan(res.timings[0].speakingAt!);
  });
});

describe('summarizeTimings', () => {
  it('reports lead, speech length, end lag and drift', async () => {
    const f = fake({ startMs: 700, talkMs: 3000, lagMs: 400 });
    const res = await run(f, [{ position: 0, text: 'Hello.' }]);
    const [s] = summarizeTimings(res.timings);
    expect(s.leadMs).toBe(700);
    expect(s.speechMs).toBe(3000);
    expect(s.endLagMs).toBeGreaterThanOrEqual(400);
    expect(Math.abs(s.driftMs!)).toBeLessThan(300);
  });
});
