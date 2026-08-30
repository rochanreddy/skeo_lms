// Mailer. Sends via SMTP (nodemailer) when SMTP_* is configured; otherwise logs
// the message to the console so password-reset links stay testable in dev.
export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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
  });
  return cachedTransport;
}

export async function sendMail({ to, subject, text, html }) {
  if (!isSmtpConfigured()) {
    console.log(`\n[email:dev] to=${to}\nsubject=${subject}\n${text || ''}\n`);
    return { dev: true };
  }
  const transport = await getTransport();
  const from = process.env.SMTP_FROM || `Skeo LMS <${process.env.SMTP_USER}>`;
  return transport.sendMail({ from, to, subject, text, html });
}
