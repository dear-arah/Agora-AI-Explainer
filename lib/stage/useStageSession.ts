'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import type { RTMClient } from 'agora-rtm';
import { accessHeaders, getAccessCode } from '../access-client';
import type { QaSlide } from '../qa/context';
import { CUE_MARKER } from './playlist';
import { mapTranscript, withTypedQuestions, type ChatLine, type RawTranscriptItem } from '../qa/transcript';
import { startUntilHealthy } from './startup';

export type StageStatus = 'idle' | 'starting' | 'live' | 'stopping' | 'error';

export interface StateEvent {
  /** Milliseconds since the session went live. */
  at: number;
  state: string;
}

interface StartResponse {
  appId: string;
  channel: string;
  uid: string;
  token: string;
  agentId: string;
  agentUid: string;
  avatarUid: string | null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...accessHeaders() }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (HTTP ${res.status}).`);
  return data as T;
}

/**
 * Joins the Agora channel as a listener, subscribes to the presenter's video and audio, and
 * reports the agent's state over RTM. It never publishes a microphone, so only our /speak calls
 * make the agent talk.
 */
export function useStageSession() {
  const [status, setStatus] = useState<StageStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<string | null>(null);
  const [events, setEvents] = useState<StateEvent[]>([]);
  const [avatarTrack, setAvatarTrack] = useState<IRemoteVideoTrack | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  /** What the start-up is doing right now, for the status line. */
  const [progress, setProgress] = useState<string | null>(null);
  // Live Q&A: what the agent's transcript says, the questions typed here, and the microphone.
  const [spoken, setSpoken] = useState<ChatLine[]>([]);
  const [typed, setTyped] = useState<ChatLine[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  /** Current output loudness from 0 to 1. Read it in an animation frame; it never causes a render. */
  const levelRef = useRef(0);
  /** Everyone who wants raw agent state events (the slide driver) subscribes here. */
  const stateListeners = useRef(new Set<(state: string) => void>());
  const onAgentState = useCallback((fn: (state: string) => void) => {
    stateListeners.current.add(fn);
    return () => { stateListeners.current.delete(fn); };
  }, []);
  /** Called whenever the audience speaks (transcript) or types, so the slide driver can tell it is being interrupted. */
  const userListeners = useRef(new Set<() => void>());
  const onUserActivity = useCallback((fn: () => void) => {
    userListeners.current.add(fn);
    return () => { userListeners.current.delete(fn); };
  }, []);
  const live = useRef<{
    info: StartResponse;
    rtc: IAgoraRTCClient;
    rtm: RTMClient;
    ctx: AudioContext;
    recordDest: MediaStreamAudioDestinationNode;
    ai: { unsubscribe(): void; destroy(): void; sendText(agentUserId: string, message: unknown): Promise<void> } | null;
    toolkit: typeof import('agora-agent-client-toolkit');
    AgoraRTC: typeof import('agora-rtc-sdk-ng').default;
    mic: IMicrophoneAudioTrack | null;
    raf: number;
    t0: number;
  } | null>(null);

  const teardown = useCallback(async () => {
    const s = live.current;
    live.current = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    try { if (s.mic) { await s.rtc.unpublish(s.mic); s.mic.stop(); s.mic.close(); } } catch {}
    try { s.ai?.unsubscribe(); s.ai?.destroy(); } catch {}
    try { await s.rtm.logout(); } catch {}
    try { await s.rtc.leave(); } catch {}
    try { await s.ctx.close(); } catch {}
    levelRef.current = 0;
    setAvatarTrack(null);
    setMicOn(false);
  }, []);

  const start = useCallback(async (presenter: 'anam' | 'heygen' | 'orb', avatarId?: string, context?: QaSlide[]): Promise<boolean> => {
    if (live.current) return true;
    setStatus('starting');
    setError(null);
    setEvents([]);
    setSpoken([]);
    setTyped([]);
    setMicError(null);
    setAgentState(null);
    // Created inside the click handler so the browser allows the agent's audio to play.
    const ctx = new AudioContext();
    let started = null as StartResponse | null;
    try {
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      const { info } = await startUntilHealthy<StartResponse>({
        start: async () => (started = await postJson<StartResponse>('/api/session/start', { presenter, avatarId, context })),
        status: async (id) => {
          const res = await fetch(`/api/session/status?agentId=${encodeURIComponent(id)}`, { headers: accessHeaders() });
          return ((await res.json()) as { status?: string }).status ?? '';
        },
        stop: async (id) => { await postJson('/api/session/stop', { agentId: id }); },
        sleep,
        onAttempt: (n, max) => setProgress(n === 1 ? 'Starting the presenter…' : `Presenter did not connect, trying again (${n} of ${max})…`),
      });
      setProgress(null);

      const [{ default: AgoraRTC }, { default: AgoraRTM }, toolkit] = await Promise.all([
        import('agora-rtc-sdk-ng'),
        import('agora-rtm'),
        import('agora-agent-client-toolkit'),
      ]);
      (AgoraRTC as unknown as { setParameter?: (k: string, v: unknown) => void }).setParameter?.('ENABLE_AUDIO_PTS', true);
      AgoraRTC.setLogLevel(3);

      const t0 = performance.now();
      const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      // The agent's audio also goes here, so a recording can capture it without the speakers.
      const recordDest = ctx.createMediaStreamDestination();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const buf = new Uint8Array(analyser.fftSize);

      const note = (state: string) => setEvents((prev) => [...prev, { at: Math.round(performance.now() - t0), state }].slice(-30));
      rtc.on('user-joined', (user) => note(`rtc: uid ${user.uid} joined`));
      rtc.on('user-left', (user) => note(`rtc: uid ${user.uid} left`));
      rtc.on('user-published', async (user, mediaType) => {
        note(`rtc: uid ${user.uid} published ${mediaType}`);
        await rtc.subscribe(user, mediaType);
        if (mediaType === 'video' && info.avatarUid && String(user.uid) === info.avatarUid) {
          setAvatarTrack(user.videoTrack ?? null);
        }
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
          // Same audio, tapped for the orb's glow and for the silence fallback.
          const track = user.audioTrack.getMediaStreamTrack();
          const source = ctx.createMediaStreamSource(new MediaStream([track]));
          source.connect(analyser);
          source.connect(recordDest); // the same audio, for the recording
        }
      });
      rtc.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video' && String(user.uid) === info.avatarUid) setAvatarTrack(null);
      });

      await rtc.join(info.appId, info.channel, info.token, Number(info.uid));

      const rtm = new AgoraRTM.RTM(info.appId, info.uid);
      await rtm.login({ token: info.token });
      await rtm.subscribe(info.channel);

      const ai = await toolkit.AgoraVoiceAI.init({
        rtcEngine: rtc,
        rtmEngine: rtm,
        renderMode: toolkit.TranscriptHelperMode.TEXT,
        enableLog: false,
      });
      ai.on(toolkit.AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_agent, event) => {
        setAgentState(event.state);
        stateListeners.current.forEach((fn) => fn(String(event.state)));
        setEvents((prev) => [...prev, { at: Math.round(performance.now() - t0), state: String(event.state) }].slice(-30));
      });
      ai.on(toolkit.AgoraVoiceAIEvents.AGENT_ERROR, (_agent, err) => {
        setError(`${err.type}: ${err.message}`);
      });
      const seenUser = new Map<string, string>();
      ai.on(toolkit.AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items) => {
        const lines = mapTranscript(items as unknown as RawTranscriptItem[], info.agentUid);
        setSpoken(lines);
        for (const l of lines) {
          if (l.who !== 'you' || seenUser.get(l.id) === l.text) continue;
          seenUser.set(l.id, l.text);
          userListeners.current.forEach((fn) => fn());
        }
      });
      ai.subscribeMessage(info.channel);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        levelRef.current = levelRef.current * 0.7 + level * 0.3;
        if (live.current) live.current.raf = requestAnimationFrame(tick);
      };
      live.current = { info, rtc, rtm, ctx, recordDest, ai, toolkit, AgoraRTC, mic: null, raf: 0, t0 };
      setAgentId(info.agentId);
      live.current.raf = requestAnimationFrame(tick);
      setStatus('live');
      return true;
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
      setStatus('error');
      const agentId = started?.agentId;
      await teardown();
      try { await ctx.close(); } catch {}
      if (agentId) postJson('/api/session/stop', { agentId }).catch(() => {});
      return false;
    }
  }, [teardown]);

  const stop = useCallback(async () => {
    const agentId = live.current?.info.agentId;
    setStatus('stopping');
    await teardown();
    if (agentId) await postJson('/api/session/stop', { agentId }).catch(() => {});
    setStatus('idle');
    setAgentState(null);
    setAgentId(null);
    setMicOn(false);
  }, [teardown]);

  const speak = useCallback(async (text: string, priority: 'INTERRUPT' | 'APPEND' | 'IGNORE' = 'APPEND', interruptable = false) => {
    const agentId = live.current?.info.agentId;
    if (!agentId) throw new Error('No live session.');
    await postJson('/api/session/speak', { agentId, text, priority, interruptable });
  }, []);

  /** Give the presenter a stage direction (not shown in the chat). Its own model says it out loud. */
  const cue = useCallback(async (text: string) => {
    const s = live.current;
    if (!s?.ai) throw new Error('No live session.');
    await s.ai.sendText(s.info.agentUid, {
      messageType: s.toolkit.ChatMessageType.TEXT,
      priority: s.toolkit.ChatMessagePriority.INTERRUPTED,
      responseInterruptable: true,
      text,
    });
  }, []);

  /** Ask the presenter a question in text. It answers out loud, from the deck it was given. */
  const ask = useCallback(async (text: string) => {
    const s = live.current;
    // A stage cue is a direction from us, never from the audience: strip the marker from anything typed.
    const question = text.split(CUE_MARKER).join('').trim();
    if (!s || !question) return;
    setTyped((t) => [...t, { id: `typed-${Date.now()}`, who: 'you', text: question, final: true, at: Date.now() }]);
    userListeners.current.forEach((fn) => fn());
    await s.ai?.sendText(s.info.agentUid, {
      messageType: s.toolkit.ChatMessageType.TEXT,
      priority: s.toolkit.ChatMessagePriority.INTERRUPTED,
      responseInterruptable: true,
      text: question,
    });
  }, []);

  /** Start sending the microphone to the agent, so it can hear spoken questions. */
  const openMic = useCallback(async () => {
    const s = live.current;
    if (!s || s.mic) return;
    setMicError(null);
    try {
      // Echo cancellation matters: the agent's own voice comes out of the speakers.
      const track = await s.AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      await s.rtc.publish(track);
      s.mic = track;
      setMicOn(true);
    } catch (e) {
      const name = (e as { name?: string; code?: string }).name ?? '';
      const code = (e as { code?: string }).code ?? '';
      setMicError(
        /NotAllowed|PERMISSION/i.test(name + code)
          ? 'The browser blocked the microphone. Allow it for this site and try again.'
          : /NotFound|DEVICES_NOT_FOUND/i.test(name + code)
            ? 'No microphone was found on this device. You can type your questions instead.'
            : `Could not open the microphone: ${(e as Error).message}`,
      );
    }
  }, []);

  const closeMic = useCallback(async () => {
    const s = live.current;
    const track = s?.mic;
    if (!s || !track) return;
    s.mic = null;
    setMicOn(false);
    try { await s.rtc.unpublish(track); } catch {}
    track.stop();
    track.close();
  }, []);

  /** The agent's audio as a stream a recorder can use, or null when no session is live. */
  const getAudioStream = useCallback(() => live.current?.recordDest.stream ?? null, []);

  // Leaving the page must not leave a paid agent running.
  useEffect(() => {
    const onLeave = () => {
      const agentId = live.current?.info.agentId;
      if (agentId) navigator.sendBeacon('/api/session/stop', new Blob([JSON.stringify({ agentId, accessCode: getAccessCode() })], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      onLeave();
      void teardown();
    };
  }, [teardown]);

  return { status, error, agentState, events, avatarTrack, agentId, progress, levelRef, start, stop, speak, cue, onAgentState, onUserActivity, getAudioStream, transcript: withTypedQuestions(spoken, typed), ask, micOn, micError, openMic, closeMic };
}
