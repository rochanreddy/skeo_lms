import { Batch } from '../models/Batch.js';
import { ProvisionedOrder } from '../models/ProvisionedOrder.js';

/**
 * Has this person paid for anything the LMS holds?
 *
 * Yes if they own Everything AI, are in any batch (bought, or enrolled by an
 * admin — both count), or have a completed website order. The last one is for
 * the buyer whose batch did not exist yet when they paid: the order recorded a
 * warning for an admin to act on, and they must still be able to sign in.
 */
export async function hasPaidAccess(user) {
  if (user.role === 'admin') return true;
  if (user.allAccess) return true;
  if ((user.batchIds || []).length) return true;
  if (await Batch.exists({ studentIds: user._id })) return true;
  return Boolean(await ProvisionedOrder.exists({ userId: user._id, status: 'done' }));
}

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
  // Ask the database the membership question instead of fetching the roster and
  // searching it here. This used to pull the batch's whole studentIds array
  // across the wire -- hundreds of ObjectIds on a full cohort -- to answer one
  // yes/no. exists() with the id in the filter is a single index lookup that
  // returns nothing but an _id. A batch that does not exist still answers
  // "no", exactly as `!!b && ...` did.
  return Boolean(await Batch.exists({ _id: batchId, studentIds: user._id }));
}

/** Batch ids the user belongs to. Admin -> all; student -> those enrolled in. */
export async function myBatchIds(user) {
  // distinct() returns the ids themselves, straight off the _id index: no
  // documents to fetch, no Mongoose documents to hydrate, no .map() after.
  if (user.role === 'admin') return Batch.distinct('_id');
  // lean(), and covered by the studentIds index -- studentIds and _id are both
  // in it, so this is answered without reading a single document.
  const batches = await Batch.find({ studentIds: user._id }).select('_id').lean();
  // Admin-blocked batches simply disappear from the user's world.
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  return batches.map((b) => b._id).filter((id) => !blocked.has(id.toString()));
}
