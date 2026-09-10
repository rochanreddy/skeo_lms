// Curriculum document import — the part the request path sees.
//
// Two problems, one boundary.
//
// Speed: parsing (mammoth for .docx, pdf-parse for .pdf) is CPU-bound and runs
// to whatever length a 15 MB upload demands. Done inline it held the event loop
// for the duration, so every other user's request queued behind one admin's
// PDF — /health included, and a platform that cannot get a health check back
// concludes the instance is dead and restarts it mid-session. That is the same
// failure bcrypt used to cause, and it is fixed the same way: get the work off
// the thread that answers requests.
//
// Safety: it has to be a separate PROCESS, not a worker thread. PDF.js — under
// pdf-parse — segfaults as its thread is torn down, and a segfault in a worker
// thread takes the whole API with it. Isolating the parse in a thread would
// therefore have traded a stall for a crash. A child process cannot do that: it
// dies alone and the import comes back 422.
//
// The cost is one Node start-up (tens of ms) per import. Imports are a rare
// admin action, so that is bought cheaply.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHILD = fileURLToPath(new URL('./docparse.child.js', import.meta.url));

// Generous: a large scanned PDF legitimately takes tens of seconds. This is
// here to catch a parse that will never finish, not to rush a slow one.
const TIMEOUT_MS = 60_000;

/**
 * Extract + structure an uploaded doc into a modules tree.
 * Same signature and shape as before — { modules, stats } — so callers are
 * unchanged; only the process it runs in moved.
 */
export function parseDocToModules(buffer, filename = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, filename], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error('That file took too long to read. Try a smaller or simpler document.'));
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { out += d; });
    // stderr is the child's crash noise (PDF.js on the way out, mostly). It is
    // not the answer, and logging it per import would be pure alarm.
    child.stderr.resume();
    child.on('error', (err) => finish(reject, err));

    child.on('close', () => {
      // The exit code is deliberately NOT consulted. The child flushes its
      // answer before ending, so a crash during teardown still leaves a valid
      // result on stdout — what decides the outcome is whether we got one.
      let msg = null;
      try { msg = JSON.parse(out); } catch { /* no usable answer */ }
      if (msg?.ok) return finish(resolve, msg.result);
      if (msg) return finish(reject, new Error(msg.error || 'Could not read that file.'));
      return finish(reject, new Error('Could not read that file.'));
    });

    // If the child dies before we finish handing it the bytes, the pipe errors;
    // 'close' above is what reports that, so there is nothing to do here.
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}
