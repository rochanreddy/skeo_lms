import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5175 keeps skeo clear of both the marketing site (5173) and the old LMS (5174).
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
});
