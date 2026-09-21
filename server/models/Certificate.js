import mongoose from 'mongoose';

// A credential somebody can hold up to an employer, which is a different thing
// from a row saying a student finished a course. The difference is that a
// stranger with no account has to be able to check it, so everything the
// verification page shows lives here rather than being joined out of the
// student, batch and programme at read time.
//
// The fields are SNAPSHOTS on purpose. A student who later changes their name
// in their profile, a batch that gets renamed, a programme whose title is
// tidied up — none of that may quietly rewrite a certificate that has already
// been issued and printed. What was true at issue is what the certificate says
// forever; the ids alongside are for our own joins, not for the public page.
const certificateSchema = new mongoose.Schema(
  {
    // The public identifier — what the QR encodes and what a verifier types in.
    // Generated in utils/certificates.js from an atomic counter, NOT derived
    // from an ObjectId: the old progress route built one by slicing a Progress
    // id, which is both guessable from another id and silently carried the
    // wrong brand's prefix.
    code: { type: String, required: true, unique: true, index: true },

    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    // Null for a certificate claimed through progress rather than issued to a
    // cohort — the self-service route has no batch in hand.
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },

    studentName: { type: String, required: true },
    programTitle: { type: String, required: true },
    batchName: { type: String, default: '' },

    issuedAt: { type: Date, default: Date.now },
    /* When the certificate mail actually went out. Null means it has been
       minted but not yet delivered — which is also the thing that keeps it
       hidden from the student, see studentCanSee() in utils/certificates.js.
       Recorded rather than inferred so the admin table can say who has been
       told and who has not, long after the issue run that did it. */
    sentAt: { type: Date, default: null },
    // Who pressed the button. Null means the student claimed it themselves by
    // completing the programme.
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Revoking rather than deleting. A certificate that has been shared and
    // then withdrawn must still resolve — a verification page that 404s reads
    // as "we lost the record", while one that says "revoked" is the answer the
    // person scanning it actually needs.
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: '' },
  },
  { timestamps: true },
);

// One certificate per student per programme per batch. Re-running a bulk issue
// over a cohort is a normal thing to do — somebody was added late, a send
// failed — and it must not mint a second code for someone who already has one.
certificateSchema.index({ studentId: 1, programId: 1, batchId: 1 }, { unique: true });

export const Certificate = mongoose.model('Certificate', certificateSchema, 'skeo_certificates');
