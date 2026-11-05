import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { getToken } from './api.js';
import { fakeServer, json, offline, signIn, student } from './test/server.js';

// App's job here is deciding who you are and which screen that means. What is
// inside each screen has its own tests, and rendering them all would only make
// these slower and vaguer.
vi.mock('./components/AppShell.jsx', () => ({
  default: ({ user, logout }) => (
    <div>
      <p>dashboard for {user.fullName}</p>
      <button type="button" onClick={logout}>log out</button>
    </div>
  ),
}));
vi.mock('./pages/Login.jsx', () => ({ default: () => <p>sign-in screen</p> }));
vi.mock('./pages/Blocked.jsx', () => ({ default: ({ message }) => <p>stopped: {message}</p> }));
vi.mock('./pages/ForcePasswordChange.jsx', () => ({ default: () => <p>choose a password</p> }));
vi.mock('./components/PwaPrompts.jsx', () => ({ default: () => null }));

const open = () => render(<MemoryRouter initialEntries={['/app']}><App /></MemoryRouter>);
const flush = () => act(() => new Promise((r) => { setTimeout(r, 0); }));

describe('arriving', () => {
  it('sends someone with no session to sign in', async () => {
    const server = fakeServer();
    open();
    expect(await screen.findByText('sign-in screen')).toBeTruthy();
    expect(server).not.toHaveBeenCalled();
  });

  it('paints a returning student before /me has answered', async () => {
    signIn(student);
    fakeServer({ '/me': () => new Promise(() => {}) }); // never answers
    open();
    expect(await screen.findByText('dashboard for Asha Rao')).toBeTruthy();
  });

  it('holds on the skeleton when it knows nothing about the session yet', async () => {
    signIn();
    fakeServer({ '/me': () => new Promise(() => {}) });
    const { container } = open();
    await flush();
    expect(container.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByText('sign-in screen')).toBeNull();
  });

  it('lets the server correct a stale remembered record', async () => {
    signIn(student);
    fakeServer({ '/me': { user: { ...student, fullName: 'Asha R. Menon' } } });
    open();
    expect(await screen.findByText('dashboard for Asha R. Menon')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('skeo_user')).fullName).toBe('Asha R. Menon');
  });

  it('remembers who signed in, for the next launch', async () => {
    signIn();
    fakeServer({ '/me': { user: student } });
    open();
    await screen.findByText('dashboard for Asha Rao');
    expect(JSON.parse(localStorage.getItem('skeo_user'))).toEqual(student);
  });

  it('forces a password change before anything else', async () => {
    signIn({ ...student, must_change_password: true });
    fakeServer({ '/me': () => new Promise(() => {}) });
    open();
    expect(await screen.findByText('choose a password')).toBeTruthy();
  });
});

describe('what ends a session', () => {
  it('a 401 with nothing left to renew it', async () => {
    signIn(student);
    fakeServer({ '/me': json({ error: 'Not authenticated.' }, 401) });
    open();
    expect(await screen.findByText('sign-in screen')).toBeTruthy();
    expect(getToken()).toBe('');
    expect(localStorage.getItem('skeo_user')).toBeNull();
  });

  it('a refresh token the server refuses', async () => {
    signIn(student, { refresh: true });
    fakeServer({
      '/me': json({ error: 'Not authenticated.' }, 401),
      'POST /auth/refresh': json({ error: 'Session expired.' }, 401),
    });
    open();
    expect(await screen.findByText('sign-in screen')).toBeTruthy();
  });

  it('a refresh refused mid-session, on any later request', async () => {
    signIn(student, { refresh: true });
    fakeServer({ '/me': { user: student } });
    open();
    await screen.findByText('dashboard for Asha Rao');
    // Some screen's request has found the session dead: api.js ends it.
    await act(async () => { localStorage.removeItem('skeo_refresh'); window.dispatchEvent(new Event('skeo:signed-out')); });
    expect(await screen.findByText('sign-in screen')).toBeTruthy();
  });

  it('signing out', async () => {
    signIn(student, { refresh: true });
    fakeServer({ '/me': { user: student } });
    open();
    (await screen.findByText('log out')).click();
    expect(await screen.findByText('sign-in screen')).toBeTruthy();
    expect(getToken()).toBe('');
  });
});

describe('what does not end a session', () => {
  it('having no connection: the installed app promises to open offline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn(student);
    fakeServer({ '/me': offline });
    open();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText('dashboard for Asha Rao')).toBeTruthy();
    expect(getToken()).toBe('access-token');
  });

  it.each([
    [500, 'the API threw'],
    [502, 'Render is deploying'],
    [503, 'the instance is restarting'],
    [504, 'the proxy gave up waiting'],
    [429, 'the rate limiter said slow down'],
  ])('a %i, because %s', async (status) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn(student);
    fakeServer({ '/me': json({ error: 'Temporarily unavailable.' }, status) });
    open();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText('dashboard for Asha Rao')).toBeTruthy();
    expect(getToken()).toBe('access-token');
  });

  it('an expired token whose renewal could not get through', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn(student, { refresh: true });
    fakeServer({ '/me': json({ error: 'Not authenticated.' }, 401), 'POST /auth/refresh': offline });
    open();
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByText('dashboard for Asha Rao')).toBeTruthy();
    expect(localStorage.getItem('skeo_refresh')).toBe('refresh-token');
  });
});

describe('being blocked', () => {
  it('honours a remembered block at once, before the server is asked', async () => {
    signIn({ ...student, blocked: { lms: true, reason: 'fees' } });
    fakeServer({ '/me': () => new Promise(() => {}) });
    open();
    expect(await screen.findByText('stopped: Your account has been blocked: fees')).toBeTruthy();
  });

  it('does not trust a remembered absence of one', async () => {
    signIn(student);
    fakeServer({ '/me': json({ error: 'Blocked by an admin.', code: 'blocked' }, 403) });
    open();
    expect(await screen.findByText('stopped: Blocked by an admin.')).toBeTruthy();
  });

  it('lifts a stale block when the server says it has gone', async () => {
    signIn({ ...student, blocked: { lms: true } });
    fakeServer({ '/me': { user: student } });
    open();
    expect(await screen.findByText('dashboard for Asha Rao')).toBeTruthy();
  });

  it('stops a session already open when a later request is refused', async () => {
    signIn(student);
    fakeServer({ '/me': { user: student } });
    open();
    await screen.findByText('dashboard for Asha Rao');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('skeo:blocked', { detail: { message: 'Blocked just now.' } }));
    });
    expect(await screen.findByText('stopped: Blocked just now.')).toBeTruthy();
  });

  it('keeps the stop page when the block arrived through a refused refresh', async () => {
    signIn(student, { refresh: true });
    fakeServer({
      '/me': json({ error: 'Not authenticated.' }, 401),
      'POST /auth/refresh': json({ error: 'Blocked at renewal.', code: 'blocked' }, 403),
    });
    open();
    expect(await screen.findByText('stopped: Blocked at renewal.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('sign-in screen')).toBeNull());
  });
});
