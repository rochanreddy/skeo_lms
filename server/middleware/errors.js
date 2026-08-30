// Central error handling. The routes in this service deliberately carry almost
// no try/catch: Express 5 forwards a rejected async handler here on its own, so
// this file is the single place where a thrown error becomes a response.
//
// Two jobs. Translate the errors Mongoose raises for bad *input* into the 4xx
// they always were -- a malformed :id is a bad request, not a server fault --
// and make sure nothing else ever ships its stack to the client. Express's own
// default handler only hides the stack when NODE_ENV=production, which made
// correct behaviour depend on remembering an env var at deploy time.

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// eslint-disable-next-line no-unused-vars -- Express identifies the error
// handler by arity; `next` must stay in the signature.
export function errorHandler(err, req, res, next) {
  // A cast that failed on _id means the caller sent something that could never
  // name a document. Answering 404 keeps ids opaque: a malformed id and an id
  // that simply is not there look identical from outside.
  if (err?.name === 'CastError') {
    return res.status(err.path === '_id' ? 404 : 400).json({
      error: err.path === '_id' ? 'Not found.' : 'Invalid value for ' + err.path + '.',
    });
  }

  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || 'Invalid request.' });
  }

  // Duplicate key on a unique index -- almost always a re-used email.
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That already exists.' });
  }

  // Body parser rejecting malformed JSON.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  // Anything past here is ours, not the caller's. Log it in full for us; say
  // nothing specific to them.
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(err?.status || 500).json({ error: 'Something went wrong.' });
}
