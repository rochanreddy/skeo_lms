import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { isReady, loadLibrary, videoProblems } from '../lib/vdoLinks.js';

/**
 * Says which video lessons this VdoCipher account cannot play, and fixes the
 * ones it can match.
 *
 * Linking only changes the tree in the editor. Nothing reaches students until
 * the admin presses Save, the same as every other edit here, so a wrong match
 * costs a click to undo rather than a broken lesson.
 */
export default function VdoCheck({ modules, onLink, onOpen }) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async ({ fresh = false } = {}) => {
    setChecking(true);
    setError('');
    try {
      setLibrary(await loadLibrary(api, { fresh }));
    } catch (e) {
      setError(e.message || 'The video service did not answer.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  if (error) {
    return (
      <div className="vc vc-warn" role="status">
        <div className="vc-head">
          <div>
            <strong>Could not read the VdoCipher library.</strong>
            <p className="vc-sub">{error} Video lessons may not play until this works. Check VDOCIPHER_API_SECRET on the server.</p>
          </div>
          <button className="btn sm ghost" onClick={() => check({ fresh: true })} disabled={checking}>{checking ? 'Checking…' : 'Try again'}</button>
        </div>
      </div>
    );
  }
  if (!library) return null;

  const problems = videoProblems(modules, library);
  if (!problems.length) return null;

  // Worth a row: a lesson pointing at a video this account lacks, and a lesson
  // whose video is in the library waiting to be linked. A lesson with nothing
  // uploaded yet is only a number here; the tree beside it marks each one.
  const matched = problems.filter((p) => p.match);
  const missing = problems.filter((p) => p.problem === 'missing');
  const listed = problems.filter((p) => p.problem === 'missing' || p.match);
  const waiting = problems.length - listed.length;
  const warn = missing.length > 0;

  return (
    <div className={`vc ${warn ? 'vc-warn' : 'vc-note'}`} role="status">
      <div className="vc-head">
        <div>
          <strong>
            {missing.length
              ? `${missing.length} video lesson${missing.length === 1 ? '' : 's'} will not play for students.`
              : matched.length
                ? `${matched.length} lesson${matched.length === 1 ? ' has its' : 's have their'} video in the library, ready to link.`
                : `${waiting} lesson${waiting === 1 ? ' has' : 's have'} no video yet.`}
          </strong>
          <p className="vc-sub">
            {missing.length ? 'They point at videos this VdoCipher account does not have, usually because the key changed. ' : ''}
            {matched.length
              ? `${matched.length === 1 ? 'It matches' : 'They match'} by lesson number, so one click links ${matched.length === 1 ? 'it' : 'them'}. `
              : ''}
            {waiting && listed.length ? `Another ${waiting} ${waiting === 1 ? 'has' : 'have'} no video in the library yet. ` : ''}
            {waiting ? 'Upload each recording to the library named by its lesson number ("1.3 Hallucinations.mp4") and it can be linked from here. Until then students see "this lesson’s video is on its way".' : ''}
          </p>
        </div>
        <div className="vc-actions">
          <button className="btn sm ghost" onClick={() => check({ fresh: true })} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</button>
          {matched.length > 0 && (
            <button className="btn sm" onClick={() => onLink(matched)}>
              Link {matched.length} matching video{matched.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {listed.length > 0 && (
      <ul className="vc-list">
        {listed.map((p) => (
          <li key={`${p.mi}.${p.ci}.${p.ti}`} className="vc-row">
            <button type="button" className="vc-lesson" onClick={() => onOpen(p)} title="Open this lesson">
              {p.lesson}
            </button>
            <span className="vc-why">{p.problem === 'missing' ? 'Not in this account' : 'No video chosen'}</span>
            <span className="vc-match">
              {p.match ? (
                <>
                  <span aria-hidden="true">→ </span>{p.match.title}
                  {!isReady(p.match) && <em className="vc-processing"> still processing</em>}
                </>
              ) : 'No match. Open it and pick from the library.'}
            </span>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
