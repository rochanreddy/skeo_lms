import { vi } from 'vitest';

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

/** What fetch does when the request never reaches anything. */
export const offline = () => { throw new TypeError('Failed to fetch'); };

/**
 * Stand in for the API. `routes` maps 'METHOD /path' (or '/path' for GET) to a
 * Response, a function returning one, or an array consumed one call at a time.
 * Anything unlisted is a 404, so a test only names what it cares about.
 * Returns the mock; `.paths()` lists what was actually asked for, in order.
 */
export function fakeServer(routes = {}) {
  const queues = new Map();
  const mock = vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^.*\/api\/skeo/, '');
    const method = init.method || 'GET';
    const key = `${method} ${path}` in routes ? `${method} ${path}` : path;
    let route = method === 'GET' || key.startsWith(method) ? routes[key] : undefined;
    if (Array.isArray(route)) {
      if (!queues.has(key)) queues.set(key, [...route]);
      route = queues.get(key).length > 1 ? queues.get(key).shift() : queues.get(key)[0];
    }
    if (route === undefined) return json({ error: 'Not found.' }, 404);
    const answer = typeof route === 'function' ? await route(init) : route;
    return answer instanceof Response ? answer.clone() : json(answer);
  });
  mock.paths = () => mock.mock.calls.map(([url]) => String(url).replace(/^.*\/api\/skeo/, ''));
  vi.stubGlobal('fetch', mock);
  return mock;
}

export const signIn = (user, { refresh = false } = {}) => {
  localStorage.setItem('skeo_token', 'access-token');
  if (refresh) localStorage.setItem('skeo_refresh', 'refresh-token');
  if (user) localStorage.setItem('skeo_user', JSON.stringify(user));
};

export const student = { id: 'u1', role: 'student', fullName: 'Asha Rao', email: 'asha@example.test' };
