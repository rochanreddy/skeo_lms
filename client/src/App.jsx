import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getCachedUser, getRefreshToken, getToken, setCachedUser, setToken } from './api.js';
import { navFor, extraRoutesFor } from './nav.jsx';
import PwaPrompts from './components/PwaPrompts.jsx';
import SkeoWordmark from './components/SkeoWordmark.jsx';
import Login from './pages/Login.jsx';
import { forgetDevice } from './pwa.js';

// The signed-in frame: topbar, dock, notification bell, avatar menu, ⌘K entry
// point. Nobody signed out can see any of it, so it does not belong in the
// bundle a first-time visitor downloads to reach the sign-in screen.
//
// Prefetched below for the people who DO need it, so splitting it out costs
// them nothing: the chunk is fetched while /me is in flight rather than after
// it answers, and /me is a cross-origin round trip while this is a same-origin
// file the service worker has usually already precached. The screen shown
// during that wait is AppSkeleton either way, the same one /me already waits
// behind: so there is no new loading state anywhere.
const AppShell = lazy(() => import('./components/AppShell.jsx'));

// Read once, at module scope, before React starts: the answer cannot change
// between here and the first render, and starting the fetch this early is the
// whole point.
if (getToken()) import('./components/AppShell.jsx');

// Login stays eager: it's the first paint for anyone signed out. The other
// three are one-off detours (sign-up, a forced reset, a blocked account), so
// they cost a chunk fetch on the rare visit instead of bytes on every visit.
const Register = lazy(() => import('./pages/Register.jsx'));
const ForcePasswordChange = lazy(() => import('./pages/ForcePasswordChange.jsx'));
const Blocked = lazy(() => import('./pages/Blocked.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
// The page behind the QR on a certificate. Lazy like the rest, and public:
// whoever opens it is a stranger checking somebody else’s credential.
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate.jsx'));
// The link sent to students to get the app on their phone. Public too.
const Install = lazy(() => import('./pages/Install.jsx'));
const QuizRunner = lazy(() => import('./pages/QuizRunner.jsx'));

// What's on screen while /me is in flight. The topbar and the page frame don't
// depend on the answer, so they paint immediately rather than after a round
// trip: only the dock does, because its tabs come from the role.
function AppSkeleton() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><SkeoWordmark size={22} /></div>
        <div className="spacer" />
      </header>
      <main className="main">
        <div className="route-loading">
          <div className="skeleton">
            <div className="skeleton-row title" />
            <div className="skeleton-row tall" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  // Start from the session this device remembers, so a returning student gets
  // their dashboard on the first paint instead of a skeleton held up by a
  // round trip to Singapore. /me still runs below and still has the last word;
  // see the note on getCachedUser() in api.js for why this is safe.
  const remembered = getCachedUser();
  const [user, setUser] = useState(remembered);
  // Nothing to show yet only when there is a session we know nothing about:
  // a token but no remembered record, i.e. the first launch on this device.
  const [loading, setLoading] = useState(Boolean(getToken()) && !remembered);
  // Message when the admin blocked this account. A remembered block counts
  // straight away; its absence is not trusted until the server confirms it,
  // so a stale record can only ever err towards less access.
  const [blocked, setBlocked] = useState(
    remembered?.blocked?.lms ? (remembered.blocked.reason
      ? `Your account has been blocked: ${remembered.blocked.reason}`
      : 'Your account has been blocked by the administrator.') : null,
  );

  // Confirm (or correct) all of the above against the server.
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/me')
      .then((d) => { setUser(d.user); setBlocked(null); })
      .catch((e) => {
        if (e.code === 'blocked') { setBlocked(e.message); return; }
        // Only a 401 with nothing left to renew it ends a session. Everything
        // else says something about the moment, not about the account: no
        // connection, a deploy (502/503/504), a bug (500), the rate limiter
        // (429). A refresh token still here means the renewal could not get
        // through, which is the same thing again; one the server refused has
        // already been cleared by api.js. Signing a student out over any of
        // these would turn a few seconds of trouble into a password prompt,
        // and the installed app promises to open without a connection at all.
        // The next call that reaches the server will decide.
        if (e.status === 401 && !getRefreshToken()) { setToken(''); setUser(null); }
      })
      .finally(() => setLoading(false));
  }, []);

  // Remember whoever we end up as, for the next launch.
  useEffect(() => { setCachedUser(user); }, [user]);

  // An admin block takes effect on the next API call, api() broadcasts it so
  // the whole app swaps to the stop page immediately.
  useEffect(() => {
    const onBlocked = (e) => setBlocked(e.detail?.message || '');
    window.addEventListener('skeo:blocked', onBlocked);
    return () => window.removeEventListener('skeo:blocked', onBlocked);
  }, []);

  // api.js ended the session on some screen's behalf: the refresh token was
  // refused partway through a visit. Without this the dashboard stays up, empty,
  // with every request failing, until somebody thinks to reload.
  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener('skeo:signed-out', onSignedOut);
    return () => window.removeEventListener('skeo:signed-out', onSignedOut);
  }, []);

  // The device leaves the account first (push notifications), while there is
  // still a token to tell the server with.
  const logout = async () => { await forgetDevice(); setToken(''); setUser(null); setBlocked(null); };

  if (loading) return <><AppSkeleton /><PwaPrompts /></>;

  if (blocked !== null) {
    return <><Suspense fallback={<AppSkeleton />}><Blocked message={blocked} onLogout={logout} /></Suspense><PwaPrompts /></>;
  }

  // Admin-provisioned / reset accounts must set their own password first.
  if (user && user.must_change_password) {
    return (
      <Suspense fallback={<AppSkeleton />}>
        <ForcePasswordChange user={user} onDone={setUser} onLogout={logout} />
      </Suspense>
    );
  }

  const tabs = user ? navFor(user.role) : [];

  // Role-based access: a signed-in user whose role has no nav (retired roles
  // like 'partner', or anything unexpected) gets a stop page, not a blank app.
  if (user && tabs.length === 0) {
    return (
      <Suspense fallback={<AppSkeleton />}>
        <Blocked message="Your account role no longer has access to this portal." onLogout={logout} />
      </Suspense>
    );
  }

  return (
    <>
    <PwaPrompts />
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" /> : <Login onLogin={setUser} />} />
      <Route
        path="/signup"
        element={user ? <Navigate to="/app" /> : <Suspense fallback={<AppSkeleton />}><Register onLogin={setUser} /></Suspense>}
      />
      <Route
        path="/forgot"
        element={user ? <Navigate to="/app" /> : <Suspense fallback={<AppSkeleton />}><ForgotPassword /></Suspense>}
      />
      {/* Where the emailed reset link lands. Reachable while signed in too: the
          link may be opened in a browser that still holds someone's session. */}
      <Route path="/reset" element={<Suspense fallback={<AppSkeleton />}><ResetPassword user={user} onSignOut={logout} /></Suspense>} />
      {/* PUBLIC, and it has to stay that way, it is printed on paper as a QR
          code and opened by recruiters who have no account. Declared above the
          catch-all so a signed-out visitor is not bounced to /login, and it
          never redirects a signed-in one either: the person checking a
          certificate may well be an admin with a session open. */}
      <Route path="/verify/:code" element={<Suspense fallback={<AppSkeleton />}><VerifyCertificate /></Suspense>} />
      <Route path="/install" element={<Suspense fallback={<AppSkeleton />}><Install /></Suspense>} />
      {/* A quiz, sat in its own tab with no app chrome around it. */}
      <Route
        path="/quiz/:id"
        element={user ? <Suspense fallback={<AppSkeleton />}><QuizRunner /></Suspense> : <Navigate to="/login" />}
      />
      <Route
        path="/app"
        element={user
          ? <Suspense fallback={<AppSkeleton />}><AppShell user={user} setUser={setUser} logout={logout} /></Suspense>
          : <Navigate to="/login" />}
      >
        {tabs.map((t) => (
          <Route key={t.path} index={t.path === ''} path={t.path || undefined} element={<t.Component />} />
        ))}
        {user && extraRoutesFor(user.role).map((t) => (
          <Route key={t.path} path={t.path} element={<t.Component />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} />} />
    </Routes>
    </>
  );
}
