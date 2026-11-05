import mongoose from 'mongoose';

/* What the API served, kept so a hosting decision can rest on real numbers.
 *
 * Two collections, because they answer different questions at different ages.
 * A bucket is five minutes of counters: enough to find the busiest moment of a
 * class, and small enough that 120 days of them is about 10MB. A day holds what
 * five-minute rows cannot add up to: who was active at all, since one student
 * seen in every bucket of a day is still one student.
 *
 * A day's `students` is there only to be counted, and the summary reads its
 * size, so the ids never leave the database.
 */
const BUCKET_DAYS = 120;
const DAY_DAYS = 400;

const bucketSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true }, // the start of the five minutes
    requests: { type: Number, default: 0 },
    serverErrors: { type: Number, default: 0 }, // 5xx
    limited: { type: Number, default: 0 }, // 429
    bytesOut: { type: Number, default: 0 },
    bytesIn: { type: Number, default: 0 },
    cpuMs: { type: Number, default: 0 },
    dbOps: { type: Number, default: 0 },
    videoPlays: { type: Number, default: 0 },
    lat: {}, // latency histogram: { l50: 12, ... }, see LATENCY in utils/usageMeter.js
    online: { type: Number, default: 0 }, // students seen in the five minutes before
    peakInflight: { type: Number, default: 0 },
    peakRps: { type: Number, default: 0 },
    peakCores: { type: Number, default: 0 },
    peakBusy: { type: Number, default: 0 }, // share of the time the event loop was working
    peakLoopMs: { type: Number, default: 0 },
    peakRssMb: { type: Number, default: 0 },
    peakHeapMb: { type: Number, default: 0 },
    peakDbConns: { type: Number, default: 0 },
  },
  { versionKey: false },
);
bucketSchema.index({ at: 1 }, { unique: true, expireAfterSeconds: BUCKET_DAYS * 86_400 });
// What the summary asks for: the busiest moments in a range.
bucketSchema.index({ requests: -1, at: -1 });

const daySchema = new mongoose.Schema(
  {
    _id: { type: String }, // YYYY-MM-DD, in India
    at: { type: Date, required: true },
    students: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    boots: { type: Number, default: 0 }, // restarts: a deploy, or a crash
    routes: {}, // { programs: { n: 120, ms: 3400 }, ... }
    limits: {}, // what the process found it was allowed: see readLimits()
  },
  { versionKey: false },
);
daySchema.index({ at: 1 }, { expireAfterSeconds: DAY_DAYS * 86_400 });

export const UsageBucket = mongoose.model('UsageBucket', bucketSchema, 'skeo_usage');
export const UsageDay = mongoose.model('UsageDay', daySchema, 'skeo_usage_days');
