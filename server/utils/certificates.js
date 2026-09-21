import QRCode from 'qrcode';
import { Certificate } from '../models/Certificate.js';
import { nextSeq } from '../models/Counter.js';
import { appUrl } from './appUrl.js';

/**
 * Issuing a certificate, and turning one into something a stranger can check.
 *
 * The whole point of the code below is that the person scanning the QR has no
 * account, no context and no reason to trust us — so the id has to come from a
 * counter rather than from another id, the lookup has to be a lookup rather
 * than a scan, and the page they land on must show only what verifying
 * actually requires.
 */

/* The programme's segment of the code. "Fellowship" certificates read
   SKEO-FELLO-…, "Kickstarter" ones SKEO-KICKS-….

   Matched on the title rather than the id so renaming a programme does not
   silently change its certificate numbers, and so a batch of either programme
   resolves the same way. A programme can also carry its own `certCode` field
   and override all of this — nothing sets that today, but it is the seam to
   use when a third programme arrives, rather than growing this table forever. */
const PROGRAMME_SEGMENTS = [
  { match: /fellow/i, segment: 'FELLO' },
  { match: /kickstart/i, segment: 'KICKS' },
];

export function segmentFor(program) {
  if (program?.certCode) return String(program.certCode).toUpperCase();
  const title = String(program?.title || '');
  const hit = PROGRAMME_SEGMENTS.find((p) => p.match.test(title));
  if (hit) return hit.segment;
  /* An unknown programme still has to be issuable — refusing here would mean a
     new course cannot hand out certificates until someone edits this file.
     Five letters off the title keeps the code readable and the uniqueness
     index keeps it honest if two titles happen to collide. */
  const letters = title.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 5) || 'SKEOX').padEnd(5, 'X');
}

/** MMYY of a given date. */
export function monthStamp(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}${yy}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The month and year written into a batch's name.
 *
 * Batches get named "Fellowship · Sept 2026" by hand. That is a convention
 * rather than a schema, so this is a fallback and not the first choice —
 * startDate is. It exists because a cohort created without a start date would
 * otherwise be stamped with today's, and reading the month off the name beats
 * being confidently wrong.
 *
 * Written as a token scan rather than one regex: the name is punctuated in
 * whatever way whoever created it felt like ("·", "—", ",", nothing), and a
 * pattern that tries to describe all of that is harder to read than splitting
 * on punctuation and looking at the words.
 *
 * Returns null on anything it cannot read, so the caller falls back again
 * rather than being handed a confidently wrong date.
 */
export function monthFromName(name) {
  const tokens = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  let month = -1;
  let year = 0;
  for (const t of tokens) {
    // "sept" and "september" both start with the three-letter key.
    if (month < 0) {
      const hit = MONTHS.findIndex((m) => t.startsWith(m));
      if (hit >= 0) { month = hit; continue; }
    }
    if (!year && t.length === 4 && Number(t) >= 2000 && Number(t) <= 2100) year = Number(t);
  }
  if (month < 0 || !year) return null;
  return new Date(year, month, 1);
}

/**
 * Which month the code is stamped with: the BATCH's, not the issue date's.
 *
 * A cohort that ran in September gets September codes even when the
 * certificates are handed out in November, so every certificate from one
 * intake shares a stamp and they sort together. The "Issued on" line on the
 * certificate still shows the real issue date — the two are allowed to differ,
 * and on a late issue they will.
 *
 * startDate first, then the month written into the name, then the issue date.
 * The last is a genuine last resort: it is the only one that cannot be wrong
 * about a batch, because it is not about the batch at all.
 */
export function stampDateFor(batch, issuedAt = new Date()) {
  if (batch?.startDate) return new Date(batch.startDate);
  return monthFromName(batch?.name) || issuedAt;
}

/**
 * A code for a sample certificate: SKEO-FELLO-0926-0000.
 *
 * The 0000 is the point. The counter behind nextCode() starts at 1 and only
 * ever goes up, so no certificate that was actually issued can end in 0000 —
 * which means a sample can never be mistaken for a credential, and a verifier
 * handed one gets an honest "no certificate with that ID" rather than a record
 * that half-exists. It also costs the real sequence nothing: sampling does not
 * touch the counter, so a dozen test previews do not push a cohort's first
 * certificate to 0013.
 */
export function sampleCode(program, batch = null) {
  return `SKEO-${segmentFor(program)}-${monthStamp(stampDateFor(batch))}-0000`;
}

/**
 * The next code for a programme in a given month: SKEO-FELLO-0926-0001.
 *
 * The number is drawn from an atomic counter keyed on programme and month, so
 * two admins issuing two cohorts at the same moment cannot both be given 0007.
 *
 * A NOTE ON WHAT THIS GIVES UP. These codes are sequential and therefore
 * guessable: holding SKEO-FELLO-0926-0007 tells you -0006 and -0008 almost
 * certainly exist, and the verification endpoint will describe them. That is a
 * deliberate trade — a code in this shape can be read down a phone line, typed
 * off a printed page and sorted in a spreadsheet, which a random string cannot
 * — but it does mean the endpoint can be walked to list a cohort's names. The
 * rate limit on /verify is what keeps that expensive, and the public view is
 * trimmed to name, programme, batch and date so walking it yields nothing an
 * employer could not already ask for. If enumeration ever matters more than
 * legibility, the fix is a random token in the QR URL alongside this code, not
 * a change to the code itself.
 */
export async function nextCode(program, batch = null, issuedAt = new Date()) {
  const segment = segmentFor(program);
  const stamp = monthStamp(stampDateFor(batch, issuedAt));
  const n = await nextSeq(`cert:${segment}:${stamp}`);
  /* padStart, not slice: the 10000th certificate in one month grows the code
     to five digits rather than wrapping round to 0000 and colliding with the
     first. Nothing about the format breaks, and the alternative silently
     issues a duplicate number. */
  return `SKEO-${segment}-${stamp}-${String(n).padStart(4, '0')}`;
}

/** The address the QR encodes and the one printed under it in plain text. */
export const verifyUrl = (code) => appUrl(`/verify/${encodeURIComponent(code)}`);

/**
 * The QR as an inline SVG data URI.
 *
 * SVG rather than PNG because this is printed as often as it is looked at, and
 * a raster QR at A4 print scale either blurs or has to be generated at a size
 * nobody needs on screen. Level Q correction survives a fold or a staple
 * through a corner; margin 0 because the certificate's own layout provides the
 * quiet zone and a doubled margin just shrinks the modules.
 */
export async function qrDataUri(code) {
  const svg = await QRCode.toString(verifyUrl(code), {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 0,
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Issue one certificate, or hand back the one that already exists.
 *
 * Idempotent on (student, programme, batch), because re-running a cohort issue
 * is a normal thing to do — somebody enrolled late, a send failed, an admin
 * pressed it twice — and a second press must not mint a second code for a
 * person who has already shared their first one.
 */
export async function issueCertificate({ student, program, batch = null, issuedBy = null }) {
  const filter = { studentId: student._id, programId: program._id, batchId: batch?._id || null };
  const existing = await Certificate.findOne(filter);
  if (existing) return { cert: existing, created: false };

  /* The counter behind nextCode() is atomic, so two issues racing get two
     different numbers and the loop below should never run twice. It stays
     because the unique index on `code` is the only thing that actually
     guarantees it — a counter document restored from an older backup, or a
     code written by hand during a migration, would both collide, and a retry
     costs nothing against a case that should not happen. */
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cert = await Certificate.create({
        ...filter,
        code: await nextCode(program, batch),
        // Snapshots. See the model for why these are copied rather than joined.
        studentName: student.fullName || student.email,
        programTitle: program.title,
        batchName: batch?.name || '',
        issuedBy,
      });
      return { cert, created: true };
    } catch (err) {
      // 11000 is a duplicate key. On `code` we retry; on the (student,
      // programme, batch) index it means someone issued the same certificate
      // between our findOne and our create, so return theirs.
      if (err?.code !== 11000) throw err;
      const raced = await Certificate.findOne(filter);
      if (raced) return { cert: raced, created: false };
    }
  }
  throw new Error('Could not allocate a certificate code.');
}

/**
 * Whether the student is allowed to know this certificate exists yet.
 *
 * Issuing a cohort's certificates and telling that cohort about them are two
 * different acts, and an admin does the first in order to check the second is
 * worth doing. So a certificate an admin minted stays invisible to the student
 * until the mail goes — otherwise someone refreshing their profile finds out
 * before the announcement, and an admin who spots a wrong name has already
 * lost the chance to fix it quietly.
 *
 * A certificate with no issuedBy was claimed by the student themselves by
 * finishing the programme. Nobody is going to email them about a thing they
 * just clicked a button to produce, so there is nothing to wait for.
 */
export const studentCanSee = (cert) => Boolean(cert.sentAt) || !cert.issuedBy;

/**
 * Exactly what a stranger is allowed to see.
 *
 * An allowlist built by hand, not the document with a few fields deleted: the
 * document carries the student's id and will carry more over time, and a
 * deny-list is one schema change away from publishing something it shouldn't.
 * No email, no ids — a verifier needs to know the name on the certificate
 * matches the person in front of them, and nothing else.
 */
export const publicView = (cert) => ({
  valid: !cert.revokedAt,
  code: cert.code,
  name: cert.studentName,
  programme: cert.programTitle,
  batch: cert.batchName || null,
  issuedAt: cert.issuedAt,
  revoked: Boolean(cert.revokedAt),
  revokedAt: cert.revokedAt || null,
});
