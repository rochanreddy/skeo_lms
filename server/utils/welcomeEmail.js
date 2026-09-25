// The mail a buyer gets once their website payment is confirmed: where to sign
// in, and with what.
//
// Two versions of one mail. A NEW account carries its temporary password, and
// says — because it is true, see routes/me.js — that the LMS will ask for a new
// one at first sign-in. An EXISTING account carries no password at all: the
// student already has one, and resetting it because they bought something else
// would lock them out of an account they were using.
//
// Only facts the LMS holds go in: the address, the password it minted, the
// batches it just unlocked. Nothing about the course that is not in the record.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const firstNameOf = (fullName, email) => String(fullName || '').trim().split(/\s+/)[0]
  || String(email || '').split('@')[0] || 'there';

export const SUPPORT = 'support@skeoai.com';

export const P = (inner, top = 18) => `<p style="margin:${top}px 0 0; font-size:15px; line-height:1.7; color:#23202e;">${inner}</p>`;

export function shell({ subject, email, body, cta = null }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0; padding:0; background:#f2f1f6; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f1f6;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; background:#ffffff; border-radius:14px; overflow:hidden;">
        <tr><td style="background:#15121f; padding:22px 32px;">
          <span style="font-size:24px; font-weight:800; letter-spacing:-0.04em; color:#ffffff;">skeo</span>
        </td></tr>
        <tr><td style="padding:30px 32px 8px;">${body}</td></tr>
        ${cta ? `<tr><td align="center" style="padding:24px 32px 8px;">
          <a href="${esc(cta.href)}" style="display:inline-block; padding:13px 34px; background:#15121f; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; border-radius:8px;">${esc(cta.label)}</a>
        </td></tr>` : ''}
        <tr><td style="padding:22px 32px 30px;">
          ${P(`Questions? Write to <a href="mailto:${SUPPORT}" style="color:#6746ec;">${SUPPORT}</a>.`, 0)}
          ${P('— skeo')}
        </td></tr>
      </table>
      <p style="margin:16px 0 0; font-size:12px; color:#8b879c;">You're receiving this because you bought skeo on skeoai.com as ${esc(email)}.</p>
    </td></tr>
  </table>
</body></html>`;
}

function box(rows) {
  const row = ([k, v, mono]) => `<tr>
      <td style="padding:10px 16px; font-size:13px; color:#6b6880; white-space:nowrap; border-top:1px solid #e7e4f0;">${k}</td>
      <td style="padding:10px 16px; font-size:15px; color:#15121f; border-top:1px solid #e7e4f0;${mono ? ' font-family:Consolas,Menlo,monospace;' : ''}">${v}</td>
    </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; background:#f6f5fb; border:1px solid #e7e4f0; border-radius:10px;">
    <tr><td colspan="2" style="padding:12px 16px 4px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#6746ec;">Your sign-in</td></tr>
    ${rows.filter(Boolean).map(row).join('')}
  </table>`;
}

/**
 * @param {object} p
 * @param {string} p.fullName
 * @param {string} p.email
 * @param {string|null} p.password   the temporary password, or null for an existing account
 * @param {string} p.loginUrl
 * @param {string[]} p.batches       names of the batches this purchase unlocked
 * @param {boolean} p.allAccess      bought Everything AI
 * @param {boolean} p.playbooks      a playbooks mail is going out alongside
 */
export function welcomeEmail({ fullName, email, password = null, loginUrl, batches = [], allAccess = false, playbooks = false }) {
  const first = firstNameOf(fullName, email);
  const isNew = Boolean(password);

  const subject = isNew ? 'Your skeo LMS login' : 'Your purchase is on your skeo account';

  const opener = isNew
    ? 'Your payment is confirmed and your skeo LMS account is ready.'
    : 'Your payment is confirmed and it has been added to your existing skeo LMS account.';

  const unlocked = allAccess
    ? 'Everything AI — every batch on the LMS, including new ones as they are added.'
    : batches.length ? batches.join(', ') : '';

  const passwordNote = isNew
    ? 'This is a temporary password. The first time you sign in, you will be asked to choose your own.'
    : 'Sign in with the password you already use. If you have forgotten it, use “Forgot password” on the sign-in page.';

  const html = shell({
    subject,
    email,
    body: [
      P(`Hi ${esc(first)},`, 0),
      P(esc(opener)),
      unlocked ? P(`<strong>Unlocked:</strong> ${esc(unlocked)}`) : '',
      box([
        ['Sign in at', `<a href="${esc(loginUrl)}" style="color:#6746ec;">${esc(loginUrl)}</a>`],
        ['Email', esc(email), true],
        isNew && ['Password', esc(password), true],
      ]),
      P(esc(passwordNote)),
      playbooks ? P('Your playbooks are in a separate email, attached as PDFs.') : '',
    ].join(''),
    cta: { label: 'Sign in to skeo', href: loginUrl },
  });

  const text = [
    `Hi ${first},`, '',
    opener, '',
    ...(unlocked ? [`Unlocked: ${unlocked}`, ''] : []),
    `Sign in at: ${loginUrl}`,
    `Email:      ${email}`,
    ...(isNew ? [`Password:   ${password}`] : []),
    '',
    passwordNote, '',
    ...(playbooks ? ['Your playbooks are in a separate email, attached as PDFs.', ''] : []),
    `Questions? Write to ${SUPPORT}.`, '',
    '— skeo',
  ].join('\n');

  return { subject, text, html };
}
