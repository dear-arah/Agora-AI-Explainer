import { NextResponse } from 'next/server';
import { guard } from '@/lib/access';
import { ConfigError, stopAgent } from '@/lib/agora/server';

export async function POST(req: Request) {
  const { agentId, accessCode } = (await req.json().catch(() => ({}))) as { agentId?: string; accessCode?: string };
  // The page-is-closing beacon cannot set headers, so it sends the code in the body.
  const denied = guard(req, accessCode);
  if (denied) return denied;
  if (!agentId || typeof agentId !== 'string' || agentId.length > 100) {
    return NextResponse.json({ error: 'agentId is required.' }, { status: 400 });
  }
  try {
    await stopAgent(agentId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: 'Could not stop the agent. It will leave on its own when the room is empty.' }, { status: 502 });
  }
}
