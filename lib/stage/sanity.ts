export interface SanityInput {
  /** Length of the recording, in seconds. */
  seconds: number;
  /** What the narration was estimated to take, in seconds. */
  estimatedSeconds: number;
  /** Loudest the agent's voice got while recording, 0 to 1. */
  peakLevel: number;
  /** Seconds the tab spent in the background while recording. */
  hiddenSeconds: number;
  bytes: number;
  ext: 'mp4' | 'webm';
}

/** Loudness below this means the recording almost certainly has no voice in it. */
export const SILENT_PEAK = 0.03;

/** Plain-language problems with a finished recording. An empty list means nothing looked wrong. */
export function videoWarnings(i: SanityInput): string[] {
  const out: string[] = [];
  if (i.bytes < 50_000 || i.seconds < 2) out.push('The file is very small, so the video may be empty. Record again.');
  if (i.peakLevel < SILENT_PEAK) {
    out.push('No voice was heard during the recording, so the video is probably silent. Check that the presenter spoke and that sound was not blocked in this tab.');
  }
  if (i.hiddenSeconds > 0.5) {
    out.push(`This tab was in the background for ${i.hiddenSeconds.toFixed(1)} s, so the picture may be choppy there. Record again with this tab in front.`);
  }
  const est = i.estimatedSeconds;
  if (est > 0 && (i.seconds < est * 0.6 || i.seconds > est * 1.8)) {
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    out.push(`The video is ${fmt(i.seconds)} long but the narration was estimated at ${fmt(est)}. Watch it through to make sure no slide was skipped.`);
  }
  if (i.ext === 'webm') out.push('This browser can only write WebM. Use a recent Chrome, Edge or Safari for an MP4.');
  return out;
}
