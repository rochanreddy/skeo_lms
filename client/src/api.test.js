import { describe, expect, it, vi } from 'vitest';
import { api, clearApiCache, getCachedUser, getRefreshToken, getToken, setCachedUser, setToken } from './api.js';
import { fakeServer, json, offline, signIn, student } from './test/server.js';

describe('the remembered session', () => {
  it('describes nobody without a token, whatever is left in storage', () => {
    localStorage.setItem('skeo_user', JSON.stringify(student));
    expect(getCachedUser()).toBeNull();
  });

  it('returns the record while a session exists', () => {
    signIn(student);
    expect(getCachedUser()).toEqual(student);
  });

  it.each([['not json', '{oops'], ['no role', '{"id":"u1"}'], ['no id', '{"role":"student"}'], ['null', 'null']])(
    'ignores a damaged record (%s)',
    (_label, raw) => {
      signIn();
      localStorage.setItem('skeo_user', raw);
      expect(getCachedUser()).toBeNull();
    },
  );

  it('survives storage that refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => setCachedUser(student)).not.toThrow();
  });

  it('goes with the session, so a shared phone does not greet the next person by name', () => {
    signIn(student, { refresh: true });
    setToken('');
    expect(getToken()).toBe('');
    expect(getRefreshToken()).toBe('');
    expect(localStorage.getItem('skeo_user')).toBeNull();
  });

  it('announces the end of a session', () => {
    const heard = vi.fn();
    window.addEventListener('skeo:signed-out', heard);
    setToken('');
    window.removeEventListener('skeo:signed-out', heard);
    expect(heard).toHaveBeenCalledOnce();
  });
});

describe('sharing GETs', () => {
  it('lets concurrent callers share one request', async () => {
    const server = fakeServer({ '/programs': { programs: [] } });
    await Promise.all([api('/programs'), api('/programs'), api('/programs')]);
    expect(server).toHaveBeenCalledOnce();
  });

  it('reuses an answer for five seconds, then asks again', async () => {
    vi.useFakeTimers();
    const server = fakeServer({ '/programs': { programs: [] } });
    await api('/programs');
    vi.advanceTimersByTime(4900);
    await api('/programs');
    expect(server).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    await api('/programs');
    expect(server).toHaveBeenCalledTimes(2);
  });

  it('forgets everything after a write', async () => {
    const server = fakeServer({ '/programs': { programs: [] }, 'POST /progress/toggle': { ok: true } });
    await api('/programs');
    await api('/progress/toggle', { method: 'POST', body: {} });
    await api('/programs');
    expect(server.paths()).toEqual(['/programs', '/progress/toggle', '/programs']);
  });

  it('does not remember a failure', async () => {
    const server = fakeServer({ '/programs': [json({ error: 'Nope.' }, 500), { programs: [] }] });
    await expect(api('/programs')).rejects.toThrow('Nope.');
    await expect(api('/programs')).resolves.toEqual({ programs: [] });
    expect(server).toHaveBeenCalledTimes(2);
  });

  it('never serves one account the answers read as another', async () => {
    const server = fakeServer({ '/me': { user: student } });
    await api('/me');
    setToken('someone-else');
    await api('/me');
    expect(server).toHaveBeenCalledTimes(2);
  });
});

describe('errors', () => {
  it('says which status the server answered with', async () => {
    fakeServer({ '/me': json({ error: 'Slow down.' }, 429) });
    await expect(api('/me')).rejects.toMatchObject({ http: true, status: 429, message: 'Slow down.' });
  });

  it('marks a request that never arrived as not an answer', async () => {
    vi.useFakeTimers();
    fakeServer({ '/me': offline });
    const failed = api('/me').catch((e) => e);
    await vi.runAllTimersAsync();
    const e = await failed;
    expect(e.http).toBeUndefined();
    expect(e.status).toBeUndefined();
  });
});

describe('retries', () => {
  it('retries a GET that never landed', async () => {
    vi.useFakeTimers();
    const server = fakeServer({ '/me': [offline, offline, { user: student }] });
    const answer = api('/me');
    await vi.runAllTimersAsync();
    await expect(answer).resolves.toEqual({ user: student });
    expect(server).toHaveBeenCalledTimes(3);
  });

  it.each([502, 503, 504])('retries a GET the proxy answered %i for: the API behind it is restarting', async (status) => {
    vi.useFakeTimers();
    const server = fakeServer({ '/me': [json({}, status), { user: student }] });
    const answer = api('/me');
    await vi.runAllTimersAsync();
    await expect(answer).resolves.toEqual({ user: student });
    expect(server).toHaveBeenCalledTimes(2);
  });

  it('never replays a write, which may already have been applied', async () => {
    const server = fakeServer({ 'POST /batches': offline });
    await expect(api('/batches', { method: 'POST', body: {} })).rejects.toThrow('Failed to fetch');
    expect(server).toHaveBeenCalledOnce();
  });

  it('does not retry a 500: that one is a real answer', async () => {
    const server = fakeServer({ '/me': json({ error: 'Broken.' }, 500) });
    await expect(api('/me')).rejects.toThrow('Broken.');
    expect(server).toHaveBeenCalledOnce();
  });
});

describe('renewing an expired token', () => {
  it('renews once and replays the request', async () => {
    signIn(student, { refresh: true });
    const server = fakeServer({
      '/me': [json({ error: 'Not authenticated.' }, 401), { user: student }],
      'POST /auth/refresh': { accessToken: 'new-token' },
    });
    await expect(api('/me')).resolves.toEqual({ user: student });
    expect(getToken()).toBe('new-token');
    expect(server.paths()).toEqual(['/me', '/auth/refresh', '/me']);
  });

  it('mints one token between a burst of expired requests', async () => {
    signIn(student, { refresh: true });
    const expired = () => (getToken() === 'new-token' ? json({}) : json({ error: 'Not authenticated.' }, 401));
    const server = fakeServer({
      '/a': expired,
      '/b': expired,
      '/c': expired,
      'POST /auth/refresh': { accessToken: 'new-token' },
    });
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(server.paths().filter((p) => p === '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the refresh token is refused', async () => {
    signIn(student, { refresh: true });
    fakeServer({
      '/me': json({ error: 'Not authenticated.' }, 401),
      'POST /auth/refresh': json({ error: 'Session expired.' }, 401),
    });
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBe('');
  });

  it('keeps the session when the renewal itself could not get through', async () => {
    signIn(student, { refresh: true });
    fakeServer({ '/me': json({ error: 'Not authenticated.' }, 401), 'POST /auth/refresh': offline });
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(getRefreshToken()).toBe('refresh-token');
  });

  it('treats a 401 from /auth/* as a wrong password, not a stale token', async () => {
    signIn(student, { refresh: true });
    const server = fakeServer({ 'POST /auth/login': json({ error: 'Wrong password.' }, 401) });
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toThrow('Wrong password.');
    expect(server).toHaveBeenCalledOnce();
  });

  it('broadcasts a block so the whole app can stop', async () => {
    const heard = vi.fn();
    window.addEventListener('skeo:blocked', heard);
    fakeServer({ '/me': json({ error: 'Blocked.', code: 'blocked' }, 403) });
    await expect(api('/me')).rejects.toMatchObject({ code: 'blocked' });
    window.removeEventListener('skeo:blocked', heard);
    expect(heard).toHaveBeenCalledOnce();
    expect(heard.mock.calls[0][0].detail.message).toBe('Blocked.');
  });
});

it('clearApiCache drops requests already in flight, so a sign-out cannot be answered by them', async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const server = fakeServer({ '/me': [() => first, { user: student }] });
  const stale = api('/me');
  clearApiCache();
  await api('/me');
  expect(server).toHaveBeenCalledTimes(2);
  release(json({ user: { id: 'old', role: 'admin' } }));
  await stale;
});
