import mongoose from 'mongoose';

// Atomic named counters.
//
// Certificate numbers run 0001, 0002, 0003 within a programme and month, which
// means two admins issuing two cohorts at the same moment must not both be
// handed 0007. Reading the highest existing number and adding one cannot give
// that guarantee — between the read and the write another process has already
// taken it — so the increment happens inside the database, where
// findOneAndUpdate with $inc is atomic against every other writer.
const counterSchema = new mongoose.Schema(
  {
    // The sequence's name, e.g. "cert:SKFEL:0926". One document per programme
    // per month, so a month with no certificates costs nothing and the numbers
    // restart cleanly.
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const Counter = mongoose.model('Counter', counterSchema, 'skeo_counters');

/** The next number in `name`, starting at 1. Never returns the same value twice. */
export async function nextSeq(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    // upsert so the first call creates the row; new so we get the incremented
    // value rather than the one it had before.
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
}
