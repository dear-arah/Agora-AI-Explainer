import 'server-only';
import { randomInt } from 'node:crypto';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import {
  Agent,
  AgoraClient,
  AnamAvatar,
  Area,
  DeepgramSTT,
  ElevenLabsTTS,
  ExpiresIn,
  LiveAvatarAvatar,
  MiniMaxTTS,
  OpenAI,
  generateConvoAIToken,
} from 'agora-agents';
import { buildInstructions, type QaSlide } from '../qa/context';
import type { PresenterPlan } from './presenter';

// Server side only. The App Certificate and every vendor key stay here; the browser only ever
// receives the App ID, a channel name, and short-lived tokens for its own uid.

/** Fixed uids for the two non-human participants, chosen to stay clear of the browser's random uid. */
export const AGENT_UID = '9100';
export const AVATAR_UID = '9101';

const TOKEN_SECONDS = 3600;

export class ConfigError extends Error {
  constructor(message: string, public missing: string[] = []) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function agoraCredentials() {
  const appId = process.env.AGORA_APP_ID || process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const missing = [!appId && 'AGORA_APP_ID', !appCertificate && 'AGORA_APP_CERTIFICATE'].filter(Boolean) as string[];
  if (missing.length || !appId || !appCertificate) {
    throw new ConfigError(`Missing Agora setting: ${missing.join(', ')}. Add it to your environment.`, missing);
  }
  return { appId, appCertificate };
}

const REGIONS = ['GLOBAL', 'NORTH_AMERICA', 'EUROPE', 'ASIA', 'INDIA', 'JAPAN'] as const;
type Region = (typeof REGIONS)[number];

/** AGORA_REGION pins where the agent runs (Agora's `geofence`). Unset means Agora chooses. */
export function agoraRegion(): Region | null {
  const value = (process.env.AGORA_REGION || '').trim().toUpperCase();
  if (!value) return null;
  if (!(REGIONS as readonly string[]).includes(value)) {
    throw new ConfigError(`AGORA_REGION must be one of ${REGIONS.join(', ')}.`, ['AGORA_REGION']);
  }
  return value as Region;
}

/** The REST endpoint area that sits next to the chosen region. */
function restArea(region: Region | null) {
  if (region === 'EUROPE') return Area.EU;
  if (region === 'ASIA' || region === 'INDIA' || region === 'JAPAN') return Area.AP;
  return Area.US;
}

export function agoraClient() {
  const { appId, appCertificate } = agoraCredentials();
  return { appId, client: new AgoraClient({ area: restArea(agoraRegion()), appId, appCertificate }) };
}

/** Every avatar bridge Agora lists for us (Anam, LiveAvatar) is built for a 24 kHz voice. */
const AVATAR_SAMPLE_RATE = 24000;

/**
 * Agora-managed MiniMax voice with its output sample rate stated. The SDK's MiniMaxTTS sends no
 * `audio_setting`, but Agora's MiniMax page lists `audio_setting.sample_rate` as required and the
 * avatar bridges only accept 24 kHz, so avatar sessions must say so.
 */
class MiniMaxAtRate extends MiniMaxTTS {
  constructor(options: ConstructorParameters<typeof MiniMaxTTS>[0], private readonly rate: number) {
    super(options);
  }
  override toConfig() {
    const config = super.toConfig();
    return { ...config, params: { ...config.params, audio_setting: { sample_rate: this.rate } } } as ReturnType<MiniMaxTTS['toConfig']>;
  }
}

function buildTts(sampleRate?: number) {
  const vendor = (process.env.TTS_VENDOR || 'managed').toLowerCase();
  if (vendor === 'elevenlabs') {
    const key = process.env.TTS_API_KEY;
    if (!key) throw new ConfigError('TTS_VENDOR=elevenlabs needs TTS_API_KEY.', ['TTS_API_KEY']);
    return new ElevenLabsTTS({
      key,
      modelId: 'eleven_flash_v2_5',
      voiceId: process.env.TTS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
      baseUrl: 'wss://api.elevenlabs.io/v1',
      sampleRate: 24000,
    });
  }
  if (vendor !== 'managed') throw new ConfigError(`Unknown TTS_VENDOR "${vendor}". Use managed or elevenlabs.`);
  // Agora-managed voice: no vendor key needed.
  const options = { model: 'speech_2_6_turbo' as const, voiceId: process.env.TTS_VOICE_ID || 'English_captivating_female1' };
  return sampleRate ? new MiniMaxAtRate(options, sampleRate) : new MiniMaxTTS(options);
}

export interface StartedSession {
  appId: string;
  channel: string;
  /** The browser's own uid, as a string. */
  uid: string;
  /** RTC + RTM token for that uid. */
  token: string;
  agentId: string;
  agentUid: string;
  /** Uid of the avatar's video publisher, or null for the orb. */
  avatarUid: string | null;
}

export async function startPresenterSession(plan: Extract<PresenterPlan, { ok: true }>, deck: QaSlide[] | null = null): Promise<StartedSession> {
  const { appId, appCertificate } = agoraCredentials();
  const { client } = agoraClient();

  const channel = `slide-narrator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uid = String(randomInt(100_000, 9_000_000));
  const expire = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithRtm(appId, appCertificate, channel, uid, RtcRole.PUBLISHER, expire, expire);

  let agent = new Agent({
    client,
    instructions: buildInstructions(deck),
    failureMessage: 'One moment.',
    ...(agoraRegion() && { geofence: { area: agoraRegion() as never } }),
    advancedFeatures: { enable_rtm: true },
    // RTM carries the agent state events the stage page uses to know when speech has finished.
    parameters: { data_channel: 'rtm', enable_error_message: true, enable_metrics: true },
  })
    .withStt(new DeepgramSTT({ model: 'nova-3', language: 'en' }))
    .withLlm(new OpenAI({ model: 'gpt-4o-mini', params: { max_tokens: 220, temperature: 0.6 } }))
    .withTts(buildTts(plan.kind === 'orb' ? undefined : AVATAR_SAMPLE_RATE));

  let avatarUid: string | null = null;
  if (plan.kind === 'heygen') {
    avatarUid = AVATAR_UID;
    const quality = process.env.HEYGEN_QUALITY;
    agent = agent.withAvatar(
      // The SDK fills in this avatar's RTC token itself, so none is passed here.
      new LiveAvatarAvatar({
        apiKey: plan.apiKey,
        avatarId: plan.avatarId,
        agoraUid: AVATAR_UID,
        quality: quality === 'low' || quality === 'high' ? quality : 'medium',
      }),
    );
  } else if (plan.kind === 'anam') {
    avatarUid = AVATAR_UID;
    agent = agent.withAvatar(
      new AnamAvatar({
        apiKey: plan.apiKey,
        avatarId: plan.avatarId,
        // Optional. Agora's Anam page lists the Cara 3 and Cara 4 models; leave unset to let Anam choose.
        avatarModel: process.env.ANAM_AVATAR_MODEL || undefined,
        // Anam is not token-managed by the SDK, so the avatar's uid and token are passed explicitly.
        additionalParams: {
          agora_uid: AVATAR_UID,
          agora_token: generateConvoAIToken({ appId, appCertificate, channelName: channel, uid: Number(AVATAR_UID), tokenExpire: TOKEN_SECONDS }),
          sample_rate: 24000,
          video_encoding: process.env.ANAM_VIDEO_ENCODING === 'AV1' ? 'AV1' : 'H264',
        },
      }),
    );
  }

  const session = agent.createSession({
    channel,
    agentUid: AGENT_UID,
    remoteUids: [uid],
    // The agent also leaves after this many idle seconds even while the page is connected, so it must
    // outlast the slow start of an avatar. Pages that close send a stop request; this is the backstop.
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: process.env.AGORA_DEBUG === '1',
  });
  const agentId = await session.start();
  return { appId, channel, uid, token, agentId, agentUid: AGENT_UID, avatarUid };
}

/** Stop is idempotent: an agent that is already stopping or gone counts as stopped. */
export async function stopAgent(agentId: string): Promise<void> {
  const { client } = agoraClient();
  try {
    await client.stopAgent(agentId);
  } catch (error) {
    const e = error as { statusCode?: number; body?: { detail?: string }; message?: string };
    const detail = (e.body?.detail ?? e.message ?? '').toLowerCase();
    if (e.statusCode === 404 || detail.includes('shutting down')) return;
    throw error;
  }
}

/** Low-level agent calls need the same ConvoAI token header that client.stopAgent builds itself. */
function convoAiAuth(channelName: string) {
  const { appId, appCertificate } = agoraCredentials();
  const token = generateConvoAIToken({ appId, appCertificate, channelName, uid: 0, tokenExpire: 300 });
  return { headers: { Authorization: `agora token=${token}` } };
}

export async function speak(agentId: string, text: string, priority: 'INTERRUPT' | 'APPEND' | 'IGNORE' = 'APPEND', interruptable = false) {
  const { appId, client } = agoraClient();
  await client.agents.speak({ appid: appId, agentId, text, priority, interruptable }, convoAiAuth('speak'));
}

/** Agent status as reported by Agora (RUNNING, STOPPED, FAILED ...), for diagnosing a session. */
export async function agentStatus(agentId: string) {
  const { appId, client } = agoraClient();
  const res = await client.agents.get({ appid: appId, agentId }, convoAiAuth('status'));
  return res as unknown as Record<string, unknown>;
}
