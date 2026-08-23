import { Notification } from '../models/Notification.js';

// Fire-and-forget notification helpers (never block the request that triggers them).
export async function notify(userId, { type = 'info', text, link = '' }) {
  if (!userId || !text) return;
  try { await Notification.create({ userId, type, text, link }); } catch { /* ignore */ }
}

export async function notifyMany(userIds, payload) {
  await Promise.all((userIds || []).map((id) => notify(id, payload)));
}
