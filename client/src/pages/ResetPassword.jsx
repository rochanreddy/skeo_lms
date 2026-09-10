import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import SkeoWordmark from '../components/SkeoWordmark.jsx';

// Step 2: the screen the emailed link lands on.
//
// The link carries ?token=&email= — the server hashes the token and matches it
// against the stored hash, so the raw value exists only in that URL and is
// never stored here. On success we send them to sign in rather than logging
// them in silently: /auth/reset issues no token, and typing the new password
// once more is the confirmation that it was actually memorable.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const linkOk = Boolean(token && email);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Those two passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { email, token, password } });
      nav('/login?reset=1', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-brand"><SkeoWordmark size={30} theme="dark" /></div>
        <div className="auth-hero-copy">
          <h2>Pick a new password.</h2>
          <p>Make it at least 8 characters, and something you haven&apos;t used elsewhere.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        {!linkOk ? (
          <div className="auth-form">
            <h1>This link is incomplete</h1>
            <p className="sub">
              It looks like the reset link was cut short — some mail clients wrap long URLs. Request a fresh one and open
              it in a single click.
            </p>
            <p className="auth-alt"><Link to="/forgot">Request a new link</Link></p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <h1>Set a new password</h1>
            <p className="sub">For <strong>{email}</strong>.</p>

            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <div className="field-with-action">
                <input
                  id="reset-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  placeholder="Min 8 characters"
                  aria-describedby={err ? 'reset-error' : undefined}
                />
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  title={show ? 'Hide password' : 'Show password'}
                >
                  {show ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.3 3.2" />
                      <path d="M6.2 6.7C4 8.2 3 10.5 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.6-.7" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="2.6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                aria-describedby={err ? 'reset-error' : undefined}
              />
            </div>
            {err && <div id="reset-error" className="error auth-error" role="alert">{err}</div>}
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Set password →'}</button>

            <p className="auth-alt">Link expired? <Link to="/forgot">Request a new one</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
