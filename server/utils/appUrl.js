// Where the front end lives, for links we put in front of a human.
//
// SKEO_APP_URL is overloaded: index.js splits it on commas to build the CORS
// allowlist, so a preview deployment can be allowed without editing code. That
// makes the raw value a LIST, and anything that treats it as a single origin
// produces a URL whose host parses as "lms.skeo.in,https", which resolves
// nowhere.
//
// So: one place that answers "which origin do we send people to", and it is
// the first entry. First rather than last because the list is written with the
// real domain leading and the preview trailing, and a preview URL printed on
// somebody's certificate outlives the preview.
export function appOrigin() {
  const first = String(process.env.SKEO_APP_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return (first || 'http://localhost:5175').replace(/\/+$/, '');
}

/** A path on the front end, absolute, safe to put in an email or a QR code. */
export const appUrl = (path = '') => `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
