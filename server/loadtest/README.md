# Load test

Answers one question: what happens when a whole class hits the API at once?

Everything here runs against a throwaway database. `seed.mjs` and `class.mjs`
refuse anything that is not local with `load` in its name, because `server/.env`
holds the real connection string and dotenv would supply it without a word.

## Running it so the numbers mean something

A desktop with a local mongod flatters this API. To measure something close to
the instance it runs on, take the three advantages away: **one core**, a **heap
the size the instance allows**, and **network latency to the database**.

```bash
cd server
export MONGODB_URI="mongodb://127.0.0.1:27019/skeo_loadtest"
export JWT_SECRET=loadtest-only   # the same value for the server and the scripts

# 1. a class of 2000 on the real curriculum, plus an admin for the scripts below
LOAD_USERS=2000 node loadtest/seed.mjs

# 2. network distance to the database: quote the round trip it prints
SLOWDB_MS=1 SLOWDB_TO=27019 SLOWDB_PORT=27020 node loadtest/slowdb.mjs &

# 3. the API, on a spare port, through that relay, with the production heap.
#    Then pin it to one core: `taskset` on Linux, ProcessorAffinity on Windows.
MONGODB_URI="mongodb://127.0.0.1:27020/skeo_loadtest" PORT=4300 NODE_ENV=production \
  NODE_OPTIONS=--max-old-space-size=256 node index.js

# 4. the test. LOAD_PID also reports the API's memory.
LOAD_PORT=4300 LOAD_PID=<pid> LOAD_HERDS=100,500,1000,2000 \
  LOAD_STEPS=100,300,500,1000,2000 LOAD_STEP_SECONDS=45 node loadtest/class.mjs
```

## What each script is for

| Script | Question |
|---|---|
| `class.mjs` | How long until a student's screen has finished loading, while everyone else's does too? |
| `run.mjs` | What does a login stampede cost? It needs `node scripts/seed.js` first, and sends `LOAD_USERS` sign-ins at once. |
| `freshness.mjs` | Does a change still show up at once, now that the class's answers are shared? Do blocks stay with the person blocked? |
| `blocking.mjs` | Does a block still land on the very next request? Needs `scripts/seed.js`. |

`class.mjs` has two scenarios. `herd` is everyone opening the app in the same
second, the moment a live class starts: the worst minute this API will have.
`ramp` is sustained use at rising headcounts, about one screen every 10 seconds
each, with the bell polling. A canary asks `/health` throughout: it does no work,
so its latency is purely how long the event loop kept it waiting. **A slow home
screen with a fast canary means requests are queueing for something other than
the CPU**, which is how the connection pool was first suspected and later ruled
out.

`freshness.mjs` and `blocking.mjs` write, which is why they are here and not in
`tests/`.

## What it found

Measured November 2026: one core of a desktop, 256MB heap, 31ms to the database,
2000 students seeded, about 54 lessons of real curriculum.

| | Before | After |
|---|---|---|
| 1000 students, sustained: home screen p50 | 3744ms | **30ms** |
| 2000 students, sustained: home screen p50 | 14058ms | **94ms** |
| 2000 arriving together: home screen p50 | 134.9s | **5.4s** |
| Peak memory | 895MB unconstrained; a fatal heap error at 128MB | **288MB** |
| Failed requests, sustained | 0 | 0 |

A home screen went from about 24 database round trips to about 6, because what
the whole class shares is now fetched once (`utils/classCache.js`).

### Limits worth knowing

- **Render's `starter` is 0.5 CPU, not one desktop core.** Expect a fraction of
  these numbers. Nothing here has run on the real instance.
- **The ceiling is now CPU**, about 1200 requests a second on this core. Raising
  the connection pool does not help: 20, 40 and 80 connections gave 879, 948 and
  806 req/s, and the event loop got slower as the pool grew.
- **Sign-ins go at about 14 a second per core.** That is bcrypt doing its job,
  and it is not something to optimise: 500 people signing in together wait up to
  36 seconds. Students already in the app are not affected (`/health` p95 110ms
  during the stampede), and a session lasts 30 days, so this is the first day of
  a cohort and not every class.
- **Everything here is one process.** The class cache, the auth cache and the
  rate limiter all live in memory. A second instance would need Redis first.

## Production numbers

The load test says what the code can take. What real students do is measured by
the running app and shown in the admin panel under **Usage**. Between them they
answer the capacity question: the rates there replace the assumptions here as
soon as there is enough real traffic to trust.

## Don't run it against production

`LOAD_HOST` / `LOAD_PORT` point these at another environment, and `run.mjs` has
no database guard because it only talks HTTP. Don't aim them at production: it
burns real VdoCipher calls and real database load.

`run.mjs` sends each virtual user its own `X-Forwarded-For`, so sign-ins are not
all counted against one address. To measure the rate limiter on purpose (the
whole classroom on one wifi), point them all at one IP instead.
