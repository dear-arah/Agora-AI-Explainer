'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/lib/app/AppProvider';

/** The frame every page shares: a brand link and a few actions. Nothing else. */
export function Page({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const app = useApp();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href={app.ready ? '/present' : '/'}>Slide Narrator</Link>
        <nav className="nav">{actions}</nav>
      </header>
      {children}
    </div>
  );
}
