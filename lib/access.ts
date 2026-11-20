import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

type Env = Record<string, string | undefined>;

export const ACCESS_HEADER = 'x-access-code';

/**
 * The routes that spend money (agents, language-model calls) need an access code on a public deployment.
 * With APP_ACCESS_CODE set, every call must send it. With it unset, local development stays open, but a
 * production deployment refuses everything, so a forgotten setting can never leave the door open.
 */
export function accessStatus(env: Env = process.env): { required: boolean; misconfigured: boolean } {
  const code = (env.APP_ACCESS_CODE ?? '').trim();
  const production = env.NODE_ENV === 'production';
  return { required: Boolean(code) || production, misconfigured: production && !code };
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export type AccessResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

export function checkAccess(supplied: string | null | undefined, env: Env = process.env): AccessResult {
  const { required, misconfigured } = accessStatus(env);
  if (misconfigured) {
    return { ok: false, status: 503, error: 'This deployment has no APP_ACCESS_CODE, so it refuses requests. Set APP_ACCESS_CODE and redeploy.' };
  }
  if (!required) return { ok: true };
  const code = (env.APP_ACCESS_CODE ?? '').trim();
  // Compare hashes so the check takes the same time whatever was typed.
  const same = typeof supplied === 'string' && timingSafeEqual(digest(supplied.trim()), digest(code));
  return same ? { ok: true } : { ok: false, status: 401, error: 'Wrong or missing access code.' };
}

/** Returns a ready-made error response when the caller may not proceed, or null when they may. */
export function guard(req: Request, bodyCode?: unknown, env: Env = process.env): NextResponse | null {
  const supplied = req.headers.get(ACCESS_HEADER) ?? (typeof bodyCode === 'string' ? bodyCode : null);
  const result = checkAccess(supplied, env);
  return result.ok ? null : NextResponse.json({ error: result.error }, { status: result.status });
}
