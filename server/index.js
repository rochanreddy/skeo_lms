// Load .env FIRST so every module below sees process.env at import time.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { connectDb } from './db.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { rateLimit } from './middleware/rateLimit.js';
import { startUsageMeter, usageMeter } from './utils/usageMeter.js';
import { syncLibrary } from './utils/librarySeed.js';
import { syncClaudeQuizzes, resetClaudeQuizAttemptsOnce } from './utils/claudeQuizSync.js';
import { startAiGrading } from './utils/aiGrader.js';

const app = express();
const port = Number(process.env.PORT || 4200); // 4200 is Skeo's own port -- 4100 belongs to menler-lms, 4000 to the marketing API.

// The API runs behind a TLS-terminating proxy in production, so req.protocol and
// req.ip are only truthful once the forwarding headers are trusted.
app.set('trust proxy', 1);

// Ahead of everything, so preflights and throttled requests are counted too.
app.use(usageMeter);

// CORS allowlist: the frontend calls this API cross-origin. The production
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

// Security headers. This API answers JSON to a separate origin and serves no
// HTML of its own, so the browser-facing policies are pointed at that: no
// framing, no sniffing, no referrer leakage. CSP is off because there is no
// document here to constrain -- the frontend ships its own.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);
app.use(compression());

// A body big enough to matter here is a bug or an attack. The one thing that
// legitimately exceeds it is a curriculum document, which travels as multipart
// and is capped separately where it is handled (15 MB, routes/programs.js).
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return cb(null, true);
      return cb(null, false);
    },
    /* Let the browser remember the preflight.
     *
     * Every request this API receives carries an Authorization header, which
     * makes it a request the browser will not send until it has first asked
     * OPTIONS whether it may -- a whole extra round trip, and the first thing
     * that happens on every cold load, ahead of /me. Without maxAge the
     * browser's own default applies, which in Chrome is five seconds: so a
     * student reading a lesson for half a minute and then tapping a tab pays
     * for another preflight before their data can even be requested.
     *
     * 7200 is as long as it is worth asking for -- Chrome caps the preflight
     * cache at two hours whatever is sent. The answer being cached is "this
     * origin may call us", which is exactly as true in two hours as it is
     * now; it is not an authorisation decision, and requireAuth re-checks
     * that against the live user record on every single request regardless.
     */
    maxAge: 7200,
  }),
);

// A ceiling on the whole API. Set well above what the UI does in normal use,
// so it only ever catches a runaway client or a scraper; /health is left out
// deliberately so an uptime probe can never be throttled.
//
// 300 a minute for one signed-in account; 3000 for an unidentified address,
// which on mobile data is not one person but everyone the carrier has put
// behind that address.
app.use(
  '/api/skeo',
  rateLimit({ bucket: 'api', max: 300, ipMax: 3000, windowMs: 60_000 }),
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
    // The Library's own resources follow utils/librarySeed.js, so a deploy is
    // what changes them. Off the critical path: a failure here is logged and
    // the API starts regardless.
    syncLibrary()
      .then((r) => { if (r.changed) console.log(`[library] synced: removed ${r.removed}, added ${r.added}`); })
      .catch((err) => console.error('[library] sync failed:', err.message));
    // Likewise the Claude module quizzes follow scripts/claudeQuizzes.js, once
    // per version of that file (utils/claudeQuizSync.js). Then the one-off
    // reset of attempts made on the old questions.
    syncClaudeQuizzes()
      .then((r) => { if (r.changes) console.log(`[quizzes] synced ${r.changes} Claude module quiz(zes)`); })
      .then(() => resetClaudeQuizAttemptsOnce())
      .then((r) => { if (r.reset) console.log(`[quizzes] reset ${r.reset} attempt(s) on the Claude module quizzes`); })
      .catch((err) => console.error('[quizzes] sync failed:', err.message));
    const server = app.listen(port, () => console.log(`Skeo LMS API listening on http://localhost:${port}`));
    // Grades submitted Drive folders with Gemini; also off the critical path.
    startAiGrading();
    startUsageMeter(server);

    /* Keep connections open longer than the proxy in front of us does.
     *
     * Node closes an idle keep-alive connection after 5 seconds. The hosting
     * proxy holds its side of that connection open for longer, so it will
     * sometimes send a request down a socket this process has just decided to
     * close -- which the client sees as a dropped connection, and which the
     * frontend's retry then has to paper over. Outliving the proxy's own idle
     * timeout hands the decision to the proxy, which knows when it is done.
     *
     * It also means a student's next request reuses the open connection rather
     * than paying for a TCP handshake and a TLS handshake again, which on a
     * phone in India talking to Singapore is the difference between one round
     * trip and three. headersTimeout must stay above keepAliveTimeout or the
     * header-read deadline fires first and undoes it.
     */
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
  } catch (err) {
    console.error('Failed to start LMS server:', err);
    process.exit(1);
  }
}

start();
