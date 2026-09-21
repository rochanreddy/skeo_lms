import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { navFor, extraRoutesFor } from './nav.jsx';
import AppShell from './components/AppShell.jsx';
import SkeoWordmark from './components/SkeoWordmark.jsx';
import Login from './pages/Login.jsx';

// Login stays eager — it's the first paint for anyone signed out. The other
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

// What's on screen while /me is in flight. The topbar and the page frame don't
// depend on the answer, so they paint immediately rather than after a round
// trip — only the dock does, because its tabs come from the role.
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(null); // message when the admin blocked this account

  // On load, resolve the current user from a stored token (picks the dashboard).
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/me')
      .then((d) => setUser(d.user))
      .catch((e) => { if (e.code === 'blocked') setBlocked(e.message); else setToken(''); })
      .finally(() => setLoading(false));
  }, []);

  // An admin block takes effect on the next API call — api() broadcasts it so
  // the whole app swaps to the stop page immediately.
  useEffect(() => {
    const onBlocked = (e) => setBlocked(e.detail?.message || '');
    window.addEventListener('skeo:blocked', onBlocked);
    return () => window.removeEventListener('skeo:blocked', onBlocked);
  }, []);

  const logout = () => { setToken(''); setUser(null); setBlocked(null); };

  if (loading) return <AppSkeleton />;

  if (blocked !== null) {
    return <Suspense fallback={<AppSkeleton />}><Blocked message={blocked} onLogout={logout} /></Suspense>;
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
      <Route path="/reset" element={<Suspense fallback={<AppSkeleton />}><ResetPassword /></Suspense>} />
      {/* PUBLIC, and it has to stay that way — it is printed on paper as a QR
          code and opened by recruiters who have no account. Declared above the
          catch-all so a signed-out visitor is not bounced to /login, and it
          never redirects a signed-in one either: the person checking a
          certificate may well be an admin with a session open. */}
      <Route path="/verify/:code" element={<Suspense fallback={<AppSkeleton />}><VerifyCertificate /></Suspense>} />
      <Route
        path="/app"
        element={user ? <AppShell user={user} setUser={setUser} logout={logout} /> : <Navigate to="/login" />}
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
  );
}
