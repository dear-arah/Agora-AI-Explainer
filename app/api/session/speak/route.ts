import { NextResponse } from 'next/server';
import { guard } from '@/lib/access';
import { ConfigError, speak } from '@/lib/agora/server';
import { SPEAK_MAX_BYTES } from '@/lib/narration/speak';

const PRIORITIES = ['INTERRUPT', 'APPEND', 'IGNORE'] as const;

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; text?: string; priority?: string; interruptable?: boolean };
  const { agentId, text } = body;
  const priority = PRIORITIES.find((p) => p === body.priority) ?? 'APPEND';
  if (!agentId || typeof agentId !== 'string' || agentId.length > 100) {
    return NextResponse.json({ error: 'agentId is required.' }, { status: 400 });
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text is required.' }, { status: 400 });
  }
  if (new TextEncoder().encode(text).length > SPEAK_MAX_BYTES) {
    return NextResponse.json({ error: `Send at most ${SPEAK_MAX_BYTES} bytes per call.` }, { status: 400 });
  }
  try {
    await speak(agentId, text, priority, body.interruptable === true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    // Agora's error body names the reason (for example, an unsupported mode); it never contains our keys.
    const err = e as { statusCode?: number; body?: { detail?: string; reason?: string } };
    const why = [err.body?.reason, err.body?.detail].filter(Boolean).join(': ');
    return NextResponse.json({ error: `Agora could not speak the line${err.statusCode ? ` (HTTP ${err.statusCode})` : ''}${why ? ` — ${why}` : ''}.` }, { status: 502 });
  }
}
