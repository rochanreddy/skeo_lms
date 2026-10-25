import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Port 5175 keeps skeo clear of both the marketing site (5173) and the old LMS (5174).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  server: { port: 5175 },
});
