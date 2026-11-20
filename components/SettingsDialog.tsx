'use client';
import { forwardRef, useState } from 'react';
import { useApp } from '@/lib/app/AppProvider';
import { clampLayout, type Corner, type PresenterShape } from '@/lib/stage/layout';

const SHAPES: [PresenterShape, string][] = [['circle', 'Circle'], ['rect', 'Rectangle'], ['hidden', 'Hidden']];
const CORNERS: [Corner, string][] = [['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left']];

/** Everything you can change about how the presenter looks and behaves, out of the way until asked for. */
export const SettingsDialog = forwardRef<HTMLDialogElement>(function SettingsDialog(_props, ref) {
  const app = useApp();
  const [pictureOk, setPictureOk] = useState(false);
  const patch = (p: Partial<typeof app.layout>) => app.setLayout((l) => clampLayout({ ...l, ...p }));

  return (
    <dialog ref={ref} aria-label="Settings">
      <div className="stack">
        <h2>Settings</h2>

        <div className="stack">
          <h3>Presenter</h3>
          <div className="seg" role="group" aria-label="Shape">
            {SHAPES.map(([v, label]) => (
              <button key={v} aria-pressed={app.layout.shape === v} onClick={() => patch({ shape: v })}>{label}</button>
            ))}
          </div>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              Corner
              <select value={app.layout.corner} onChange={(e) => patch({ corner: e.target.value as Corner })}>
                {CORNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              Size {app.layout.sizePct}%
              <input type="range" min={10} max={40} value={app.layout.sizePct} onChange={(e) => patch({ sizePct: Number(e.target.value) })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={pictureOk} onChange={(e) => { setPictureOk(e.target.checked); if (!e.target.checked) app.setPhoto(null); }} />
            <span>Use my own picture. I own it or have permission from the person in it. It stays in this tab.</span>
          </label>
          {pictureOk && (
            <div className="row">
              <input type="file" accept="image/*" aria-label="Presenter picture" onChange={(e) => { app.setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              {app.photoUrl && <button className="ghost" onClick={() => app.setPhoto(null)}>Remove</button>}
            </div>
          )}
        </div>

        <div className="stack">
          <h3>How it presents</h3>
          <div className="seg" role="group" aria-label="Style">
            <button aria-pressed={app.style === 'improvise'} onClick={() => app.setStyle('improvise')}>Improvise from my script</button>
            <button aria-pressed={app.style === 'script'} onClick={() => app.setStyle('script')}>Read it exactly</button>
          </div>
          <label className="check"><input type="checkbox" checked={app.saveVideo} onChange={(e) => app.setSaveVideo(e.target.checked)} /><span>Record a video</span></label>
          <label className="check"><input type="checkbox" checked={app.micOn} onChange={(e) => app.setMicOn(e.target.checked)} /><span>Open the microphone so the audience can speak</span></label>
        </div>

        <div className="row"><form method="dialog"><button className="primary">Done</button></form></div>
      </div>
    </dialog>
  );
});
