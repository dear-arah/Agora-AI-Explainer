'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Page } from '@/components/Page';
import { useApp } from '@/lib/app/AppProvider';
import { BLOCK_SECONDS, WARN_SECONDS, countWords } from '@/lib/narration/timing';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function Edit() {
  const app = useApp();
  const router = useRouter();
  const { narr } = app;

  useEffect(() => { if (app.slides.length === 0 && !app.preparing) router.replace('/'); }, [app.slides.length, app.preparing, router]);
  if (app.slides.length === 0) return null;

  const note =
    narr.status === 'blocked' ? `Too long to record (limit ${fmt(BLOCK_SECONDS)}).`
    : narr.status === 'warn' ? `Over ${fmt(WARN_SECONDS)}. Shorter works better.`
    : 'Good length.';

  return (
    <Page actions={<Link className="btn primary" href="/present">Done</Link>}>
      <main className="page">
        <div className="edit-head">
          <div>
            <h2>Edit script</h2>
            <p className="meta">
              <span className={narr.status === 'ok' ? 'good' : 'long'}>{fmt(narr.seconds)}</span> · {note}{' '}
              The presenter uses each line as its talking points.
            </p>
          </div>
          <button onClick={() => void narr.write()} disabled={narr.busy || !app.consent}>{narr.busy ? 'Writing…' : 'Rewrite with AI'}</button>
        </div>
        {narr.error && <div className="notice error" role="alert" style={{ marginBottom: 12 }}>{narr.error}</div>}

        <div className="slides">
          {app.slides.map((s, i) => {
            const line = narr.lines[s.index];
            return (
              <div key={s.index} className={`slide-row${line?.skip ? ' skipped' : ''}`}>
                {app.slideUrls?.[i]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className="thumb" src={app.slideUrls[i]} alt={`Slide ${s.index}`} />
                  : <div className="thumb">{s.title ?? `Slide ${s.index}`}</div>}
                <div className="stack" style={{ gap: 8 }}>
                  <textarea
                    rows={3}
                    value={line?.text ?? ''}
                    placeholder="Nothing written. The presenter will improvise from the slide text."
                    aria-label={`Script for slide ${s.index}`}
                    onChange={(e) => narr.edit(s.index, { text: e.target.value, skip: false })}
                  />
                  <div className="row">
                    <label className="check">
                      <input type="checkbox" checked={!!line?.skip} onChange={(e) => narr.edit(s.index, { skip: e.target.checked })} />
                      <span>Skip this slide</span>
                    </label>
                    <span className="meta">{line?.skip ? '' : `${countWords(line?.text ?? '')} words`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </Page>
  );
}
