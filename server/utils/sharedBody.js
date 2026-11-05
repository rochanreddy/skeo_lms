import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { classCache } from './classCache.js';

const gzipAsync = promisify(gzip);

/* A response that is the same bytes for a whole class.
 *
 * Profiling a class arriving at once put 11% of the CPU in zlib, compressing
 * the same curriculum and the same announcements from scratch for each student.
 * The database read was already shared by then; this shares the work after it.
 * The JSON is built and gzipped once, and every student is sent those bytes.
 *
 * The compressed copy is only kept if it is smaller, which it is not for a body
 * of a few hundred bytes. Sent with its Content-Encoding already set, it passes
 * through the compression middleware untouched.
 *
 * The ETag is worked out here, from the JSON, rather than left to Express, which
 * would hash whichever bytes it was sending: the same content would then have a
 * different tag gzipped and plain, and a revalidation across the two would
 * re-send it all. Weak, because that is what a weak tag means: the same content,
 * not the same bytes. It saves hashing on every response as well.
 *
 * `key` has to name everything that varies the body. Two callers with the same
 * key are served the same bytes, so if they should not see the same thing, that
 * difference belongs in the key.
 */
export async function sendShared(req, res, key, build) {
  const { json, gzipped, etag } = await classCache.get(`body:${key}`, async () => {
    const plain = Buffer.from(JSON.stringify(await build()));
    const packed = await gzipAsync(plain);
    return {
      json: plain,
      gzipped: packed.length < plain.length ? packed : null,
      etag: `W/"${createHash('sha256').update(plain).digest('base64url').slice(0, 32)}"`,
    };
  });

  res.vary('Accept-Encoding');
  res.type('json');
  res.set('ETag', etag);
  // With no header at all acceptsEncodings() says yes to anything, so the
  // header is checked for first: a client that never asked gets plain JSON.
  if (gzipped && req.get('Accept-Encoding') && req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip');
    return res.send(gzipped);
  }
  return res.send(json);
}
