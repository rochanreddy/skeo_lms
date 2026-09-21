import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hit as rateLimit } from '../middleware/rateLimit.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Certificate } from '../models/Certificate.js';
import { issueCertificate, publicView, qrDataUri, sampleCode, studentCanSee, verifyUrl } from '../utils/certificates.js';

const router = Router();

/* ───────────────────────── public ─────────────────────────
   Everything under this heading is the only part of the API a person with no
   account can reach. Keep it that way: the route below is linked from a QR
   code printed on paper, so it will be opened by recruiters, by bots, and
   eventually by someone trying every code they can think of. */

// GET /api/skeo/certificates/verify/:code — is this certificate real?
//
// No auth, by design. A credential nobody can check without an account is not
// a credential. What keeps it safe is the shape of the answer, not a login:
// publicView() is an allowlist of a handful of facts, and the rate limit below
// makes walking the sequence pointless.
router.get('/verify/:code', async (req, res) => {
  // Per IP, generous enough for a real person checking a handful of
  // applicants' certificates in a sitting and useless for a script.
  if (!rateLimit(`cert-verify:${req.ip}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Too many lookups. Try again shortly.' });
  }

  // Uppercased and de-spaced before lookup: this code gets read off paper and
  // typed by hand, and "skeo fello 0926 0001" is the same certificate.
  const code = String(req.params.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const cert = await Certificate.findOne({ code });

  // A 404 says "no such certificate", which is the honest answer and also the
  // one that tells an enumerator nothing they did not already know.
  if (!cert) return res.status(404).json({ valid: false, error: 'No certificate with that ID.' });
  res.json(publicView(cert));
});

/* ───────────────────────── student ───────────────────────── */

// GET /api/skeo/certificates/mine — what I hold, with the QR to print.
router.get('/mine', requireAuth, async (req, res) => {
  const certs = (await Certificate.find({ studentId: req.user._id }).sort({ issuedAt: -1 }))
    // A minted-but-unsent certificate is not yet the student's news to have.
    .filter(studentCanSee);
  const out = await Promise.all(
    certs.map(async (c) => ({
      ...publicView(c),
      // The modal reads these names; publicView speaks the verifier's.
      program: c.programTitle,
      certId: c.code,
      verifyUrl: verifyUrl(c.code),
      qr: await qrDataUri(c.code),
    })),
  );
  res.json({ certificates: out });
});

/* ───────────────────────── admin ───────────────────────── */

// GET /api/skeo/certificates?batchId= — who in this cohort has one.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId } = req.query;
  const filter = batchId ? { batchId } : {};
  const certs = await Certificate.find(filter)
    .sort({ issuedAt: -1 })
    .limit(500)
    .populate('studentId', 'fullName email');
  res.json({
    certificates: certs.map((c) => ({
      id: c._id,
      // The student this belongs to, so the admin screen can line certificates
      // up against the batch roster by id. Matching on the email string would
      // work until somebody corrects a typo in an address.
      studentId: String(c.studentId?._id || c.studentId || ''),
      code: c.code,
      name: c.studentName,
      email: c.studentId?.email || '',
      programme: c.programTitle,
      batch: c.batchName,
      issuedAt: c.issuedAt,
      sentAt: c.sentAt,
      revoked: Boolean(c.revokedAt),
      verifyUrl: verifyUrl(c.code),
    })),
  });
});

// POST /api/skeo/certificates/sample { name, programId, batchId }
//
// The sheet, with any name on it, for looking at. It writes nothing: no
// certificate row, no counter increment. A sample exists to answer "does this
// read correctly" before a cohort is issued, and a check that alters the thing
// it is checking is not one.
//
// Declared before /:id so the literal path is not swallowed by the parameter.
router.post('/sample', requireAuth, requireRole('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'A name is required.' });

  const batch = req.body?.batchId ? await Batch.findById(req.body.batchId).populate('programId', 'title') : null;
  const program = batch?.programId
    || (req.body?.programId ? await Program.findById(req.body.programId).select('title') : null)
    || { title: 'Fellowship' };
  const code = sampleCode(program, batch);

  res.json({
    certificate: {
      name,
      program: program.title,
      batch: batch?.name || null,
      issuedAt: new Date(),
      certId: code,
      sample: true,
      verifyUrl: verifyUrl(code),
      qr: await qrDataUri(code),
    },
  });
});

// GET /api/skeo/certificates/:id — one certificate, as the student will see it.
//
// Separate from the list because the QR is a couple of kilobytes of inline SVG
// each: putting it on every row would push a 200-student cohort past half a
// megabyte for a table that shows none of them. So the list stays text and the
// sheet is fetched when an admin actually opens one.
//
// Declared after /mine, /verify/:code and /sample, which are literal paths and
// would otherwise be swallowed by :id.
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const cert = await Certificate.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found.' });
  res.json({
    certificate: {
      name: cert.studentName,
      program: cert.programTitle,
      batch: cert.batchName || null,
      issuedAt: cert.issuedAt,
      certId: cert.code,
      revoked: Boolean(cert.revokedAt),
      verifyUrl: verifyUrl(cert.code),
      qr: await qrDataUri(cert.code),
    },
  });
});

// POST /api/skeo/certificates/issue { batchId } — issue to a whole cohort.
//
// Minting only. Telling the cohort is a separate act and deliberately not
// wired to this button: issuing is reversible in practice, because nobody has
// seen the code yet, and sending is not — once thirty people have the mail you
// cannot unsend it. So this mints, the admin reads the list back, and delivery
// is its own decision.
router.post('/issue', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId } = req.body || {};
  if (!batchId) return res.status(400).json({ error: 'batchId is required.' });

  const batch = await Batch.findById(batchId)
    .populate('programId', 'title')
    .populate('studentIds', 'fullName email');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  if (!batch.programId) return res.status(400).json({ error: 'That batch has no programme.' });

  const students = batch.studentIds || [];
  if (!students.length) return res.json({ ok: true, issued: 0, existing: 0, results: [] });

  const results = [];
  for (const student of students) {
    const { cert, created } = await issueCertificate({
      student,
      program: batch.programId,
      batch,
      issuedBy: req.user._id,
    });
    results.push({
      email: student.email,
      name: cert.studentName,
      code: cert.code,
      created,
      verifyUrl: verifyUrl(cert.code),
    });
  }

  res.json({
    ok: true,
    batch: batch.name,
    programme: batch.programId.title,
    issued: results.filter((r) => r.created).length,
    existing: results.filter((r) => !r.created).length,
    results,
  });
});

// POST /api/skeo/certificates/:id/revoke { reason }
//
// Revoked, never deleted. A certificate that has been shared and then
// withdrawn still has to resolve: a verification page that 404s reads as "we
// lost the record", while one that says revoked is the answer the person
// scanning it actually needs.
router.post('/:id/revoke', requireAuth, requireRole('admin'), async (req, res) => {
  const cert = await Certificate.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found.' });
  cert.revokedAt = new Date();
  cert.revokedReason = String(req.body?.reason || '').slice(0, 300);
  await cert.save();
  res.json({ ok: true, code: cert.code, revoked: true });
});

export default router;
