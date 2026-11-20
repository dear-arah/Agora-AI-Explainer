import { CUE_MARKER } from '@/lib/stage/playlist';

/** The fields of the toolkit's transcript item that we use. */
export interface RawTranscriptItem {
  uid: string;
  turn_id: number;
  stream_id: number;
  _time: number;
  text: string;
  /** 0 in progress, 1 finished, 2 interrupted. */
  status: number;
}

export interface ChatLine {
  id: string;
  who: 'you' | 'presenter';
  text: string;
  /** False while the sentence is still being spoken or recognised. */
  final: boolean;
  at: number;
}

/**
 * The agent's text arrives in chunks that can run together ("now,which", "percent.Churn"). Put the missing
 * space after punctuation when a letter follows; digits are left alone so "2.1" stays whole.
 */
export function tidy(text: string): string {
  return text.replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 ').replace(/\s+/g, ' ').trim();
}

/**
 * Turn the toolkit's transcript list into chat lines: the agent's turns are the presenter, everyone else
 * (our microphone) is you. Empty turns are dropped and the order is by time.
 */
export function mapTranscript(items: RawTranscriptItem[], agentUid: string): ChatLine[] {
  return items
    .filter((i) => i.text && i.text.trim() && !i.text.trim().startsWith(CUE_MARKER)) // stage directions are not conversation
    .map((i) => ({
      id: `${i.uid}-${i.stream_id}-${i.turn_id}`,
      who: String(i.uid) === agentUid ? ('presenter' as const) : ('you' as const),
      text: tidy(i.text),
      final: i.status !== 0,
      at: i._time,
    }))
    .sort((a, b) => a.at - b.at);
}

/** Add the questions typed in this tab, which the agent's transcript may not echo back, in time order. */
export function withTypedQuestions(lines: ChatLine[], typed: ChatLine[]): ChatLine[] {
  const spoken = new Set(lines.filter((l) => l.who === 'you').map((l) => l.text.toLowerCase()));
  const extra = typed.filter((t) => !spoken.has(t.text.toLowerCase()));
  return [...lines, ...extra].sort((a, b) => a.at - b.at);
}
