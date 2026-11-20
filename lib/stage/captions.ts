import { countWords } from '@/lib/narration/timing';

export interface Cue { startMs: number; endMs: number; text: string }

/** One slide's narration and when it was heard, in milliseconds since the recording began. */
export interface SpokenSlide { text: string; startMs: number; endMs: number }

function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Cues for the sentences of each slide, spread over the time that slide was spoken in proportion to
 * how many words each sentence has. Timing within a slide is an estimate; the slide's start and end are measured.
 */
export function toCues(slides: SpokenSlide[]): Cue[] {
  const cues: Cue[] = [];
  for (const s of slides) {
    const parts = sentences(s.text);
    if (parts.length === 0 || s.endMs <= s.startMs) continue;
    const words = parts.map((p) => Math.max(1, countWords(p)));
    const total = words.reduce((a, b) => a + b, 0);
    let at = s.startMs;
    parts.forEach((text, i) => {
      const end = i === parts.length - 1 ? s.endMs : at + ((s.endMs - s.startMs) * words[i]) / total;
      cues.push({ startMs: Math.round(at), endMs: Math.round(end), text });
      at = end;
    });
  }
  return cues;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
function stamp(ms: number, sep: '.' | ','): string {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor((t % 3_600_000) / 60_000))}:${pad(Math.floor((t % 60_000) / 1000))}${sep}${pad(t % 1000, 3)}`;
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text}`).join('\n\n')}\n`;
}

export function toSrt(cues: Cue[]): string {
  return `${cues.map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text}`).join('\n\n')}\n`;
}
