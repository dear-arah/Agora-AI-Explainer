import { NarrationError, type Narration } from './types';

function extractJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = Math.min(...['{', '['].map((c) => text.indexOf(c)).filter((i) => i >= 0));
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (Number.isFinite(start) && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new NarrationError('The model did not return valid JSON. Try again.');
  }
}

/** One entry per requested slide, in order. Missing or malformed entries become empty narration. */
export function parseNarration(raw: string, indexes: number[]): Narration[] {
  const data = extractJson(raw) as { slides?: unknown } | unknown[];
  const list = Array.isArray(data) ? data : Array.isArray(data?.slides) ? data.slides : null;
  if (!list) throw new NarrationError('The model did not return valid JSON in the expected shape. Try again.');

  const byIndex = new Map<number, string>();
  for (const item of list as { index?: unknown; narration?: unknown }[]) {
    if (typeof item?.index === 'number' && typeof item.narration === 'string') {
      byIndex.set(item.index, item.narration.trim());
    }
  }
  return indexes.map((index) => ({ index, narration: byIndex.get(index) ?? '' }));
}
