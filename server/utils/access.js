import { Batch } from '../models/Batch.js';

const has = (arr, id) => (arr || []).some((x) => x.toString() === id);

/** Admin course-block: is this batch hidden from this (non-admin) user? */
export function isBlockedFromBatch(user, batchId) {
  if (user.role === 'admin') return false;
  return has(user.blocked?.batchIds, String(batchId));
}

/** Admin assignment/project-block: is this assignment hidden from this user? */
export function isBlockedFromAssignment(user, assignmentId) {
  if (user.role === 'admin') return false;
  return has(user.blocked?.assignmentIds, String(assignmentId));
}

/** Can this user MANAGE a batch (attendance, announcements, quizzes, grading)?
 *  There are only two roles here, so this is exactly "is an admin" -- but the
 *  routes read better asking the question they mean, and if a teaching role is
 *  ever reintroduced this is the one place that has to learn about it. */
export function canManageBatch(user) {
  return user.role === 'admin';
}

/** Can this user SEE the batch? An admin, or a student enrolled in it. */
export async function canAccessBatch(user, batchId) {
  if (user.role === 'admin') return true;
  if (isBlockedFromBatch(user, batchId)) return false;
  const b = await Batch.findById(batchId).select('studentIds');
  return !!b && has(b.studentIds, user._id.toString());
}

/** Batch ids the user belongs to. Admin -> all; student -> those enrolled in. */
export async function myBatchIds(user) {
  if (user.role === 'admin') return (await Batch.find().select('_id')).map((b) => b._id);
  const batches = await Batch.find({ studentIds: user._id }).select('_id');
  // Admin-blocked batches simply disappear from the user's world.
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  return batches.map((b) => b._id).filter((id) => !blocked.has(id.toString()));
}
