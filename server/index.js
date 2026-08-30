// Load .env FIRST so every module below sees process.env at import time.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import { connectDb } from './db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();
const port = Number(process.env.PORT || 4200); // 4200 is Skeo's own port -- 4100 belongs to menler-lms, 4000 to the marketing API.

// The API runs behind a TLS-terminating proxy in production, so req.protocol and
// req.ip are only truthful once the forwarding headers are trusted.
app.set('trust proxy', 1);

// CORS allowlist — the frontend calls this API cross-origin. The production
// origin comes from SKEO_APP_URL: this fork has no domain of its own yet, so
// there is deliberately no hard-coded one to fall back to. Bearer tokens (no
// cookies) keep this simple.
const normalizeOrigin = (s) => (s || '').trim().replace(/\/+$/, '');
const allowedOrigins = new Set(
  [process.env.SKEO_APP_URL, 'http://localhost:5175']
    .flatMap((v) => (v ? v.split(',') : []))
    .map(normalizeOrigin)
    .filter(Boolean),
);

app.use(express.json());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return cb(null, true);
      return cb(null, false);
    },
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/skeo', routes);

// Errors last: an unmatched path is a 404, and anything a route throws lands
// in errorHandler rather than Express's default (which prints a stack unless
// NODE_ENV happens to be set).
app.use(notFound);
app.use(errorHandler);

// A rejected promise nobody awaited should not take the process down silently
// or leave it running in a half-dead state. Log it; let the platform decide.
process.on('unhandledRejection', (reason) => console.error('[fatal] unhandled rejection:', reason));
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
  process.exit(1);
});

async function start() {
  try {
    await connectDb();
    app.listen(port, () => console.log(`Skeo LMS API listening on http://localhost:${port}`));
  } catch (err) {
    console.error('Failed to start LMS server:', err);
    process.exit(1);
  }
}

start();
