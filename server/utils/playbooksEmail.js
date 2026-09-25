import { esc, firstNameOf, P, shell, SUPPORT } from './welcomeEmail.js';

/**
 * The mail that carries a playbook set — the same shape menler.in sends its
 * own playbooks in: the PDFs attached, and their titles listed so the buyer
 * can see what arrived without opening a single file.
 *
 * A set too large for one mail arrives in numbered parts; each part lists only
 * what it carries and says how many parts there are, so nobody wonders
 * whether the rest went missing.
 */
export function playbooksEmail({ fullName, email, label, titles, part = 1, parts = 1 }) {
  const first = firstNameOf(fullName, email);
  const n = titles.length;
  const split = parts > 1;
  const partLabel = split ? ` (part ${part} of ${parts})` : '';
  const subject = `Your ${label}${partLabel} — ${n} playbook${n === 1 ? '' : 's'} inside`;

  const opener = split
    ? `Thanks for your purchase — here is part ${part} of ${parts} of your ${label}. The set is large, so it comes in ${parts} emails; this one has ${n === 1 ? 'this playbook' : `these ${n}`} attached:`
    : `Thanks for your purchase — here ${n === 1 ? 'is' : 'are'} your ${label}, ${n === 1 ? 'attached' : `all ${n} attached`} to this email:`;

  const html = shell({
    subject,
    email,
    body: [
      P(`Hi ${esc(first)},`, 0),
      P(esc(opener)),
      `<ul style="margin:14px 0 0; padding-left:20px; font-size:15px; line-height:1.8; color:#23202e;">${titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
      P('They are yours to keep. If anything does not open, write to us and we will send it again.'),
    ].join(''),
  });

  const text = [
    `Hi ${first},`, '',
    opener, '',
    ...titles.map((t) => `- ${t}`), '',
    'They are yours to keep. If anything does not open, write to us and we will send it again.', '',
    `Questions? Write to ${SUPPORT}.`, '',
    '— skeo',
  ].join('\n');

  return { subject, text, html };
}
