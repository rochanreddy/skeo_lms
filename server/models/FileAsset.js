import mongoose from 'mongoose';

// Binary files that belong to the product rather than to a student's own Drive.
// Today that is exactly one thing: the resume uploaded from the Profile page.
//
// These live in Mongo rather than on the server's disk because the API runs on
// a host with an ephemeral filesystem -- anything written to ./uploads is gone
// on the next deploy, which would leave User.resumeUrl pointing at a 404.
// Submissions do NOT belong here: those stay in the student's Drive and we only
// keep the link (see models/Submission.js).
//
// `data` is select:false so that no ordinary query -- a list, a populate, a
// stray findById -- ever drags megabytes of file body into memory. The one
// route that serves bytes asks for it explicitly with .select('+data').
const fileAssetSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true, select: false },
    name: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['resume'], default: 'resume', index: true },
  },
  { timestamps: true },
);

export const FileAsset = mongoose.model('FileAsset', fileAssetSchema, 'skeo_files');
