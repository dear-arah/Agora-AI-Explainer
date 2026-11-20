export interface SlideInput {
  index: number;
  title: string | null;
  paragraphs: string[];
  notes: string;
  imageAlts: string[];
  /** Optional low-resolution JPEG of the slide, base64 without the data: prefix. */
  imageBase64?: string;
}

export interface Narration {
  index: number;
  /** Text the presenter says. Empty means the slide is left out of the video. */
  narration: string;
}

export class NarrationError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = 'NarrationError';
  }
}
