import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { UsageBucket, UsageDay } from '../models/Usage.js';
import { User } from '../models/User.js';
import { LATENCY, liveUsage } from '../utils/usageMeter.js';
import { buildEvidence, percentile } from '../utils/usageSummary.js';

const router = Router();

const TZ = 'Asia/Kolkata';
const RANGES = new Set([7, 30, 90]);
const SAMPLE_BUCKETS = 24; // two hours of the busiest moments

const bandKeys = LATENCY.map((top) => `l${top}`);

// Everything is grouped in the database. A 90-day range is 26,000 rows, and this
// process has a 256MB heap and students to serve.
const totals = {
  requests: { $sum: '$requests' },
  serverErrors: { $sum: '$serverErrors' },
  limited: { $sum: '$limited' },
  bytesOut: { $sum: '$bytesOut' },
  bytesIn: { $sum: '$bytesIn' },
  dbOps: { $sum: '$dbOps' },
  videoPlays: { $sum: '$videoPlays' },
  peakOnline: { $max: '$online' },
  peakRps: { $max: '$peakRps' },
  peakInflight: { $max: '$peakInflight' },
  peakCores: { $max: '$peakCores' },
  peakBusy: { $max: '$peakBusy' },
  peakLoopMs: { $max: '$peakLoopMs' },
  peakRssMb: { $max: '$peakRssMb' },
  peakHeapMb: { $max: '$peakHeapMb' },
  peakDbConns: { $max: '$peakDbConns' },
};

async function databaseSize() {
  try {
    const s = await mongoose.connection.db.stats();
    return { dataMb: s.dataSize / 1e6, indexMb: s.indexSize / 1e6, storageMb: s.storageSize / 1e6 };
  } catch {
    return null; // a restricted database user; the screen just leaves it out
  }
}

// GET /api/skeo/usage?days=30 — what the admin Usage screen and its calculator
// are built from. Counts and rates only: no student is named anywhere in it.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const days = RANGES.has(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const inRange = { at: { $gte: since } };

  const dayKey = { $dateToString: { date: '$at', format: '%Y-%m-%d', timezone: TZ } };
  const [perDay, overall, perHour, busiest, quietest, busiestHour, dayRows, students, database] = await Promise.all([
    UsageBucket.aggregate([{ $match: inRange }, { $group: { _id: dayKey, ...totals } }, { $sort: { _id: 1 } }]),
    UsageBucket.aggregate([
      { $match: inRange },
      {
        $group: {
          _id: null,
          ...totals,
          ...Object.fromEntries(bandKeys.map((k) => [k, { $sum: `$lat.${k}` }])),
        },
      },
    ]),
    UsageBucket.aggregate([
      { $match: inRange },
      { $group: { _id: { $hour: { date: '$at', timezone: TZ } }, online: { $max: '$online' }, requests: { $sum: '$requests' } } },
    ]),
    UsageBucket.find({ ...inRange, requests: { $gt: 0 } }).sort({ requests: -1 }).limit(SAMPLE_BUCKETS)
      .select('requests online cpuMs dbOps').lean(),
    UsageBucket.find(inRange).sort({ requests: 1 }).limit(SAMPLE_BUCKETS).select('cpuMs').lean(),
    UsageBucket.aggregate([
      { $match: inRange },
      { $group: { _id: { $dateTrunc: { date: '$at', unit: 'hour' } }, requests: { $sum: '$requests' } } },
      { $sort: { requests: -1 } },
      { $limit: 1 },
    ]),
    UsageDay.aggregate([
      { $match: inRange },
      { $project: { students: { $size: { $ifNull: ['$students', []] } }, boots: 1, routes: 1, limits: 1 } },
      { $sort: { _id: 1 } },
    ]),
    User.countDocuments({ role: 'student' }),
    databaseSize(),
  ]);

  const dayInfo = new Map(dayRows.map((d) => [d._id, d]));
  const daily = perDay.map((d) => ({
    day: d._id,
    students: dayInfo.get(d._id)?.students || 0,
    restarts: dayInfo.get(d._id)?.boots || 0,
    requests: d.requests,
    bytesOut: d.bytesOut,
    videoPlays: d.videoPlays,
    peakOnline: d.peakOnline,
    serverErrors: d.serverErrors,
  }));

  const routes = new Map();
  for (const day of dayRows) {
    for (const [area, r] of Object.entries(day.routes || {})) {
      const row = routes.get(area) || { area, requests: 0, ms: 0 };
      row.requests += r.n || 0;
      row.ms += r.ms || 0;
      routes.set(area, row);
    }
  }

  const all = overall[0] || {};
  const lat = Object.fromEntries(bandKeys.map((k) => [k, all[k] || 0]));

  res.json({
    days,
    live: liveUsage(),
    totals: {
      requests: all.requests || 0,
      serverErrors: all.serverErrors || 0,
      limited: all.limited || 0,
      bytesOut: all.bytesOut || 0,
      bytesIn: all.bytesIn || 0,
      dbOps: all.dbOps || 0,
      videoPlays: all.videoPlays || 0,
      restarts: dayRows.reduce((n, d) => n + (d.boots || 0), 0),
      activeDays: daily.filter((d) => d.students > 0).length,
      avgDailyStudents: daily.length ? Math.round(daily.reduce((n, d) => n + d.students, 0) / daily.length) : 0,
    },
    peaks: {
      online: all.peakOnline || 0,
      rps: all.peakRps || 0,
      inflight: all.peakInflight || 0,
      cores: all.peakCores || 0,
      busy: all.peakBusy || 0,
      loopMs: all.peakLoopMs || 0,
      rssMb: all.peakRssMb || 0,
      heapMb: all.peakHeapMb || 0,
      dbConns: all.peakDbConns || 0,
      // The top of a band, so "under 250ms" rather than a false 137ms.
      p50Ms: percentile(lat, LATENCY.slice(0, -1), 0.5),
      p95Ms: percentile(lat, LATENCY.slice(0, -1), 0.95),
    },
    daily,
    hours: Array.from({ length: 24 }, (_, hour) => {
      const h = perHour.find((x) => x._id === hour);
      return { hour, online: h?.online || 0, requests: h?.requests || 0 };
    }),
    routes: [...routes.values()].sort((a, b) => b.ms - a.ms),
    database,
    evidence: buildEvidence({
      busiest,
      quietest,
      days: perDay.map((d) => ({
        students: dayInfo.get(d._id)?.students || 0,
        requests: d.requests,
        bytesOut: d.bytesOut,
        peakOnline: d.peakOnline,
      })),
      busiestHourRequests: busiestHour[0]?.requests || 0,
      students,
    }),
  });
});

export default router;
