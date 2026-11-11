/* YouTube (unlisted) is where lesson videos live. VdoCipher is kept, apart,
 * for later: a lesson can still carry a `vdoVideoId`, and it plays only when
 * that lesson has no YouTube link (see lessonVideo).
 *
 * YouTube plays through the IFrame Player API with its own controls switched
 * off; VdoPlayer draws the controls, exactly as it does for VdoCipher, through
 * youtubeMedia() below, which makes the YouTube player look like a <video>.
 * Unlisted is the right setting: Private videos refuse to play for anyone
 * but the owner, and Public ones show up in search.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

/** A YouTube video id from whatever an admin pastes: a watch, share, embed,
 * shorts or live link, or the bare 11-character id. Null if it is none of them. */
export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (ID.test(s)) return s;
  let url;
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    if (!id) {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && ID.test(id) ? id : null;
}

export const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** The embed VdoPlayer drives: no YouTube controls, keyboard, captions,
 * annotations or related videos from other channels; plays inline on iPhone. */
export function youtubeEmbedUrl(id, origin = window.location.origin) {
  const q = new URLSearchParams({
    enablejsapi: '1', controls: '0', disablekb: '1', fs: '0', rel: '0', modestbranding: '1',
    iv_load_policy: '3', cc_load_policy: '0', playsinline: '1', origin,
  });
  return `https://www.youtube.com/embed/${id}?${q}`;
}

/** Which video a lesson plays, if any: { kind: 'youtube' | 'vdocipher', id }.
 * YouTube whenever the lesson has a link. Its VdoCipher video, kept for
 * later, plays only when there is none, so a lesson not yet moved over keeps
 * playing rather than going blank. */
export function lessonVideo(topic) {
  if (!topic || topic.contentType !== 'video') return null;
  const yt = (topic.youtubeId || '').trim();
  if (yt) return { kind: 'youtube', id: yt };
  const vdo = (topic.vdoVideoId || '').trim();
  return vdo ? { kind: 'vdocipher', id: vdo } : null;
}

// ── The IFrame API ──────────────────────────────────────────────────────────
let loading = null;
export function loadYouTubeApi({ doc = document, win = window } = {}) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const before = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      if (typeof before === 'function') before();
      resolve(win.YT);
    };
    const script = doc.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('YouTube could not be reached. Check your connection and try again.'));
    };
    doc.head.appendChild(script);
  });
  return loading;
}

/** What a YouTube player error means, in words a student can act on. */
export function youtubeError(code) {
  if (code === 100) return 'This video is private or was removed. Ask the team to check it is Unlisted on YouTube.';
  if (code === 101 || code === 150) return 'This video cannot be played inside skeo. Its owner has turned off embedding on YouTube.';
  if (code === 2) return 'This lesson points at a YouTube link that is not valid.';
  return 'The video stopped with an error.';
}

/* A YouTube player dressed as an HTML <video>: the same properties, methods
 * and events VdoPlayer already uses for VdoCipher's proxy. YouTube reports
 * state changes but not time, so time is polled while playing. */
export function youtubeMedia(yt) {
  const target = new EventTarget();
  const emit = (name) => target.dispatchEvent(new Event(name));
  let timer = null;
  let lastDuration = 0;
  // isMuted() and getVolume() lag a set by a tick; remember what was asked.
  let muted = !!yt.isMuted?.();
  let volume = (yt.getVolume?.() ?? 100) / 100;

  const duration = () => {
    const d = yt.getDuration?.() || 0;
    return d > 0 ? d : NaN;
  };
  const checkDuration = () => {
    const d = duration();
    if (Number.isFinite(d) && d !== lastDuration) {
      lastDuration = d;
      emit('durationchange');
    }
  };
  const tick = () => { checkDuration(); emit('timeupdate'); emit('progress'); };
  const run = () => { if (!timer) timer = setInterval(tick, 250); };
  const stop = () => { clearInterval(timer); timer = null; };

  // Until the length is known (it usually is by onReady), keep asking.
  let probes = 0;
  const probe = setInterval(() => {
    checkDuration();
    if (lastDuration || ++probes > 40) clearInterval(probe);
  }, 250);

  const onState = (e) => {
    const S = window.YT?.PlayerState || { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
    switch (e.data) {
      case S.PLAYING: checkDuration(); emit('play'); emit('playing'); run(); break;
      case S.PAUSED: stop(); tick(); emit('pause'); break;
      case S.BUFFERING: emit('waiting'); break;
      case S.ENDED: stop(); tick(); emit('pause'); emit('ended'); break;
      default: checkDuration();
    }
  };
  const onRate = () => emit('ratechange');
  yt.addEventListener('onStateChange', onState);
  yt.addEventListener('onPlaybackRateChange', onRate);
  queueMicrotask(() => { checkDuration(); emit('volumechange'); });

  return {
    addEventListener: (name, fn) => target.addEventListener(name, fn),
    removeEventListener: (name, fn) => target.removeEventListener(name, fn),
    get currentTime() { return yt.getCurrentTime?.() || 0; },
    set currentTime(t) { yt.seekTo?.(t, true); queueMicrotask(tick); },
    get duration() { return duration(); },
    get paused() { return yt.getPlayerState?.() !== 1; },
    get volume() { return volume; },
    set volume(v) { volume = v; yt.setVolume?.(Math.round(v * 100)); emit('volumechange'); },
    get muted() { return muted; },
    set muted(m) { muted = !!m; if (muted) yt.mute?.(); else yt.unMute?.(); emit('volumechange'); },
    get playbackRate() { return yt.getPlaybackRate?.() ?? 1; },
    set playbackRate(r) { yt.setPlaybackRate?.(r); },
    get buffered() {
      const end = (yt.getVideoLoadedFraction?.() || 0) * (yt.getDuration?.() || 0);
      return { length: 1, start: () => 0, end: () => end };
    },
    play() { yt.playVideo?.(); return Promise.resolve(); },
    pause() { yt.pauseVideo?.(); return Promise.resolve(); },
    destroy() {
      stop();
      clearInterval(probe);
      try { yt.removeEventListener?.('onStateChange', onState); yt.removeEventListener?.('onPlaybackRateChange', onRate); } catch { /* frame gone */ }
    },
  };
}
