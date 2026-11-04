import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/* Open the connection to the API before anything needs it.
 *
 * The API lives on another origin (Render, in Singapore) and the app's very
 * first act after the bundle runs is to ask it /me -- which is what decides
 * whether a dashboard or the sign-in screen gets rendered. Nothing can paint
 * until that answers, and before the request can even be sent the browser has
 * to resolve the hostname, open a TCP connection and negotiate TLS: three
 * round trips, discovered only at the moment the bundle calls fetch(). On a
 * phone on Indian mobile data that is a few hundred milliseconds of a blank
 * screen with nothing happening on the wire.
 *
 * A preconnect in the <head> starts that handshake while the HTML is still
 * being read, in parallel with the CSS and JS downloads, so by the time the
 * app asks for /me the pipe is already open. crossorigin is not optional: an
 * authenticated fetch() is a CORS request and uses a separate connection pool,
 * so a preconnect without it warms a connection the request cannot reuse.
 *
 * The origin comes from the same VITE_API_URL the app itself reads, so the two
 * cannot drift. Nothing is injected when the API is same-origin or local --
 * there is no handshake to save.
 */
function preconnectApi(mode) {
  const { VITE_API_URL } = loadEnv(mode, process.cwd(), '');
  let origin = null;
  try {
    const u = new URL(VITE_API_URL);
    if (u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) origin = u.origin;
  } catch { /* unset or not a URL: nothing to preconnect to */ }

  return {
    name: 'skeo-preconnect-api',
    transformIndexHtml() {
      if (!origin) return [];
      return [
        // dns-prefetch first, for anything that ignores the preconnect.
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: origin }, injectTo: 'head-prepend' },
        { tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' },
      ];
    },
  };
}

// Port 5175 keeps skeo clear of both the marketing site (5173) and the old LMS (5174).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preconnectApi(mode),
    // The installable app: a manifest, and a service worker (src/sw.js) that
    // keeps the app's own files on the device and shows push notifications.
    // It is only built into `vite build` -- run `npm run build && npm run
    // preview` to try it locally; `npm run dev` has no service worker.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // A new version waits for the student to press Refresh (PwaPrompts.jsx):
      // reloading by itself could throw away a half-written submission.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        // Every file of this build, so the version on the device is always
        // whole. Two exceptions: the PDF reader (1.7 MB, and only some people
        // ever open a PDF -- cached on first use instead) and the course PDFs.
        globPatterns: ['**/*.{js,mjs,css,html,woff2,png,svg,webp}'],
        globIgnores: ['**/pdf.min-*.js', '**/pdf.worker.min-*.mjs', 'pdfs/**'],
      },
      manifest: {
        id: '/app',
        name: 'skeo LMS',
        short_name: 'skeo',
        description: 'Your skeo courses, grades and masterclasses.',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        background_color: '#fafaf7',
        theme_color: '#fafaf7',
        lang: 'en',
        categories: ['education'],
        // Lets /install ask Chrome whether skeo is already on this phone.
        related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    // shadcn components are generated with `@/` imports; keep the alias in step
    // with the `paths` entry in jsconfig.json so the CLI and Vite agree.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        /* The framework in its own file, so a deploy does not re-download it.
         *
         * React, React DOM and React Router are about four fifths of the entry
         * chunk and they change when we upgrade them, which is roughly never.
         * Our own code changes on every deploy. Bundled together, every deploy
         * gave the file a new hash, and every student on every device fetched
         * the whole thing again -- 87 KB over the wire to deliver a few
         * kilobytes of changed app code, with the service worker then
         * precaching the new copy too.
         *
         * Split, a deploy invalidates only the app chunk. The framework stays
         * in the HTTP cache (immutable, a year -- see vercel.json) and in the
         * precache, across every deploy until we actually upgrade React.
         *
         * They go in ONE chunk rather than three on purpose: all three are
         * needed before the first paint, so splitting them further would only
         * add requests, and react-dom reaching into react across a chunk
         * boundary is how circular-import bugs start.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const n = id.replace(/\\/g, '/');
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(n)) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: { port: 5175 },
}));
