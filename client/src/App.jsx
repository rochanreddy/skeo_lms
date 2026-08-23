import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { navFor, extraRoutesFor } from './nav.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForcePasswordChange from './pages/ForcePasswordChange.jsx';
import Blocked from './pages/Blocked.jsx';

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

  if (loading) return <div className="center">Loading…</div>;

  if (blocked !== null) return <Blocked message={blocked} onLogout={logout} />;

  // Admin-provisioned / reset accounts must set their own password first.
  if (user && user.must_change_password) {
    return <ForcePasswordChange user={user} onDone={setUser} onLogout={logout} />;
  }

  const tabs = user ? navFor(user.role) : [];

  // Role-based access: a signed-in user whose role has no nav (retired roles
  // like 'partner', or anything unexpected) gets a stop page, not a blank app.
  if (user && tabs.length === 0) {
    return <Blocked message="Your account role no longer has access to this portal." onLogout={logout} />;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" /> : <Login onLogin={setUser} />} />
      <Route path="/signup" element={user ? <Navigate to="/app" /> : <Register onLogin={setUser} />} />
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
