import { splitForSpeak } from '@/lib/narration/speak';
import { SLIDE_PAUSE_SECONDS, estimateSeconds } from '@/lib/narration/timing';

/** One slide to present: where it sits in the deck and what the presenter says over it. */
export interface PlayItem {
  position: number;
  /** What to deliver. Split into 512-byte chunks unless `raw` is set. */
  text: string;
  /** Send `text` as one piece (a cue for the agent's own model) instead of splitting it as spoken text. */
  raw?: boolean;
  /** Delivered when the audience interrupted the slide and the conversation has settled. No resume text: move on. */
  resumeText?: string;
  /** How long the slide should take, for the stuck-slide ceiling. Defaults to an estimate from `text`. */
  expectedSeconds?: number;
}

/** Wall-clock marks for one slide, in milliseconds on the driver's clock. null means "never seen". */
export interface SlideTiming {
  position: number;
  shownAt: number;
  /** Agent state event: speaking. */
  speakingAt: number | null;
  /** Agent state event: silent (or idle/listening) after speaking. */
  silentAt: number | null;
  /** First time the received audio rose above the noise floor. */
  audibleStartAt: number | null;
  /** When the received audio went quiet for good. */
  audibleEndAt: number | null;
  /** When the driver moved on to the next slide (or finished the last one). */
  advancedAt: number | null;
  chunks: number;
  retries: number;
  /** How many times the audience broke in during this slide. */
  interruptions: number;
  /** What told the driver the narration was over. */
  endedBy: 'state' | 'level' | 'timeout' | null;
}

export interface DriverDeps {
  /** Ask the agent to say this text now. Must reject if the request fails. */
  speak(text: string): Promise<void>;
  /** Show the slide at this position of the deck. */
  showSlide(position: number): void;
  /** Current loudness of the agent's audio, 0 to 1. */
  getLevel(): number;
  now?: () => number;
}

export interface DriverOptions {
  /** Hold after the narration ends, before the next slide. */
  pauseMs: number;
  /** Give up on a /speak call if the agent has not started talking by then. */
  startTimeoutMs: number;
  /** The narration may run this many times longer than the estimate, plus the extra, before we move on. */
  ceilingFactor: number;
  ceilingExtraMs: number;
  /** Loudness above this counts as sound. */
  levelThreshold: number;
  /** Audio must stay quiet this long after the end signal before we call it over. */
  settleQuietMs: number;
  settleMaxMs: number;
  /** Without any state events, this much silence after sound ends the narration. */
  levelOnlyQuietMs: number;
  maxRetries: number;
  retryDelayMs: number;
  pollMs: number;
  /** Watch for the audience breaking in, wait for the conversation to settle, then resume the slide. */
  interruptions: boolean;
  /** With interruptions on, wait at least this long after a slide before moving on, so a late reply is noticed. */
  graceMs: number;
  /** The conversation counts as over after this long with no speech from anyone. */
  conversationQuietMs: number;
  conversationMaxMs: number;
  maxResumes: number;
}

export const DEFAULT_OPTIONS: DriverOptions = {
  pauseMs: SLIDE_PAUSE_SECONDS * 1000,
  startTimeoutMs: 10_000,
  ceilingFactor: 1.6,
  ceilingExtraMs: 6_000,
  levelThreshold: 0.02,
  settleQuietMs: 300,
  settleMaxMs: 2_000,
  levelOnlyQuietMs: 1_500,
  maxRetries: 2,
  retryDelayMs: 1_500,
  pollMs: 100,
  interruptions: false,
  graceMs: 1_000,
  conversationQuietMs: 2_500,
  conversationMaxMs: 60_000,
  maxResumes: 2,
};

export type PlayResult =
  | { status: 'done' | 'stopped'; timings: SlideTiming[] }
  | { status: 'error'; message: string; timings: SlideTiming[] };

type Waiter = (state: string) => void;
type ChunkEnd = 'ended' | 'no-start' | 'stopped';

/**
 * Presents slides one after another. For each slide it shows the picture, sends the narration to the
 * agent, and moves on only once the agent has really stopped talking. It never guesses from a timer
 * alone: the agent's state events say when speech ends, the audio level confirms it is audible-quiet,
 * and a time ceiling stops one stuck slide from hanging the whole video.
 */
export class SlideDriver {
  private readonly o: DriverOptions;
  private readonly now: () => number;
  private waiters = new Set<Waiter>();
  private aborted = false;
  private agentState: string | null = null;
  private lastUserAt = 0;
  private lastAgentAt = 0;

  constructor(private readonly deps: DriverDeps, options: Partial<DriverOptions> = {}) {
    this.o = { ...DEFAULT_OPTIONS, ...options };
    this.now = deps.now ?? (() => Date.now());
  }

  /** Feed every agent state event here (speaking, silent, idle, listening, thinking). */
  handleAgentState(state: string) {
    if (state !== '__stop') {
      this.agentState = state;
      this.lastAgentAt = this.now();
    }
    for (const w of [...this.waiters]) w(state);
  }

  /** Call whenever the audience speaks or types. */
  handleUserActivity() {
    this.lastUserAt = this.now();
  }

  /** Has the audience broken in since `since`, or is the agent busy answering? */
  private inConversation(since: number) {
    return this.lastUserAt >= since || this.agentState === 'thinking' || this.agentState === 'speaking';
  }

  /** Wait until nobody has spoken for a while, including a short gap after the agent's answer so a follow-up fits. */
  private async waitConversationEnd() {
    const start = this.now();
    while (!this.aborted && this.now() - start < this.o.conversationMaxMs) {
      if (this.deps.getLevel() > this.o.levelThreshold) this.lastAgentAt = this.now();
      const quiet = this.o.conversationQuietMs;
      const busy =
        this.agentState === 'thinking' || this.agentState === 'speaking' ||
        this.now() - this.lastUserAt < quiet ||
        this.now() - this.lastAgentAt < quiet;
      if (!busy) return;
      await this.sleep(this.o.pollMs);
    }
  }

  stop() {
    this.aborted = true;
    this.handleAgentState('__stop');
  }

  async play(items: PlayItem[]): Promise<PlayResult> {
    this.aborted = false;
    const timings: SlideTiming[] = [];
    for (const item of items) {
      if (this.aborted) return { status: 'stopped', timings };
      const t: SlideTiming = {
        position: item.position, shownAt: this.now(), speakingAt: null, silentAt: null,
        audibleStartAt: null, audibleEndAt: null, advancedAt: null, chunks: 0, retries: 0, interruptions: 0, endedBy: null,
      };
      timings.push(t);
      this.deps.showSlide(item.position);

      let text = item.text;
      let resumes = 0;
      for (;;) {
        const startedAt = this.now();
        for (const chunk of item.raw ? [text] : splitForSpeak(text)) {
          t.chunks += 1;
          const res = await this.speakWithRetry(chunk, t, item.expectedSeconds);
          if (res === 'stopped') return { status: 'stopped', timings };
          if (res === 'no-start') {
            return { status: 'error', message: `The presenter did not start speaking on slide ${item.position + 1}.`, timings };
          }
        }

        // The pause counts from when the audio went quiet, not from when we noticed. When the audience can break in,
        // it is at least `graceMs`, so a reply that is only just starting is noticed before the slide changes.
        const hold = this.o.interruptions ? Math.max(this.o.pauseMs, this.o.graceMs) : this.o.pauseMs;
        await this.sleep(Math.max(0, hold - (this.now() - (t.audibleEndAt ?? this.now()))));
        if (this.aborted) return { status: 'stopped', timings };

        if (this.o.interruptions && this.inConversation(startedAt)) {
          t.interruptions += 1;
          await this.waitConversationEnd();
          if (this.aborted) return { status: 'stopped', timings };
          if (item.resumeText && resumes < this.o.maxResumes) {
            resumes += 1;
            text = item.resumeText;
            continue;
          }
        }
        break;
      }
      t.advancedAt = this.now();
    }
    return { status: 'done', timings };
  }

  private async speakWithRetry(text: string, t: SlideTiming, expectedSeconds?: number): Promise<ChunkEnd> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.runChunk(text, t, expectedSeconds);
      if (res !== 'no-start' || attempt >= this.o.maxRetries) {
        if (res === 'ended' && t.endedBy !== 'level') await this.settle(t);
        return res;
      }
      t.retries += 1;
      await this.sleep(this.o.retryDelayMs);
      if (this.aborted) return 'stopped';
    }
  }

  /** Say one chunk and resolve when it is over, or never started. */
  private runChunk(text: string, t: SlideTiming, expectedSeconds?: number): Promise<ChunkEnd> {
    return new Promise((resolve) => {
      const o = this.o;
      let speaking = false;
      let started = false;
      let audible = false;
      let quietSince: number | null = null;
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      let ceiling: ReturnType<typeof setTimeout> | undefined;
      let poll: ReturnType<typeof setInterval> | undefined;

      const finish = (result: ChunkEnd, cause: SlideTiming['endedBy'] = null) => {
        clearTimeout(startTimer);
        clearTimeout(ceiling);
        clearInterval(poll);
        this.waiters.delete(on);
        if (result === 'ended') t.endedBy = cause;
        resolve(result);
      };

      const markStarted = () => {
        if (started) return;
        started = true;
        clearTimeout(startTimer);
        const limit = (expectedSeconds ?? estimateSeconds(text)) * 1000 * o.ceilingFactor + o.ceilingExtraMs;
        ceiling = setTimeout(() => finish('ended', 'timeout'), limit);
      };

      const on: Waiter = (state) => {
        if (state === '__stop') return finish('stopped');
        if (state === 'speaking') {
          if (!speaking) t.speakingAt ??= this.now();
          speaking = true;
          markStarted();
        } else if (speaking && (state === 'silent' || state === 'idle' || state === 'listening')) {
          t.silentAt = this.now();
          finish('ended', 'state');
        }
      };

      const check = () => {
        const n = this.now();
        if (this.deps.getLevel() > o.levelThreshold) {
          if (!audible) {
            audible = true;
            t.audibleStartAt ??= n;
            markStarted();
          }
          quietSince = null;
        } else if (audible && quietSince === null) {
          quietSince = n;
        }
        // Fallback for when the agent's state events do not arrive: long silence after sound.
        if (!speaking && audible && quietSince !== null && n - quietSince >= o.levelOnlyQuietMs) {
          t.audibleEndAt = quietSince;
          finish('ended', 'level');
        }
      };

      this.waiters.add(on);
      startTimer = setTimeout(() => finish('no-start'), o.startTimeoutMs);
      poll = setInterval(check, o.pollMs);
      this.deps.speak(text).catch(() => finish('no-start'));
    });
  }

  /** After the end signal, wait until the audio really is quiet, so the slide never changes mid-word. */
  private async settle(t: SlideTiming) {
    const o = this.o;
    const start = this.now();
    let quietSince: number | null = null;
    while (!this.aborted) {
      const n = this.now();
      if (this.deps.getLevel() > o.levelThreshold) {
        t.audibleStartAt ??= n;
        quietSince = null;
      } else {
        quietSince ??= n;
      }
      if (quietSince !== null && n - quietSince >= o.settleQuietMs) break;
      if (n - start >= o.settleMaxMs) break;
      await this.sleep(o.pollMs);
    }
    t.audibleEndAt = quietSince ?? this.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      // Ends on the timer or on stop(), whichever comes first, and always removes its stop-listener.
      const done = () => {
        clearTimeout(id);
        this.waiters.delete(on);
        resolve();
      };
      const on: Waiter = (s) => { if (s === '__stop') done(); };
      const id = setTimeout(done, ms);
      this.waiters.add(on);
    });
  }
}

export interface SlideSummary {
  position: number;
  /** Slide shown until the agent began speaking. */
  leadMs: number | null;
  /** Agent state "speaking" until "silent". */
  speechMs: number | null;
  /** How long the audio kept playing after the end signal. */
  endLagMs: number | null;
  /** Audio went quiet until the slide changed, minus the intended pause. Near 0 when the driver is on time. */
  driftMs: number | null;
}

const diff = (a: number | null, b: number | null) => (a !== null && b !== null ? Math.round(a - b) : null);

export function summarizeTimings(timings: SlideTiming[], pauseMs = DEFAULT_OPTIONS.pauseMs): SlideSummary[] {
  return timings.map((t) => {
    const hold = diff(t.advancedAt, t.audibleEndAt);
    return {
      position: t.position,
      leadMs: diff(t.speakingAt, t.shownAt),
      speechMs: diff(t.silentAt, t.speakingAt),
      endLagMs: diff(t.audibleEndAt, t.silentAt),
      driftMs: hold === null ? null : hold - pauseMs,
    };
  });
}
