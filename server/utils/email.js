// Mailer. Three ways out, tried in this order:
//
//   1. Resend   — RESEND_API_KEY set. Plain HTTPS on 443, no SDK. This is the
//                 one that works on a managed host: Render and most others
//                 firewall outbound 25/465/587, and the failure is not an auth
//                 error you would notice — the connection hangs until it times
//                 out, taking the request with it. No amount of correct SMTP
//                 credentials fixes that. Port 443 is never blocked.
//   2. SMTP     — SMTP_HOST/USER/PASS set. Fine on a box you control.
//   3. Console  — neither set: the message is logged, so reset links stay
//                 testable in development without a provider.
//
// Every caller goes through sendMail(), so changing provider is an env change
// rather than a code change.
//
// Ported from menler-lms, which arrived at this after SMTP silently failed in
// production there.

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isMailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

/* MAIL_FROM wins; SMTP_FROM is honoured for installs that predate it. Quotes
   are stripped because a dashboard (Render, say) passes them through verbatim
   where a .env file would have eaten them, and Resend 422s on the result. */
const unquote = (s) => String(s || '').trim().replace(/^["']+|["']+$/g, '').trim();

function fromAddress() {
  return unquote(process.env.MAIL_FROM)
    || unquote(process.env.SMTP_FROM)
    || (process.env.SMTP_USER ? `Skeo <${process.env.SMTP_USER}>` : 'Skeo <onboarding@resend.dev>');
}

let cachedTransport = null;
async function getTransport() {
  if (cachedTransport) return cachedTransport;
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Fail fast rather than hanging a request behind a blocked port.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return cachedTransport;
}

async function sendViaResend({ from, to, subject, text, html, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  // Resend puts the useful part in `message` — e.g. "The skeo.in domain is not
  // verified", which is the difference between a config error and a bug.
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || body?.name || 'send failed'}`);
  return { id: body.id, provider: 'resend' };
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  if (!isMailConfigured()) {
    console.log(`\n[email:dev] to=${to}\nsubject=${subject}\n${text || ''}\n`);
    return { dev: true };
  }
  const from = fromAddress();
  if (isResendConfigured()) return sendViaResend({ from, to, subject, text, html, replyTo });
  const transport = await getTransport();
  const info = await transport.sendMail({ from, to, subject, text, html, replyTo });
  return { id: info?.messageId, provider: 'smtp' };
}

/**
 * For callers that must not fail the request when the mail does — a
 * provisioned account is still provisioned if the provider is down.
 * Returns { emailed, dev?, error? } so the caller can say which.
 */
export async function trySendMail(message) {
  try {
    const r = await sendMail(message);
    return { emailed: !r.dev, dev: !!r.dev };
  } catch (err) {
    console.error(`[email] to=${message.to} failed:`, err?.message || err);
    return { emailed: false, error: err?.message || 'send failed' };
  }
}
