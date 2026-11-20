'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Page } from '@/components/Page';
import { useApp } from '@/lib/app/AppProvider';
import { summarizeTimings } from '@/lib/stage/driver';

const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}s`);

/** The technical side: what the session, the agent and each slide did. Nothing here is needed to make a video. */
export default function Details() {
  const app = useApp();
  const router = useRouter();
  const { present: p } = app;
  const { session, rec } = p;

  useEffect(() => { if (app.slides.length === 0 && !app.preparing) router.replace('/'); }, [app.slides.length, app.preparing, router]);
  if (app.slides.length === 0) return null;

  // The live driver holds a second after each slide so a late reply is noticed, so drift is measured against that.
  const rows = p.timings ? summarizeTimings(p.timings, 1000) : [];
  return (
    <Page actions={<Link className="btn primary" href="/present">Back</Link>}>
      <main className="page">
        <section className="block">
          <h2>Deck</h2>
          <p className="meta">
            {app.fileName} · {app.slides.length} slides · pictures from {app.imageSource === 'pdf' ? 'a PDF' : app.imageSource === 'powerpoint' ? 'the PowerPoint file' : 'none (title cards)'}
            {app.narr.source ? ` · script by ${app.narr.source}` : ' · no written script'}
          </p>
          {app.warning && <div className="notice warn">{app.warning}</div>}
          {app.narr.error && <div className="notice error">Script: {app.narr.error}</div>}
        </section>

        <section className="block">
          <h2>Session</h2>
          <p className="meta">
            Status: {p.phase} · agent {session.agentState ?? 'not connected'}{session.agentId ? ` · ${session.agentId}` : ''} · style: {app.style}
          </p>
          {(p.runError || session.error) && <div className="notice error">{p.runError ?? session.error}</div>}
          {rec.error && <div className="notice error">Recording: {rec.error}</div>}
          {rec.result && (
            <p className="meta">
              Video: {rec.result.seconds.toFixed(1)}s · {(rec.result.bytes / 1_000_000).toFixed(2)} MB · {rec.result.mime} · loudest voice {rec.result.peakLevel.toFixed(2)} · tab hidden {rec.result.hiddenSeconds.toFixed(1)}s
            </p>
          )}
        </section>

        <section className="block">
          <h2>Slides</h2>
          {rows.length === 0 ? <p className="meta">Nothing recorded yet.</p> : (
            <table>
              <thead><tr><th>Slide</th><th>Lead</th><th>Speech</th><th>Lag</th><th>Drift</th><th>Interruptions</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.position + 1}</td><td>{sec(r.leadMs)}</td><td>{sec(r.speechMs)}</td><td>{sec(r.endLagMs)}</td>
                    <td>{r.driftMs === null ? '–' : `${r.driftMs} ms`}</td><td>{p.timings?.[i].interruptions ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="meta">Lead: slide shown to first word. Lag: sound after the end signal. Drift: slide change versus the end of sound.</p>
        </section>

        <section className="block">
          <h2>Agent events</h2>
          <pre className="log">{session.events.length ? session.events.map((e) => `${(e.at / 1000).toFixed(2)}s  ${e.state}`).join('\n') : 'No events yet.'}</pre>
        </section>
      </main>
    </Page>
  );
}
