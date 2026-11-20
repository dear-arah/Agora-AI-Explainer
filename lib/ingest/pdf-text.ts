export interface PdfTextItem {
  str: string;
  x: number;
  /** PDF y grows upward, so a bigger y is higher on the page. */
  y: number;
}

/** "O c t o b e r" -> "October": three or more single-character tokens means letter-spacing. */
function closeLetterSpacing(str: string): string {
  const tokens = str.trim().split(/\s+/);
  return tokens.length >= 3 && tokens.every((t) => t.length === 1) ? tokens.join('') : str;
}

/**
 * Join pdf.js text fragments into reading-order lines: top to bottom, left to right.
 * Exported decks often draw the same text several times at one spot (shadows, stacked layers),
 * so exact repeats at the same position are dropped.
 */
export function linesFromItems(items: PdfTextItem[], tolerance = 4): string[] {
  const rows: { y: number; parts: PdfTextItem[] }[] = [];
  const unique: PdfTextItem[] = [];
  for (const raw of items) {
    if (!raw.str.trim()) continue;
    const it = { ...raw, str: closeLetterSpacing(raw.str) };
    if (!unique.some((u) => u.str === it.str && Math.abs(u.x - it.x) <= 1 && Math.abs(u.y - it.y) <= 1)) {
      unique.push(it);
    }
  }
  for (const it of unique.sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tolerance);
    if (row) row.parts.push(it);
    else rows.push({ y: it.y, parts: [it] });
  }
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(' ').replace(/\s+/g, ' '))
    .filter(Boolean);
}
