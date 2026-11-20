import { afterEach, describe, expect, it } from 'vitest';
import { agoraRegion } from '@/lib/agora/server';

const original = process.env.AGORA_REGION;
afterEach(() => {
  if (original === undefined) delete process.env.AGORA_REGION;
  else process.env.AGORA_REGION = original;
});

describe('agoraRegion', () => {
  it('is null when unset, so Agora chooses', () => {
    delete process.env.AGORA_REGION;
    expect(agoraRegion()).toBeNull();
  });

  it('accepts a region in any letter case', () => {
    process.env.AGORA_REGION = ' asia ';
    expect(agoraRegion()).toBe('ASIA');
  });

  it('names the setting when the value is not a region', () => {
    process.env.AGORA_REGION = 'mars';
    expect(() => agoraRegion()).toThrow(/AGORA_REGION must be one of/);
  });
});
