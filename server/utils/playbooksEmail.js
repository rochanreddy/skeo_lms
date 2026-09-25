import { esc, firstNameOf, P, shell, SUPPORT } from './welcomeEmail.js';

/**
 * The mail that carries the Claude Playbooks — the same shape menler.in sends
 * its own playbooks in: every PDF attached, and the titles listed so the buyer
 * can see what arrived without opening a single file.
 */
export function playbooksEmail({ fullName, email, titles }) {
  const first = firstNameOf(fullName, email);
  const n = titles.length;
  const subject = `Your Claude Playbooks — ${n} playbook${n === 1 ? '' : 's'} inside`;

  const html = shell({
    subject,
    email,
    body: [
      P(`Hi ${esc(first)},`, 0),
      P(`Thanks for your purchase — here are your <strong>Claude Playbooks</strong>, ${n === 1 ? 'attached' : `all ${n} attached`} to this email.`),
      `<ul style="margin:14px 0 0; padding-left:20px; font-size:15px; line-height:1.8; color:#23202e;">${titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
      P('They are yours to keep. If anything does not open, write to us and we will send it again.'),
    ].join(''),
  });

  const text = [
    `Hi ${first},`, '',
    `Thanks for your purchase — here are your Claude Playbooks, ${n === 1 ? 'attached' : `all ${n} attached`} to this email.`, '',
    ...titles.map((t) => `- ${t}`), '',
    'They are yours to keep. If anything does not open, write to us and we will send it again.', '',
    `Questions? Write to ${SUPPORT}.`, '',
    '— skeo',
  ].join('\n');

  return { subject, text, html };
}
