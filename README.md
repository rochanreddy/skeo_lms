# Skeo LMS

Standalone LMS, forked from `menler-lms` for a new production. Two roles only:
**student** and **admin**. Everything the old LMS did is here; the mentor role and
every screen, route and permission that hung off it are gone, and the admin has
absorbed the work mentors used to do.

It shares the same MongoDB Atlas cluster as the other services but lives in its
own database (`skeo`) and its own `skeo_*` collections, so it cannot see or
disturb the old LMS's data.

```
skeo/
├── server/   Express + Mongoose API  → /api/skeo   (port 4200)
└── client/   React + Vite frontend                 (port 5175)
```

Ports and collection names are deliberately different from `menler-lms`
(4100 / 5174 / `lms_*`) so both can run side by side without colliding.

## Run locally

### 1. Backend
```bash
cd server
npm install
cp .env.example .env        # then edit .env
#   MONGODB_URI  = connection string; keep the /skeo database name
#   JWT_SECRET   = any long random string (the server refuses to start
#                  in production without it)
npm run seed                # creates the admin from SKEO_SEED_EMAIL + sample programs
npm run dev                 # http://localhost:4200
```

### 2. Frontend
```bash
cd client
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:4200/api/skeo
npm run dev                 # http://localhost:5175
```

Open http://localhost:5175 and log in with the seeded admin.

Optional: `npm run seed:demo` fills a batch with students, sessions, attendance,
a quiz and forum activity so the dashboards have something to show. It needs the
admin from `npm run seed` to exist first, since the admin authors the demo
announcements and forum answers.

## Roles
`student` · `admin` — a user has exactly one. Signup is student-only; admins are
provisioned by another admin. Access is role-gated end to end: the API rejects
unknown or retired roles at login and on every request (`requireAuth` +
`requireRole`), and the client only mounts each role's own routes.

Accounts carrying a role from the old system (`mentor`, `partner`) are not
migrated and cannot sign in — `ROLES` in `server/models/User.js` is the single
source of truth, and anything outside it is refused at the auth chokepoint.

**Who does what.** Students learn, submit and ask. Admins do everything else:
run programmes and batches, enrol students, schedule sessions and webinars, mark
attendance, set assignments, author quizzes, grade, and answer the forum.

## API
Mounted at `/api/skeo`.
- `POST /api/skeo/auth/register | login | refresh | forgot | reset`
- `GET | PATCH /api/skeo/me`
- `GET /api/skeo/programs` · `GET /api/skeo/programs/:id` · `POST|PATCH` (admin only)
- `batches` · `sessions` · `attendance` · `assignments` · `submissions` · `quizzes`
  · `grades` · `announcements` · `forum` · `library` · `webinars` · `uploads`
  · `reports` · `stats` · `search` · `users` · `notifications` · `videos`

## Video (VdoCipher)
Lesson videos can either be a plain URL (played by the browser's own `<video>`)
or a DRM-protected VdoCipher video. Set `VDOCIPHER_API_SECRET` in the server
env and the curriculum editor grows a **Video source** switch; leave it unset
and the option stays hidden.

The API secret never leaves the server. A student's browser asks
`POST /api/skeo/videos/:videoId/otp` and gets a 5-minute playback ticket, and
only for a video attached to a lesson in a module they are allowed to see —
an id alone buys nothing. Playback is watermarked with the viewer's own name
and email (`VDOCIPHER_WATERMARK=off` turns that off).

Admins upload from **Programs → Manage curriculum → a video lesson → Library**.
The file goes straight from the browser to VdoCipher on a signed, single-video
credential; the bytes never pass through this API.

## Deploy
- **Backend** → Render (new Web Service, root `server/`, start `npm start`).
  Env: `MONGODB_URI`, `JWT_SECRET`, `SKEO_APP_URL=https://<your-frontend-domain>`,
  `VDOCIPHER_API_SECRET` (for DRM lesson video).
  `SKEO_APP_URL` is what the CORS allowlist trusts in production — there is no
  hard-coded fallback domain, so the frontend cannot call the API until it is set.
- **Frontend** → Vercel (root `client/`). Env: `VITE_API_URL=https://<render-app>/api/skeo`.

## Data isolation rule
This service must only ever read/write `skeo_*` collections in the `skeo`
database. Never touch the marketing collections (`leads`, `orders`, `users`) or
the old LMS's `lms_*` collections — that keeps the shared cluster safe.
