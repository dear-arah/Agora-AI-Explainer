/** Agora's /speak accepts at most 512 bytes of text per call. */
export const SPEAK_MAX_BYTES = 512;

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Break text that has no room to stay whole: at spaces, and inside a word only as a last resort. */
function splitLong(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  const push = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (byteLength(next) <= max) {
      cur = next;
      continue;
    }
    push();
    if (byteLength(word) <= max) {
      cur = word;
      continue;
    }
    let piece = '';
    for (const ch of Array.from(word)) {
      if (byteLength(piece + ch) > max) {
        out.push(piece);
        piece = '';
      }
      piece += ch;
    }
    cur = piece;
  }
  push();
  return out;
}

/** Split narration into chunks that each fit one /speak call, preferring sentence boundaries. */
export function splitForSpeak(text: string, maxBytes = SPEAK_MAX_BYTES): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (byteLength(clean) <= maxBytes) return [clean];

  const sentences = (clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean]).map((s) => s.trim()).filter(Boolean);
  const pieces = sentences.flatMap((s) => (byteLength(s) <= maxBytes ? [s] : splitLong(s, maxBytes)));

  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    const next = cur ? `${cur} ${p}` : p;
    if (byteLength(next) <= maxBytes) {
      cur = next;
    } else {
      chunks.push(cur);
      cur = p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
