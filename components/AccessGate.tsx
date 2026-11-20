'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { accessHeaders, setAccessCode } from '@/lib/access-client';

interface Health { access?: { required: boolean; misconfigured: boolean } }
type State = 'checking' | 'open' | 'needs-code' | 'misconfigured';

/** Shows the app only once the access code (when the deployment needs one) has been accepted. */
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(): Promise<boolean> {
    const res = await fetch('/api/access', { method: 'POST', headers: accessHeaders() });
    return res.ok;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = (await fetch('/api/health').then((r) => r.json())) as Health;
        if (cancelled) return;
        if (h.access?.misconfigured) return setState('misconfigured');
        if (!h.access?.required) return setState('open');
        setState((await verify()) ? 'open' : 'needs-code');
      } catch {
        if (!cancelled) setState('open'); // health is unreachable: let the app show its own errors
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAccessCode(code.trim());
    try {
      if (await verify()) setState('open');
      else { setAccessCode(''); setError('That access code was not accepted.'); }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') return <p className="meta">Checking access…</p>;
  if (state === 'misconfigured') {
    return <div className="notice error" role="alert">This deployment has no APP_ACCESS_CODE set, so it refuses requests. The owner needs to set it and redeploy.</div>;
  }
  if (state === 'needs-code') {
    return (
      <form className="notice" onSubmit={submit}>
        <label className="field">
          Access code
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoFocus />
        </label>
        <div className="row">
          <button className="primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Continue'}</button>
          <span className="meta">The code is kept in this tab only.</span>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
      </form>
    );
  }
  return <>{children}</>;
}
