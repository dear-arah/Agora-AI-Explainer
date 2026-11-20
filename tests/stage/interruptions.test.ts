import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlideDriver, type DriverOptions, type PlayItem } from '@/lib/stage/driver';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Step = { at: number; do: 'state' | 'user' | 'level'; value?: string | number };

/**
 * A pretend agent. Each call to speak() follows the next script in the list (the last one repeats):
 * a list of timed events, in milliseconds after the call.
 */
function fake(scripts: Step[][], options: Partial<DriverOptions> = {}) {
  const spoken: { text: string; at: number }[] = [];
  const shown: number[] = [];
  const level = { value: 0 };
  let calls = 0;
  const driver: SlideDriver = new SlideDriver(
    {
      showSlide: (p) => shown.push(p),
      getLevel: () => level.value,
      speak: async (text) => {
        spoken.push({ text, at: Date.now() });
        const script = scripts[Math.min(calls++, scripts.length - 1)];
        for (const s of script) {
          setTimeout(() => {
            if (s.do === 'state') driver.handleAgentState(String(s.value));
            else if (s.do === 'user') driver.handleUserActivity();
            else level.value = Number(s.value);
          }, s.at);
        }
      },
    },
    { interruptions: true, ...options },
  );
  return { driver, spoken, shown };
}

const run = async (f: ReturnType<typeof fake>, items: PlayItem[]) => {
  const p = f.driver.play(items);
  await vi.runAllTimersAsync();
  return p;
};

const plain: Step[] = [
  { at: 300, do: 'state', value: 'speaking' }, { at: 300, do: 'level', value: 0.5 },
  { at: 3300, do: 'state', value: 'silent' }, { at: 3400, do: 'level', value: 0 },
];

// The audience breaks in at 1.5 s: the slide stops, the agent thinks, answers for 3 s, then is quiet.
const interrupted: Step[] = [
  { at: 300, do: 'state', value: 'speaking' }, { at: 300, do: 'level', value: 0.5 },
  { at: 1500, do: 'user' }, { at: 1600, do: 'state', value: 'silent' }, { at: 1600, do: 'level', value: 0 },
  { at: 2200, do: 'state', value: 'thinking' },
  { at: 3200, do: 'state', value: 'speaking' }, { at: 3200, do: 'level', value: 0.5 },
  { at: 6200, do: 'state', value: 'silent' }, { at: 6300, do: 'level', value: 0 },
];

const item = (over: Partial<PlayItem> = {}): PlayItem => ({ position: 0, text: 'Present slide one.', raw: true, resumeText: 'Finish slide one.', ...over });

describe('interruptions', () => {
  it('waits out the conversation, then resumes the slide before moving on', async () => {
    const f = fake([interrupted, plain]);
    const res = await run(f, [item(), item({ position: 1, text: 'Present slide two.', resumeText: undefined })]);
    expect(res.status).toBe('done');
    expect(f.spoken.map((s) => s.text)).toEqual(['Present slide one.', 'Finish slide one.', 'Present slide two.']);
    expect(f.shown).toEqual([0, 1]);
    expect(res.timings[0].interruptions).toBe(1);
    // the resume waits for the answer to end (about 6.2 s) and then for a quiet gap, so a follow-up fits
    expect(f.spoken[1].at - f.spoken[0].at).toBeGreaterThanOrEqual(6200 + 2500);
  });

  it('does not wait or resume when nobody breaks in', async () => {
    const f = fake([plain]);
    const res = await run(f, [item()]);
    expect(f.spoken).toHaveLength(1);
    expect(res.timings[0].interruptions).toBe(0);
  });

  it('holds at least the grace time after a slide so a late reply is noticed', async () => {
    const f = fake([plain], { pauseMs: 200, graceMs: 1500 });
    const res = await run(f, [item()]);
    expect(res.timings[0].advancedAt! - res.timings[0].audibleEndAt!).toBeGreaterThanOrEqual(1500);
  });

  it('resumes at most maxResumes times, then moves on', async () => {
    const f = fake([interrupted], { maxResumes: 2 });
    const res = await run(f, [item(), item({ position: 1, resumeText: undefined })]);
    // slide one: the cue plus two resumes, every one interrupted; then slide two once
    expect(f.spoken.filter((s) => s.text !== 'Present slide one.' && s.text !== 'Present slide two.')).toHaveLength(2);
    expect(f.shown).toEqual([0, 1]);
    expect(res.timings[0].interruptions).toBe(3);
  });

  it('moves on after the conversation when there is no resume text', async () => {
    const f = fake([interrupted, plain]);
    const res = await run(f, [item({ resumeText: undefined }), item({ position: 1, text: 'Next.', resumeText: undefined })]);
    expect(f.spoken.map((s) => s.text)).toEqual(['Present slide one.', 'Next.']);
    expect(res.timings[0].interruptions).toBe(1);
  });

  it('notices an answer that has already started when the slide ends', async () => {
    // no user event at all (for example a transcript that lagged): the agent is just speaking again
    const noUser = interrupted.filter((s) => s.do !== 'user');
    const f = fake([noUser, plain]);
    const res = await run(f, [item()]);
    expect(res.timings[0].interruptions).toBe(1);
    expect(f.spoken).toHaveLength(2);
  });

  it('keeps old behaviour when interruptions are off', async () => {
    const f = fake([interrupted], { interruptions: false });
    await run(f, [item()]);
    expect(f.spoken).toHaveLength(1);
  });

  it('can be stopped in the middle of a conversation', async () => {
    const f = fake([interrupted]);
    const p = f.driver.play([item()]);
    await vi.advanceTimersByTimeAsync(5000);
    f.driver.stop();
    await vi.advanceTimersByTimeAsync(50);
    expect((await p).status).toBe('stopped');
  });
});
