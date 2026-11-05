/* Which host does this headcount need, and what does it cost?
 *
 * The sum is deliberately simple enough to check by hand:
 *
 *   students online    = students × the share online at the busiest moment
 *   CPU needed         = online × requests a second each × CPU per request
 *   a class rush       = online × requests in a home screen × CPU per request
 *   bandwidth a month  = students × the share active a day × MB a day × 30
 *
 * The rates come from real use once there is enough of it, and from the load
 * test until then. Each is a straight line upward, which overstates the load: a
 * class shares cached answers, so the 500th student costs less than the 5th.
 * That is the safe direction to be wrong in.
 *
 * Three things here are facts about this app rather than about hosts, and they
 * decide most of the table:
 *
 *   One core. The API is one Node process, and its caches and rate limiter live
 *   in that process. A plan with four CPUs gives it about one until the code runs
 *   several processes with Redis between them, so extra CPUs count for nothing.
 *
 *   Rushes, not averages. A live class arriving together is the worst minute this
 *   API has. A plan that survives an average afternoon can still leave the last
 *   student waiting half a minute.
 *
 *   Burstable is not the same as fast. Lightsail's two vCPUs each sustain a
 *   fraction of a core, and sprint above it on saved credit. Good for a class,
 *   bad for a busy afternoon, so it has to pass both checks.
 */

export const PRICES_CHECKED = '5 Nov 2026';
export const PRICE_SOURCES = [
  { label: 'Render pricing', href: 'https://render.com/pricing' },
  { label: 'Lightsail bundles', href: 'https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html' },
  { label: 'Lightsail CPU baseline', href: 'https://docs.aws.amazon.com/lightsail/latest/userguide/baseline-cpu-performance.html' },
  { label: 'Atlas pricing', href: 'https://www.mongodb.com/pricing' },
];

/** The most CPU a single Node process puts to work. */
export const USABLE_CORES = 1;
/** Plans are judged at 70% busy: past that, requests start to queue. */
export const HEADROOM = 0.7;
/** Requests a student's home screen fires at once. */
export const SCREEN_REQUESTS = 7;
/** The longest the last student of a rush should wait for their screen. */
export const RUSH_SECONDS = 10;
/** What the process needs at 2000 students, with its heap pinned at 256MB. */
export const BASE_MEMORY_MB = 300;
export const MEMORY_MARGIN = 1.25;

/* Prices in USD a month. `cores` is what a sprint can use, `sustainedCores` what
 * can be held all afternoon. Render's bandwidth is per workspace on the Hobby
 * plan, and the allowance fell from 100GB to 5GB on 1 August 2026. Lightsail's
 * allowance is half the headline figure in Mumbai. */
export const HOSTS = [
  { id: 'render-starter', name: 'Render Starter', provider: 'Render', price: 7, cores: 0.5, sustainedCores: 0.5, ramMb: 512, includedGb: 5, perGb: 0.15, opsHours: 0 },
  { id: 'render-standard', name: 'Render Standard', provider: 'Render', price: 25, cores: 1, sustainedCores: 1, ramMb: 2048, includedGb: 5, perGb: 0.15, opsHours: 0 },
  { id: 'render-pro', name: 'Render Pro', provider: 'Render', price: 85, cores: 2, sustainedCores: 2, ramMb: 4096, includedGb: 5, perGb: 0.15, opsHours: 0 },
  { id: 'lightsail-2gb', name: 'AWS Lightsail 2GB', provider: 'AWS', price: 12, cores: 2, sustainedCores: 0.4, ramMb: 2048, includedGb: 1500, perGb: 0.13, opsHours: 3 },
  { id: 'lightsail-8gb', name: 'AWS Lightsail 8GB', provider: 'AWS', price: 44, cores: 2, sustainedCores: 0.6, ramMb: 8192, includedGb: 2500, perGb: 0.13, opsHours: 3 },
];

export const DATABASES = [
  { id: 'm0', name: 'Atlas Free (M0)', price: '$0', opsPerSecond: 100, storageMb: 512 },
  { id: 'flex', name: 'Atlas Flex', price: '$8 to $30', opsPerSecond: 500, storageMb: 5000 },
  { id: 'm10', name: 'Atlas M10', price: 'from $57', opsPerSecond: Infinity, storageMb: 10000 },
];

/* Used until real traffic replaces them, and shown as assumptions on the screen.
 * cpuMsPerRequest is the load test's 0.84ms on a desktop core, doubled for a
 * cloud core. rpsPerOnline is a home screen every 30 seconds. mbPerStudentDay is
 * 300 requests at the 2.3KB a request measured, rounded up. */
export const ASSUMED = {
  rpsPerOnline: 0.25,
  cpuMsPerRequest: 1.7,
  dbOpsPerRequest: 1,
  mbPerStudentDay: 1,
  peakShare: 0.25,
  dailyShare: 0.4,
  sustainedRatio: 0.6,
};

/** No real request is cheaper than the load test's, whatever the sums say. */
const CHEAPEST_REQUEST_MS = 0.84;

/** Real rates where there are enough of them, assumptions everywhere else. */
export function ratesFrom(evidence) {
  if (!evidence?.measured) return { ...ASSUMED, measured: false };
  const pick = (key) => evidence[key] ?? ASSUMED[key];
  return {
    measured: true,
    rpsPerOnline: pick('rpsPerOnline'),
    cpuMsPerRequest: Math.max(CHEAPEST_REQUEST_MS, pick('cpuMsPerRequest')),
    dbOpsPerRequest: pick('dbOpsPerRequest'),
    mbPerStudentDay: pick('mbPerStudentDay'),
    peakShare: pick('peakShare'),
    dailyShare: pick('dailyShare'),
    sustainedRatio: pick('sustainedRatio'),
  };
}

function judgeHost(host, { online, peakShare, rates, gbPerMonth, memoryMb, hourRate }) {
  const coresEach = (rates.rpsPerOnline * rates.cpuMsPerRequest) / 1000;
  const usable = Math.min(host.cores, USABLE_CORES);
  const sustainable = Math.min(host.sustainedCores, USABLE_CORES);
  const screenCores = (SCREEN_REQUESTS * rates.cpuMsPerRequest) / 1000;

  // Each limit, as the number of students online it allows.
  const limits = [
    { by: 'the busiest minutes', online: (HEADROOM * usable) / coresEach },
    { by: 'a long busy stretch', online: (HEADROOM * sustainable) / (coresEach * rates.sustainedRatio) },
    { by: 'a class rush', online: (RUSH_SECONDS * usable) / screenCores },
  ];
  const tightest = limits.reduce((a, b) => (b.online < a.online ? b : a));

  const memoryNeeded = Math.max(memoryMb || 0, BASE_MEMORY_MB) * MEMORY_MARGIN;
  const memoryFits = memoryNeeded <= host.ramMb;
  const bandwidthCost = Math.max(0, gbPerMonth - host.includedGb) * host.perGb;
  const monthly = host.price + bandwidthCost;

  return {
    ...host,
    maxOnline: Math.floor(tightest.online),
    maxStudents: Math.floor(tightest.online / peakShare),
    limitedBy: memoryFits ? tightest.by : 'memory',
    rushSeconds: (online * screenCores) / usable,
    busyShare: (online * coresEach) / usable,
    bandwidthCost,
    monthly,
    withTime: monthly + host.opsHours * hourRate,
    fits: memoryFits && online <= tightest.online,
    // A second CPU the process cannot use is money for nothing.
    wastesCores: host.sustainedCores > USABLE_CORES,
  };
}

function judgeDatabase({ online, rates, database, students }) {
  const opsPerSecond = online * rates.rpsPerOnline * rates.dbOpsPerRequest;
  const nowMb = database ? database.dataMb + database.indexMb : 0;
  const storageMb = database?.studentsNow ? nowMb * (students / database.studentsNow) : nowMb;
  const tier = DATABASES.find((d) => opsPerSecond <= d.opsPerSecond * HEADROOM && storageMb <= d.storageMb * 0.8)
    || DATABASES[DATABASES.length - 1];
  return { opsPerSecond, storageMb, tier };
}

/**
 * @param students    how many enrolled, the number being planned for
 * @param peakShare   share of them online at the busiest moment, 0 to 1
 * @param dailyShare  share of them active on a typical day, 0 to 1
 * @param hourRate    what an hour of your time is worth, USD
 * @param rates       from ratesFrom()
 * @param memoryMb    the highest the process has reached for real, if known
 * @param database    { dataMb, indexMb, studentsNow }, if known
 */
export function planHosting({ students, peakShare, dailyShare, hourRate = 0, rates, memoryMb, database }) {
  const online = Math.ceil(students * peakShare);
  const gbPerMonth = (students * dailyShare * 30 * rates.mbPerStudentDay) / 1000;
  const context = { online, peakShare, rates, gbPerMonth, memoryMb, hourRate };

  const hosts = HOSTS.map((host) => judgeHost(host, context));
  const best = hosts
    .filter((h) => h.fits && !h.wastesCores)
    .sort((a, b) => a.withTime - b.withTime)[0] || null;
  // The step after this one, so the screen can say when to move.
  const next = best
    ? hosts
      .filter((h) => !h.wastesCores && h.provider === best.provider && h.maxStudents > best.maxStudents)
      .sort((a, b) => a.price - b.price)[0] || null
    : null;

  return {
    online,
    gbPerMonth,
    coresNeeded: (online * rates.rpsPerOnline * rates.cpuMsPerRequest) / 1000,
    hosts,
    best,
    next,
    database: judgeDatabase({ online, rates, database, students }),
  };
}
