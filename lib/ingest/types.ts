export interface SlideContent {
  /** 1-based position in the .pptx, hidden slides included. */
  index: number;
  title: string | null;
  /** Body text, one entry per paragraph, in reading order. Title and slide numbers excluded. */
  paragraphs: string[];
  /** Speaker notes, empty string when there are none. */
  notes: string;
  /** Alt text of pictures, useful context for the narration. */
  imageAlts: string[];
  hidden: boolean;
}

export interface ParsedDeck {
  slides: SlideContent[];
  /** Slide size in EMU (914400 per inch). */
  size: { width: number; height: number };
}

export interface SlideImage {
  /** 1-based, matches the visible slide order. */
  index: number;
  blob: Blob;
  width: number;
  height: number;
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}
