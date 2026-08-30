// Does this VdoCipher key actually allow everything the LMS needs?
//
//   npm run vdo:check              read-only probe
//   npm run vdo:check -- --cleanup also deletes the placeholder video that the
//                                  upload-credential check creates
//
// Written for the trial-account question: it reports, per capability, whether
// the key is permitted, so nobody has to take a pricing page's word for it.
// It never uploads bytes and never touches a video it did not create itself.

import 'dotenv/config';
import {
  createOtp,
  createUploadCredentials,
  deleteVideo,
  isConfigured,
  listVideos,
  watermarkFor,
} from '../utils/vdocipher.js';

const CLEANUP = process.argv.includes('--cleanup');
const PLACEHOLDER_TITLE = 'skeo-api-check (delete me)';

const ok = (label, detail = '') => console.log(`  OK    ${label}${detail ? ` — ${detail}` : ''}`);
const bad = (label, e) => console.log(`  FAIL  ${label} — ${e?.message || e}`);

if (!isConfigured()) {
  console.error('VDOCIPHER_API_SECRET is not set in server/.env — nothing to check.');
  process.exit(1);
}

console.log('\nVdoCipher capability check\n');

// 1. Library listing — what the admin lesson picker runs on.
let firstVideo = null;
try {
  const data = await listVideos({ limit: 5 });
  const count = data.count ?? (data.rows || []).length;
  firstVideo = (data.rows || [])[0] || null;
  ok('list videos', `${count} video(s) in the account`);
} catch (e) {
  bad('list videos', e);
}

// 2. Playback OTP with a watermark — the one call every student makes.
if (firstVideo) {
  try {
    const { otp, playbackInfo } = await createOtp(firstVideo.id, {
      ttl: 300,
      annotate: watermarkFor({ fullName: 'API Check', email: 'check@skeo.in' }),
    });
    ok(
      'playback OTP + watermark',
      otp && playbackInfo ? `minted for "${firstVideo.title || firstVideo.id}"` : 'incomplete ticket returned',
    );
  } catch (e) {
    bad('playback OTP + watermark', e);
  }
} else {
  console.log('  SKIP  playback OTP — the account has no video to mint one for yet');
}

// 3. Upload credentials. This RESERVES a video id on the account (no bytes are
//    sent), so the placeholder is reported and removed only with --cleanup.
let placeholderId = null;
try {
  const { videoId } = await createUploadCredentials(PLACEHOLDER_TITLE);
  placeholderId = videoId;
  ok('upload credentials', `reserved placeholder ${videoId}`);
} catch (e) {
  bad('upload credentials', e);
}

// 4. Delete — only ever the placeholder this script just made.
if (placeholderId && CLEANUP) {
  try {
    await deleteVideo(placeholderId);
    ok('delete video', 'placeholder removed');
  } catch (e) {
    bad('delete video', e);
  }
} else if (placeholderId) {
  console.log(`\n  Note: an empty video "${PLACEHOLDER_TITLE}" (${placeholderId}) is now sitting in`);
  console.log('  your VdoCipher dashboard. Re-run with --cleanup to delete it, or remove it there.');
}

console.log('');
