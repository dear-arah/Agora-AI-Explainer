import { NextResponse } from 'next/server';
import { guard } from '@/lib/access';
import { ConfigError, agentStatus } from '@/lib/agora/server';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const agentId = new URL(req.url).searchParams.get('agentId');
  if (!agentId || agentId.length > 100) return NextResponse.json({ error: 'agentId is required.' }, { status: 400 });
  try {
    const s = await agentStatus(agentId);
    return NextResponse.json({ status: s.status ?? null, startTs: s.start_ts ?? null, message: s.message ?? null });
  } catch (e) {
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    const err = e as { statusCode?: number };
    return NextResponse.json({ error: `Agora status call failed${err.statusCode ? ` (HTTP ${err.statusCode})` : ''}.` }, { status: 502 });
  }
}
