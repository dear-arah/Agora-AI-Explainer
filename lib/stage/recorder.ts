export interface FormatChoice { mime: string; ext: 'mp4' | 'webm' }

/** Best first. MP4 is what the recipe promises; WebM is only a fallback for browsers that cannot write MP4. */
const CANDIDATES: FormatChoice[] = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export function pickFormat(isSupported: (mime: string) => boolean): FormatChoice | null {
  return CANDIDATES.find((c) => isSupported(c.mime)) ?? null;
}

export interface RecorderOptions {
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  /** How often the browser hands over finished data. Shorter slices lose less if the tab dies. */
  sliceMs: number;
}

export const RECORDER_DEFAULTS: RecorderOptions = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000, sliceMs: 1000 };

/** Records a stream to one Blob. Thin on purpose: the browser does the encoding. */
export class StageRecorder {
  private chunks: Blob[] = [];
  private recorder: MediaRecorder;
  private failure: Error | null = null;

  constructor(stream: MediaStream, readonly format: FormatChoice, private readonly options: Partial<RecorderOptions> = {}) {
    const o = { ...RECORDER_DEFAULTS, ...options };
    this.recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      videoBitsPerSecond: o.videoBitsPerSecond,
      audioBitsPerSecond: o.audioBitsPerSecond,
    });
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.onerror = (e) => { this.failure = new Error((e as unknown as { error?: Error }).error?.message ?? 'The recorder failed.'); };
  }

  start() {
    this.recorder.start(this.options.sliceMs ?? RECORDER_DEFAULTS.sliceMs);
  }

  /** Stop and resolve with everything recorded. */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (this.failure) reject(this.failure);
        else if (this.chunks.length === 0) reject(new Error('Nothing was recorded.'));
        else resolve(new Blob(this.chunks, { type: this.format.mime.split(';')[0] }));
      };
      if (this.recorder.state === 'inactive') return finish();
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }

  get state() {
    return this.recorder.state;
  }
}
