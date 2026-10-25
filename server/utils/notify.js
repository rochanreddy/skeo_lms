import { Notification } from '../models/Notification.js';
import { sendPush } from './push.js';

// Fire-and-forget notification helpers (never block the request that triggers them).
// Each one lands under the bell and, on every device the user turned alerts on
// for, as a push notification.
async function save(userId, { type = 'info', text, link = '' }) {
  try { await Notification.create({ userId, type, text, link }); return true; } catch { return false; }
}

export async function notify(userId, payload = {}) {
  if (!userId || !payload.text) return;
  if (await save(userId, payload)) await sendPush([userId], payload);
}

// One push query for the whole list rather than one per recipient: a
// masterclass goes to every student in the school.
export async function notifyMany(userIds, payload = {}) {
  if (!payload.text) return;
  const ids = (userIds || []).filter(Boolean);
  const saved = await Promise.all(ids.map((id) => save(id, payload)));
  await sendPush(ids.filter((_, i) => saved[i]), payload);
}
