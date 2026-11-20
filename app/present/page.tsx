'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Conversation } from '@/components/Conversation';
import { Page } from '@/components/Page';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Stage } from '@/components/Stage';
import { useApp } from '@/lib/app/AppProvider';
import { videoWarnings } from '@/lib/stage/sanity';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function Present() {
  const app = useApp();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const p = app.present;
  const { session, rec } = p;

  // No deck in memory (a reload, or a direct visit): start over.
  useEffect(() => { if (app.slides.length === 0 && !app.preparing) router.replace('/'); }, [app.slides.length, app.preparing, router]);
  if (app.slides.length === 0) return null;

  const slide = app.slides[Math.min(p.pos, app.slides.length - 1)];
  const result = rec.result;
  const showVideo = p.phase === 'finished' && !!result;
  const busy = p.phase === 'connecting';
  const live = p.phase === 'live';
  const showChat = session.status === 'live' || session.transcript.length > 0;
  const error = p.runError ?? (p.phase === 'error' ? session.error : null);
  const warnings = result
    ? videoWarnings({ seconds: result.seconds, estimatedSeconds: app.narr.seconds, peakLevel: result.peakLevel, hiddenSeconds: result.hiddenSeconds, bytes: result.bytes, ext: result.ext })
    : [];

  const actions = (
    <>
      <Link className="btn ghost" href="/edit">Edit script</Link>
      <button className="ghost" onClick={() => dialog.current?.showModal()}>Settings</button>
      <Link className="btn ghost" href="/details">Details</Link>
      <button className="ghost" onClick={async () => { await app.reset(); router.push('/'); }}>New deck</button>
    </>
  );

  return (
    <Page actions={actions}>
      <main className="page">
        <div className={`present${showChat ? ' with-chat' : ''}`}>
          <div className="present-main">
            {showVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video className="result-video" src={result.url} controls>
                {p.captionFiles && <track kind="captions" src={p.captionFiles.vttUrl} srcLang="en" label="Captions" />}
              </video>
            ) : (
              <Stage
                slideSrc={app.slideUrls?.[p.pos] ?? null}
                slideTitle={slide.title ?? `Slide ${slide.index}`}
                layout={app.layout}
                presenter="orb"
                photoUrl={app.photoUrl}
                avatarTrack={null}
                levelRef={session.levelRef}
              />
            )}

            <div className="controls">
              {(p.phase === 'idle' || p.phase === 'error') && (
                <>
                  <button className="primary big" onClick={() => void p.start()} disabled={Boolean(app.blockedReason)}>Start presenting</button>
                  <span className="status">{app.blockedReason ?? ''}</span>
                </>
              )}
              {busy && (
                <>
                  <button className="big" disabled>Starting…</button>
                  <span className="status">{session.progress ?? 'Connecting the presenter…'}</span>
                </>
              )}
              {live && (
                <>
                  <button className="big" onClick={p.stop}>{app.saveVideo ? 'Stop and save' : 'Stop'}</button>
                  <button onClick={() => void (session.micOn ? session.closeMic() : session.openMic())} aria-pressed={session.micOn}>
                    {session.micOn ? 'Mic on' : 'Mic off'}
                  </button>
                  <span className="status">
                    {rec.recording && <i className="dot" aria-label="Recording" />}
                    Slide {p.pos + 1} of {app.slides.length}
                  </span>
                </>
              )}
              {p.phase === 'finished' && (
                <>
                  {result && <a className="btn primary big" href={result.url} download={result.filename}>Download video</a>}
                  {p.captionFiles && <a className="btn" href={p.captionFiles.vttUrl} download={result?.filename.replace(/\.\w+$/, '.vtt')}>Captions</a>}
                  <button onClick={() => void p.start()}>Present again</button>
                  {result && <button className="ghost" onClick={p.clearVideo}>Delete</button>}
                  {!result && <span className="status">Finished.</span>}
                </>
              )}
              <span className="spacer" />
              {session.status === 'live' && !live && !busy && <button className="ghost" onClick={() => void p.endSession()}>End session</button>}
            </div>

            {error && <div className="notice error" role="alert">{error}</div>}
            {session.micError && <div className="notice warn">{session.micError}</div>}
            {result && <p className="meta">{fmt(result.seconds)} · {(result.bytes / 1_000_000).toFixed(1)} MB · {result.ext.toUpperCase()}</p>}
            {warnings.map((w) => <div key={w} className="notice warn">{w}</div>)}
          </div>

          {showChat && <Conversation lines={session.transcript} canAsk={session.status === 'live'} onAsk={session.ask} />}
        </div>
      </main>
      <SettingsDialog ref={dialog} />
    </Page>
  );
}
