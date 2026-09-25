// Where someone who has not bought skeo is sent: the plans on skeoai.com.
//
// A skeo account is made by buying a plan there — the LMS creates it once the
// payment is confirmed and mails the login — so the answer to "I can't get in"
// for a non-buyer is never "reset your password", it is "here is where to buy".
//
// VITE_SITE_URL points a preview build at its own site; production is skeoai.com.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://skeoai.com').replace(/\/+$/, '');
export const PRICING_URL = `${SITE_URL}/#pricing`;

export default function GetSkeo({ message, id }) {
  return (
    <div id={id} className="get-skeo" role="alert">
      <p className="get-skeo-msg">{message}</p>
      <a className="btn get-skeo-btn" href={PRICING_URL}>See plans →</a>
      {/* The two ₹99 items are PDFs by mail and make no account, so their
          buyers are exactly the people most likely to land here puzzled. */}
      <p className="get-skeo-note">
        Bought Claude Playbooks or the AI Library? Those are sent by email, not through the LMS. Check your inbox.
      </p>
    </div>
  );
}
