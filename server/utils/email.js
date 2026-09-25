// Mailer. Four ways out, tried in this order:
//
//   0. ZeptoMail — ZEPTOMAIL_TOKEN set. HTTPS API, same as menler-lms. It is
//                 first because it is credit-based rather than capped per day:
//                 every paid order sends a login mail, and Resend's free 100 a
//                 day is not a ceiling a checkout can be allowed to hit. The
//                 sender must be on a domain verified in ZeptoMail —
//                 noreply@skeoai.com needs skeoai.com added there.
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

export function isZeptoConfigured() {
  return !!process.env.ZEPTOMAIL_TOKEN;
}

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isMailConfigured() {
  return isZeptoConfigured() || isResendConfigured() || isSmtpConfigured();
}

/* MAIL_FROM wins; SMTP_FROM is honoured for installs that predate it. Quotes
   are stripped because a dashboard (Render, say) passes them through verbatim
   where a .env file would have eaten them, and Resend 422s on the result. */
const unquote = (s) => String(s || '').trim().replace(/^["']+|["']+$/g, '').trim();

function fromAddress() {
  return unquote(process.env.MAIL_FROM)
    || unquote(process.env.SMTP_FROM)
    || (process.env.SMTP_USER ? `skeo <${process.env.SMTP_USER}>` : 'skeo <onboarding@resend.dev>');
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

// ZeptoMail wants the sender split into name and address.
function parseAddress(str) {
  const m = /^s*(.*?)s*<([^>]+)>s*$/.exec(String(str || ''));
  if (m) return { ...(m[1] ? { name: m[1] } : {}), email: m[2].trim() };
  return { email: String(str || '').trim() };
}

// India data centre; ZEPTOMAIL_API_URL overrides it for the global (.com) one.
const zeptoUrl = () => process.env.ZEPTOMAIL_API_URL || 'https://api.zeptomail.in/v1.1/email';

// `attachments` everywhere below is [{ filename, content: Buffer, contentType }]
// — nodemailer's own shape. The two HTTPS providers want the bytes base64'd,
// each under its own field names.
const forZepto = (attachments) => attachments.map((a) => ({
  content: Buffer.from(a.content).toString('base64'),
  mime_type: a.contentType || 'application/octet-stream',
  name: a.filename,
}));
const forResend = (attachments) => attachments.map((a) => ({
  filename: a.filename,
  content: Buffer.from(a.content).toString('base64'),
  ...(a.contentType ? { content_type: a.contentType } : {}),
}));

async function sendViaZepto({ from, to, subject, text, html, replyTo, attachments }) {
  const sender = parseAddress(from);
  const token = process.env.ZEPTOMAIL_TOKEN;
  const auth = token.startsWith('Zoho-enczapikey') ? token : `Zoho-enczapikey ${token}`;
  const res = await fetch(zeptoUrl(), {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      from: { address: sender.email, ...(sender.name ? { name: sender.name } : {}) },
      to: [{ email_address: { address: to } }],
      subject,
      ...(html ? { htmlbody: html } : {}),
      ...(text ? { textbody: text } : {}),
      ...(replyTo ? { reply_to: [{ address: replyTo }] } : {}),
      ...(attachments?.length ? { attachments: forZepto(attachments) } : {}),
    }),
    // Longer than a plain mail: a set of PDFs is megabytes on the wire.
    signal: AbortSignal.timeout(attachments?.length ? 60000 : 20000),
  });
  if (!res.ok) {
    // ZeptoMail names the problem — an unverified sender domain reads as such,
    // which is the difference between a config error and a bug.
    const body = await res.text().catch(() => '');
    throw new Error(`ZeptoMail ${res.status}: ${body.slice(0, 300)}`);
  }
  return { provider: 'zeptomail' };
}

async function sendViaResend({ from, to, subject, text, html, replyTo, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject, text, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments: forResend(attachments) } : {}),
    }),
    signal: AbortSignal.timeout(attachments?.length ? 60000 : 20000),
  });
  const body = await res.json().catch(() => ({}));
  // Resend puts the useful part in `message` — e.g. "The skeo.in domain is not
  // verified", which is the difference between a config error and a bug.
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || body?.name || 'send failed'}`);
  return { id: body.id, provider: 'resend' };
}

export async function sendMail({ to, subject, text, html, replyTo, attachments }) {
  /* Resolved before the dev branch so the console prints the sender too. It is
     the one field you cannot check any other way short of actually sending, and
     getting it wrong is silent: the mail goes out from whatever mailbox the SMTP
     credentials belong to, or from Resend's shared address, and nobody notices
     until a student replies to it. */
  const from = fromAddress();
  if (!isMailConfigured()) {
    const files = attachments?.length ? `attachments=${attachments.map((a) => a.filename).join(', ')}\n` : '';
    console.log(`\n[email:dev] from=${from}\nto=${to}\nsubject=${subject}\n${files}${text || ''}\n`);
    return { dev: true };
  }
  const reply = replyTo || unquote(process.env.MAIL_REPLY_TO) || undefined;
  if (isZeptoConfigured()) return sendViaZepto({ from, to, subject, text, html, replyTo: reply, attachments });
  if (isResendConfigured()) return sendViaResend({ from, to, subject, text, html, replyTo: reply, attachments });
  const transport = await getTransport();
  const info = await transport.sendMail({ from, to, subject, text, html, replyTo: reply, ...(attachments?.length ? { attachments } : {}) });
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
