import { useEffect, useMemo, useRef, useState } from 'react';
import { api, postFile } from '../api.js';
import LessonIcon from './LessonIcon.jsx';
import { ProjectsManager, QuizzesManager } from './CourseWork.jsx';
import VdoLibrary from './VdoLibrary.jsx';

// Admin curriculum builder for one program. Upload a doc to auto-structure it,
// then review/edit the Module → Chapter → Topic tree and publish.
export default function CurriculumEditor({ programId, onClose }) {
  const [program, setProgram] = useState(null);
  const [modules, setModules] = useState([]);
  const [published, setPublished] = useState(false);
  const [sel, setSel] = useState(null); // { mi, ci, ti }
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState('curriculum'); // curriculum | projects | quizzes
  // Projects hang off the single course record, not the programme.
  const [batchId, setBatchId] = useState(null);
  const fileRef = useRef(null);
  // VdoCipher is only offered when the server actually holds an API secret --
  // otherwise the option would be a field that silently never plays.
  const [vdoReady, setVdoReady] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api(`/programs/${programId}`).then(({ program: p }) => {
      setProgram(p); setModules(p.modules || []); setPublished(!!p.published);
    }).catch(() => {});
  }, [programId]);

  useEffect(() => {
    api('/batches').then((d) => setBatchId((d.batches || [])[0]?.id || null)).catch(() => {});
    api('/videos/config').then((d) => setVdoReady(!!d.configured)).catch(() => {});
  }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  // Immutable tree edit: clone, mutate via callback, mark dirty.
  const edit = (fn) => setModules((prev) => { const next = structuredClone(prev); fn(next); return next; });
  const touch = (fn) => { edit(fn); setDirty(true); };

  const stats = useMemo(() => {
    const topics = modules.reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);
    return { modules: modules.length, topics };
  }, [modules]);

  // ── Tree mutators ──
  const addModule = () => touch((m) => m.push({ title: 'New module', order: m.length, chapters: [] }));
  const addChapter = (mi) => touch((m) => m[mi].chapters.push({ title: 'New chapter', order: m[mi].chapters.length, topics: [] }));
  const addTopic = (mi, ci) => touch((m) => m[mi].chapters[ci].topics.push({ title: 'New lesson', contentType: 'text', contentUrl: '', body: '', classLink: '', readingUrl: '', order: m[mi].chapters[ci].topics.length }));
  const delModule = (mi) => { touch((m) => m.splice(mi, 1)); setSel(null); };
  const delChapter = (mi, ci) => { touch((m) => m[mi].chapters.splice(ci, 1)); setSel(null); };
  const delTopic = (mi, ci, ti) => { touch((m) => m[mi].chapters[ci].topics.splice(ti, 1)); setSel(null); };
  const setModuleTitle = (mi, v) => touch((m) => { m[mi].title = v; });
  const setChapterTitle = (mi, ci, v) => touch((m) => { m[mi].chapters[ci].title = v; });
  const setTopicField = (mi, ci, ti, patch) => touch((m) => { Object.assign(m[mi].chapters[ci].topics[ti], patch); });
  const move = (mi, dir) => touch((m) => { const j = mi + dir; if (j < 0 || j >= m.length) return; [m[mi], m[j]] = [m[j], m[mi]]; });

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { modules: parsed, stats: st } = await postFile(`/programs/${programId}/import`, file);
      touch((m) => { parsed.forEach((pm) => m.push({ ...pm, order: m.length })); });
      flash(`Imported ${st.modules} module(s), ${st.topics} lesson(s) from ${file.name}`);
    } catch (err) { flash(err.message); }
    finally { setImporting(false); }
  }

  async function save() {
    try {
      await api(`/programs/${programId}`, { method: 'PATCH', body: { modules, published } });
      setDirty(false); flash('Curriculum saved — students see it now.');
    } catch (err) { flash(err.message); }
  }

  if (!program) return <div className="panel">Loading…</div>;
  const selTopic = sel ? modules[sel.mi]?.chapters[sel.ci]?.topics[sel.ti] : null;

  return (
    <div className="ce">
      <div className="ce-bar">
        <button className="btn ghost sm" onClick={onClose}>← Programs</button>
        <div className="ce-bar-title"><strong>{program.title}</strong> <span className="muted">· {stats.modules} modules · {stats.topics} lessons</span></div>
        {view === 'curriculum' && (
          <label className="ce-pub"><input type="checkbox" checked={published} onChange={(e) => { setPublished(e.target.checked); setDirty(true); }} /> Published</label>
        )}
        {msg && <span className="muted ce-msg">{msg}</span>}
        {view === 'curriculum' && (
          <button className="btn" onClick={save} disabled={!dirty}>{dirty ? 'Save changes' : 'Saved'}</button>
        )}
      </div>

      {/* Three things belong to a programme: its lessons, the work set against
          them, and the quizzes that gate them. Author all three in one place. */}
      <div className="tabs ce-views">
        <button className={`tab ${view === 'curriculum' ? 'active' : ''}`} onClick={() => setView('curriculum')}>Curriculum</button>
        <button className={`tab ${view === 'projects' ? 'active' : ''}`} onClick={() => setView('projects')}>Projects &amp; assignments</button>
        <button className={`tab ${view === 'quizzes' ? 'active' : ''}`} onClick={() => setView('quizzes')}>Quizzes</button>
      </div>

      {view === 'projects' && <ProjectsManager batchId={batchId} />}
      {view === 'quizzes' && <QuizzesManager programId={programId} modules={modules} batchId={batchId} />}

      {view === 'curriculum' && (
      <>

      <div className="ce-import">
        <div>
          <strong>📥 Import from a document</strong>
          <p className="muted" style={{ margin: '2px 0 0' }}>Upload a <b>.docx</b>, <b>.pdf</b>, <b>.md</b> or <b>.txt</b> — headings become modules & lessons automatically. Review below, then Save.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".docx,.pdf,.md,.txt,.markdown" onChange={onImport} hidden />
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Reading…' : 'Choose file'}</button>
        </div>
      </div>

      <div className="ce-grid">
        <aside className="ce-tree">
          {modules.length === 0 && <p className="muted" style={{ padding: 12 }}>No content yet — import a doc or add a module.</p>}
          {modules.map((m, mi) => (
            <div key={mi} className="ce-mod">
              <div className="ce-mod-head">
                <input className="ce-mod-input" value={m.title} onChange={(e) => setModuleTitle(mi, e.target.value)} />
                <button className="ce-mini" title="Move up" onClick={() => move(mi, -1)}>↑</button>
                <button className="ce-mini" title="Move down" onClick={() => move(mi, 1)}>↓</button>
                <button className="ce-mini danger" title="Delete module" onClick={() => delModule(mi)}>✕</button>
              </div>
              {(m.chapters || []).map((c, ci) => (
                <div key={ci} className="ce-chap">
                  <div className="ce-chap-head">
                    <input className="ce-chap-input" value={c.title} onChange={(e) => setChapterTitle(mi, ci, e.target.value)} />
                    <button className="ce-mini danger" title="Delete chapter" onClick={() => delChapter(mi, ci)}>✕</button>
                  </div>
                  {(c.topics || []).map((t, ti) => {
                    const active = sel && sel.mi === mi && sel.ci === ci && sel.ti === ti;
                    return (
                      <div key={ti} className={`ce-topic ${active ? 'active' : ''}`} onClick={() => setSel({ mi, ci, ti })}>
                        <span className="ce-topic-type"><LessonIcon type={t.contentType} size={13} /></span>
                        <span className="ce-topic-title">{t.title || 'Untitled'}</span>
                        <button className="ce-mini danger" title="Delete lesson" onClick={(e) => { e.stopPropagation(); delTopic(mi, ci, ti); }}>✕</button>
                      </div>
                    );
                  })}
                  <button className="ce-add" onClick={() => addTopic(mi, ci)}>+ lesson</button>
                </div>
              ))}
              <button className="ce-add" onClick={() => addChapter(mi)}>+ chapter</button>
            </div>
          ))}
          <button className="btn ghost sm ce-addmod" onClick={addModule}>+ Add module</button>
        </aside>

        <section className="ce-editor panel">
          {!selTopic ? (
            <div className="empty-state"><p className="muted">Select a lesson to edit its content, or import a document above.</p></div>
          ) : (
            <>
              <label className="ce-label">Lesson title</label>
              <input className="ce-field" value={selTopic.title} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { title: e.target.value })} />

              <label className="ce-label">Type</label>
              <div className="ce-types">
                {['text', 'video', 'pdf'].map((tp) => (
                  <button key={tp} className={`ce-type ${selTopic.contentType === tp ? 'on' : ''}`} onClick={() => setTopicField(sel.mi, sel.ci, sel.ti, { contentType: tp })}>
                    <LessonIcon type={tp} size={14} /> {tp === 'video' ? 'Video' : tp === 'pdf' ? 'PDF' : 'Reading'}
                  </button>
                ))}
              </div>

              {/* A video lesson picks its source; a PDF lesson just has a URL. */}
              {selTopic.contentType === 'video' && vdoReady && (
                <>
                  <label className="ce-label">Video source</label>
                  <div className="ce-types">
                    {[['url', 'Direct URL'], ['vdocipher', 'VdoCipher (DRM)']].map(([src, label]) => (
                      <button
                        key={src}
                        className={`ce-type ${(selTopic.videoSource || 'url') === src ? 'on' : ''}`}
                        onClick={() => setTopicField(sel.mi, sel.ci, sel.ti, { videoSource: src })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selTopic.contentType === 'video' && vdoReady && selTopic.videoSource === 'vdocipher' ? (
                <>
                  <label className="ce-label">
                    VdoCipher video <span className="muted">(encrypted playback, watermarked with the student's name)</span>
                  </label>
                  <div className="row">
                    <input
                      className="ce-field"
                      placeholder="Video ID — or pick one from the library"
                      value={selTopic.vdoVideoId || ''}
                      onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { vdoVideoId: e.target.value.trim() })}
                    />
                    <button className="btn sm" onClick={() => setPicking(true)}>Library…</button>
                  </div>
                </>
              ) : selTopic.contentType !== 'text' && (
                <>
                  <label className="ce-label">{selTopic.contentType === 'video' ? 'Video URL' : 'PDF URL'}</label>
                  <input className="ce-field" placeholder="https://…" value={selTopic.contentUrl} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { contentUrl: e.target.value })} />
                </>
              )}

              {/* Independent of content type — a reading lesson can still have
                  had a live class about it. */}
              <label className="ce-label">Class link <span className="muted">(the meeting link while it's live, YouTube once recorded — leave empty and students see "Not available yet")</span></label>
              <input
                className="ce-field"
                placeholder="https://meet.google.com/… or https://youtube.com/watch?v=…"
                value={selTopic.classLink || ''}
                onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { classLink: e.target.value })}
              />

              <label className="ce-label">Reading material <span className="muted">(PDF — opens in the in-page viewer)</span></label>
              <input
                className="ce-field"
                placeholder="https://… .pdf"
                value={selTopic.readingUrl || ''}
                onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { readingUrl: e.target.value })}
              />

              <label className="ce-label">Content <span className="muted">(Markdown — # headings, **bold**, - lists, `code`)</span></label>
              <textarea className="ce-body" rows={16} value={selTopic.body} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { body: e.target.value })} placeholder="Write the lesson content here…" />
            </>
          )}
        </section>
      </div>
      </>
      )}

      {picking && selTopic && (
        <VdoLibrary
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setTopicField(sel.mi, sel.ci, sel.ti, { videoSource: 'vdocipher', vdoVideoId: v.id });
            setPicking(false);
            flash(`Attached “${v.title || v.id}”. Save to publish it.`);
          }}
        />
      )}
    </div>
  );
}
