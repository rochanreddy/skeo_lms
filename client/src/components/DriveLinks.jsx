import { useEffect, useState } from 'react';
import { api } from '../api';
import { driveThumb, driveViewUrl, lessonLabel, parseDriveId, parseFolderId } from '../lib/drive.js';
import { YouTubeBulk } from './YouTubeLinks.jsx';

/* The curriculum editor's Google Drive side: one lesson's video (DriveField)
 * and every lesson's at once (DriveBulk), including straight from the course
 * folder. Like every edit in the editor, nothing reaches students until Save. */

const SHARE_HINT = 'Share the videos (or their folder) in Drive as “Anyone with the link: Viewer”. They play in Drive’s own player.';

/** Reads a shared course folder and its module folders into the paste box. */
function FolderImport({ onLines }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const id = parseFolderId(link);

  const read = async () => {
    setBusy(true);
    setNote('');
    try {
      const { videos } = await api(`/videos/drive/folder/${encodeURIComponent(id)}`);
      onLines(videos.map((v) => `${lessonLabel(v.name)}  ${driveViewUrl(v.id)}`).join('\n'));
      setNote(`Found ${videos.length} video${videos.length === 1 ? '' : 's'}. Check the matches below, then link them.`);
    } catch (e) {
      setNote(e.message || 'Could not read that folder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yb-import">
      <input
        className="ce-field"
        placeholder="Course folder link: https://drive.google.com/drive/folders/…"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && id && !busy) read(); }}
      />
      <button type="button" className="btn sm" disabled={!id || busy} onClick={read}>{busy ? 'Reading…' : 'Read folder'}</button>
      {note && <p className="vc-sub yb-import-note">{note}</p>}
    </div>
  );
}

const DRIVE = {
  name: 'Google Drive', field: 'driveFileId', parse: parseDriveId, hint: `${SHARE_HINT} Paste the course folder link to read every module folder at once, or paste links yourself.`,
  example: 'https://drive.google.com/file/d/…/view', short: (id) => `drive · ${id.slice(0, 10)}…`,
  Importer: FolderImport,
};

/** Is the file shared so students can open it, and what is it called. */
function useDriveCheck(id) {
  const [check, setCheck] = useState(null);
  useEffect(() => {
    if (!id) { setCheck(null); return undefined; }
    let gone = false;
    setCheck({ status: 'checking' });
    api(`/videos/drive/${encodeURIComponent(id)}/check`)
      .then((c) => { if (!gone) setCheck(c); })
      .catch((e) => { if (!gone) setCheck({ status: 'error', message: e.message || 'Could not check the file.' }); });
    return () => { gone = true; };
  }, [id]);
  return check;
}

function checkLine(c) {
  if (!c || c.status === 'checking') return { tone: 'wait', text: 'Checking the file’s sharing…' };
  if (c.status === 'ok') return { tone: 'ok', text: `${c.name ? `${c.name} · ` : ''}shared, plays for students` };
  if (c.status === 'private' || c.status === 'not-video') return { tone: 'none', text: c.message };
  return { tone: 'wait', text: c.message || 'Could not check the file.' };
}

/** One lesson's Drive video: paste a link, see whether it is shared, change it. */
export function DriveField({ driveFileId, onChange }) {
  const [editing, setEditing] = useState(!driveFileId);
  const [draft, setDraft] = useState('');
  useEffect(() => { setEditing(!driveFileId); setDraft(''); }, [driveFileId]);
  const check = useDriveCheck(driveFileId && !editing ? driveFileId : '');

  const take = (text) => {
    setDraft(text);
    const id = parseDriveId(text);
    if (id) { onChange(id); setEditing(false); setDraft(''); }
  };

  if (driveFileId && !editing) {
    const line = checkLine(check);
    return (
      <div className={`ce-video ce-yt ${line.tone === 'ok' ? 'is-ok' : 'is-wait'}`}>
        <img className="ce-yt-thumb" src={driveThumb(driveFileId, 320)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        <div className="ce-video-body">
          <p className="ce-video-title">Google Drive video linked</p>
          <p className="ce-video-sub">
            <span className={`ce-dot is-${line.tone}`} aria-hidden="true" /> {line.text} ·{' '}
            <a href={driveViewUrl(driveFileId)} target="_blank" rel="noreferrer">Open in Drive</a>
          </p>
        </div>
        <div className="ce-video-actions">
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)}>Change</button>
          <button type="button" className="btn sm ghost" onClick={() => onChange('')}>Remove</button>
        </div>
      </div>
    );
  }

  const invalid = draft.trim() && !parseDriveId(draft);
  return (
    <div className="ce-video is-none">
      <p className="ce-video-title">{driveFileId ? 'Paste the new Google Drive link' : 'Paste the Google Drive link'}</p>
      <p className="ce-video-sub">{SHARE_HINT}</p>
      <input
        className="ce-field"
        placeholder="https://drive.google.com/file/d/…/view"
        value={draft}
        onChange={(e) => take(e.target.value)}
        aria-invalid={invalid || undefined}
      />
      {invalid && <p className="ce-yt-err">That is not a link to a Drive file. A folder link will not do here: open the video itself and copy its link.</p>}
      {driveFileId && (
        <div className="ce-video-actions">
          <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setDraft(''); }}>Keep the current video</button>
        </div>
      )}
    </div>
  );
}

/** Every lesson's Drive link at once, matched by lesson number. */
export function DriveBulk({ modules, onLink }) {
  return <YouTubeBulk modules={modules} onLink={onLink} source={DRIVE} />;
}
