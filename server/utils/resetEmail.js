// The two mails of password recovery, in the same frame as the welcome mail.
//
//   resetEmail           : the link, sent from POST /auth/forgot.
//   passwordChangedEmail : the notice, sent once POST /auth/reset succeeds. It
//                          is the account owner's only warning if somebody
//                          else got hold of their inbox and reset it, so it
//                          says what to do in that case.
//
// Plain text goes alongside every HTML body: some clients show only that, and
// the reset link has to survive them.

import { esc, firstNameOf, P, shell, SUPPORT } from './welcomeEmail.js';

export function resetEmail({ fullName, email, link }) {
  const first = firstNameOf(fullName, email);
  const subject = 'Reset your skeo password';

  const html = shell({
    subject,
    email,
    body: [
      P(`Hi ${esc(first)},`, 0),
      P('Someone (hopefully you) asked to reset the password on your skeo LMS account. Use the button below to choose a new one.'),
      P('The link works once. Asking for another one replaces it.'),
      P(`If the button does not work, copy this into your browser:<br /><a href="${esc(link)}" style="color:#6746ec; word-break:break-all;">${esc(link)}</a>`),
      P('If you did not ask for this, ignore this email. Your password stays as it is.'),
    ].join(''),
    cta: { label: 'Set a new password', href: link },
    footer: `You're receiving this because a password reset was requested for ${email} on skeo.`,
  });

  const text = [
    `Hi ${first},`, '',
    'Someone (hopefully you) asked to reset the password on your skeo LMS account.',
    'Open this link to choose a new one:', '',
    link, '',
    'The link works once. Asking for another one replaces it.', '',
    'If you did not ask for this, ignore this email. Your password stays as it is.', '',
    `Questions? Write to ${SUPPORT}.`, '',
    'Team skeo',
  ].join('\n');

  return { subject, text, html };
}

export function passwordChangedEmail({ fullName, email, loginUrl }) {
  const first = firstNameOf(fullName, email);
  const subject = 'Your skeo password was changed';

  const html = shell({
    subject,
    email,
    body: [
      P(`Hi ${esc(first)},`, 0),
      P('The password on your skeo LMS account was just changed using a reset link. Every device that was signed in has been signed out.'),
      P(`If this was you, you're all set. If it wasn't, reply to this email or write to <a href="mailto:${SUPPORT}" style="color:#6746ec;">${SUPPORT}</a> straight away.`),
    ].join(''),
    cta: { label: 'Sign in to skeo', href: loginUrl },
    footer: `You're receiving this because the password for ${email} on skeo was changed.`,
  });

  const text = [
    `Hi ${first},`, '',
    'The password on your skeo LMS account was just changed using a reset link. Every device that was signed in has been signed out.', '',
    `If this was you, you're all set. If it wasn't, write to ${SUPPORT} straight away.`, '',
    `Sign in: ${loginUrl}`, '',
    'Team skeo',
  ].join('\n');

  return { subject, text, html };
}
