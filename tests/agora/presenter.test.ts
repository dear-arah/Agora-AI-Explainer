import { describe, expect, it } from 'vitest';
import { resolvePresenter } from '@/lib/agora/presenter';

describe('resolvePresenter', () => {
  it('needs no keys for the orb', () => {
    expect(resolvePresenter('orb', {})).toEqual({ ok: true, kind: 'orb' });
  });

  it('names the missing variables for anam', () => {
    expect(resolvePresenter('anam', {})).toEqual({ ok: false, missing: ['ANAM_API_KEY', 'ANAM_AVATAR_ID'] });
    expect(resolvePresenter('anam', { ANAM_API_KEY: 'k' })).toEqual({ ok: false, missing: ['ANAM_AVATAR_ID'] });
  });

  it('accepts an avatar id chosen in the app instead of ANAM_AVATAR_ID', () => {
    expect(resolvePresenter('anam', { ANAM_API_KEY: 'k' }, 'abc')).toMatchObject({ ok: true, kind: 'anam', avatarId: 'abc' });
  });

  it('uses the environment avatar id when none is chosen', () => {
    expect(resolvePresenter('anam', { ANAM_API_KEY: 'k', ANAM_AVATAR_ID: 'envid' })).toMatchObject({ avatarId: 'envid' });
  });

  it('rejects providers it does not run yet', () => {
    expect(resolvePresenter('akool', {})).toMatchObject({ ok: false });
  });

  it('names the missing variable for heygen and treats the avatar id as optional', () => {
    expect(resolvePresenter('heygen', {})).toEqual({ ok: false, missing: ['HEYGEN_API_KEY'] });
    expect(resolvePresenter('heygen', { HEYGEN_API_KEY: 'k' })).toEqual({ ok: true, kind: 'heygen', apiKey: 'k', avatarId: undefined });
    expect(resolvePresenter('heygen', { HEYGEN_API_KEY: 'k', HEYGEN_AVATAR_ID: 'envid' })).toMatchObject({ avatarId: 'envid' });
    expect(resolvePresenter('heygen', { HEYGEN_API_KEY: 'k', HEYGEN_AVATAR_ID: 'envid' }, 'chosen')).toMatchObject({ avatarId: 'chosen' });
  });

  it('never returns the key in an error', () => {
    expect(JSON.stringify(resolvePresenter('anam', { ANAM_API_KEY: 'secret-value' }))).not.toContain('secret-value');
  });
});
