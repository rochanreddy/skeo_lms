import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// DRM playback for a VdoCipher-hosted lesson.
//
// The browser is never told anything durable: it asks our API for a 5-minute
// OTP for this one video and hands that to VdoCipher's player. Reload the page
// a day later and the old ticket is worthless, which is the point -- copying the
// iframe URL out of dev tools buys you five minutes, not the video.

const PLAYER_ORIGIN = 'https://player.vdocipher.com';

export default function VdoPlayer({ videoId, title = 'Lesson video', poster = '' }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Only the first load should show a skeleton; a retry keeps the frame in place.
  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setTicket(null);
    setError('');
    (async () => {
      try {
        const { otp, playbackInfo } = await api(`/videos/${encodeURIComponent(videoId)}/otp`, { method: 'POST' });
        if (cancelled) return;
        if (!otp || !playbackInfo) throw new Error('The video service returned an incomplete ticket.');
        loadedOnce.current = true;
        setTicket({ otp, playbackInfo });
      } catch (e) {
        if (!cancelled) setError(e.message || 'This video could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [videoId, attempt]);

  if (error) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">{error}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="lesson-video vdo-frame vdo-loading" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
        <span className="muted">Starting the video…</span>
      </div>
    );
  }

  const src = `${PLAYER_ORIGIN}/v2/?otp=${encodeURIComponent(ticket.otp)}&playbackInfo=${encodeURIComponent(ticket.playbackInfo)}`;
  return (
    <div className="lesson-video vdo-frame">
      <iframe
        key={`${videoId}-${attempt}`}
        src={src}
        title={title}
        // Widevine/FairPlay need encrypted-media; the rest is what the player's
        // own controls use. No sandbox: the player runs its own DRM stack.
        allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
