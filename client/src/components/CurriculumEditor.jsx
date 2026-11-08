import { useEffect, useMemo, useRef, useState } from 'react';
import { api, postFile } from '../api.js';
import LessonIcon from './LessonIcon.jsx';
import { ProjectsManager, QuizzesManager } from './CourseWork.jsx';
import VdoLibrary from './VdoLibrary.jsx';
import VdoCheck from './VdoCheck.jsx';
import { isReady, loadLibrary } from '../lib/vdoLinks.js';
import { addFrame, missingFrame } from '../lib/courseFrame.js';

// Admin curriculum builder for one program. Upload a doc to auto-structure it,
// then review/edit the Module → Chapter → Topic tree and publish.
//
// Lesson recordings live on VdoCipher and nowhere else: a video lesson has one
// video, chosen from the account's library (or uploaded into it). Until it has
// one, students see "this lesson's video is on its way", and this editor says
// so next to the lesson.
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
  const [pasting, setPasting] = useState(false);
  // The account's library, so a lesson can show its video by name and state
  // rather than as an id. null until it has loaded.
  const [library, setLibrary] = useState(null);

  useEffect(() => {
    api(`/programs/${programId}`).then(({ program: p }) => {
      setProgram(p); setModules(p.modules || []); setPublished(!!p.published);
    }).catch(() => {});
  }, [programId]);

  useEffect(() => {
    api('/batches').then((d) => setBatchId((d.batches || [])[0]?.id || null)).catch(() => {});
    api('/videos/config').then((d) => setVdoReady(!!d.configured)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!vdoReady) return;
    // Fresh on each visit; the video check below reuses this same read.
    loadLibrary(api, { fresh: true }).then(setLibrary).catch(() => setLibrary([]));
  }, [vdoReady]);
  const videoById = useMemo(() => new Map((library || []).map((v) => [v.id, v])), [library]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  // Immutable tree edit: clone, mutate via callback, mark dirty.
  const edit = (fn) => setModules((prev) => { const next = structuredClone(prev); fn(next); return next; });
  const touch = (fn) => { edit(fn); setDirty(true); };

  const stats = useMemo(() => {
    let topics = 0; let videos = 0; let linked = 0;
    for (const m of modules) for (const c of m.chapters || []) for (const t of c.topics || []) {
      topics += 1;
      if (t.contentType === 'video') { videos += 1; if (t.vdoVideoId) linked += 1; }
    }
    return { modules: modules.length, topics, videos, linked };
  }, [modules]);

  // Module intros and recaps the course does not have yet.
  const frame = useMemo(() => missingFrame(modules), [modules]);
  const addIntrosAndRecaps = () => {
    const n = frame.count;
    touch((m) => { addFrame(m); });
    setSel(null); // lessons moved down a slot; the open one may be another now
    flash(`Added ${n} lesson${n === 1 ? '' : 's'}. Save to show ${n === 1 ? 'it' : 'them'} to students.`);
  };

  // ── Tree mutators ──
  const addModule = () => touch((m) => m.push({ title: 'New module', order: m.length, chapters: [] }));
  const addChapter = (mi) => touch((m) => m[mi].chapters.push({ title: 'New chapter', order: m[mi].chapters.length, topics: [] }));
  const addTopic = (mi, ci) => touch((m) => m[mi].chapters[ci].topics.push({ title: 'New lesson', contentType: 'video', videoSource: 'vdocipher', vdoVideoId: '', contentUrl: '', body: '', order: m[mi].chapters[ci].topics.length }));
  const delModule = (mi) => { touch((m) => m.splice(mi, 1)); setSel(null); };
  const delChapter = (mi, ci) => { touch((m) => m[mi].chapters.splice(ci, 1)); setSel(null); };
  const delTopic = (mi, ci, ti) => { touch((m) => m[mi].chapters[ci].topics.splice(ti, 1)); setSel(null); };
  const setModuleTitle = (mi, v) => touch((m) => { m[mi].title = v; });
  const setChapterTitle = (mi, ci, v) => touch((m) => { m[mi].chapters[ci].title = v; });
  const setTopicField = (mi, ci, ti, patch) => touch((m) => { Object.assign(m[mi].chapters[ci].topics[ti], patch); });
  const move = (mi, dir) => touch((m) => { const j = mi + dir; if (j < 0 || j >= m.length) return; [m[mi], m[j]] = [m[j], m[mi]]; });
  const select = (p) => {
    setSel(p);
    setPasting(false);
    // On a phone the lesson opens below the list and the check: bring it up.
    if (p && window.matchMedia?.('(max-width: 820px)').matches) {
      requestAnimationFrame(() => document.querySelector('.ce-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  };
  // A lesson's type decides what it carries; a video lesson is always VdoCipher.
  const setType = (tp) => setTopicField(sel.mi, sel.ci, sel.ti, tp === 'video' ? { contentType: 'video', videoSource: 'vdocipher' } : { contentType: tp });
  const attachVideo = (v) => {
    setTopicField(sel.mi, sel.ci, sel.ti, { videoSource: 'vdocipher', vdoVideoId: v.id, contentUrl: '' });
    // A fresh upload is not in the library we loaded; remember it ourselves.
    if (library && !videoById.has(v.id)) setLibrary([...library, v]);
  };
  // From the video check: point each lesson at the library video it matched.
  const linkVideos = (matches) => {
    touch((m) => {
      for (const p of matches) Object.assign(m[p.mi].chapters[p.ci].topics[p.ti], { videoSource: 'vdocipher', vdoVideoId: p.match.id, contentUrl: '' });
    });
    flash(`Linked ${matches.length} lesson${matches.length === 1 ? '' : 's'}. Save to publish ${matches.length === 1 ? 'it' : 'them'}.`);
  };

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
      setDirty(false); flash('Curriculum saved: students see it now.');
    } catch (err) { flash(err.message); }
  }

  /** How a video lesson stands: what the tree dot and the editor card both say. */
  const videoState = (t) => {
    if (t.contentType !== 'video') return null;
    const id = (t.vdoVideoId || '').trim();
    if (!id) return { tone: 'none', label: 'No video yet' };
    if (!library) return { tone: 'wait', label: 'Checking the library…' };
    const v = videoById.get(id);
    if (!v) return { tone: 'none', label: 'Not in this VdoCipher account', video: null };
    if (!isReady(v)) return { tone: 'wait', label: 'Processing', video: v };
    return { tone: 'ok', label: 'Ready', video: v };
  };

  if (!program) return <div className="panel">Loading…</div>;
  const selTopic = sel ? modules[sel.mi]?.chapters[sel.ci]?.topics[sel.ti] : null;
  const selState = selTopic ? videoState(selTopic) : null;
  const selChapter = sel ? modules[sel.mi]?.chapters[sel.ci] : null;

  return (
    <div className={`ce ${selTopic ? 'has-sel' : ''}`}>
      <div className="ce-bar">
        <button className="btn ghost sm" onClick={onClose}>← Programs</button>
        <div className="ce-bar-title">
          <strong>{program.title}</strong>
          <span className="muted"> · {stats.modules} modules · {stats.topics} lessons{stats.videos ? ` · ${stats.linked}/${stats.videos} videos attached` : ''}</span>
        </div>
        {view === 'curriculum' && (
          <label className="ce-pub"><input type="checkbox" checked={published} onChange={(e) => { setPublished(e.target.checked); setDirty(true); }} /> Published</label>
        )}
        {msg && <span className="muted ce-msg" role="status">{msg}</span>}
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

      {frame.count > 0 && (
        <div className="vc vc-note ce-frame" role="note">
          <div className="vc-head">
            <div>
              <strong>{frame.intros.length && frame.recaps.length ? 'Add the module intros and recaps' : frame.intros.length ? 'Add the module intros' : 'Add the module recaps'}</strong>
              <p className="vc-sub">
                {frame.intros.length > 0 && <>{frame.intros.map((mi) => `${mi + 1}.0`).join(', ')} Module Intro at the start of {frame.intros.length === 1 ? 'its module' : 'their modules'}. </>}
                {frame.recaps.length > 0 && <>{frame.recaps.length === 1 ? `Module ${frame.recaps[0] + 1} Recap at its end` : `A Module N Recap at the end of ${frame.recaps.length === modules.length ? `all ${modules.length} modules` : `modules ${frame.recaps.map((mi) => mi + 1).join(', ')}`}`}. </>}
                Every lesson already here keeps its place in order, its video and its students’ progress. Save afterwards.
              </p>
            </div>
            <div className="vc-actions"><button className="btn sm" onClick={addIntrosAndRecaps}>Add {frame.count} lesson{frame.count === 1 ? '' : 's'}</button></div>
          </div>
        </div>
      )}

      {vdoReady && <VdoCheck modules={modules} onLink={linkVideos} onOpen={(p) => select({ mi: p.mi, ci: p.ci, ti: p.ti })} />}

      <div className="ce-import">
        <div>
          <strong>Import from a document</strong>
          <p className="muted" style={{ margin: '2px 0 0' }}>Upload a <b>.docx</b>, <b>.pdf</b>, <b>.md</b> or <b>.txt</b> and headings become modules &amp; lessons automatically. Review below, then Save.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".docx,.pdf,.md,.txt,.markdown" onChange={onImport} hidden />
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Reading…' : 'Choose file'}</button>
        </div>
      </div>

      <div className="ce-grid">
        <aside className="ce-tree">
          {modules.length === 0 && <p className="muted" style={{ padding: 12 }}>No content yet: import a doc or add a module.</p>}
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
                    const state = videoState(t);
                    return (
                      <div key={ti} className={`ce-topic ${active ? 'active' : ''}`} onClick={() => select({ mi, ci, ti })}>
                        <span className="ce-topic-type"><LessonIcon type={t.contentType} size={13} /></span>
                        <span className="ce-topic-title">{t.title || 'Untitled'}</span>
                        {state && <span className={`ce-dot is-${state.tone}`} title={state.label} aria-label={state.label} />}
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
            <div className="empty-state"><p className="muted">Select a lesson to edit it, or import a document above.</p></div>
          ) : (
            <>
              <button type="button" className="btn ghost sm ce-back" onClick={() => select(null)}>← All lessons</button>
              <p className="ce-eyebrow">
                Module {sel.mi + 1}{selChapter?.title && selChapter.title !== 'Lessons' ? ` · ${selChapter.title}` : ''} · Lesson {sel.ti + 1} of {selChapter?.topics?.length || 1}
              </p>
              <label className="ce-label">Lesson title</label>
              <input className="ce-field" value={selTopic.title} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { title: e.target.value })} />

              <label className="ce-label">Type</label>
              <div className="ce-types">
                {['video', 'text', 'pdf'].map((tp) => (
                  <button key={tp} className={`ce-type ${selTopic.contentType === tp ? 'on' : ''}`} onClick={() => setType(tp)}>
                    <LessonIcon type={tp} size={14} /> {tp === 'video' ? 'Video' : tp === 'pdf' ? 'PDF' : 'Reading'}
                  </button>
                ))}
              </div>

              {selTopic.contentType === 'video' && (
                <>
                  <label className="ce-label">Video <span className="muted">(VdoCipher: encrypted playback, watermarked with the student’s name)</span></label>
                  {!vdoReady ? (
                    <div className="ce-video is-none">
                      <p className="ce-video-title">Video hosting is not set up on the server.</p>
                      <p className="ce-video-sub">Add VDOCIPHER_API_SECRET to the API and this lesson can carry a recording. Students see “on its way” until then.</p>
                    </div>
                  ) : selState.tone === 'none' && !selTopic.vdoVideoId ? (
                    <div className="ce-video is-none">
                      <p className="ce-video-title">No video yet.</p>
                      <p className="ce-video-sub">Students see “This lesson’s video is on its way” until one is attached. The notes below stay readable.</p>
                      <div className="ce-video-actions">
                        <button className="btn sm" onClick={() => setPicking(true)}>Choose or upload a video</button>
                        {!pasting && <button type="button" className="ce-link" onClick={() => setPasting(true)}>Have the video ID? Paste it</button>}
                      </div>
                      {pasting && (
                        <input
                          className="ce-field"
                          autoFocus
                          placeholder="VdoCipher video ID"
                          value={selTopic.vdoVideoId || ''}
                          onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { videoSource: 'vdocipher', vdoVideoId: e.target.value.trim() })}
                        />
                      )}
                    </div>
                  ) : (
                    <div className={`ce-video is-${selState.tone}`}>
                      <span className="ce-video-mark" aria-hidden="true"><LessonIcon type="video" size={18} /></span>
                      <div className="ce-video-body">
                        <p className="ce-video-title">{selState.video?.title || selTopic.vdoVideoId}</p>
                        <p className="ce-video-sub">
                          <span className={`ce-dot is-${selState.tone}`} aria-hidden="true" /> {selState.label}
                          {selState.video?.length ? ` · ${Math.floor(selState.video.length / 60)}m ${String(Math.round(selState.video.length % 60)).padStart(2, '0')}s` : ''}
                          {selState.tone === 'wait' && selState.video ? '. VdoCipher is still preparing it; it plays once that finishes.' : ''}
                          {selState.tone === 'none' ? '. This id belongs to another account or was deleted. Students see “on its way”.' : ''}
                        </p>
                      </div>
                      <div className="ce-video-actions">
                        <button className="btn sm ghost" onClick={() => setPicking(true)}>Change</button>
                        <button className="btn sm ghost" onClick={() => setTopicField(sel.mi, sel.ci, sel.ti, { vdoVideoId: '' })}>Remove</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selTopic.contentType === 'pdf' && (
                <>
                  <label className="ce-label">PDF URL</label>
                  <input className="ce-field" placeholder="https://…" value={selTopic.contentUrl || ''} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { contentUrl: e.target.value })} />
                </>
              )}

              <label className="ce-label">Notes <span className="muted">(Markdown: # headings, **bold**, - lists, `code`)</span></label>
              <textarea className="ce-body" rows={16} value={selTopic.body} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { body: e.target.value })} placeholder="Write the lesson notes here…" />
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
            attachVideo(v);
            setPicking(false);
            flash(`Attached “${v.title || v.id}”. Save to publish it.`);
          }}
        />
      )}
    </div>
  );
}
