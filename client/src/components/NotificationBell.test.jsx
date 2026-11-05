import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from './NotificationBell.jsx';
import { clearApiCache } from '../api.js';
import { pushState } from '../pwa.js';
import { fakeServer } from '../test/server.js';

vi.mock('../pwa.js', () => ({ pushState: vi.fn() }));

const MINUTE = 60_000;

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function mount() {
  const server = fakeServer({ '/notifications': { items: [], unread: 2 } });
  render(<MemoryRouter><NotificationBell /></MemoryRouter>);
  await act(() => vi.advanceTimersByTimeAsync(0));
  server.mockClear();
  return server;
}

// The API's 5s GET cache is real, and would absorb polls in a test that jumps
// the clock without letting anything else run.
const advance = (ms) => act(async () => { clearApiCache(); await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
  pushState.mockResolvedValue('off');
});

describe('how often the bell asks', () => {
  it('every 45 seconds when nothing else will tell it', async () => {
    const server = await mount();
    await advance(44_000);
    expect(server).not.toHaveBeenCalled();
    await advance(2_000);
    expect(server).toHaveBeenCalledOnce();
    await advance(MINUTE + 30_000);
    expect(server).toHaveBeenCalledTimes(3);
  });

  it('every two minutes when push is on, since push tells it the moment something arrives', async () => {
    pushState.mockResolvedValue('on');
    const server = await mount();
    await advance(MINUTE + 30_000);
    expect(server).not.toHaveBeenCalled();
    await advance(31_000);
    expect(server).toHaveBeenCalledOnce();
  });

  it('falls back to the brisk interval if push state cannot be read', async () => {
    pushState.mockRejectedValue(new Error('no service worker'));
    const server = await mount();
    await advance(46_000);
    expect(server).toHaveBeenCalledOnce();
  });
});

describe('a tab nobody is looking at', () => {
  it('stops asking', async () => {
    const server = await mount();
    await act(async () => setVisibility('hidden'));
    await advance(10 * MINUTE);
    expect(server).not.toHaveBeenCalled();
  });

  it('catches up the moment it is looked at again', async () => {
    const server = await mount();
    await act(async () => setVisibility('hidden'));
    await advance(10 * MINUTE);
    await act(async () => { setVisibility('visible'); await vi.advanceTimersByTimeAsync(0); });
    expect(server).toHaveBeenCalledOnce();
  });

  it('does not pile up a second timer for every return', async () => {
    const server = await mount();
    for (let i = 0; i < 4; i += 1) {
      await act(async () => setVisibility('hidden'));
      await act(async () => setVisibility('visible'));
    }
    await act(() => vi.advanceTimersByTimeAsync(0));
    server.mockClear();
    await advance(46_000);
    expect(server).toHaveBeenCalledOnce();
  });
});

it('stops polling when it goes away', async () => {
  const server = fakeServer({ '/notifications': { items: [], unread: 0 } });
  const { unmount } = render(<MemoryRouter><NotificationBell /></MemoryRouter>);
  await act(() => vi.advanceTimersByTimeAsync(0));
  unmount();
  server.mockClear();
  await vi.advanceTimersByTimeAsync(10 * MINUTE);
  expect(server).not.toHaveBeenCalled();
});
