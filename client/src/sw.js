/* The service worker. Built by vite-plugin-pwa (see vite.config.js), which
   fills in self.__WB_MANIFEST with every file of the build.

   What it does, and deliberately does not do:
   · keeps the app's own files on the device, so launching is instant and the
     app still opens with no connection
   · never touches the API. Grades, progress and sign-in are per-student and
     must be live, and they live on another origin anyway -- requests it has no
     route for go straight to the network
   · shows push notifications and opens the right screen when one is tapped */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every page of the app is index.html; React Router takes it from there. So a
// deep link (/app/grades) opens offline too, instead of the browser's error.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

const sameOrigin = (url) => url.origin === self.location.origin;

// Build files left out of the precache (the PDF reader). Hashed names, so a
// cached copy can never be stale -- a new build has a new name.
registerRoute(
  ({ url }) => sameOrigin(url) && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'skeo-assets',
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 3600 })],
  }),
);

// Course PDFs: open from the device, refresh in the background, because the
// file can be rebuilt under the same name.
registerRoute(
  ({ url }) => sameOrigin(url) && url.pathname.startsWith('/pdfs/'),
  new StaleWhileRevalidate({
    cacheName: 'skeo-pdfs',
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 10 })],
  }),
);

// The first install takes over the open tab straight away. Later versions
// wait until the student presses Refresh, which posts SKIP_WAITING.
clientsClaim();
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push ──────────────────────────────────────────────────────────────────
// Payload from server/utils/push.js: { title, body, url, type }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || '' }; }

  event.waitUntil((async () => {
    // Always shown, even with the app open: browsers penalise a push that
    // shows nothing (Safari drops the subscription after a few).
    await self.registration.showNotification(data.title || 'skeo', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: data.url || '/app' },
    });
    // A dot on the home-screen icon; the bell sets the exact count once the
    // app is open.
    if (self.navigator.setAppBadge) self.navigator.setAppBadge().catch(() => {});
    // An open window refreshes its bell now rather than at the next poll.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'skeo:push' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL(event.notification.data?.url || '/app', self.location.origin);
  if (!sameOrigin(url)) url = new URL('/app', self.location.origin);

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => sameOrigin(new URL(w.url)));
    if (win) {
      // Already open: bring it forward and let React Router move it, which
      // keeps the session and skips a full reload.
      await win.focus();
      win.postMessage({ type: 'skeo:navigate', url: url.pathname + url.search + url.hash });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
