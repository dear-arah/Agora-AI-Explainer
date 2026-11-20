'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';

/** Free presenter: an animated circle, or the user's picture, that glows with the agent's voice. No lip-sync. */
export function Orb({ levelRef, photoUrl }: { levelRef: MutableRefObject<number>; photoUrl?: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      el.current?.style.setProperty('--level', levelRef.current.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div ref={el} className="orb" style={{ '--level': 0 } as React.CSSProperties}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Presenter" className="orb-photo" />
      ) : (
        <div className="orb-core" />
      )}
      <div className="orb-glow" />
    </div>
  );
}
