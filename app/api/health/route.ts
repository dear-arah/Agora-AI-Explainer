import { NextResponse } from 'next/server';
import { accessStatus } from '@/lib/access';

// Reports which settings are present, by name only. Never returns a value.
const NAMES = [
  'AGORA_APP_ID', 'NEXT_PUBLIC_AGORA_APP_ID', 'AGORA_APP_CERTIFICATE',
  'ANAM_API_KEY', 'ANAM_AVATAR_ID', 'HEYGEN_API_KEY', 'HEYGEN_AVATAR_ID', 'GOOGLE_API_KEY', 'TTS_API_KEY',
];

export function GET() {
  const set = Object.fromEntries(NAMES.map((n) => [n, Boolean(process.env[n])]));
  return NextResponse.json({
    set,
    avatarProvider: process.env.AVATAR_PROVIDER || null,
    llmProvider: process.env.LLM_PROVIDER || 'gemini',
    ttsVendor: process.env.TTS_VENDOR || 'managed',
    access: accessStatus(),
  });
}
