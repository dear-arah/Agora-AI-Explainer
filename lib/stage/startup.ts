export interface StartDeps<T extends { agentId: string }> {
  /** Start one agent. Errors here (bad settings, rejected request) are final and are not retried. */
  start(): Promise<T>;
  /** The agent's status as Agora reports it: RUNNING, FAILED, STOPPING ... */
  status(agentId: string): Promise<string>;
  stop(agentId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  onAttempt?(attempt: number, max: number): void;
}

export interface StartOptions {
  maxAttempts: number;
  /** How long to watch a new agent before trusting it. */
  watchMs: number;
  pollMs: number;
}

export const START_OPTIONS: StartOptions = { maxAttempts: 6, watchMs: 5000, pollMs: 1000 };

const BAD = new Set(['FAILED', 'STOPPED', 'STOPPING']);

export class StartFailedError extends Error {
  constructor(public attempts: number, public lastReason: string) {
    super(
      `The presenter agent could not connect after ${attempts} tries (${lastReason}). ` +
        'Agora sometimes drops an agent right after it joins; wait a minute and try again.',
    );
    this.name = 'StartFailedError';
  }
}

/**
 * Agora's agent sometimes reaches RUNNING and then fails about two seconds later with "RTC connection
 * error". An agent that survives the watch period stays up, so watch each new one and replace any that
 * fails, instead of handing the user a presenter that will never speak.
 */
export async function startUntilHealthy<T extends { agentId: string }>(
  deps: StartDeps<T>,
  options: Partial<StartOptions> = {},
): Promise<{ info: T; attempts: number }> {
  const o = { ...START_OPTIONS, ...options };
  let reason = 'no status';
  for (let attempt = 1; attempt <= o.maxAttempts; attempt++) {
    deps.onAttempt?.(attempt, o.maxAttempts);
    const info = await deps.start();

    let last = '';
    let bad = false;
    for (let waited = 0; waited < o.watchMs; waited += o.pollMs) {
      await deps.sleep(o.pollMs);
      last = await deps.status(info.agentId).catch(() => '');
      if (BAD.has(last)) { bad = true; break; }
    }
    if (!bad && last === 'RUNNING') return { info, attempts: attempt };

    reason = bad ? `agent ${last.toLowerCase()}` : last ? `agent still ${last.toLowerCase()}` : 'status unavailable';
    await deps.stop(info.agentId).catch(() => {});
  }
  throw new StartFailedError(o.maxAttempts, reason);
}
