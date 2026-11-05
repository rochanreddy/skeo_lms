import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import mongoose from 'mongoose';
import { UsageBucket, UsageDay } from '../models/Usage.js';

/* The meter behind the admin Usage screen.
 *
 * It answers one question: what would this API need to run on, going by what
 * students actually do? A load test says what the code can take. Only real use
 * says how many are online at once, how often they ask for something, and how
 * many bytes that comes to, and those are what a plan is chosen on.
 *
 * It lives in the process, so it has no dependency and no bill, and it has to
 * stay cheap enough never to show up in what it measures. A request costs a few
 * counter increments. Everything heavier happens on a timer: every 5 seconds the
 * process reads its own CPU and memory, and once a minute the counters go to the
 * database in two small writes.
 *
 * If a write fails that minute is dropped. Monitoring must never be the reason a
 * request failed, and a gap in a chart is an acceptable price for that.
 *
 * What it does not see: video. Students stream from VdoCipher directly, so a
 * lesson costs this API one ticket however long it plays. It counts the tickets.
 */

const BUCKET_MS = 5 * 60_000;
const SAMPLE_MS = 5_000;
const FLUSH_MS = 60_000;
const ONLINE_MS = 5 * 60_000;
const LOOP_RESOLUTION_MS = 20;
const IST_OFFSET_MS = 5.5 * 3_600_000; // students and the admin both live in India

/** Upper bound of each latency band, in ms. The last one catches everything. */
export const LATENCY = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];
export const latencyKey = (ms) => `l${LATENCY.find((top) => ms <= top)}`;

/** The router a request ended up in. Mount paths are fixed, so this cannot grow. */
export const routeArea = (baseUrl = '') => /^\/api\/skeo\/([a-z]+)/.exec(baseUrl)?.[1] || 'other';

export const bucketStart = (ms) => new Date(ms - (ms % BUCKET_MS));
export const istDay = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

const blankWindow = () => ({
  requests: 0, serverErrors: 0, limited: 0, bytesOut: 0, bytesIn: 0, cpuMs: 0, dbOps: 0, videoPlays: 0,
  lat: {},
  routes: {},
  peakInflight: 0, peakRps: 0, peakCores: 0, peakBusy: 0, peakLoopMs: 0,
  peakRssMb: 0, peakHeapMb: 0, peakDbConns: 0,
});

let win = blankWindow();
let inflight = 0;
let dbInUse = 0;
let requestsAtSample = 0;
const seen = new Map(); // student id -> when last seen, for "online now"
const newToday = new Set(); // ids not yet written to today's row
const knownToday = new Set();
let today = '';
let bootPending = true;
let latest = { cores: 0, busy: 0, loopMs: 0, rssMb: 0, heapMb: 0 };

/** First in the chain, so it sees preflights and rate-limited requests too. */
export function usageMeter(req, res, next) {
  if (req.path === '/health') return next(); // the platform's probe, not usage
  const started = performance.now();
  inflight += 1;
  if (inflight > win.peakInflight) win.peakInflight = inflight;

  // 'close' rather than 'finish': a student who walks away mid-response is the
  // one case 'finish' never fires for, and inflight would drift up for good.
  res.once('close', () => {
    inflight -= 1;
    const ms = performance.now() - started;
    win.requests += 1;
    if (res.statusCode >= 500) win.serverErrors += 1;
    else if (res.statusCode === 429) win.limited += 1;

    const band = latencyKey(ms);
    win.lat[band] = (win.lat[band] || 0) + 1;

    const area = routeArea(req.baseUrl);
    const route = win.routes[area] || (win.routes[area] = { n: 0, ms: 0 });
    route.n += 1;
    route.ms += ms;

    if (req.user?.role === 'student') {
      const id = String(req.user._id);
      seen.set(id, Date.now());
      if (!knownToday.has(id)) {
        knownToday.add(id);
        newToday.add(id);
      }
    }
  });
  next();
}

/** A student was given a playback ticket. */
export function videoPlayed() {
  win.videoPlays += 1;
}

export function onlineNow(now = Date.now()) {
  let n = 0;
  for (const at of seen.values()) if (now - at <= ONLINE_MS) n += 1;
  return n;
}

function forgetOffline(now) {
  for (const [id, at] of seen) if (now - at > ONLINE_MS) seen.delete(id);
}

const round = (n, places = 0) => Number(n.toFixed(places));

/** The two writes for one minute of counters. Separate so a test can read them. */
export function buildUpdates(w, { online, newStudents = [], boot = false, limits } = {}) {
  const $inc = {
    requests: w.requests, serverErrors: w.serverErrors, limited: w.limited,
    bytesOut: w.bytesOut, bytesIn: w.bytesIn, cpuMs: round(w.cpuMs),
    dbOps: w.dbOps, videoPlays: w.videoPlays,
  };
  for (const [band, n] of Object.entries(w.lat)) $inc[`lat.${band}`] = n;

  const $max = {
    online, peakInflight: w.peakInflight, peakRps: round(w.peakRps, 1),
    peakCores: round(w.peakCores, 3), peakBusy: round(w.peakBusy, 3), peakLoopMs: round(w.peakLoopMs, 1),
    peakRssMb: round(w.peakRssMb), peakHeapMb: round(w.peakHeapMb), peakDbConns: w.peakDbConns,
  };

  const dayInc = {};
  for (const [area, r] of Object.entries(w.routes)) {
    dayInc[`routes.${area}.n`] = r.n;
    dayInc[`routes.${area}.ms`] = round(r.ms);
  }
  if (boot) dayInc.boots = 1;

  const day = {};
  if (Object.keys(dayInc).length) day.$inc = dayInc;
  if (newStudents.length) {
    day.$addToSet = { students: { $each: newStudents.map((id) => new mongoose.Types.ObjectId(id)) } };
  }
  if (limits) day.$set = { limits };

  return { bucket: { $inc, $max }, day };
}

/** Parses cgroup v2's cpu.max, e.g. "50000 100000" is half a core. */
export function parseCpuMax(text) {
  const [quota, period] = String(text).trim().split(/\s+/);
  if (!quota || quota === 'max' || !Number(period)) return null;
  return Number(quota) / Number(period);
}

/* V8's heap_size_limit is the old space plus three times the new space, so a
 * 256MB setting reads as about 470MB on Node 24. The setting is the number that
 * can be compared with anything, so that is the one to report. */
export function heapLimitMb(nodeOptions = '', v8LimitBytes = 0) {
  const set = /--max-old-space-size=(\d+)/.exec(nodeOptions)?.[1];
  return set ? Number(set) : round(v8LimitBytes / 1e6);
}

const readFile = (path) => {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null; // not Linux, or a cgroup layout this does not know
  }
};

/* What this process has actually been given, read from the inside. On Render
 * that says whether a plan change and NODE_OPTIONS really applied, which the
 * dashboard otherwise leaves you to check by hand. */
export function readLimits() {
  const quota = readFile('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
  const period = readFile('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
  const cpuLimit = parseCpuMax(readFile('/sys/fs/cgroup/cpu.max'))
    ?? (Number(quota) > 0 && Number(period) > 0 ? Number(quota) / Number(period) : null);

  // A figure in the hundreds of terabytes means "no limit was set".
  const memory = process.constrainedMemory?.() || 0;
  const memoryLimitMb = memory > 0 && memory < 2 ** 50 ? round(memory / 1e6) : null;

  return {
    cpuLimit,
    memoryLimitMb,
    heapLimitMb: heapLimitMb(process.env.NODE_OPTIONS, getHeapStatistics().heap_size_limit),
    cpusVisible: availableParallelism(),
  };
}

/** The numbers the Usage screen shows as "right now". */
export const liveUsage = () => ({ ...latest, online: onlineNow(), inflight, dbInUse, limits: readLimits() });

/* Starts the clocks. Called once the server is listening and the database is
 * connected: both the socket and the pool counters attach to real objects. */
export function startUsageMeter(server) {
  // Socket totals rather than Content-Length, which is missing on anything
  // compressed as it streams. This is what actually left the process, headers
  // included, before the platform's proxy adds TLS.
  const sockets = new Set();
  let closedOut = 0;
  let closedIn = 0;
  let lastOut = 0;
  let lastIn = 0;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      closedOut += socket.bytesWritten;
      closedIn += socket.bytesRead;
      sockets.delete(socket);
    });
  });

  // Every operation checks a connection out of the pool, and the driver reports
  // that without command monitoring being turned on, so counting database work
  // costs an increment and not a copy of each command.
  const client = mongoose.connection.getClient();
  client.on('connectionCheckedOut', () => {
    win.dbOps += 1;
    dbInUse += 1;
    if (dbInUse > win.peakDbConns) win.peakDbConns = dbInUse;
  });
  client.on('connectionCheckedIn', () => { dbInUse -= 1; });

  const loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
  loop.enable();
  let cpuBefore = process.cpuUsage();
  let eluBefore = performance.eventLoopUtilization();
  let sampledAt = performance.now();

  function sample() {
    const now = performance.now();
    const seconds = (now - sampledAt) / 1000;
    sampledAt = now;

    const cpu = process.cpuUsage(cpuBefore);
    cpuBefore = process.cpuUsage();
    const cpuMs = (cpu.user + cpu.system) / 1000;
    const cores = cpuMs / 1000 / seconds;

    const elu = performance.eventLoopUtilization(eluBefore);
    eluBefore = performance.eventLoopUtilization();

    // The histogram measures a timer that was asked to wait for the resolution,
    // so the wait itself is in every reading and is not delay.
    const loopMs = Math.max(0, loop.percentile(99) / 1e6 - LOOP_RESOLUTION_MS);
    loop.reset();

    const { rss, heapUsed } = process.memoryUsage();
    latest = { cores: round(cores, 3), busy: round(elu.utilization, 3), loopMs: round(loopMs, 1), rssMb: round(rss / 1e6), heapMb: round(heapUsed / 1e6) };

    const rps = (win.requests - requestsAtSample) / seconds;
    requestsAtSample = win.requests;

    win.cpuMs += cpuMs;
    win.peakCores = Math.max(win.peakCores, cores);
    win.peakBusy = Math.max(win.peakBusy, elu.utilization);
    win.peakLoopMs = Math.max(win.peakLoopMs, loopMs);
    win.peakRssMb = Math.max(win.peakRssMb, rss / 1e6);
    win.peakHeapMb = Math.max(win.peakHeapMb, heapUsed / 1e6);
    win.peakRps = Math.max(win.peakRps, rps);
  }

  async function flush() {
    const now = Date.now();
    let out = closedOut;
    let inn = closedIn;
    for (const socket of sockets) {
      out += socket.bytesWritten;
      inn += socket.bytesRead;
    }
    win.bytesOut = out - lastOut;
    win.bytesIn = inn - lastIn;
    lastOut = out;
    lastIn = inn;

    forgetOffline(now);
    const day = istDay(now);
    if (day !== today) {
      today = day;
      knownToday.clear();
      for (const id of seen.keys()) { // still here after midnight
        newToday.add(id);
        knownToday.add(id);
      }
    }

    const done = win;
    const newStudents = [...newToday];
    const boot = bootPending;
    win = blankWindow();
    requestsAtSample = 0;
    newToday.clear();
    bootPending = false;

    const { bucket, day: dayUpdate } = buildUpdates(done, { online: seen.size, newStudents, boot, limits: readLimits() });
    try {
      await Promise.all([
        UsageBucket.updateOne({ at: bucketStart(now) }, bucket, { upsert: true }),
        UsageDay.updateOne(
          { _id: day },
          { ...dayUpdate, $setOnInsert: { at: new Date(now) } },
          { upsert: true },
        ),
      ]);
    } catch (e) {
      console.error('[usage] dropped a minute of counters:', e.message);
    }
  }

  setInterval(sample, SAMPLE_MS).unref();
  setInterval(() => { flush().catch((e) => console.error('[usage]', e.message)); }, FLUSH_MS).unref();
}
