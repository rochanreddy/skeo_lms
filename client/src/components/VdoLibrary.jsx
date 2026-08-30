import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.jsx';

// Admin picker for the VdoCipher account library: browse what is already
// uploaded, or upload a new file and attach it to the lesson when it lands.
//
// Uploads go straight from this browser to VdoCipher. Our API only signs a
// one-video credential -- a two-hour lecture has no business travelling through
// an Express process that caps its own JSON bodies at 256 kB.

const mins = (secs) => (secs ? `${Math.floor(secs / 60)}m ${String(Math.round(secs % 60)).padStart(2, '0')}s` : '—');

/** POST the file to VdoCipher's storage with the signed payload, reporting progress. */
function putToVdocipher({ clientPayload, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const { uploadLink, policy, key, ...rest } = clientPayload || {};
    if (!uploadLink) return reject(new Error('The upload credentials came back incomplete.'));

    // S3 requires the file field LAST; everything else is the signed policy.
    const fd = new FormData();
    fd.append('policy', policy);
    fd.append('key', key);
    fd.append('x-amz-signature', rest['x-amz-signature']);
    fd.append('x-amz-algorithm', rest['x-amz-algorithm']);
    fd.append('x-amz-date', rest['x-amz-date']);
    fd.append('x-amz-credential', rest['x-amz-credential']);
    fd.append('success_action_status', '201');
    fd.append('success_action_redirect', '');
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadLink);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status === 201 || xhr.status === 204 ? resolve() : reject(new Error(`Upload rejected (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('The upload failed — check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(fd);
  });
}

export default function VdoLibrary({ onPick, onClose }) {
  const [videos, setVideos] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(null); // null = idle, 0-100 = uploading
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async (query) => {
    setLoading(true); setError('');
    try {
      const { videos: rows } = await api(`/videos?limit=40${query ? `&q=${encodeURIComponent(query)}` : ''}`);
      setVideos(rows || []);
    } catch (e) {
      setError(e.message || 'Could not load the video library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);
  // Search as you type, once you stop.
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q, load]);

  async function upload() {
    if (!file) return;
    setUploadError(''); setProgress(0);
    try {
      const { videoId, clientPayload } = await api('/videos/upload', {
        method: 'POST',
        body: { title: (title.trim() || file.name).slice(0, 200) },
      });
      await putToVdocipher({ clientPayload, file, onProgress: setProgress });
      // VdoCipher still has to encrypt and package it; the id is usable now and
      // the lesson simply shows "processing" until playback is ready.
      onPick({ id: videoId, title: title.trim() || file.name, status: 'Queued' });
    } catch (e) {
      setUploadError(e.message || 'Upload failed.');
      setProgress(null);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="vdo-dialog">
        <DialogTitle>VdoCipher library</DialogTitle>

        <div className="vdo-upload">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; setFile(f || null); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }}
          />
          <div className="row">
            <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={progress !== null}>
              {file ? 'Choose another file' : 'Choose a video file'}
            </button>
            {file && (
              <input
                className="ce-field vdo-title"
                placeholder="Title in the VdoCipher library"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={progress !== null}
              />
            )}
            {file && progress === null && <button className="btn sm on-stage" onClick={upload}>Upload</button>}
          </div>
          {file && <div className="muted vdo-filename">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
          {progress !== null && (
            <div className="vdo-progress">
              <div className="vdo-progress-track"><div className="vdo-progress-bar" style={{ width: `${progress}%` }} /></div>
              <span className="muted">{progress === 100 ? 'Processing…' : `${progress}%`}</span>
            </div>
          )}
          {uploadError && <div className="muted vdo-error">{uploadError}</div>}
        </div>

        <input className="ce-field" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />

        {error ? (
          <div className="empty-state"><p className="muted">{error}</p></div>
        ) : loading ? (
          <div className="empty-state"><p className="muted">Loading…</p></div>
        ) : videos.length === 0 ? (
          <div className="empty-state"><p className="muted">No videos in the VdoCipher account yet.</p></div>
        ) : (
          <div className="vdo-list">
            {videos.map((v) => (
              <button key={v.id} className="vdo-item" onClick={() => onPick(v)}>
                {v.poster ? <img className="vdo-thumb" src={v.poster} alt="" /> : <span className="vdo-thumb vdo-thumb-empty" />}
                <span className="vdo-item-main">
                  <span className="vdo-item-title">{v.title || v.id}</span>
                  <span className="muted">{mins(v.length)} · {v.status || 'unknown'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
