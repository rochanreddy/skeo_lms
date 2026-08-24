import { useEffect, useState } from 'react';
import { api } from '../api.js';
import LineIcon from './LineIcon.jsx';
import Markdown from './Markdown.jsx';
import DateTimePicker from './DateTimePicker.jsx';

// Authoring for the two things students hand in against: projects/assignments
// and quizzes. Both live under Programs → Manage curriculum, next to the
// lessons they belong to — writing a module and writing its work is one job.
// Grading what comes back stays on the Course page.

const dueLabel = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// What an admin can demand inside the student's Drive folder. Written
// deliverables only — no video or photo requirements. Ticking 'html' also
// lifts the default block on HTML files for this assignment.
export const DRIVE_TYPES = [
  { key: 'doc', label: 'Document', hint: 'PDF, Word, text file' },
  { key: 'slides', label: 'Slide deck', hint: 'PPT, Google Slides' },
  { key: 'html', label: 'HTML file / artifact', hint: 'blocked unless ticked' },
];

// ══ Projects & assignments ══════════════════════════════════════════════
export function ProjectsManager({ batchId }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => api(`/assignments?batchId=${batchId}`).then((d) => setItems(d.assignments || [])).catch(() => {});
  useEffect(() => { if (batchId) load(); }, [batchId]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  async function act(fn, ok) { try { await fn(); flash(ok); } catch (e) { flash(e.message); } }

  const remove = (a) => {
    if (!window.confirm(`Delete "${a.title}"? Every submission under it goes too. This can't be undone.`)) return;
    act(() => api(`/assignments/${a._id}`, { method: 'DELETE' }).then(load), 'Deleted');
  };

  if (!batchId) return <p className="muted">No course to attach work to yet — create it on the Course page first.</p>;

  return (
    <div>
      <div className="cw-head">
        <div>
          <h3 style={{ margin: 0 }}>Projects &amp; assignments</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            Students see these under Learning → Assignments &amp; Projects, with the brief on one side and their submission on the other.
          </p>
        </div>
        {msg && <span className="muted ce-msg">{msg}</span>}
      </div>

      <AssignmentForm onAdd={(body) => act(() => api('/assignments', { method: 'POST', body: { batchId, ...body } }).then(load), 'Posted')} />

      <div style={{ marginTop: 16 }}>
        {items.map((a) => (
          <div key={a._id} className="assignment">
            {editing === a._id ? (
              <AssignmentForm
                initial={a}
                onCancel={() => setEditing(null)}
                onAdd={(body) => act(() => api(`/assignments/${a._id}`, { method: 'PATCH', body }).then(() => { setEditing(null); load(); }), 'Updated')}
              />
            ) : (
              <>
                <div className="assignment-head">
                  <strong>{a.title}</strong>
                  <span className={`badge ${a.type === 'project' ? 'badge-accent' : ''}`}>{a.type}</span>
                  {a.startDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Opens {dueLabel(a.startDate)}</span>}
                  {a.dueDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Due {dueLabel(a.dueDate)}</span>}
                  <span className="assignment-tools">
                    <button className="btn sm ghost" onClick={() => setEditing(a._id)}>Edit</button>
                    <button className="btn sm ghost-danger" onClick={() => remove(a)}>Delete</button>
                  </span>
                </div>
                <div className="assignment-reqs">
                  {(a.videoUrl || a.pdfUrl) && (
                    <>
                      <span className="muted">Content:</span>
                      {a.videoUrl && <span className="badge badge-muted">video</span>}
                      {a.pdfUrl && <span className="badge badge-muted">PDF</span>}
                    </>
                  )}
                  {(a.requiredDriveTypes || []).length > 0 && (
                    <>
                      <span className="muted">Must submit:</span>
                      {a.requiredDriveTypes.map((t) => (
                        <span key={t} className="badge badge-muted">{DRIVE_TYPES.find((d) => d.key === t)?.label || t}</span>
                      ))}
                    </>
                  )}
                </div>
                {a.description && <div className="assignment-desc"><Markdown text={a.description} /></div>}
              </>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="muted">Nothing set yet. Post the first one above.</p>}
      </div>
    </div>
  );
}

// The picker's value contract is 'YYYY-MM-DDTHH:mm' local; the API stores ISO.
const toPickerValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// One form, two jobs: posting new work and editing existing work. Pass
// `initial` to edit — it opens prefilled and stays open.
export function AssignmentForm({ onAdd, initial, onCancel }) {
  const editing = Boolean(initial);
  const [open, setOpen] = useState(editing);
  const [title, setTitle] = useState(initial?.title || '');
  const [type, setType] = useState(initial?.type || 'assignment');
  const [description, setDescription] = useState(initial?.description || '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl || '');
  const [pdfUrl, setPdfUrl] = useState(initial?.pdfUrl || '');
  const [startDate, setStartDate] = useState(toPickerValue(initial?.startDate));
  const [dueDate, setDueDate] = useState(toPickerValue(initial?.dueDate));
  const [required, setRequired] = useState(initial?.requiredDriveTypes || ['doc']);
  const [err, setErr] = useState('');

  function reset() {
    if (editing) { onCancel?.(); return; }
    setTitle(''); setType('assignment'); setDescription(''); setVideoUrl(''); setPdfUrl('');
    setStartDate(''); setDueDate(''); setRequired(['doc']);
    setErr(''); setOpen(false);
  }

  const toggleType = (key) =>
    setRequired((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      return setErr('The start date must be before the last date for submission.');
    }
    onAdd({
      title: title.trim(),
      type,
      description: description.trim(),
      videoUrl: videoUrl.trim(),
      pdfUrl: pdfUrl.trim(),
      startDate: startDate ? new Date(startDate).toISOString() : null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      requiredDriveTypes: required,
    });
    reset();
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New project / assignment</button>;

  return (
    <form className="af" onSubmit={submit}>
      <div className="af-top">
        <input className="af-title" placeholder={type === 'project' ? 'Project title' : 'Assignment title'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="af-seg">
          <button type="button" className={type === 'assignment' ? 'on' : ''} onClick={() => setType('assignment')}>Assignment</button>
          <button type="button" className={type === 'project' ? 'on' : ''} onClick={() => setType('project')}>Project</button>
        </div>
      </div>

      <label className="af-label">Description &amp; instructions</label>
      <textarea
        className="af-desc"
        rows={6}
        placeholder={"Explain the task clearly:\n• What students need to do\n• Deliverables to submit\n• How it will be graded\n\nMarkdown supported — **bold**, - lists, `code`."}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="af-label">Content <span className="muted">(shown beside the submission form)</span></label>
      <div className="af-content">
        <input className="af-content-field" placeholder="Video URL (https://… .mp4) — plays inline" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        <input className="af-content-field" placeholder="PDF URL (https://… .pdf) — opens in the viewer" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
      </div>

      <label className="af-label">Required in the Drive folder</label>
      <p className="af-hint">
        The automated check rejects a submission whose folder is missing any ticked item.
        Untick everything to accept any files.
      </p>
      <div className="af-reqs">
        {DRIVE_TYPES.map((t) => (
          <label key={t.key} className={`af-req ${required.includes(t.key) ? 'on' : ''}`}>
            <input type="checkbox" checked={required.includes(t.key)} onChange={() => toggleType(t.key)} />
            <span><strong>{t.label}</strong><span className="muted"> · {t.hint}</span></span>
          </label>
        ))}
      </div>

      {err && <p className="sub-check-error">{err}</p>}

      <div className="af-foot">
        <label className="af-due">
          <span>Start date <span className="muted">(optional)</span></span>
          <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Open immediately" />
        </label>
        <label className="af-due">
          <span>Last date to submit <span className="muted">(optional)</span></span>
          <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="No deadline" />
        </label>
        <div className="af-actions">
          <button type="button" className="btn ghost sm" onClick={reset}>Cancel</button>
          <button className="btn sm" disabled={!title.trim()}>{editing ? 'Save changes' : `Post ${type}`}</button>
        </div>
      </div>
    </form>
  );
}

// ══ Quizzes ═════════════════════════════════════════════════════════════
// One gate quiz per module: attempting it unlocks the next module. Listed in
// module order so the gates read as the sequence students actually meet.
export function QuizzesManager({ programId, modules, batchId }) {
  const [quizzes, setQuizzes] = useState([]);
  const [editing, setEditing] = useState(null);   // quiz id
  const [adding, setAdding] = useState(null);     // moduleId ('' = a loose quiz)
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [gates, batch] = await Promise.all([
      api(`/quizzes?programId=${programId}`).then((d) => d.quizzes || []).catch(() => []),
      batchId ? api(`/quizzes?batchId=${batchId}`).then((d) => d.quizzes || []).catch(() => []) : Promise.resolve([]),
    ]);
    setQuizzes([...gates, ...batch]);
  };
  useEffect(() => { if (programId) load(); }, [programId, batchId]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };
  async function act(fn, ok) { try { await fn(); flash(ok); } catch (e) { flash(e.message); } }

  const byModule = new Map(quizzes.filter((q) => q.moduleId).map((q) => [String(q.moduleId), q]));
  const loose = quizzes.filter((q) => !q.moduleId);

  const remove = (q) => {
    if (!window.confirm(`Delete "${q.title}"? Every attempt at it goes too.`)) return;
    act(() => api(`/quizzes/${q._id}`, { method: 'DELETE' }).then(load), 'Deleted');
  };

  return (
    <div>
      <div className="cw-head">
        <div>
          <h3 style={{ margin: 0 }}>Quizzes</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            One gate quiz per module. A student must attempt a module's quiz before the next module unlocks.
          </p>
        </div>
        {msg && <span className="muted ce-msg">{msg}</span>}
      </div>

      {(modules || []).map((m, i) => {
        const q = byModule.get(String(m._id));
        return (
          <div key={m._id} className="assignment">
            <div className="assignment-head">
              <span className="cw-modnum">{String(i + 1).padStart(2, '0')}</span>
              <strong>{m.title}</strong>
              {q
                ? <span className="badge badge-accent">{q.questions?.length || 0} questions</span>
                : <span className="badge badge-muted">No gate quiz</span>}
              <span className="assignment-tools">
                {q ? (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing(editing === q._id ? null : q._id)}>
                      {editing === q._id ? 'Close' : 'Edit quiz'}
                    </button>
                    <button className="btn sm ghost-danger" onClick={() => remove(q)}>Delete</button>
                  </>
                ) : (
                  <button className="btn sm ghost" onClick={() => setAdding(adding === String(m._id) ? null : String(m._id))}>
                    {adding === String(m._id) ? 'Cancel' : '+ Add gate quiz'}
                  </button>
                )}
              </span>
            </div>
            {q && <div className="muted" style={{ fontSize: 13 }}>{q.title}</div>}

            {editing === q?._id && (
              <QuizEditor
                initial={q}
                onCancel={() => setEditing(null)}
                onSave={(body) => act(
                  () => api(`/quizzes/${q._id}`, { method: 'PATCH', body }).then(() => { setEditing(null); load(); }),
                  'Quiz updated',
                )}
              />
            )}
            {adding === String(m._id) && (
              <QuizEditor
                onCancel={() => setAdding(null)}
                onSave={(body) => act(
                  () => api('/quizzes', { method: 'POST', body: { programId, moduleId: String(m._id), ...body } })
                    .then(() => { setAdding(null); load(); }),
                  'Quiz posted',
                )}
              />
            )}
          </div>
        );
      })}

      {loose.length > 0 && (
        <>
          <h4 className="cw-sub">Other quizzes <span className="muted">(not attached to a module)</span></h4>
          {loose.map((q) => (
            <div key={q._id} className="assignment">
              <div className="assignment-head">
                <strong>{q.title}</strong>
                <span className="badge">{q.type}</span>
                <span className="badge badge-muted">{q.questions?.length || 0} questions</span>
                <span className="assignment-tools">
                  <button className="btn sm ghost" onClick={() => setEditing(editing === q._id ? null : q._id)}>
                    {editing === q._id ? 'Close' : 'Edit quiz'}
                  </button>
                  <button className="btn sm ghost-danger" onClick={() => remove(q)}>Delete</button>
                </span>
              </div>
              {editing === q._id && (
                <QuizEditor
                  initial={q}
                  onCancel={() => setEditing(null)}
                  onSave={(body) => act(
                    () => api(`/quizzes/${q._id}`, { method: 'PATCH', body }).then(() => { setEditing(null); load(); }),
                    'Quiz updated',
                  )}
                />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Author or edit one quiz. Editing the questions of a quiz students have
// already sat is refused server-side — the error surfaces in the flash line.
function QuizEditor({ initial, onSave, onCancel }) {
  const blank = () => ({ text: '', options: ['', ''], correctIndex: 0, explanation: '' });
  const [title, setTitle] = useState(initial?.title || '');
  const [type, setType] = useState(initial?.type || 'quiz');
  const [questions, setQuestions] = useState(
    initial?.questions?.length
      ? initial.questions.map((q) => ({
        text: q.text || '',
        options: [...(q.options || ['', ''])],
        // A student-shaped quiz hides correctIndex; default to the first option.
        correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
        explanation: q.explanation || '',
      }))
      : [blank()],
  );

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi, oi, val) => setQ(qi, { options: questions[qi].options.map((o, idx) => (idx === oi ? val : o)) });
  const addOption = (qi) => setQ(qi, { options: [...questions[qi].options, ''] });
  const addQuestion = () => setQuestions((qs) => [...qs, blank()]);
  const dropQuestion = (qi) => setQuestions((qs) => (qs.length > 1 ? qs.filter((_, i) => i !== qi) : qs));

  function submit(e) {
    e.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.text.trim() && q.options.length >= 2);
    if (!title.trim() || clean.length === 0) return;
    onSave({ title: title.trim(), type, questions: clean });
  }

  return (
    <form className="quiz-builder" onSubmit={submit}>
      <div className="inline-form">
        <input placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="quiz">Quiz</option><option value="exam">Exam</option>
        </select>
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="quiz-q">
          <div className="row">
            <input style={{ flex: 1 }} placeholder={`Question ${qi + 1}`} value={q.text} onChange={(e) => setQ(qi, { text: e.target.value })} />
            {questions.length > 1 && (
              <button type="button" className="ce-mini danger" title="Remove question" onClick={() => dropQuestion(qi)}>✕</button>
            )}
          </div>
          {q.options.map((o, oi) => (
            <label key={oi} className="quiz-opt">
              <input type="radio" name={`correct-${initial?._id || 'new'}-${qi}`} checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} />
              <input placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => setOpt(qi, oi, e.target.value)} />
            </label>
          ))}
          <button type="button" className="btn sm ghost" onClick={() => addOption(qi)}>+ option</button>
          <textarea
            className="quiz-why-input"
            rows={2}
            placeholder="Explanation (optional) — shown to students after they answer"
            value={q.explanation}
            onChange={(e) => setQ(qi, { explanation: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={addQuestion}>+ question</button>
        <button className="btn sm" type="submit">{initial ? 'Save quiz' : 'Post quiz'}</button>
        <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Tick the radio next to the correct option. Explanations appear in the student's answer review.
        {initial && ' Questions can only change while no one has sat this quiz yet.'}
      </p>
    </form>
  );
}
