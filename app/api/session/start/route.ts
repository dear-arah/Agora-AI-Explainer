import { NextResponse } from 'next/server';
import { resolvePresenter } from '@/lib/agora/presenter';
import { guard } from '@/lib/access';
import { cleanContext } from '@/lib/qa/context';
import { ConfigError, startPresenterSession } from '@/lib/agora/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { presenter?: string; avatarId?: string; context?: unknown };
  const choice = body.presenter ?? process.env.AVATAR_PROVIDER ?? 'orb';
  const avatarId = typeof body.avatarId === 'string' ? body.avatarId.slice(0, 100) : undefined;

  const plan = resolvePresenter(choice, process.env, avatarId);
  if (!plan.ok) {
    const msg = plan.missing?.length ? `Missing setting: ${plan.missing.join(', ')}.` : (plan.message ?? 'Unsupported presenter.');
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  try {
    return NextResponse.json(await startPresenterSession(plan, cleanContext(body.context)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    // Log the reason only; request payloads contain keys and must not reach the logs.
    const err = e as { statusCode?: number; body?: { detail?: string; reason?: string }; message?: string };
    console.error('session start failed', err.statusCode, err.body?.reason, err.body?.detail ?? err.message);
    return NextResponse.json(
      { error: `Agora could not start the agent${err.statusCode ? ` (HTTP ${err.statusCode})` : ''}${err.body?.detail ? `: ${err.body.detail}` : ''}` },
      { status: 502 },
    );
  }
}
