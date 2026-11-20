import { describe, expect, it } from 'vitest';
import { accessStatus, checkAccess, guard } from '@/lib/access';

const prod = { NODE_ENV: 'production' };
const dev = { NODE_ENV: 'development' };

describe('accessStatus', () => {
  it('is open in development with no code', () => {
    expect(accessStatus(dev)).toEqual({ required: false, misconfigured: false });
  });
  it('is required whenever a code is set', () => {
    expect(accessStatus({ ...dev, APP_ACCESS_CODE: 'x' })).toEqual({ required: true, misconfigured: false });
  });
  it('fails closed in production with no code, and ignores a code that is only spaces', () => {
    expect(accessStatus(prod)).toEqual({ required: true, misconfigured: true });
    expect(accessStatus({ ...prod, APP_ACCESS_CODE: '   ' })).toEqual({ required: true, misconfigured: true });
  });
});

describe('checkAccess', () => {
  it('lets anyone in during local development without a code', () => {
    expect(checkAccess(null, dev)).toEqual({ ok: true });
  });
  it('accepts the right code, even with stray spaces', () => {
    expect(checkAccess(' letmein ', { ...prod, APP_ACCESS_CODE: 'letmein' })).toEqual({ ok: true });
  });
  it('rejects a wrong, missing or different-length code with 401', () => {
    const env = { ...prod, APP_ACCESS_CODE: 'letmein' };
    for (const bad of ['nope', 'letmeinn', '', null, undefined]) {
      expect(checkAccess(bad, env)).toMatchObject({ ok: false, status: 401 });
    }
  });
  it('refuses everything with 503 in production when no code is set, whatever is sent', () => {
    expect(checkAccess('anything', prod)).toMatchObject({ ok: false, status: 503 });
  });
  it('never puts the real code in an error message', () => {
    const r = checkAccess('nope', { ...prod, APP_ACCESS_CODE: 'secret-code' });
    expect(JSON.stringify(r)).not.toContain('secret-code');
  });
});

describe('guard', () => {
  const env = { ...prod, APP_ACCESS_CODE: 'letmein' };
  const req = (headers: Record<string, string> = {}) => new Request('http://x/api', { method: 'POST', headers });

  it('returns null for a request with the right header', () => {
    expect(guard(req({ 'x-access-code': 'letmein' }), undefined, env)).toBeNull();
  });
  it('takes the code from the body when there is no header (the page-closing beacon)', () => {
    expect(guard(req(), 'letmein', env)).toBeNull();
  });
  it('answers 401 without a code', async () => {
    const res = guard(req(), undefined, env)!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Wrong or missing access code.' });
  });
});
