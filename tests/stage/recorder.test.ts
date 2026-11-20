import { afterEach, describe, expect, it, vi } from 'vitest';
import { StageRecorder, pickFormat } from '@/lib/stage/recorder';

describe('pickFormat', () => {
  it('prefers MP4 with H.264 and AAC', () => {
    expect(pickFormat(() => true)).toEqual({ mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' });
  });

  it('falls back through plain MP4 to WebM, and says which it chose', () => {
    expect(pickFormat((m) => m === 'video/mp4')?.ext).toBe('mp4');
    expect(pickFormat((m) => m.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9,opus', ext: 'webm' });
  });

  it('returns null when nothing is supported', () => {
    expect(pickFormat(() => false)).toBeNull();
  });
});

/** A MediaRecorder that hands out one chunk per slice and one more on stop. */
class FakeMediaRecorder {
  static last: FakeMediaRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public stream: unknown, public options: Record<string, unknown>) { FakeMediaRecorder.last = this; }
  start(slice?: number) { this.state = 'recording'; this.slice = slice; }
  slice?: number;
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
  stop() { this.state = 'inactive'; this.emit('last'); this.onstop?.(); }
}

afterEach(() => vi.unstubAllGlobals());

describe('StageRecorder', () => {
  const format = { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' as const };

  it('passes the format and bitrates to the browser and slices the data', () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const rec = new StageRecorder({} as MediaStream, format);
    rec.start();
    const fake = FakeMediaRecorder.last!;
    expect(fake.options).toMatchObject({ mimeType: format.mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    expect(fake.slice).toBe(1000);
  });

  it('resolves with every chunk as one Blob typed without the codec list', async () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const rec = new StageRecorder({} as MediaStream, format);
    rec.start();
    FakeMediaRecorder.last!.emit('one');
    FakeMediaRecorder.last!.emit('two');
    const blob = await rec.stop();
    expect(blob.type).toBe('video/mp4');
    expect(await blob.text()).toBe('onetwolast');
  });

  it('rejects when nothing was recorded', async () => {
    vi.stubGlobal('MediaRecorder', class extends FakeMediaRecorder { stop() { this.state = 'inactive'; this.onstop?.(); } });
    const rec = new StageRecorder({} as MediaStream, format);
    rec.start();
    await expect(rec.stop()).rejects.toThrow('Nothing was recorded');
  });

  it('rejects with the browser\'s reason when the recorder fails', async () => {
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const rec = new StageRecorder({} as MediaStream, format);
    rec.start();
    FakeMediaRecorder.last!.onerror?.({ error: new Error('encoder died') });
    await expect(rec.stop()).rejects.toThrow('encoder died');
  });
});
