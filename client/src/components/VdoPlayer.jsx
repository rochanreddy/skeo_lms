import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  RATES, SKIP_SECONDS, bufferedEnd, clamp, clearPosition, formatTime, keyAction, loadPlayerApi,
  readPosition, readRate, resumePoint, spokenTime, stepRate, writePosition, writeRate,
} from '../lib/player.js';

/* DRM playback for a VdoCipher-hosted lesson, in the LMS's own clothes.
 *
 * VdoCipher plays the video inside its iframe and keeps the DRM there; its own
 * controls are switched off (controls=off) and everything a student touches is
 * drawn here, over the frame: play, the timeline, skipping, volume, speed,
 * captions, fullscreen and the keys every player answers to. The iframe is
 * driven through VdoCipher's player API, which hands back a proxy that behaves
 * like an HTML5 <video>.
 *
 * The browser is never told anything durable: it asks our API for a 5-minute
 * OTP for this one video and hands that to the player. Reload the page a day
 * later and the old ticket is worthless, which is the point.
 */

const PLAYER_ORIGIN = 'https://player.vdocipher.com';
const HIDE_AFTER_MS = 2600;
const SAVE_EVERY_S = 5;

const touchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/* The accent as the player's own colour, read from the live theme so it
 * follows day and night: VdoCipher wants it as bare upper-case hex. */
function accentHex() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.slice(1).toUpperCase() : 'BD5A38';
  } catch {
    return 'BD5A38';
  }
}

// ── Icons: one stroke, one weight, drawn here so the player owns its glyphs ──
const Glyph = ({ d, size = 22, fill = false, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
const I = {
  play: (p) => <Glyph fill {...p} d="M7 5.2v13.6a1 1 0 0 0 1.52.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 7 5.2z" />,
  pause: (p) => <Glyph fill {...p}><rect x="6" y="5" width="4.2" height="14" rx="1" /><rect x="13.8" y="5" width="4.2" height="14" rx="1" /></Glyph>,
  replay: (p) => <Glyph {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 3.5v5h5" /></Glyph>,
  back: (p) => <Glyph {...p}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 3.8v4.6h4.6" /><text x="12" y="15.4" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Inter, system-ui, sans-serif">{SKIP_SECONDS}</text></Glyph>,
  forward: (p) => <Glyph {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 3.8v4.6h-4.6" /><text x="12" y="15.4" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Inter, system-ui, sans-serif">{SKIP_SECONDS}</text></Glyph>,
  volume: (p) => <Glyph {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /><path d="M18.3 6.2a8 8 0 0 1 0 11.6" /></Glyph>,
  quiet: (p) => <Glyph {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /></Glyph>,
  muted: (p) => <Glyph {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="m16 9.5 5 5" /><path d="m21 9.5-5 5" /></Glyph>,
  captions: (p) => <Glyph {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M10.2 10.3a2 2 0 1 0 0 3.4" /><path d="M16.2 10.3a2 2 0 1 0 0 3.4" /></Glyph>,
  enter: (p) => <Glyph {...p}><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" /><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" /><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></Glyph>,
  exit: (p) => <Glyph {...p}><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4" /><path d="M15 4v3.5A1.5 1.5 0 0 0 16.5 9H20" /><path d="M20 15h-3.5a1.5 1.5 0 0 0-1.5 1.5V20" /><path d="M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" /></Glyph>,
  check: (p) => <Glyph {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Glyph>,
  alert: (p) => <Glyph {...p}><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Glyph>,
  next: (p) => <Glyph {...p}><path d="M5 12h13" /><path d="m12 6 6 6-6 6" /></Glyph>,
};

const Spinner = () => (
  <svg className="vp-spinner" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="70 30" />
  </svg>
);

/**
 * @param videoId  the VdoCipher id the lesson points at
 * @param title    the lesson's title, shown while fullscreen
 * @param upNext   { title, onPlay } for the card at the end, or null
 * @param onEnded  called once when the video reaches its end
 */
export default function VdoPlayer({ videoId, title = 'Lesson video', upNext = null, onEnded }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const root = useRef(null);
  const frame = useRef(null);
  const player = useRef(null); // { video, api } from VdoCipher
  const hideTimer = useRef(null);
  const toastTimer = useRef(null);
  const lastSaved = useRef(0);
  const endedOnce = useRef(false);
  const resumed = useRef(false);
  const dragging = useRef(false);
  const lastTap = useRef({ at: 0, side: '' });

  const [ready, setReady] = useState(false); // the API is talking to the frame
  const [started, setStarted] = useState(false); // play has been pressed once
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(readRate);
  const [resumeAt, setResumeAt] = useState(0); // where to pick up, once play is pressed
  const [captions, setCaptions] = useState({ languages: [], visible: false });
  const [menu, setMenu] = useState(''); // 'rate' | 'captions' | ''
  const [full, setFull] = useState(false);
  const [fakeFull, setFakeFull] = useState(false);
  const [active, setActive] = useState(true); // controls shown
  const [toast, setToast] = useState('');
  const [scrub, setScrub] = useState(null); // { x, time } while hovering the timeline
  const [nudge, setNudge] = useState(null); // { side, n } the skip indicator on touch

  const v = () => player.current?.video;

  // ── 1. The ticket ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setTicket(null);
    setError('');
    setReady(false);
    setStarted(false);
    setPlaying(false);
    setEnded(false);
    setTime(0);
    setDuration(0);
    setBuffered(0);
    setCaptions({ languages: [], visible: false });
    setResumeAt(0);
    endedOnce.current = false;
    resumed.current = false;
    player.current = null;
    (async () => {
      try {
        const [{ otp, playbackInfo }] = await Promise.all([
          api(`/videos/${encodeURIComponent(videoId)}/otp`, { method: 'POST' }),
          loadPlayerApi(),
        ]);
        if (cancelled) return;
        if (!otp || !playbackInfo) throw new Error('The video service returned an incomplete ticket.');
        setTicket({ otp, playbackInfo });
      } catch (e) {
        if (!cancelled) setError(e.message || 'This video could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [videoId, attempt]);

  // ── 2. The player behind the frame ────────────────────────────────────────
  useEffect(() => {
    const iframe = frame.current;
    if (!ticket || !iframe || !window.VdoPlayer) return undefined;
    const p = window.VdoPlayer.getInstance(iframe);
    player.current = p;
    const vid = p.video;
    setReady(true);

    const onTime = () => {
      if (dragging.current) return;
      const t = vid.currentTime || 0;
      setTime(t);
      setBuffered(bufferedEnd(vid.buffered, t));
      if (t - lastSaved.current >= SAVE_EVERY_S) {
        lastSaved.current = t;
        writePosition(videoId, t);
      }
    };
    const onDuration = () => {
      const d = vid.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      setDuration(d);
      // Somewhere to pick up? Decided once, as soon as the length is known.
      // The seek itself waits for play: the player drops a position set
      // before its media has loaded.
      if (!resumed.current) {
        resumed.current = true;
        const at = resumePoint(readPosition(videoId), d);
        if (at) { setResumeAt(at); setTime(at); }
      }
    };
    const onPlay = () => { setPlaying(true); setEnded(false); setStarted(true); };
    const onPause = () => setPlaying(false);
    const onPlaying = () => { setWaiting(false); setPlaying(true); };
    const onWaiting = () => setWaiting(true);
    const onEnd = () => {
      setPlaying(false);
      setEnded(true);
      setActive(true);
      clearPosition(videoId);
      if (!endedOnce.current) {
        endedOnce.current = true;
        onEnded?.();
      }
    };
    const onVolume = () => { setVolume(vid.volume ?? 1); setMuted(!!vid.muted); };
    const onRate = () => { if (RATES.includes(vid.playbackRate)) setRate(vid.playbackRate); };
    const onProgress = () => setBuffered(bufferedEnd(vid.buffered, vid.currentTime || 0));

    const listeners = [
      ['timeupdate', onTime], ['durationchange', onDuration], ['loadedmetadata', onDuration],
      ['play', onPlay], ['pause', onPause], ['playing', onPlaying], ['waiting', onWaiting],
      ['ended', onEnd], ['volumechange', onVolume], ['ratechange', onRate], ['progress', onProgress],
    ];
    for (const [name, fn] of listeners) vid.addEventListener(name, fn);

    // The speed they chose last time, applied once the media can take it.
    const wanted = readRate();
    const onCanPlay = () => { if (wanted !== 1 && vid.playbackRate !== wanted) vid.playbackRate = wanted; };
    vid.addEventListener('canplay', onCanPlay);
    listeners.push(['canplay', onCanPlay]);

    // The player's own failures (a browser without DRM, a licence refused) would
    // otherwise be a black frame that never explains itself.
    try {
      p.api.addEventListener?.('error', (e) => {
        const text = e?.message || e?.payload?.message || '';
        setError(/figure out what to play|not supported|drm|incognito|protected content/i.test(text)
          ? 'This browser cannot play protected video. Try Chrome, Edge or Safari, outside private browsing.'
          : text || 'The video stopped with an error.');
      });
    } catch { /* an older API without this event */ }

    // Captions arrive whenever the player has them; a video without any never answers.
    let alive = true;
    Promise.resolve(p.api.getCaptionLanguages?.()).then((c) => {
      if (!alive || !c) return;
      const languages = Array.isArray(c.languages) ? c.languages : [];
      setCaptions({ languages, visible: !!c.visible });
    }).catch(() => {});

    return () => {
      alive = false;
      for (const [name, fn] of listeners) vid.removeEventListener(name, fn);
      const t = vid.currentTime;
      if (t > 0) writePosition(videoId, t);
    };
  }, [ticket, videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Showing and hiding the chrome ──────────────────────────────────────
  const wake = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!dragging.current) setActive(false);
    }, HIDE_AFTER_MS);
  }, []);
  // Hide only while playing: a paused frame keeps its controls.
  useEffect(() => {
    if (playing && !menu) wake();
    else { clearTimeout(hideTimer.current); setActive(true); }
    return () => clearTimeout(hideTimer.current);
  }, [playing, menu, wake]);

  const say = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── 4. Actions ────────────────────────────────────────────────────────────
  const play = () => {
    const vid = v();
    if (!vid) return;
    if (resumeAt) {
      vid.currentTime = resumeAt;
      setResumeAt(0);
      say(`Picked up at ${formatTime(resumeAt)}`);
    }
    if (rate !== 1 && vid.playbackRate !== rate) vid.playbackRate = rate;
    vid.play?.();
    setStarted(true);
  };
  const startOver = () => {
    setResumeAt(0);
    setTime(0);
    clearPosition(videoId);
  };
  const pause = () => v()?.pause?.();
  const toggle = () => (playing ? pause() : play());
  const seekTo = (s) => {
    const vid = v();
    if (!vid) return;
    const t = clamp(s, 0, duration || s);
    vid.currentTime = t;
    setTime(t);
    if (ended && t < duration) setEnded(false);
  };
  const seekBy = (by) => {
    seekTo((v()?.currentTime ?? time) + by);
    wake();
  };
  const setVol = (n) => {
    const vid = v();
    if (!vid) return;
    const level = clamp(n, 0, 1);
    vid.volume = level;
    vid.muted = level === 0;
    setVolume(level);
    setMuted(level === 0);
  };
  const toggleMute = () => {
    const vid = v();
    if (!vid) return;
    const next = !muted;
    vid.muted = next;
    if (!next && volume === 0) { vid.volume = 0.6; setVolume(0.6); }
    setMuted(next);
  };
  const chooseRate = (r) => {
    const vid = v();
    if (vid) vid.playbackRate = r;
    setRate(r);
    writeRate(r);
    setMenu('');
    say(r === 1 ? 'Normal speed' : `${r}× speed`);
  };
  const chooseCaption = (lang) => {
    const a = player.current?.api;
    if (!a) return;
    if (lang == null) {
      a.hideCaptions?.();
      setCaptions((c) => ({ ...c, visible: false }));
    } else {
      a.setCaptionLanguage?.(lang);
      setCaptions((c) => ({ ...c, visible: true, current: lang }));
    }
    setMenu('');
  };
  const toggleCaptions = () => {
    if (!captions.languages.length) return;
    if (captions.visible) chooseCaption(null);
    else chooseCaption(captions.languages[0].language ?? captions.languages[0].id ?? captions.languages[0]);
  };
  const replay = () => { setResumeAt(0); seekTo(0); play(); };

  const toggleFullscreen = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement || fakeFull) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      setFakeFull(false);
      return;
    }
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFakeFull(true));
    } else {
      // iPhones have no element fullscreen: the frame fills the screen itself.
      setFakeFull(true);
    }
  };
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!fakeFull) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFakeFull(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [fakeFull]);

  const onKeyDown = (e) => {
    if (!ready) return;
    if (e.target.closest?.('[role="menu"], input')) return;
    const action = keyAction(e.key, { shift: e.shiftKey });
    if (!action) return;
    e.preventDefault();
    wake();
    switch (action.type) {
      case 'toggle': toggle(); break;
      case 'seek': seekBy(action.by); break;
      case 'seekTo': seekTo(action.fraction * duration); break;
      case 'volume': setVol((muted ? 0 : volume) + action.by); break;
      case 'mute': toggleMute(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'captions': toggleCaptions(); break;
      case 'rate': chooseRate(stepRate(rate, action.step)); break;
      default: break;
    }
  };

  // ── 5. The surface: tap to play, double-tap the sides to skip ────────────
  const onSurfaceClick = (e) => {
    if (!ready || menu) { setMenu(''); return; }
    if (touchDevice()) {
      const now = Date.now();
      const rect = root.current.getBoundingClientRect();
      const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
      if (now - lastTap.current.at < 320 && lastTap.current.side === side) {
        lastTap.current = { at: 0, side: '' };
        seekBy(side === 'left' ? -SKIP_SECONDS : SKIP_SECONDS);
        setNudge((n) => ({ side, n: (n?.side === side ? n.n : 0) + 1 }));
        clearTimeout(nudge?.timer);
        setTimeout(() => setNudge(null), 700);
        return;
      }
      lastTap.current = { at: now, side };
      // A single tap on a phone shows the controls first; a second starts it.
      if (!active && playing) { wake(); return; }
    }
    toggle();
    wake();
  };
  const onSurfaceDouble = () => { if (!touchDevice()) toggleFullscreen(); };

  // ── 6. The timeline ───────────────────────────────────────────────────────
  const bar = useRef(null);
  const fractionAt = (clientX) => {
    const rect = bar.current.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const onBarPointerDown = (e) => {
    if (!duration) return;
    e.preventDefault();
    dragging.current = true;
    bar.current.setPointerCapture?.(e.pointerId);
    const t = fractionAt(e.clientX) * duration;
    setTime(t);
    setScrub({ x: fractionAt(e.clientX), time: t });
  };
  const onBarPointerMove = (e) => {
    if (!duration) return;
    const f = fractionAt(e.clientX);
    setScrub({ x: f, time: f * duration });
    if (dragging.current) setTime(f * duration);
  };
  const onBarPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    seekTo(fractionAt(e.clientX) * duration);
    wake();
  };
  const onBarKey = (e) => {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-step); }
    if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(step); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const played = duration ? (time / duration) * 100 : 0;
  const loaded = duration ? (buffered / duration) * 100 : 0;
  const isFull = full || fakeFull;
  const showChrome = !error && ticket && ready;
  const idle = playing && !active && !menu;
  const volumeIcon = muted || volume === 0 ? I.muted : volume < 0.5 ? I.quiet : I.volume;

  return (
    <div
      ref={root}
      className={`vp ${idle ? 'is-idle' : ''} ${isFull ? 'is-full' : ''} ${fakeFull ? 'is-fake-full' : ''} ${started ? 'is-started' : ''} ${ended ? 'is-ended' : ''}`}
      tabIndex={0}
      role="region"
      aria-label={`Video: ${title}`}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => { if (playing && !menu) setActive(false); }}
    >
      {ticket && (
        <iframe
          ref={frame}
          key={`${videoId}-${attempt}`}
          className="vp-frame"
          src={`${PLAYER_ORIGIN}/v2/?otp=${encodeURIComponent(ticket.otp)}&playbackInfo=${encodeURIComponent(ticket.playbackInfo)}&controls=off&primaryColor=${accentHex()}`}
          title={title}
          // Widevine/FairPlay need encrypted-media; the rest is what playback
          // uses. No sandbox: the player runs its own DRM stack.
          allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          tabIndex={-1}
        />
      )}

      {/* Everything a pointer meets is ours; the frame underneath only plays. */}
      <div className="vp-surface" onClick={onSurfaceClick} onDoubleClick={onSurfaceDouble} />

      {/* While the ticket and the player are on their way. */}
      {!error && !ready && (
        <div className="vp-state vp-loading" aria-live="polite">
          <Spinner />
          <span>Starting the video…</span>
        </div>
      )}

      {/* The first frame: one invitation, in the accent. */}
      {showChrome && !started && !ended && (
        <>
          <button type="button" className="vp-big" onClick={play} aria-label={resumeAt ? `Play ${title} from ${formatTime(resumeAt)}` : `Play ${title}`}>
            <I.play size={34} />
          </button>
          {duration > 0 && <span className="vp-length" aria-hidden="true">{formatTime(duration)}</span>}
          {resumeAt > 0 && (
            <div className="vp-resume">
              <span>Picks up at {formatTime(resumeAt)}</span>
              <button type="button" className="vp-resume-reset" onClick={startOver}>Start over</button>
            </div>
          )}
        </>
      )}

      {showChrome && started && waiting && !ended && (
        <div className="vp-state vp-buffering" aria-hidden="true"><Spinner /></div>
      )}

      {/* Finished: say so, and offer what comes next. */}
      {showChrome && ended && (
        <div className="vp-end" role="group" aria-label="Finished">
          <div className="vp-end-mark"><I.check size={22} /></div>
          <div className="vp-end-title">You've finished this lesson.</div>
          <div className="vp-end-actions">
            <button type="button" className="vp-end-btn" onClick={replay}><I.replay size={18} /> Watch again</button>
            {upNext && (
              <button type="button" className="vp-end-btn is-primary" onClick={upNext.onPlay}>
                Next: <span className="vp-end-next">{upNext.title}</span> <I.next size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="vp-state vp-error" role="alert">
          <I.alert size={26} />
          <p>{error}</p>
          <button type="button" className="vp-end-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}

      {nudge && (
        <div className={`vp-nudge is-${nudge.side}`} aria-hidden="true">
          {nudge.side === 'left' ? <I.back size={28} /> : <I.forward size={28} />}
          <span>{nudge.n * SKIP_SECONDS} seconds</span>
        </div>
      )}

      {toast && <div className="vp-toast" role="status">{toast}</div>}

      {showChrome && (
        <>
          {isFull && <div className="vp-head"><span className="vp-head-title">{title}</span></div>}

          <div className="vp-chrome" onClick={(e) => e.stopPropagation()}>
            {/* The timeline. The whole strip is the target; the bar is the picture. */}
            <div
              ref={bar}
              className="vp-bar"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(time)}
              aria-valuetext={`${spokenTime(time)} of ${spokenTime(duration)}`}
              tabIndex={0}
              onKeyDown={onBarKey}
              onPointerDown={onBarPointerDown}
              onPointerMove={onBarPointerMove}
              onPointerUp={onBarPointerUp}
              onPointerCancel={() => { dragging.current = false; }}
              onPointerLeave={() => { if (!dragging.current) setScrub(null); }}
            >
              <div className="vp-track">
                <div className="vp-loaded" style={{ width: `${loaded}%` }} />
                <div className="vp-played" style={{ width: `${played}%` }} />
                {scrub && <div className="vp-scrub" style={{ left: `${scrub.x * 100}%` }} />}
              </div>
              <div className="vp-knob" style={{ left: `${played}%` }} />
              {scrub && duration > 0 && (
                <div className="vp-tip" style={{ left: `${scrub.x * 100}%` }}>{formatTime(scrub.time)}</div>
              )}
            </div>

            <div className="vp-row">
              <button type="button" className="vp-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (k)' : 'Play (k)'}>
                {playing ? <I.pause /> : <I.play />}
              </button>
              <button type="button" className="vp-btn vp-skip" onClick={() => seekBy(-SKIP_SECONDS)} aria-label={`Back ${SKIP_SECONDS} seconds`} title={`Back ${SKIP_SECONDS}s (j)`}><I.back /></button>
              <button type="button" className="vp-btn vp-skip" onClick={() => seekBy(SKIP_SECONDS)} aria-label={`Forward ${SKIP_SECONDS} seconds`} title={`Forward ${SKIP_SECONDS}s (l)`}><I.forward /></button>

              <div className="vp-volume">
                <button type="button" className="vp-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (m)' : 'Mute (m)'}>
                  {volumeIcon({})}
                </button>
                <input
                  className="vp-vol"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(Number(e.target.value))}
                  aria-label="Volume"
                  style={{ '--level': `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>

              <div className="vp-time" aria-hidden="true">
                <span>{formatTime(time)}</span>
                <span className="vp-time-sep">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="vp-spacer" />

              <div className="vp-menu-wrap">
                <button
                  type="button"
                  className={`vp-btn vp-rate ${rate !== 1 ? 'is-on' : ''}`}
                  onClick={() => setMenu(menu === 'rate' ? '' : 'rate')}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'rate'}
                  aria-label={`Speed, ${rate}×`}
                  title="Speed"
                >
                  {rate}×
                </button>
                {menu === 'rate' && (
                  <div className="vp-menu" role="menu" aria-label="Speed">
                    {RATES.map((r) => (
                      <button type="button" role="menuitemradio" aria-checked={r === rate} key={r} className={`vp-item ${r === rate ? 'is-on' : ''}`} onClick={() => chooseRate(r)}>
                        {r === 1 ? 'Normal' : `${r}×`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {captions.languages.length > 0 && (
                <div className="vp-menu-wrap">
                  <button
                    type="button"
                    className={`vp-btn ${captions.visible ? 'is-on' : ''}`}
                    onClick={() => (captions.languages.length === 1 ? toggleCaptions() : setMenu(menu === 'captions' ? '' : 'captions'))}
                    aria-pressed={captions.visible}
                    aria-label="Captions"
                    title="Captions (c)"
                  >
                    <I.captions />
                  </button>
                  {menu === 'captions' && (
                    <div className="vp-menu" role="menu" aria-label="Captions">
                      <button type="button" role="menuitemradio" aria-checked={!captions.visible} className={`vp-item ${!captions.visible ? 'is-on' : ''}`} onClick={() => chooseCaption(null)}>Off</button>
                      {captions.languages.map((l, i) => {
                        const id = l.language ?? l.id ?? l;
                        const label = l.label ?? l.name ?? l.language ?? String(l);
                        const on = captions.visible && (captions.current ?? captions.languages[0]) === id;
                        return (
                          <button type="button" role="menuitemradio" aria-checked={on} key={`${id}-${i}`} className={`vp-item ${on ? 'is-on' : ''}`} onClick={() => chooseCaption(id)}>{label}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button type="button" className="vp-btn" onClick={toggleFullscreen} aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'} title={isFull ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}>
                {isFull ? <I.exit /> : <I.enter />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
