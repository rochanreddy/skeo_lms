// Child-process entry for curriculum document parsing.
//
// Reads the document bytes from stdin, writes one JSON line to stdout:
//   { ok: true, result: { modules, stats } }   or   { ok: false, error }
//
// The write is awaited to completion before this process is allowed to end, so
// the answer is through the pipe even if PDF.js crashes on its way out — see
// the note in docparse.js about why that matters.
import { parseDocToModules } from './docparse.impl.js';

const filename = process.argv[2] || '';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let payload;
try {
  payload = { ok: true, result: await parseDocToModules(Buffer.concat(chunks), filename) };
} catch (err) {
  payload = { ok: false, error: err?.message || 'Could not read that file.' };
}

await new Promise((resolve) => process.stdout.write(JSON.stringify(payload), resolve));
