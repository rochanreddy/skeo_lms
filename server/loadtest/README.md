# Load test

Answers one question: what happens when 100 students hit the API at the same time?

Run it against a throwaway database — it creates 120 `load*@skeo.test` accounts.

```bash
cd server

# 1. base data (admin + sample programs) and 120 students
MONGODB_URI="mongodb://127.0.0.1:27017/skeo_loadtest" node scripts/seed.js
MONGODB_URI="mongodb://127.0.0.1:27017/skeo_loadtest" LOAD_USERS=120 node loadtest/seed.mjs

# 2. server on a spare port, pointed at that same database
MONGODB_URI="mongodb://127.0.0.1:27017/skeo_loadtest" PORT=4300 node index.js

# 3. the test
LOAD_PORT=4300 LOAD_USERS=100 node loadtest/run.mjs
```

Scenarios: `/health` baseline, a 100-user login stampede, 100 concurrent
authenticated reads, 100 concurrent curriculum reads, and 100 users doing five
reads each about a second apart.

Each virtual user sends its own `X-Forwarded-For`. The API rate-limits per IP
(`trust proxy = 1`), so without this every request lands in one bucket and the
result measures the rate limiter instead of the server. To measure the rate
limiter on purpose — the "whole classroom on one wifi" case — point them all at
a single IP instead.

There is a second script alongside it:

```bash
LOAD_PORT=4300 node loadtest/blocking.mjs
```

`blocking.mjs` checks the one thing the requireAuth cache puts at risk — that an
admin's block still locks a student out on the very next request rather than
when the cache entry expires. It writes (it blocks and unblocks an account),
which is why it is here and not in `tests/`.

`LOAD_HOST` / `LOAD_PORT` also point these at a deployed environment. Don't run
it against production: it burns real VdoCipher calls and real database load.
