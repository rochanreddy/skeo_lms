import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SkeoWordmark from '../components/SkeoWordmark.jsx';

/**
 * The page behind the QR code on a certificate.
 *
 * PUBLIC. Whoever opens this has no account and no reason to trust us — they
 * are a recruiter holding a printout, checking whether the person in front of
 * them really did the thing. So it does not use api.js: that helper attaches a
 * Bearer token and, on a 401, tries to refresh and bounces to /login. Here a
 * bare fetch is the right tool, because there is nothing to authenticate and
 * nowhere to send someone who has not signed in.
 *
 * The answer is deliberately small — a name, a programme, a cohort, a date.
 * That is what verifying needs, and the server's publicView() is an allowlist
 * rather than the document with fields deleted. See utils/certificates.js.
 */

// Same default and the same trailing-slash strip as api.js. Not imported from
// there because importing that module for its constant would also pull in the
// token handling this page must not have.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4200/api/skeo').replace(/\/+$/, '');

const longDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function VerifyCertificate() {
  const { code } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`${API}/certificates/verify/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        // 404 is the honest answer for a code that does not exist, and the
        // rate limiter's 429 has to be told apart from it — "no such
        // certificate" would be a lie when we simply refused to look.
        if (res.ok) setState({ status: 'found', cert: body });
        else if (res.status === 429) setState({ status: 'throttled', error: body.error });
        else if (res.status === 404) setState({ status: 'missing', error: body.error });
        else setState({ status: 'error', error: body.error });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="verify">
      <div className="verify-card">
        <div className="verify-brand"><SkeoWordmark size={26} /></div>

        {state.status === 'loading' && <p className="verify-status muted">Checking this certificate…</p>}

        {state.status === 'found' && state.cert.revoked && (
          <>
            <div className="verify-badge verify-badge--revoked">Revoked</div>
            <p className="verify-status">
              This certificate was issued by skeo and has since been withdrawn. It is no longer
              valid evidence of completion.
            </p>
            <Facts cert={state.cert} />
          </>
        )}

        {state.status === 'found' && !state.cert.revoked && (
          <>
            <div className="verify-badge verify-badge--valid">Verified</div>
            <p className="verify-status">This is a genuine certificate issued by skeo.</p>
            <Facts cert={state.cert} />
          </>
        )}

        {state.status === 'missing' && (
          <>
            <div className="verify-badge verify-badge--missing">Not found</div>
            <p className="verify-status">
              {state.error || 'No certificate with that ID.'} Check the ID printed under the QR
              code — it reads SKEO-XXXXX-MMYY-NNNN.
            </p>
            <div className="verify-facts"><Fact label="ID checked" value={String(code).toUpperCase()} mono /></div>
          </>
        )}

        {state.status === 'throttled' && (
          <>
            <div className="verify-badge verify-badge--missing">Too many lookups</div>
            <p className="verify-status">{state.error || 'Try again in a minute.'}</p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="verify-badge verify-badge--missing">Couldn’t check</div>
            {/* Never "invalid": we do not know that. The certificate may be
                perfectly good and our server unreachable, and telling a
                recruiter otherwise is the worst thing this page could do. */}
            <p className="verify-status">
              We couldn’t reach the certificate service just now. That says nothing about this
              certificate — please try again shortly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Facts({ cert }) {
  return (
    <div className="verify-facts">
      <Fact label="Awarded to" value={cert.name} />
      <Fact label="Programme" value={cert.programme} />
      {cert.batch && <Fact label="Cohort" value={cert.batch} />}
      <Fact label="Issued" value={longDate(cert.issuedAt)} />
      {cert.revoked && cert.revokedAt && <Fact label="Revoked" value={longDate(cert.revokedAt)} />}
      <Fact label="Certificate ID" value={cert.code} mono />
    </div>
  );
}

const Fact = ({ label, value, mono }) => (
  <div className="verify-fact">
    <div className="verify-fact-label">{label}</div>
    <div className={`verify-fact-value${mono ? ' mono' : ''}`}>{value}</div>
  </div>
);
