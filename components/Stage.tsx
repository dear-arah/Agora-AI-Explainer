'use client';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { presenterStyle, type PresenterLayout } from '@/lib/stage/layout';
import { Orb } from './Orb';

interface Props {
  /** Slide picture, or null to show the slide title instead. */
  slideSrc: string | null;
  slideTitle: string;
  layout: PresenterLayout;
  presenter: 'anam' | 'heygen' | 'orb';
  photoUrl: string | null;
  avatarTrack: IRemoteVideoTrack | null;
  levelRef: MutableRefObject<number>;
}

/**
 * The 16:9 frame that gets recorded: the slide fills it, the presenter sits in a corner.
 * All positions are percentages of the frame, so any size looks the same.
 */
export function Stage({ slideSrc, slideTitle, layout, presenter, photoUrl, avatarTrack, levelRef }: Props) {
  const video = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = video.current;
    if (!host || !avatarTrack) return;
    avatarTrack.play(host, { fit: 'cover' });
    return () => avatarTrack.stop();
  }, [avatarTrack, layout.shape]);

  return (
    <div className="stage" data-testid="stage">
      {slideSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="stage-slide" src={slideSrc} alt={slideTitle} />
      ) : (
        <div className="stage-slide stage-title">{slideTitle}</div>
      )}
      <div className="stage-presenter" style={presenterStyle(layout)} data-testid="presenter">
        {presenter !== 'orb' ? (
          <div ref={video} className="stage-video">{!avatarTrack && <span className="stage-wait">waiting for avatar…</span>}</div>
        ) : (
          <Orb levelRef={levelRef} photoUrl={photoUrl} />
        )}
      </div>
    </div>
  );
}
