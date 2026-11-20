'use client';
import { useState } from 'react';
import type { ChatLine } from '@/lib/qa/transcript';

/** What the audience and the presenter have said, plus a box to type a question. */
export function Conversation({ lines, canAsk, onAsk }: { lines: ChatLine[]; canAsk: boolean; onAsk: (q: string) => Promise<void> }) {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setQ('');
    setError(null);
    try { await onAsk(text); } catch (err) { setError((err as Error).message); }
  }

  return (
    <aside className="chat-col" aria-label="Conversation">
      <h3>Ask anything</h3>
      <form className="row grow" onSubmit={submit}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type, or just speak" aria-label="Question" disabled={!canAsk} />
        <button className="primary" type="submit" disabled={!canAsk || !q.trim()}>Ask</button>
      </form>
      {error && <div className="notice error" role="alert">{error}</div>}
      {lines.length > 0 && (
        <ol className="chat">
          {lines.map((l) => (
            <li key={l.id} className={l.who}><b>{l.who === 'you' ? 'You' : 'Presenter'}</b>{l.text}{!l.final && ' …'}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
