/* Turns stored usage into what a plan is chosen on.
 *
 * The rates come from the busiest buckets rather than an average over the whole
 * range, because a quiet night says nothing about a live class. Each is per
 * something that scales (per student online, per request), so the calculator on
 * the admin screen can carry it to a headcount that has not happened yet.
 */

const BUCKET_SECONDS = 300;

// Below this, one student's habits or one slow request would set the forecast,
// and the calculator is better off saying it is using assumptions.
const ENOUGH = { peakOnline: 20, requests: 5000, days: 3 };

const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] || 0), 0);

/** Requests a band of the latency histogram holds, in band order. */
export function percentile(lat, bands, share) {
  const total = bands.reduce((n, top) => n + (lat[`l${top}`] || 0), 0);
  if (!total) return null;
  let running = 0;
  for (const top of bands) {
    running += lat[`l${top}`] || 0;
    if (running >= total * share) return top;
  }
  return null;
}

/**
 * @param busiest   the buckets with the most requests, heaviest first
 * @param quietest  the buckets with the fewest, for what the process costs idle
 * @param days      per-day rows, each with { students, bytesOut, requests }
 * @param busiestHourRequests  requests in the busiest clock hour of the range
 * @param students  accounts with the student role today
 */
export function buildEvidence({ busiest, quietest, days, busiestHourRequests, students }) {
  const requests = sum(busiest, 'requests');
  const peakOnline = Math.max(0, ...busiest.map((b) => b.online || 0), ...days.map((d) => d.peakOnline || 0));
  const totalRequests = sum(days, 'requests');
  const activeDays = days.filter((d) => d.students > 0);
  const studentDays = sum(activeDays, 'students');

  // A process with no traffic still spends a little on timers. Over a whole day
  // that dwarfs a handful of requests, so it comes off before dividing.
  const idleMsPerBucket = quietest.length ? sum(quietest, 'cpuMs') / quietest.length : 0;
  const workMs = Math.max(0, sum(busiest, 'cpuMs') - idleMsPerBucket * busiest.length);

  const onlineSeconds = sum(busiest, 'online') * BUCKET_SECONDS;

  return {
    peakOnline,
    studentsNow: students,
    daysMeasured: activeDays.length,
    measured: peakOnline >= ENOUGH.peakOnline && totalRequests >= ENOUGH.requests && activeDays.length >= ENOUGH.days,
    needs: ENOUGH,
    rpsPerOnline: onlineSeconds ? requests / onlineSeconds : null,
    cpuMsPerRequest: requests ? workMs / requests : null,
    dbOpsPerRequest: requests ? sum(busiest, 'dbOps') / requests : null,
    mbPerStudentDay: studentDays ? sum(activeDays, 'bytesOut') / studentDays / 1e6 : null,
    peakShare: students ? peakOnline / students : null,
    dailyShare: students && activeDays.length ? studentDays / activeDays.length / students : null,
    // How much of the five-minute peak the busiest hour keeps up. Burstable hosts
    // live or die on this: they can sprint for a class, not run all afternoon.
    sustainedRatio: busiest[0]?.requests ? Math.min(1, busiestHourRequests / 12 / busiest[0].requests) : null,
  };
}
