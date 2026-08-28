import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Port 5175 keeps skeo clear of both the marketing site (5173) and the old LMS (5174).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn components are generated with `@/` imports; keep the alias in step
    // with the `paths` entry in jsconfig.json so the CLI and Vite agree.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: 5175 },
});
