import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FileViewer from '../components/FileViewer.jsx';
import Markdown from '../components/Markdown.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { CheckBadge, SubmissionCheckPanel } from '../components/SubmissionCheck.jsx';

// TEMPORARY test files, until real ones are attached. Both are real Menler-hosted
// documents on the public marketing host rather than localhost, so they keep
// working once this is deployed — and the deck HAS to be public regardless,
// since Microsoft's embed fetches the file itself and cannot see a local
// address. Delete both constants and the `||` fallbacks below once real files
// are attached to lessons.
const PLACEHOLDER_READING = 'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf';
const PLACEHOLDER_NOTES = 'https://menler.in/project_decks/Account_Research_Agent.pptx';

// Learning. For students: Content + Assignments (submit) + Quizzes (take).
// For admins: just the course content to teach from — they create &
// grade assignments/quizzes under Programs → a batch, not here.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // ?tab= lets search results (and shared links) open straight onto the right
  // tab — "assignments" hits from ⌘K would otherwise land on Content.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = params.get('tab');
    return ['content', 'assignments', 'quizzes'].includes(t) ? t : 'content';
  });

  // …and keeps working when a result is opened while already on this page.
  const wantTab = params.get('tab');
  const wantTopic = params.get('topic');
  useEffect(() => {
    if (wantTab && ['content', 'assignments', 'quizzes'].includes(wantTab)) setTab(wantTab);
    else if (wantTopic) setTab('content');
  }, [wantTab, wantTopic]);

  if (!isStudent) {
    return (
      <div>
        <h1>Learning</h1>
        <p className="muted">The course content your students see — teach from this. Create &amp; grade assignments and quizzes under <b>Programs → your batch</b>.</p>
        <Content />
      </div>
    );
  }

  return (
    <div>
      <h1>Learning</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
        <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Assignments & Projects</button>
        <button className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
      </div>
      {tab === 'content' && <Content />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'quizzes' && <Quizzes />}
    </div>
  );
}

function Quizzes() {
  const [items, setItems] = useState([]);
  const load = () => api('/quizzes?scope=mine').then((d) => setItems(d.quizzes || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  if (items.length === 0) return <p className="muted">No quizzes yet. They appear here once posted.</p>;
  return <div className="list">{items.map((q) => <QuizCard key={q._id} quiz={q} onDone={load} />)}</div>;
}

function QuizCard({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [review, setReview] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const attempt = quiz.myAttempt;
  const total = quiz.questions.length;
  const allAnswered = quiz.questions.every((_, i) => answers[i] != null);
  const q = quiz.questions[qIndex];

  // Once answering has begun, warn before an accidental tab close / reload —
  // draft answers live only in local state and aren't saved until submit.
  const dirty = open && !attempt && Object.keys(answers).length > 0 && !busy;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const ordered = quiz.questions.map((_, i) => (answers[i] ?? -1));
      await api(`/quizzes/${quiz._id}/attempt`, { method: 'POST', body: { answers: ordered } });
      onDone();
    } finally { setBusy(false); }
  }

  // Fetched once, then toggled — the review never changes after an attempt.
  async function toggleReview() {
    if (review) { setShowReview((v) => !v); return; }
    setBusy(true);
    try {
      setReview(await api(`/quizzes/${quiz._id}/review`));
      setShowReview(true);
    } finally { setBusy(false); }
  }

  const pct = attempt && attempt.total ? Math.round((attempt.score / attempt.total) * 100) : null;

  return (
    <div className="panel">
      <div className="row">
        <strong>{quiz.title}</strong>
        <span className="badge">{quiz.type}</span>
        {attempt && <span className="badge badge-student">Scored {attempt.score}/{attempt.total}</span>}
      </div>
      {!attempt && !open && <button className="btn sm" onClick={() => { setOpen(true); setQIndex(0); }}>Take quiz</button>}
      {attempt && (
        <div className="quiz-review-bar">
          <div className="qr-score">
            <span className="qr-score-pct">{pct}%</span>
            <span className="muted">{attempt.score} of {attempt.total} correct</span>
          </div>
          <button className="btn sm ghost" onClick={toggleReview} disabled={busy}>
            {busy ? 'Loading…' : showReview ? 'Hide review' : 'Review answers'}
          </button>
        </div>
      )}
      {showReview && review && <QuizReview questions={review.questions} />}
      {!attempt && open && (
        <form onSubmit={submit} className="quiz-take">
          <QuizStepper
            count={total}
            current={qIndex}
            onSelect={setQIndex}
            statusFor={(i) => (answers[i] != null ? 'answered' : 'unanswered')}
          />
          <div className="quiz-take-q-solo">
            <p className="quiz-take-q-count">Question {qIndex + 1} of {total}</p>
            <p className="quiz-take-q-text"><strong>{q.text}</strong></p>
            {q.options.map((o, oi) => (
              <label key={oi} className="quiz-opt">
                <input type="radio" name={`q-${quiz._id}-${qIndex}`} checked={answers[qIndex] === oi} onChange={() => setAnswers((a) => ({ ...a, [qIndex]: oi }))} />
                {o}
              </label>
            ))}
          </div>
          <div className="quiz-take-nav">
            <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
            {qIndex < total - 1 ? (
              <button type="button" className="btn sm" onClick={() => setQIndex((i) => i + 1)}>Next →</button>
            ) : (
              <button className="btn sm" disabled={busy || !allAnswered}>{busy ? 'Submitting…' : 'Submit answers'}</button>
            )}
          </div>
          {qIndex === total - 1 && !allAnswered && <p className="muted quiz-take-hint">Answer every question to submit.</p>}
        </form>
      )}
    </div>
  );
}

// Numbered step navigation shared by the take-quiz and review-quiz views, so
// a student jumps straight to any question instead of scrolling a stack of
// blocks. `statusFor` colors each pip: answered/unanswered while taking,
// correct/incorrect while reviewing.
function QuizStepper({ count, current, onSelect, statusFor }) {
  return (
    <div className="quiz-stepper" role="tablist" aria-label="Questions">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === current}
          className={`quiz-step ${statusFor(i)} ${i === current ? 'current' : ''}`}
          onClick={() => onSelect(i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

// Post-attempt feedback: every question with the student's pick, the right
// answer, and the author's explanation. This is where the quiz actually
// teaches — shown one question at a time via the stepper above it.
function QuizReview({ questions }) {
  const [qIndex, setQIndex] = useState(0);
  const total = questions.length;
  const q = questions[qIndex];

  return (
    <div className="quiz-review">
      <QuizStepper
        count={total}
        current={qIndex}
        onSelect={setQIndex}
        statusFor={(i) => (questions[i].isCorrect ? 'correct' : 'incorrect')}
      />

      <div className={`qr-q ${q.isCorrect ? 'ok' : 'bad'}`}>
        <div className="qr-q-head">
          <span className={`qr-mark ${q.isCorrect ? 'ok' : 'bad'}`}>{q.isCorrect ? '✓' : '✗'}</span>
          <div>
            <div className="qr-q-count">Question {qIndex + 1} of {total}</div>
            <strong>{q.text}</strong>
          </div>
        </div>

        <div className="qr-opts">
          {q.options.map((o, oi) => {
            const isCorrect = oi === q.correctIndex;
            const isMine = oi === q.myAnswer;
            return (
              <div key={oi} className={`qr-opt ${isCorrect ? 'correct' : isMine ? 'wrong' : ''}`}>
                <span>{o}</span>
                {isCorrect && <span className="qr-tag tag-correct">{isMine ? 'Your answer · correct' : 'Correct answer'}</span>}
                {isMine && !isCorrect && <span className="qr-tag tag-wrong">Your answer</span>}
              </div>
            );
          })}
        </div>

        {q.myAnswer === null && <p className="muted qr-blank">You left this one blank.</p>}

        {q.explanation && (
          <div className="qr-why">
            <div className="qr-why-label">Why</div>
            <Markdown text={q.explanation} />
          </div>
        )}
      </div>

      <div className="quiz-take-nav">
        <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
        <button type="button" className="btn ghost sm" disabled={qIndex === total - 1} onClick={() => setQIndex((i) => i + 1)}>Next →</button>
      </div>
    </div>
  );
}

function Content() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // The lesson you're on lives in the URL, so a lesson is a shareable link and
  // ⌘K can drop you straight into one instead of onto the page that holds it.
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topicId, setTopicId] = useState(null);
  const [open, setOpen] = useState({});
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }

  // Flatten the tree into an ordered lesson list for counting + prev/next.
  const flat = useMemo(() => {
    const arr = [];
    (program?.modules || []).forEach((m) => (m.chapters || []).forEach((c) => (c.topics || []).forEach((t) => arr.push({ topic: t, modId: m._id, chapId: c._id, mod: m.title, chap: c.title }))));
    return arr;
  }, [program]);
  const idx = flat.findIndex((f) => f.topic._id === topicId);
  const current = idx >= 0 ? flat[idx] : null;
  const topic = current?.topic || null;

  const loadProgress = (programId) => {
    if (!isStudent || !programId) return;
    api(`/progress/me?programId=${programId}`).then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); }).catch(() => {});
  };
  // Locate a topic anywhere in a program's tree, so a deep link can open the
  // right module + chapter as well as the right lesson.
  function locate(p, tid) {
    for (const m of p.modules || []) {
      for (const c of m.chapters || []) {
        for (const t of c.topics || []) if (String(t._id) === String(tid)) return { topic: t, modId: m._id, chapId: c._id };
      }
    }
    return null;
  }

  async function pick(id, preferTopicId) {
    const { program: p } = await api(`/programs/${id}`);
    setProgram(p); setCert(null);
    const target = preferTopicId ? locate(p, preferTopicId) : null;
    if (target) {
      setOpen({ [target.modId]: true, [target.chapId]: true });
      setTopicId(target.topic._id);
    } else {
      // Auto-open + select the very first lesson so the page is never empty.
      const firstMod = (p.modules || [])[0];
      const firstChap = firstMod?.chapters?.[0];
      const firstTopic = firstChap?.topics?.[0];
      setOpen(firstMod && firstChap ? { [firstMod._id]: true, [firstChap._id]: true } : {});
      setTopicId(firstTopic?._id || null);
    }
    loadProgress(id);
  }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  function selectTopic(f) {
    setTopicId(f.topic._id);
    setOpen((o) => ({ ...o, [f.modId]: true, [f.chapId]: true }));
    // replace, not push — Prev/Next shouldn't fill the back button with lessons.
    if (program) setParams({ program: program._id, topic: String(f.topic._id) }, { replace: true });
  }

  useEffect(() => {
    // Students only see the program(s) of the batches they're enrolled in.
    Promise.all([api('/programs'), isStudent ? api('/batches') : Promise.resolve({ batches: null })])
      .then(([pd, bd]) => {
        let list = pd.programs || [];
        if (bd.batches) {
          // Students see only published programs of the batches they're enrolled in.
          const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean));
          list = list.filter((p) => mine.has(p._id) && p.published);
        }
        setPrograms(list);
        // Honour a deep link (?program=&topic=) on first load; otherwise open
        // the first programme as before.
        const wantP = params.get('program');
        const start = (wantP && list.find((p) => p._id === wantP)) ? wantP : list[0]?._id;
        if (start) pick(start, params.get('topic'));
      })
      .catch(() => {});
  }, []);

  // A search result opened while already on this page only changes the URL —
  // react to that too, or ⌘K would appear to do nothing the second time.
  const urlProgram = params.get('program');
  const urlTopic = params.get('topic');
  useEffect(() => {
    if (!urlTopic || !program) return;
    if (String(urlTopic) === String(topicId)) return;
    if (urlProgram && urlProgram !== program._id) { pick(urlProgram, urlTopic); return; }
    const target = locate(program, urlTopic);
    if (target) { setTopicId(target.topic._id); setOpen((o) => ({ ...o, [target.modId]: true, [target.chapId]: true })); }
  }, [urlProgram, urlTopic]);

  async function toggleComplete(tid) {
    const { completedTopics } = await api('/progress/toggle', { method: 'POST', body: { programId: program._id, topicId: tid } });
    setCompleted(new Set(completedTopics));
  }
  async function viewCertificate() {
    const c = await api(`/progress/certificate?programId=${program._id}`);
    if (c.eligible) setCert(c);
  }

  const done = Math.min(completed.size, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = topic && completed.has(topic._id);
  const readingUrl = topic?.readingUrl || PLACEHOLDER_READING;
  const notesUrl = topic?.notesUrl || PLACEHOLDER_NOTES;

  return (
    <div className="learn">
      {/* Header: program picker + progress ring */}
      <div className="learn-top">
        <div className="learn-prog-pick">
          <span className="learn-eyebrow" id="learn-prog-label">Program</span>
          <select aria-labelledby="learn-prog-label" value={program?._id || ''} onChange={(e) => { if (e.target.value) { setParams({ program: e.target.value }, { replace: true }); pick(e.target.value); } }}>
            <option value="">Select a program…</option>
            {programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>
        </div>
        {program && isStudent && total > 0 && (
          <div className="learn-progress">
            <Ring pct={pct} />
            <div>
              <div className="learn-progress-pct">{pct}% complete</div>
              <div className="muted">{done} of {total} lessons</div>
            </div>
            {pct === 100 && <button className="btn sm" onClick={viewCertificate}>🎓 Certificate</button>}
          </div>
        )}
      </div>

      {!program ? (
        <div className="panel empty-state"><p className="muted">Choose a program above to start learning.</p></div>
      ) : flat.length === 0 ? (
        <div className="panel empty-state"><p className="muted">No lessons published yet.{!isStudent ? ' Add curriculum in Programs → Manage curriculum.' : ' Check back soon.'}</p></div>
      ) : (
        <div className="learn-grid">
          {/* Curriculum sidebar */}
          <aside className="curriculum">
            {(program.modules || []).map((m, mi) => {
              const mTopics = (m.chapters || []).flatMap((c) => c.topics || []);
              const mDone = mTopics.filter((t) => completed.has(t._id)).length;
              return (
                <div key={m._id} className="cur-mod">
                  <button className="cur-mod-head" onClick={() => toggle(m._id)}>
                    <span className="cur-mod-idx">{String(mi + 1).padStart(2, '0')}</span>
                    <span className="cur-mod-title">{m.title}</span>
                    {isStudent && mTopics.length > 0 && <span className="cur-mod-count">{mDone}/{mTopics.length}</span>}
                    <span className={`cur-caret ${open[m._id] ? 'up' : ''}`}>⌄</span>
                  </button>
                  {open[m._id] && (m.chapters || []).map((c) => (
                    <div key={c._id} className="cur-chap">
                      {(m.chapters.length > 1 || c.title !== 'Lessons') && <div className="cur-chap-title">{c.title}</div>}
                      {(c.topics || []).map((t) => {
                        const active = t._id === topicId;
                        const tdone = completed.has(t._id);
                        return (
                          <button key={t._id} className={`cur-topic ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })}>
                            {/* The dot carries state here exactly as it does on the Path. */}
                            <span className="cur-tick" />
                            <span className="cur-topic-title">{t.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </aside>

          {/* Lesson viewer */}
          <section className="lesson">
            {topic && (
              <>
                <div className="lesson-head">
                  <div className="lesson-head-top">
                    <div className="lesson-crumb">{current.mod}{current.chap && current.chap !== 'Lessons' ? ` · ${current.chap}` : ''}</div>
                  </div>
                  <h2 className="lesson-title">{topic.title}</h2>
                  {/* Same numbers the old chip read from — position in the
                      flattened lesson list, so it tracks as you move around. */}
                  <div className="lesson-position">Lesson {idx + 1} of {flat.length}</div>

                  {/* Three peers on one line. None is filled — the primary move
                      on this page is still "Mark complete" in the footer. */}
                  <div className="lesson-actions">
                    <button className="btn sm lesson-action" onClick={() => setViewer({ label: 'Reading Material', subtitle: topic.title, url: readingUrl })}>
                      <LessonIcon type="pdf" size={15} /> Reading Material
                    </button>
                    <button className="btn sm lesson-action" onClick={() => setViewer({ label: 'Teacher Notes', subtitle: topic.title, url: notesUrl })}>
                      <LineIcon name="slides" size={15} /> Teacher Notes
                    </button>
                    {topic.classLink ? (
                      <a className="btn sm lesson-action" href={topic.classLink} target="_blank" rel="noreferrer">
                        <LineIcon name="video" size={15} /> Join Class
                      </a>
                    ) : (
                      <button className="btn sm lesson-action" disabled title="The class link for this lecture hasn't been posted yet">
                        <LineIcon name="video" size={15} /> Not available yet
                      </button>
                    )}
                  </div>
                </div>

                <div className="lesson-body">
                  {topic.contentType === 'video' && topic.contentUrl && <LessonVideo key={topic._id} url={topic.contentUrl} />}
                  {topic.contentType === 'pdf' && topic.contentUrl && <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">📄 Open PDF</a>}
                  {topic.body ? <Markdown text={topic.body} /> : (topic.contentType === 'text' && <p className="muted">No content for this lesson yet.</p>)}
                </div>

                <div className="lesson-foot">
                  <button className="btn ghost sm" disabled={idx <= 0} onClick={() => flat[idx - 1] && selectTopic(flat[idx - 1])}>← Previous</button>
                  {isStudent && (
                    <button className={`btn ${isDone ? 'ghost' : 'on-stage'}`} onClick={() => toggleComplete(topic._id)}>
                      {isDone ? 'Completed' : 'Mark complete'}
                    </button>
                  )}
                  <button className="btn ghost sm" disabled={idx >= flat.length - 1} onClick={() => flat[idx + 1] && selectTopic(flat[idx + 1])}>Next →</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Lesson video with a graceful failure path — a dead CDN link or an
// unsupported codec should offer a retry and a direct link, not a black frame.
function LessonVideo({ url }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">This video couldn’t be loaded. It may have moved, or your connection dropped.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button>
          <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
        </div>
      </div>
    );
  }
  return <video key={attempt} src={url} controls className="lesson-video" onError={() => setFailed(true)} />;
}

// Circular progress indicator.
function Ring({ pct }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} className="ring-bg" />
      <circle cx="26" cy="26" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" className="ring-text">{pct}%</text>
    </svg>
  );
}

function CertificateModal({ cert, onClose }) {
  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="cert" onClick={(e) => e.stopPropagation()}>
        <div className="cert-inner">
          <div className="cert-brand">Skeo</div>
          <div className="cert-kicker">Certificate of Completion</div>
          <div className="cert-name">{cert.name}</div>
          <p className="cert-body">has successfully completed</p>
          <div className="cert-program">{cert.program}</div>
          <div className="cert-meta">
            <span>Issued {new Date(cert.issuedAt).toLocaleDateString()}</span>
            <span>ID {cert.certId}</span>
          </div>
        </div>
        <div className="cert-actions">
          <button className="btn" onClick={() => window.print()}>Download / Print</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Assignments() {
  const [items, setItems] = useState([]);
  const load = () => api('/assignments?scope=mine').then((d) => setItems(d.assignments || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  if (items.length === 0) return <p className="muted">No assignments yet. They appear once they're set.</p>;
  return (
    <div className="list">
      {items.map((a) => <AssignmentCard key={a._id} a={a} onChange={load} />)}
    </div>
  );
}

// Mirrors the admin-side DRIVE_TYPES list, in student-facing wording.
const REQUIRED_LABELS = {
  video: 'a video',
  image: 'a photo/screenshot',
  doc: 'a document (PDF, Word or text file)',
  slides: 'a slide deck (PPT)',
  html: 'an HTML file',
};

function AssignmentCard({ a, onChange }) {
  const { user } = useOutletContext();
  const sub = a.mySubmission;
  const [driveLink, setDriveLink] = useState(sub?.driveLink || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Editing re-runs verification server-side, so stale error text can
      // never survive a changed link.
      if (sub) await api(`/submissions/${sub._id}`, { method: 'PATCH', body: { driveLink } });
      else await api('/submissions', { method: 'POST', body: { assignmentId: a._id, driveLink } });
      setEditing(false);
      onChange();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!sub || !window.confirm('Delete this submission? This can’t be undone.')) return;
    setBusy(true);
    setError('');
    try { await api(`/submissions/${sub._id}`, { method: 'DELETE' }); onChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const fmt = (d) => new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const overdue = a.dueDate && new Date(a.dueDate) < new Date();
  const notOpenYet = a.startDate && new Date(a.startDate) > new Date();
  const due = a.dueDate && fmt(a.dueDate);
  const start = a.startDate && fmt(a.startDate);
  const showForm = (!sub || editing) && !notOpenYet;
  // Mirrors the server's rules — the API is still the authority, this just
  // avoids offering an action that would be rejected.
  const editable = !sub?.locked && !overdue && !notOpenYet;
  const required = (a.requiredDriveTypes || []).map((t) => REQUIRED_LABELS[t] || t);

  return (
    <div className="panel assign-card">
      <div className="assign-head">
        <div>
          <div className="assign-title"><strong>{a.title}</strong><span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span></div>
          {notOpenYet && <div className="assign-due"><LineIcon name="clock" size={13} /> Opens {start}</div>}
          {a.dueDate && <div className={`assign-due ${overdue && !sub ? 'overdue' : ''}`}><LineIcon name="clock" size={13} /> Due {due}{overdue ? ' · overdue' : ''}</div>}
        </div>
        {sub && <span className={`badge ${sub.status === 'graded' ? 'badge-student' : sub.status === 'submitted' ? 'badge-submitted' : ''}`}>{sub.status}</span>}
      </div>

      {a.description && <div className="assign-desc"><Markdown text={a.description} /></div>}

      {/* Current verification state — visible without opening notifications. */}
      {sub && !editing && (
        <SubmissionCheckPanel submission={{ ...sub, driveLink: sub.driveLink || sub.url }} audience="student" />
      )}

      {sub?.status === 'graded' && (
        <div className="graded">
          <div className="tile-value">{sub.score != null ? `${sub.score}/10` : '—'}</div>
          <div><strong>Score</strong>{sub.feedback && <p className="muted">“{sub.feedback}”</p>}</div>
        </div>
      )}

      {error && <p className="sub-check-error">{error}</p>}

      {notOpenYet ? (
        <p className="assign-note">Submissions for this {a.type} open on {start}.</p>
      ) : showForm ? (
        <form className="sub-form" onSubmit={submit}>
          {/* On an edit after a failed check, lead with what needs fixing. */}
          {editing && (sub?.checkStatus === 'NEEDS_FIXES' || sub?.checkStatus === 'CHECK_FAILED') && sub?.errorDetail && (
            <div className="sub-form-alert">
              <CheckBadge status={sub.checkStatus} audience="student" />
              <p>{sub.errorDetail}</p>
            </div>
          )}

          <div className="sub-form-grid">
            <div className="sub-field">
              <span className="sub-field-label">Student</span>
              <span className="sub-field-value">{user?.full_name || user?.fullName || user?.email}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">{a.type === 'project' ? 'Project' : 'Assignment'}</span>
              <span className="sub-field-value">{a.title}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">Opens</span>
              <span className="sub-field-value">{start || 'Open now'}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">Last date to submit</span>
              <span className={`sub-field-value ${overdue ? 'is-overdue' : ''}`}>{due || 'No deadline'}</span>
            </div>
          </div>

          {/* What the automated check will look for — shown so the student
              isn't guessing at what the folder must contain. */}
          {required.length > 0 && (
            <p className="muted sub-form-hint">
              <strong>Your folder must contain:</strong> {required.join(', ')}.
            </p>
          )}

          <label className="sub-field-label" htmlFor={`drive-${a._id}`}>Google Drive folder link</label>
          <div className="assign-submit">
            <input
              id={`drive-${a._id}`}
              placeholder="https://drive.google.com/drive/folders/…"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              required
            />
            <button className="btn sm" disabled={busy}>{busy ? 'Checking…' : (sub ? 'Save' : 'Submit')}</button>
            {sub && <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setError(''); setDriveLink(sub.driveLink || ''); }}>Cancel</button>}
          </div>
          <p className="muted sub-form-hint">Share the folder as “Anyone with the link can view”, and include your video, screenshots, and write-up.</p>
        </form>
      ) : sub?.locked ? (
        <p className="assign-note">This submission has been reviewed and is locked. Ask your administrator to unlock it if you need to change it.</p>
      ) : overdue ? (
        <p className="assign-note">The deadline has passed, so this submission can no longer be changed.</p>
      ) : (
        <div className="inline-form">
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)} disabled={!editable}>Edit</button>
          <button type="button" className="btn sm ghost" onClick={remove} disabled={busy || !editable}>Delete</button>
        </div>
      )}
    </div>
  );
}
