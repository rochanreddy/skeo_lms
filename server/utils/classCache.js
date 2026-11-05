/* Answers the whole class shares.
 *
 * Load-tested with a class of 2000 on one core, what limited this API was not
 * CPU: the event loop answered /health in milliseconds while the home screen
 * took 14 seconds. Requests were queueing for the database connection pool, and
 * every one of them parked in memory while it waited, which at a 256MB heap
 * meant the garbage collector eating what time was left. A class arriving
 * together, the moment a live session starts, took the process down.
 *
 * A home screen cost about 24 database round trips, and most were wasted:
 *
 *   · The assignments, the announcements, the quiz list and the lesson count
 *     are the same for everyone on a course, and were fetched afresh for each
 *     of them.
 *   · One screen's seven concurrent requests each looked up the same user and
 *     the same list of batches.
 *
 * So both are shared. Only what is really per-student still goes to the
 * database: submissions, attempts, progress, notifications.
 *
 * Two things keep it honest about freshness:
 *
 *   · Any write to the collections behind it clears it. That lives on the
 *     Mongoose schemas (see keepsClassCacheFresh) rather than in the routes,
 *     because writes arrive by a dozen paths -- save(), findByIdAndUpdate,
 *     updateMany in provisioning -- and a route that forgot would show a whole
 *     class stale data. What is left is the TTL, which bounds a write from
 *     outside this process: a seed script, or a second instance, should this
 *     ever run more than one. The same limit as the auth cache and the rate
 *     limiter, with the same answer (Redis) if that day comes.
 *   · A read that began before a write must not be stored after it. Otherwise
 *     it would put back the very answer the write just invalidated, for a full
 *     TTL. `generation` is what catches that.
 *
 * Cached values are shared between requests. Read them, copy them, never mutate
 * them.
 */
export function shortCache({ ttlMs, maxEntries = 5000 }) {
  const entries = new Map(); // key -> { at, value }
  const inflight = new Map(); // key -> Promise
  let generation = 0;

  return {
    /** The value for key: cached, joined onto a read in flight, or loaded. */
    get(key, load) {
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

      const pending = inflight.get(key);
      if (pending) return pending;

      const startedIn = generation;
      const read = Promise.resolve()
        .then(load)
        .then((value) => {
          if (startedIn === generation) {
            // A crude bound, like the one on the auth cache: entries live for
            // seconds, so this is a backstop and not a policy.
            if (entries.size >= maxEntries) entries.clear();
            entries.set(key, { at: Date.now(), value });
          }
          return value;
        })
        // A failure is not remembered: the next caller simply tries again.
        .finally(() => {
          if (inflight.get(key) === read) inflight.delete(key);
        });
      inflight.set(key, read);
      return read;
    },

    /** Forget everything, and refuse whatever is still being read. */
    clear() {
      generation += 1;
      entries.clear();
      inflight.clear();
    },

    get generation() {
      return generation;
    },
  };
}

// 15 seconds: long enough that a class arriving together is one query, short
// enough to be the worst case for anything that bypasses the hooks below.
export const classCache = shortCache({ ttlMs: 15_000 });

const QUERY_WRITES = [
  'updateOne', 'updateMany', 'replaceOne',
  'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'deleteOne', 'deleteMany',
];

/**
 * Clear the cache after any write to this schema's collection. Must be called
 * before the schema is compiled into a model. findByIdAndUpdate and friends
 * arrive here as their findOneAnd* equivalents.
 */
export function keepsClassCacheFresh(schema) {
  const clear = () => classCache.clear();
  schema.post('save', clear);
  schema.post(QUERY_WRITES, { document: false, query: true }, clear);
  // doc.deleteOne() and doc.updateOne() are document middleware, not query.
  schema.post(['deleteOne', 'updateOne'], { document: true, query: false }, clear);
  schema.post('insertMany', clear);
  schema.post('bulkWrite', clear);
}
