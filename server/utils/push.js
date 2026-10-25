import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';

// Web Push: the notification that reaches a phone's lock screen while the app
// is closed. Optional, like VdoCipher -- with no VAPID keys the server starts
// normally, /push/key reports push as off, and the client never offers it.
//
//   npm run push:keys   prints a fresh key pair for VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
//
// Generate the pair once and keep it. Replacing it orphans every subscription
// in the database: browsers bind a subscription to the public key it was made
// with, so each device would have to turn alerts on again.
const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
// Push services contact this address if the sender misbehaves. It has to be a
// mailto: or https: URL, or web-push refuses the keys outright.
const SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:support@skeoai.com').trim();

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    // A bad key should cost the feature, not the process.
    console.error('[push] VAPID keys rejected, push is off:', err.message);
  }
}

export const pushEnabled = () => configured;
export const vapidPublicKey = () => (configured ? PUBLIC_KEY : '');

/**
 * Only the real push services. The server POSTs to whatever endpoint a browser
 * registered, so an endpoint is an outbound URL chosen by a client -- without
 * this list a signed-in user could point it at anything reachable from here.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

// The heading on the lock screen. The text itself is the body, and it already
// says what happened ("Your submission was graded: 8"), so the title only
// names the part of the app it came from.
const TITLES = {
  grade: 'Grades',
  quiz: 'Learning',
  assignment: 'Learning',
  announcement: 'Announcement',
  doubt: 'Doubts',
  support: 'Support',
  webinar: 'Masterclass',
};

// Push services cap a payload at about 4 KB after encryption. No notification
// here comes close, but a pasted essay as a support subject should not be the
// one that silently fails.
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Enough parallel sends to finish a whole-school masterclass push quickly,
// few enough not to open hundreds of sockets at once.
const CONCURRENCY = 10;

/**
 * Push one notification to every device of every user listed. Never throws and
 * never blocks the caller: notify() fires it after the bell's row is saved.
 *
 * A 404 or 410 from the push service means the device has unsubscribed (app
 * uninstalled, permission revoked, the browser rotated it), so that row is
 * deleted. Anything else is logged and left alone -- it may be transient.
 */
export async function sendPush(userIds, { type = 'info', text, link = '', title } = {}) {
  if (!configured || !text || !userIds?.length) return;
  try {
    const subs = await PushSubscription.find({ userId: { $in: userIds } }).lean();
    if (!subs.length) return;

    const payload = JSON.stringify({
      title: clip(title || TITLES[type] || 'skeo', 80),
      body: clip(String(text), 400),
      // In-app paths only; the service worker refuses anything off-origin too.
      url: typeof link === 'string' && link.startsWith('/') ? link : '/app',
      type,
    });

    const dead = [];
    let next = 0;
    const worker = async () => {
      while (next < subs.length) {
        const sub = subs[next++];
        try {
          // A day: a phone that is off overnight still gets the morning's
          // grades, and nothing older than that is worth showing.
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 86_400, urgency: 'normal' });
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub._id);
          else console.warn(`[push] send failed (${err.statusCode || err.code || 'error'}):`, err.body || err.message);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, subs.length) }, worker));

    if (dead.length) await PushSubscription.deleteMany({ _id: { $in: dead } });
  } catch (err) {
    console.error('[push] could not send:', err.message);
  }
}
