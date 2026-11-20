import { useEffect, useRef } from 'react';
import { drivePreviewUrl } from '../lib/drive.js';

/* A lesson video from Google Drive, in Drive's own player.
 *
 * Drive's frame says nothing about playback, so "watched" is worked out
 * around it, a stopgap until a real player replaces this:
 *   - Pressing play means clicking into the frame. The page loses focus to
 *     the frame when that happens, which is the one signal we get, so the
 *     clock starts there.
 *   - From then on, every second the tab is in front counts as watched.
 *     Switching tabs or minimising stops it.
 *   - WATCH_TO_COUNT_S of that, added up across visits on this device,
 *     marks the lesson done.
 * A paused video in a front tab still counts. It is a stopgap.
 */

const WATCH_TO_COUNT_S = 3 * 60;
const SAVE_EVERY_S = 5;
const key = (id) => `skeo.drive.watched.${id}`;

function readWatched(id) {
  try { return Number(localStorage.getItem(key(id))) || 0; } catch { return 0; }
}
function writeWatched(id, s) {
  try { localStorage.setItem(key(id), String(Math.round(s))); } catch { /* private mode */ }
}

/**
 * @param fileId     the Drive file id
 * @param title      the lesson's title
 * @param onWatched  called once, when the watch time is reached
 */
export default function DriveFrame({ fileId, title = 'Lesson video', onWatched }) {
  const frame = useRef(null);
  const onWatchedRef = useRef(onWatched);
  onWatchedRef.current = onWatched;

  useEffect(() => {
    let watched = readWatched(fileId);
    let engaged = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onWatchedRef.current?.();
    };
    // Watched enough on an earlier visit: done now.
    if (watched >= WATCH_TO_COUNT_S) finish();

    // Focus moving into the frame is the click on play (or anywhere in it).
    const onBlur = () => setTimeout(() => {
      if (document.activeElement === frame.current) engaged = true;
    }, 0);
    window.addEventListener('blur', onBlur);

    const tick = setInterval(() => {
      if (!engaged || document.visibilityState !== 'visible') return;
      watched += 1;
      if (watched % SAVE_EVERY_S === 0) writeWatched(fileId, watched);
      if (watched >= WATCH_TO_COUNT_S) finish();
    }, 1000);

    return () => {
      window.removeEventListener('blur', onBlur);
      clearInterval(tick);
      writeWatched(fileId, watched);
    };
  }, [fileId]);

  return (
    <div className="vp is-drive" role="region" aria-label={`Video: ${title}`}>
      <iframe
        ref={frame}
        className="vp-frame"
        src={drivePreviewUrl(fileId)}
        title={title}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}
