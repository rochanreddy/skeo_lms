import mongoose from 'mongoose';

// Own dedicated Atlas cluster (project: Sachin's Org / Project 0), database
// "skeo". Every model pins an explicit skeo_* collection name (see
// server/models/*), so this stays self-contained even if the URI is ever
// pointed at a cluster shared with something else.
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skeo';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, {
    /* A pool sized for the box, not for the default.
     *
     * The driver opens up to 100 sockets by default. This service runs on one
     * small instance with a single event loop: it cannot usefully have a
     * hundred queries in flight, and every idle socket in the pool is one more
     * connection Atlas counts against the cluster's limit -- a limit this
     * shares with the second pool in jobsDb() below. Twenty is well above what
     * one event loop can keep busy, and minPoolSize keeps a few warm so the
     * first request after a quiet spell does not wait for a TCP and TLS
     * handshake to Singapore before it can ask anything.
     */
    maxPoolSize: 20,
    minPoolSize: 2,
    // Fail a query rather than hang a request for the default 30 seconds. A
    // page that says something went wrong beats one that never answers.
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  console.log('LMS DB connected →', mongoose.connection.name);
}

/* ------------------------------------------------------------------ *
 * The job pipeline's database — a second, separate connection.
 *
 * The scraped job board is written by another service entirely
 * (skeo-job-pipeline), which runs on its own schedule and its own cluster.
 * This LMS only ever reads it, with a read-only Atlas user, so a bug here
 * cannot damage a feed that several products depend on.
 *
 * A second connection rather than a second database on the same one:
 * they are genuinely different clusters, and mongoose.connect() only ever
 * manages one. createConnection gives a separate pool that can fail on its
 * own without taking the LMS's own database down with it — which matters,
 * because a job board being unreachable should never stop a student
 * submitting an assignment.
 * ------------------------------------------------------------------ */

let jobsConnection = null;

/** True when a jobs database is configured at all. */
export const jobsDbConfigured = () => Boolean(process.env.JOBS_MONGODB_URI);

/**
 * The shared read-only connection, opened on first use. Returns null when
 * JOBS_MONGODB_URI is unset, so the board can say "not configured" rather
 * than throwing on a route nobody set up yet.
 */
export function jobsDb() {
  if (!jobsDbConfigured()) return null;

  if (!jobsConnection) {
    jobsConnection = mongoose.createConnection(process.env.JOBS_MONGODB_URI, {
      // Small on purpose. This is a second pool on top of the LMS's own, and
      // Atlas counts them together against the cluster's connection limit.
      maxPoolSize: 5,
      // Fail fast rather than hanging a request for the default 30s — a board
      // that says it can't reach the feed beats one that never answers.
      serverSelectionTimeoutMS: 8000,
    });

    jobsConnection.on('connected', () =>
      console.log('Jobs DB connected →', jobsConnection.name),
    );
    jobsConnection.on('error', (err) =>
      console.error('Jobs DB error:', err.message),
    );
  }

  return jobsConnection;
}
