import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Student: leave a review of the programme. The questions come from the
// server (server/config/reviews.js), so changing the form is a one-file job.
// After submitting, the student is invited to say the same thing in public,
// on Google and LinkedIn, when those links are set.
export default function Review() {
  const [form, setForm] = useState(null); // { questions, links, mine }
  const [answers, setAnswers] = useState({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/reviews/form')
      .then((d) => {
        setForm(d);
        setAnswers(Object.fromEntries((d.mine?.answers || []).map((a) => [a.questionId, a.value])));
      })
      .catch(() => setFailed(true));
  }, []);

  const set = (id, value) => setAnswers((cur) => ({ ...cur, [id]: value }));

  async function submit(e) {
    e.preventDefault();
    const missing = form.questions.find((q) => q.required && (answers[q.id] === undefined || answers[q.id] === null || answers[q.id] === ''));
    if (missing) return setError(`Please answer "${missing.label}".`);
    setBusy(true); setError('');
    try {
      const d = await api('/reviews', { method: 'POST', body: { answers } });
      setForm((f) => ({ ...f, mine: d.review, links: d.links || f.links }));
      setEditing(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Could not send your review. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <div className="rv-page"><h1>Review</h1><p className="muted">The review form didn't load. Refresh to try again.</p></div>;
  if (!form) return <div className="rv-page"><h1>Review</h1><div className="skeleton" style={{ height: 320, borderRadius: 16 }} /></div>;

  const done = form.mine && !editing;

  return (
    <div className="rv-page">
      <h1>Review</h1>

      {done ? (
        <div className="panel rv-thanks">
          <div className="rv-thanks-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <h2>Thank you for your review</h2>
          <p className="muted">
            It goes straight to the skeo team. Sent {new Date(form.mine.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}.
          </p>

          {/* The ask for a public review, always shown after submitting. */}
          <div className="rv-public">
            <GoogleMark size={28} />
            <p className="rv-public-lead">Drop us a Google review</p>
            <p className="muted rv-public-sub">It takes a minute, and it's how the next student finds skeo.</p>
            <div className="rv-public-btns">
              <a className="btn rv-google" href={form.links.google || GOOGLE_FALLBACK} target="_blank" rel="noreferrer">
                Write a Google review <span aria-hidden="true">↗</span>
              </a>
              {form.links.linkedin && (
                <a className="btn rv-link" href={form.links.linkedin} target="_blank" rel="noreferrer">
                  <LinkedInMark /> Recommend us on LinkedIn
                </a>
              )}
            </div>
          </div>

          <button type="button" className="btn ghost sm rv-edit" onClick={() => setEditing(true)}>Edit your review</button>
        </div>
      ) : (
        <form className="panel rv-form" onSubmit={submit}>
          <h2 className="rv-title">{form.intro?.title || 'How was the class?'}</h2>
          {form.intro?.note && <p className="muted rv-intro">{form.intro.note}</p>}

          {form.questions.map((q, i) => (
            <fieldset className="rv-q" key={q.id}>
              <legend className="rv-q-label">
                <span className="rv-q-n">{i + 1}</span>
                <span>{q.label}{q.required ? '' : <span className="rv-optional"> (optional)</span>}</span>
              </legend>
              <Answer q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
            </fieldset>
          ))}

          {error && <p className="rv-error" role="alert">{error}</p>}
          <div className="rv-actions">
            {form.mine && <button type="button" className="btn ghost" onClick={() => { setEditing(false); setError(''); }}>Cancel</button>}
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : form.mine ? 'Save review' : 'Submit review'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

// One question's input, by type.
function Answer({ q, value, onChange }) {
  if (q.type === 'rating') {
    return (
      <div className="rv-rating">
      <div className="rv-stars" role="radiogroup" aria-label={q.label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}, ${STAR_WORDS[n]}`}
            title={STAR_WORDS[n]}
            className={`rv-star ${value >= n ? 'on' : ''}`}
            onClick={() => onChange(n)}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" fill="currentColor" /></svg>
          </button>
        ))}
      </div>
      <span className={`rv-star-word ${value ? '' : 'is-empty'}`}>{value ? STAR_WORDS[value] : 'Tap a star'}</span>
      </div>
    );
  }
  if (q.type === 'scale') {
    return (
      <div>
        <div className="rv-scale" role="radiogroup" aria-label={q.label}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} className={`rv-pill ${value === n ? 'on' : ''}`} onClick={() => onChange(n)}>{n}</button>
          ))}
        </div>
        <div className="rv-scale-ends"><span>Not likely</span><span>Very likely</span></div>
      </div>
    );
  }
  if (q.type === 'choice') {
    return (
      <div className="rv-choices" role="radiogroup" aria-label={q.label}>
        {(q.options || []).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={`rv-pill ${value === o ? 'on' : ''}`} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    );
  }
  return q.long ? (
    <>
      <textarea className="rv-text" rows={4} value={value || ''} maxLength={q.max} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} aria-label={q.label} />
      {q.max && <div className="rv-count">{(value || '').length} / {q.max}</div>}
    </>
  ) : (
    <input className="rv-text" value={value || ''} maxLength={q.max} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} aria-label={q.label} />
  );
}

// What each star means, said under the stars as you pick.
const STAR_WORDS = { 1: 'Poor', 2: 'Not great', 3: 'Fine', 4: 'Good', 5: 'Excellent' };

// Until the real "write a review" link is set (REVIEW_GOOGLE_URL on the
// server), a Google search for skeo: its business panel carries the
// "Write a review" button.
const GOOGLE_FALLBACK = 'https://www.google.com/search?q=skeo+ai+reviews';

const GoogleMark = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
  </svg>
);

const LinkedInMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="4" fill="#0A66C2" />
    <path fill="#fff" d="M7.1 9.5h2.6V18H7.1zM8.4 5.3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11.3 9.5h2.5v1.2c.4-.7 1.2-1.4 2.6-1.4 2.7 0 3.2 1.8 3.2 4.1V18H17v-4.1c0-1 0-2.2-1.4-2.2s-1.6 1.1-1.6 2.2V18h-2.7z" />
  </svg>
);
