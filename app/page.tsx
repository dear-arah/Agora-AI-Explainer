'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Page } from '@/components/Page';
import { useApp } from '@/lib/app/AppProvider';

export default function Upload() {
  const app = useApp();
  const router = useRouter();
  const [over, setOver] = useState(false);
  const working = Boolean(app.preparing);
  const locked = !app.consent || working;

  // Once the slides are drawn and the script is drafted, go straight to the presenter.
  useEffect(() => { if (app.ready) router.push('/present'); }, [app.ready, router]);

  // Developer aid: /?deck=sample (or deck1 for a local file) after ticking the box.
  const [auto] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('deck')));
  useEffect(() => {
    if (auto && app.consent && !working && app.slides.length === 0 && !app.error) void app.openSample(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, app.consent]);

  const pick = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (files.length && !locked) void app.openDeck(files);
  };

  return (
    <Page>
      <main className="center">
        <h1>Slide Narrator</h1>
        <p className="sub">Upload a PowerPoint. An AI presenter explains it live, and you download the video.</p>

        <label className="check">
          <input type="checkbox" checked={app.consent} onChange={(e) => app.setConsent(e.target.checked)} />
          <span>My slide text and pictures may be sent to Agora&apos;s AI and to Google Gemini.</span>
        </label>

        <label
          className={`drop${over ? ' over' : ''}`}
          aria-disabled={locked}
          onDragOver={(e) => { e.preventDefault(); if (!locked) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        >
          <span className="btn primary big">Choose PowerPoint</span>
          <span className="meta">or drop it here</span>
          <input type="file" accept=".pptx,.pdf" multiple hidden disabled={locked} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        </label>

        {working && (
          <>
            <div className="progress" role="progressbar" aria-label="Preparing"><i /></div>
            <p className="status">{app.preparing}</p>
          </>
        )}
        {app.error && <div className="notice error" role="alert">{app.error}</div>}
        {app.warning && !working && <div className="notice warn">{app.warning}</div>}

        <button className="ghost" disabled={locked} onClick={() => void app.openSample()}>Try the sample deck</button>
      </main>
    </Page>
  );
}
