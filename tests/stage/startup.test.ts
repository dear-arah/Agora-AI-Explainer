import { describe, expect, it, vi } from 'vitest';
import { StartFailedError, startUntilHealthy } from '@/lib/stage/startup';

/** Each started agent gets the next scripted list of statuses, one per poll; the last one repeats. */
function setup(scripts: string[][]) {
  let n = 0;
  const polls = new Map<string, number>();
  const stopped: string[] = [];
  const attempts: number[] = [];
  const deps = {
    start: vi.fn(async () => ({ agentId: `agent-${++n}` })),
    status: vi.fn(async (id: string) => {
      const s = scripts[Number(id.split('-')[1]) - 1] ?? ['FAILED'];
      const i = polls.get(id) ?? 0;
      polls.set(id, i + 1);
      return s[Math.min(i, s.length - 1)];
    }),
    stop: vi.fn(async (id: string) => { stopped.push(id); }),
    sleep: vi.fn(async () => {}),
    onAttempt: (a: number) => attempts.push(a),
  };
  return { deps, stopped, attempts };
}

describe('startUntilHealthy', () => {
  it('keeps the first agent when it stays RUNNING for the whole watch period', async () => {
    const { deps, stopped } = setup([['RUNNING']]);
    const r = await startUntilHealthy(deps, { watchMs: 5000, pollMs: 1000 });
    expect(r.attempts).toBe(1);
    expect(r.info.agentId).toBe('agent-1');
    expect(deps.status).toHaveBeenCalledTimes(5);
    expect(stopped).toEqual([]);
  });

  it('replaces an agent that reaches RUNNING and then FAILS, and stops the bad one', async () => {
    const { deps, stopped, attempts } = setup([['RUNNING', 'RUNNING', 'FAILED'], ['RUNNING']]);
    const r = await startUntilHealthy(deps);
    expect(r.attempts).toBe(2);
    expect(r.info.agentId).toBe('agent-2');
    expect(stopped).toEqual(['agent-1']);
    expect(attempts).toEqual([1, 2]);
  });

  it('gives up after the maximum number of attempts with a readable error', async () => {
    const { deps, stopped } = setup([]);
    const err = await startUntilHealthy(deps, { maxAttempts: 3 }).catch((e) => e);
    expect(err).toBeInstanceOf(StartFailedError);
    expect(err.message).toContain('3 tries');
    expect(err.message).toContain('wait a minute');
    expect(stopped).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  it('does not retry when starting itself is rejected', async () => {
    const { deps } = setup([['RUNNING']]);
    deps.start.mockRejectedValueOnce(new Error('Missing Agora setting'));
    await expect(startUntilHealthy(deps)).rejects.toThrow('Missing Agora setting');
    expect(deps.start).toHaveBeenCalledTimes(1);
  });

  it('treats an agent that never reports RUNNING as bad', async () => {
    const { deps } = setup([['STARTING'], ['RUNNING']]);
    const r = await startUntilHealthy(deps);
    expect(r.info.agentId).toBe('agent-2');
  });

  it('survives a status call that errors once', async () => {
    const { deps } = setup([['RUNNING']]);
    deps.status.mockRejectedValueOnce(new Error('network'));
    const r = await startUntilHealthy(deps);
    expect(r.attempts).toBe(1);
  });
});
