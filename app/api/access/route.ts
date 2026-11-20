import { NextResponse } from 'next/server';
import { guard } from '@/lib/access';

/** Lets the page check an access code before showing the app. Spends nothing. */
export function POST(req: Request) {
  return guard(req) ?? NextResponse.json({ ok: true });
}
