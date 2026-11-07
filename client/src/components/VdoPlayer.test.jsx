import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiCache } from '../api.js';
import { fakeServer, json, signIn, student } from '../test/server.js';
import VdoPlayer from './VdoPlayer.jsx';

/* A stand-in for VdoCipher's player: an event target that remembers what it
 * was told, so a test can press the controls and read what reached the video. */
function fakePlayer() {
  const target = new EventTarget();
  const video = {
    paused: true, currentTime: 0, duration: 300, volume: 1, muted: false, playbackRate: 1, buffered: [{ start: 0, end: 40 }],
    play: vi.fn(() => { video.paused = false; target.dispatchEvent(new Event('play')); }),
    pause: vi.fn(() => { video.paused = true; target.dispatchEvent(new Event('pause')); }),
    addEventListener: (n, f) => target.addEventListener(n, f),
    removeEventListener: (n, f) => target.removeEventListener(n, f),
  };
  const api = { getCaptionLanguages: vi.fn(() => new Promise(() => {})), setCaptionLanguage: vi.fn(), hideCaptions: vi.fn() };
  const fire = (name) => act(() => { target.dispatchEvent(new Event(name)); });
  return { video, api, fire };
}

let fake;
const OTP = 'POST /videos/vid1/otp';

function show(props = {}) {
  const server = fakeServer({ [OTP]: { otp: 'o', playbackInfo: 'p', ttl: 300 } });
  render(<VdoPlayer videoId="vid1" title="1.1 · What Generative AI Actually Is" {...props} />);
  return server;
}
const ready = async () => {
  await screen.findByRole('button', { name: /^Play 1\.1/ });
  fake.fire('durationchange');
};

beforeEach(() => {
  signIn(student);
  clearApiCache();
  fake = fakePlayer();
  vi.stubGlobal('VdoPlayer', { getInstance: vi.fn(() => ({ video: fake.video, api: fake.api })) });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe('getting a video on screen', () => {
  it('asks for a ticket and hands it to the player with its own controls off', async () => {
    const server = show();
    await ready();
    expect(server.paths()).toContain('/videos/vid1/otp');
    const frame = document.querySelector('iframe.vp-frame');
    expect(frame.src).toContain('player.vdocipher.com/v2/?otp=o&playbackInfo=p&controls=off');
    expect(frame.getAttribute('allow')).toContain('encrypted-media');
  });

  it('says what went wrong and offers another go', async () => {
    fakeServer({ [OTP]: json({ error: 'Video not found.' }, 404) });
    render(<VdoPlayer videoId="vid1" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Video not found.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the length once the player knows it', async () => {
    show();
    await ready();
    expect(document.querySelector('.vp-time').textContent).toBe('0:00/5:00');
  });
});

describe('playing', () => {
  it('starts from the big button and follows the video from there', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Play 1\.1/ }));
    expect(fake.video.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Play 1\.1/ })).toBeNull();

    fake.video.currentTime = 83;
    fake.fire('timeupdate');
    expect(document.querySelector('.vp-time').textContent).toBe('1:23/5:00');
    expect(document.querySelector('.vp-played').style.width).toBe(`${(83 / 300) * 100}%`);
  });

  it('skips, from the buttons and the keys', async () => {
    show();
    await ready();
    fake.video.currentTime = 100;
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(fake.video.currentTime).toBe(110);
    fireEvent.keyDown(document.querySelector('.vp'), { key: 'j' });
    expect(fake.video.currentTime).toBe(100);
    fireEvent.keyDown(document.querySelector('.vp'), { key: '5' });
    expect(fake.video.currentTime).toBe(150);
    fireEvent.keyDown(document.querySelector('.vp'), { key: 'Home' });
    expect(fake.video.currentTime).toBe(0);
  });

  it('answers the space bar and m like every player', async () => {
    show();
    await ready();
    const el = document.querySelector('.vp');
    fireEvent.keyDown(el, { key: ' ' });
    expect(fake.video.play).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: ' ' });
    expect(fake.video.pause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(el, { key: 'm' });
    expect(fake.video.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  });

  it('changes speed from the menu and remembers it', async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /^Speed/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '1.5×' }));
    expect(fake.video.playbackRate).toBe(1.5);
    expect(localStorage.getItem('skeo_vrate')).toBe('1.5');
    expect(screen.getByRole('button', { name: 'Speed, 1.5×' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('applies the remembered speed once the video can take it, and again on play', async () => {
    localStorage.setItem('skeo_vrate', '1.25');
    show();
    await ready();
    expect(fake.video.playbackRate).toBe(1); // not yet: the player would drop it
    fake.fire('canplay');
    expect(fake.video.playbackRate).toBe(1.25);
    fake.video.playbackRate = 1; // the player forgot it
    fireEvent.click(screen.getByRole('button', { name: /^Play 1\.1/ }));
    expect(fake.video.playbackRate).toBe(1.25);
  });
});

describe('picking up and finishing', () => {
  it('offers to pick a lesson up in the middle, and does so on play', async () => {
    localStorage.setItem('skeo_vpos:vid1', '120');
    show();
    await ready();
    expect(screen.getByText('Picks up at 2:00')).toBeTruthy();
    expect(document.querySelector('.vp-time').textContent).toBe('2:00/5:00');
    expect(fake.video.currentTime).toBe(0); // the seek waits for play
    fireEvent.click(screen.getByRole('button', { name: /^Play 1\.1 .* from 2:00/ }));
    expect(fake.video.currentTime).toBe(120);
    expect(fake.video.play).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Picked up at 2:00');
  });

  it('can start over instead', async () => {
    localStorage.setItem('skeo_vpos:vid1', '120');
    show();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.queryByText(/Picks up at/)).toBeNull();
    expect(localStorage.getItem('skeo_vpos:vid1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Play 1\.1/ }));
    expect(fake.video.currentTime).toBe(0);
  });

  it('starts over when the lesson was all but finished', async () => {
    localStorage.setItem('skeo_vpos:vid1', '295');
    show();
    await ready();
    expect(screen.queryByText(/Picks up at/)).toBeNull();
  });

  it('keeps the position as it plays, and forgets it at the end', async () => {
    show();
    await ready();
    fake.video.currentTime = 42;
    fake.fire('timeupdate');
    expect(localStorage.getItem('skeo_vpos:vid1')).toBe('42');
    fake.fire('ended');
    expect(localStorage.getItem('skeo_vpos:vid1')).toBeNull();
  });

  it('offers the next lesson at the end, and a replay', async () => {
    const onPlay = vi.fn();
    const onEnded = vi.fn();
    show({ upNext: { title: '1.2 · Tokens', onPlay }, onEnded });
    await ready();
    fake.fire('ended');
    expect(screen.getByText("You've finished this lesson.")).toBeTruthy();
    expect(onEnded).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Next: 1\.2/ }));
    expect(onPlay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Watch again' }));
    expect(fake.video.currentTime).toBe(0);
    expect(fake.video.play).toHaveBeenCalled();
  });

  it('shows no next lesson when there is none to offer', async () => {
    show({ upNext: null });
    await ready();
    fake.fire('ended');
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Watch again' })).toBeTruthy();
  });
});

describe('captions', () => {
  it('appear only when the video has some', async () => {
    fake.api.getCaptionLanguages = vi.fn(() => Promise.resolve({ visible: false, languages: [{ language: 'en', label: 'English' }] }));
    show();
    await ready();
    const cc = await screen.findByRole('button', { name: 'Captions' });
    fireEvent.click(cc);
    expect(fake.api.setCaptionLanguage).toHaveBeenCalledWith('en');
    fireEvent.click(cc);
    expect(fake.api.hideCaptions).toHaveBeenCalled();
  });

  it('stay out of the way otherwise', async () => {
    show();
    await ready();
    expect(screen.queryByRole('button', { name: 'Captions' })).toBeNull();
  });
});
