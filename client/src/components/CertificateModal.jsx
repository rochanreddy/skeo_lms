import { Dialog, DialogContent, DialogTitle } from './ui/dialog.jsx';

/**
 * The certificate itself, as a printable sheet.
 *
 * Lives here rather than inside Learning because more than one screen renders
 * the same object: the classroom, when you finish a programme, and the profile,
 * which lists every certificate you hold including ones an admin issued to a
 * whole cohort. One component means the printed sheet cannot drift between them.
 *
 * `cert` is whatever the API returned — /progress/certificate or an entry from
 * /certificates/mine. It carries name, program, batch, issuedAt, certId,
 * verifyUrl and qr.
 *
 * The sheet keeps its own dark palette rather than reading the app's theme
 * tokens. A credential is an artifact: it should look identical on screen, in
 * print, in a PDF and in a screenshot pasted into an application form, and a
 * certificate that changes colour with someone's theme preference is not one
 * document but several.
 */

/** "November, 2026" — the same month and year the id encodes as MMYY. */
const monthYear = (d) => {
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'long' })}, ${dt.getFullYear()}`;
};

/* The programme's name as it is written out in the body copy. The LMS stores
   the short internal title ("Fellowship"), while the certificate names the
   thing a reader would recognise. The guard stops "skeo Fellowship Program
   Program" if a programme is ever titled with the suffix already in it. */
function programmeName(program) {
  const t = String(program || '').trim();
  if (!t) return 'skeo Fellowship Program';
  if (/program/i.test(t)) return t;
  return `skeo ${t} Program`;
}

/* The founder signs every certificate. skeo has no mentor concept — no batch
   carries one — so there is one signature rather than a second line left
   blank, which would read as a rendering fault rather than as a design. When
   mentors arrive, this becomes a list built from the certificate's own
   snapshot, the way menler-lms does it. */
const FOUNDER = { name: 'Sachin Roy', role: 'Founder, skeo' };

function CertificateModal({ cert, onClose }) {
  return (
    // A real modal: Radix traps focus, closes on Escape and locks the page
    // scroll. Click-outside-to-close is preserved from the old overlay.
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="cert-overlay"
        className="cert"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Certificate of Completion</DialogTitle>
        <div className="cert-inner">

          <header className="cert-head">
            <div className="cert-brandblock">
              <div className="cert-brand">skeo</div>
              <div className="cert-tagline">Build. Learn. Monetize.</div>
            </div>
            {/* A sample is watermarked on its face. The code already ends 0000
                and resolves to nothing, but somebody holding a printout will
                not check the code — they will read the sheet. */}
            {cert.sample && <div className="cert-sample">Sample</div>}
          </header>

          <div className="cert-rule" />

          <div className="cert-kicker">Certificate of Completion</div>
          <p className="cert-lede">This certificate is proudly presented to</p>
          <div className="cert-name">{cert.name}</div>

          <p className="cert-body">
            for successfully completing the <strong>{programmeName(cert.program)}</strong>,
            building and shipping real products, and demonstrating the craft and persistence
            the work asks for.
          </p>
          <p className="cert-body">
            We recognise their commitment to building in public and wish them continued
            success in the work ahead.
          </p>

          {/* A revoked certificate must say so on its face. Someone holding a
              printed copy of one that was withdrawn should not be able to show
              it as if nothing had happened. */}
          {cert.revoked && <div className="cert-revoked">This certificate has been revoked</div>}

          <footer className="cert-foot">
            <div className="cert-idblock">
              {cert.qr && (
                <img className="cert-qr" src={cert.qr} alt={`QR code linking to ${cert.verifyUrl}`} width="74" height="74" />
              )}
              <div className="cert-idtext">
                <div className="cert-id">{cert.certId}</div>
                <div className="cert-issued">Issued on {monthYear(cert.issuedAt)}</div>
                {cert.batch && <div className="cert-issued">{cert.batch}</div>}
              </div>
            </div>

            <div className="cert-signs">
              <div className="cert-sign">
                <div className="cert-sign-name">{FOUNDER.name}</div>
                <div className="cert-sign-role">{FOUNDER.role}</div>
              </div>
            </div>
          </footer>

        </div>

        <div className="cert-actions">
          <button className="btn" onClick={() => window.print()}>Download / Print</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CertificateModal;
