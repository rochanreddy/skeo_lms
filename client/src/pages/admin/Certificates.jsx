import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import CertificateModal from '../../components/CertificateModal.jsx';

/**
 * Admin: issue a cohort's certificates, and see what has been issued.
 *
 * The order of the screen is the order of the decision. Pick a cohort, look at
 * a sample with a real name on it, and only then issue — because issuing is
 * the step that mints codes people will put on a CV, and the cheapest moment to
 * notice a wrong programme title is before that and not after.
 *
 * Sampling writes nothing: no row, no counter increment, and the code it shows
 * ends 0000, which no issued certificate can. See utils/certificates.js.
 */

const fmt = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminCertificates() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sampleName, setSampleName] = useState('Aarav Sharma');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api('/batches')
      .then((d) => {
        const list = d.batches || [];
        setBatches(list);
        if (list[0]) setBatchId(list[0].id);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // The table follows the selected cohort, so switching cohorts answers "who in
  // THIS one has a certificate" without a second control to remember to change.
  const loadCerts = (id) => {
    if (!id) { setCerts([]); return; }
    api(`/certificates?batchId=${encodeURIComponent(id)}`)
      .then((d) => setCerts(d.certificates || []))
      .catch(() => setCerts([]));
  };
  useEffect(() => { loadCerts(batchId); }, [batchId]);

  const batch = batches.find((b) => b.id === batchId);

  async function showSample() {
    setErr(''); setNote(''); setBusy('sample');
    try {
      const d = await api('/certificates/sample', { method: 'POST', body: { name: sampleName, batchId } });
      setPreview(d.certificate);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }

  async function issue() {
    setErr(''); setNote(''); setBusy('issue');
    try {
      const d = await api('/certificates/issue', { method: 'POST', body: { batchId } });
      setNote(`${d.issued} issued, ${d.existing} already had one — ${d.batch}.`);
      loadCerts(batchId);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }

  async function open(id) {
    setErr('');
    try {
      const d = await api(`/certificates/${id}`);
      setPreview(d.certificate);
    } catch (e) { setErr(e.message); }
  }

  async function revoke(row) {
    // Revoking is the one destructive act here and it is visible to anyone who
    // scans the QR, so it asks. The reason is stored, not shown publicly.
    const reason = window.prompt(`Revoke ${row.code} (${row.name})?\n\nThe verification page will say so. Reason (optional):`);
    if (reason === null) return;
    setErr('');
    try {
      await api(`/certificates/${row.id}/revoke`, { method: 'POST', body: { reason } });
      loadCerts(batchId);
    } catch (e) { setErr(e.message); }
  }

  if (loading) return <div className="panel skeleton-row" style={{ height: 180 }} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Certificates</h1>
          <p>Issue a cohort&rsquo;s certificates and check what has gone out. Every certificate carries a QR that anyone can verify without an account.</p>
        </div>
      </div>

      {err && <div className="error" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {note && <div className="auth-notice" role="status" style={{ marginBottom: 14 }}>{note}</div>}

      {batches.length === 0 ? (
        <p className="muted">No cohorts yet. Create one under Course, then come back.</p>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 260px' }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Cohort</div>
                <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ width: '100%' }}>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} · {b.studentCount} student{b.studentCount === 1 ? '' : 's'}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: '1 1 200px' }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Sample name</div>
                <input value={sampleName} onChange={(e) => setSampleName(e.target.value)} style={{ width: '100%' }} />
              </label>
              <button className="btn quiet" onClick={showSample} disabled={busy === 'sample' || !sampleName.trim()}>
                {busy === 'sample' ? 'Building…' : 'Preview sample'}
              </button>
              <button className="btn" onClick={issue} disabled={busy === 'issue' || !batch?.studentCount}>
                {busy === 'issue' ? 'Issuing…' : `Issue to ${batch?.studentCount || 0}`}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Issuing mints a certificate for every student in the cohort. It is safe to run twice —
              anyone who already has one keeps the code they have.
            </p>
          </div>

          {certs.length === 0 ? (
            <p className="muted">Nothing issued for this cohort yet.</p>
          ) : (
            <div className="panel">
              <div className="table-wrap">
              <table className="grade-table">
                <thead>
                  <tr><th>Student</th><th>Certificate</th><th>Issued</th><th /></tr>
                </thead>
                <tbody>
                  {certs.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div>{c.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{c.email}</div>
                      </td>
                      <td>
                        <code style={{ fontSize: 12 }}>{c.code}</code>
                        {c.revoked && <div style={{ fontSize: 12, color: 'var(--red-ink)', fontWeight: 600 }}>Revoked</div>}
                      </td>
                      <td className="muted" style={{ fontSize: 13 }}>{fmt(c.issuedAt)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sm quiet" onClick={() => open(c.id)}>View</button>
                        {!c.revoked && <button className="btn sm quiet" style={{ marginLeft: 6 }} onClick={() => revoke(c)}>Revoke</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {preview && <CertificateModal cert={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
