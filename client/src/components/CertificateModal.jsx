import { Dialog, DialogContent, DialogTitle } from './ui/dialog.jsx';
import { TOOLS } from './ToolMarks.jsx';
import anthropic from '../assets/accreditation/anthropic.webp';
import sarvam from '../assets/accreditation/sarvam-cut.png';
import msme from '../assets/accreditation/msme.webp';
import startupIndia from '../assets/accreditation/startup-india.png';

/**
 * The certificate itself, as a printable sheet.
 *
 * It is the website's certificate (skeoai.com, the "Certificates with real
 * signal" section) made real: the same card, the same accreditation row, the
 * same title row naming the tool with its mark, the same citation and foot —
 * plus the QR code, which is what turns the specimen into a credential anyone
 * can check. What the website promises is what a student receives.
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
 * The sheet keeps its own palette rather than the app's theme tokens. A
 * credential is an artifact: it should look identical on screen, in print, in
 * a PDF and in a screenshot pasted into an application form, whichever theme
 * the holder had on when they opened it.
 */

/* The bodies that stand behind the credential — the same four, in the same
   order, as the website's certificate. */
const ACCREDITORS = [
  { name: 'Startup India', logo: startupIndia },
  { name: 'Ministry of MSME, Government of India', logo: msme },
  { name: 'Sarvam AI', logo: sarvam, square: true },
  { name: 'Anthropic', logo: anthropic },
];

/* Which tool this certificate vouches for. The batches are named after the
   tools, so the batch name is the surest guide, then the programme's; anything
   else — an older programme — keeps its own name under the house violet. */
function toolFor(cert) {
  const hay = [cert.batch, cert.program].map((s) => String(s || '').toLowerCase());
  for (const text of hay) {
    const hit = TOOLS.find((t) => text.includes(t.key) || text.includes(t.name.toLowerCase()));
    if (hit) return hit;
  }
  return { key: 'program', name: String(cert.program || 'skeo').trim() || 'skeo', accent: '#6746ec', Mark: null };
}

/** "Jun 2026" — the website's form, and the month the id encodes as MMYY. */
const issued = (d) => {
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'short' })} ${dt.getFullYear()}`;
};

function CertificateModal({ cert, onClose }) {
  const tool = toolFor(cert);
  const { Mark } = tool;

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
        <DialogTitle className="sr-only">Certificate of Proficiency — {tool.name}</DialogTitle>

        <div className="certificate" style={{ '--cert-accent': tool.accent }}>
          <div className="cert-glow" aria-hidden="true" />
          <div className="cert-inner">
            {/* The mark on the left, the bodies behind the credential on the
                right — the way a printed certificate heads itself. */}
            <div className="cert-head">
              <span className="cert-brand">
                <b>skeo</b>
                {/* A sample is marked on its face. The code already ends 0000
                    and resolves to nothing, but somebody holding a printout
                    will not check the code — they will read the sheet. */}
                {cert.sample && <span className="cert-sample">Sample</span>}
              </span>
              <span className="cert-accred-row">
                {ACCREDITORS.map((body) => (
                  <img
                    key={body.name}
                    src={body.logo}
                    alt={body.name}
                    title={body.name}
                    className={body.square ? 'cert-accred-logo cert-accred-logo--square' : 'cert-accred-logo'}
                  />
                ))}
              </span>
            </div>

            <div className="cert-title-row">
              <small>CERTIFICATE OF PROFICIENCY — {tool.name.toUpperCase()}</small>
              <span className="cert-badge">
                {Mark && <Mark className="cert-badge-mark" />}
                {tool.name}
              </span>
            </div>

            <div className="cert-body">
              <p className="cert-presented">This certificate is proudly presented to</p>
              <h3 className="cert-name">{cert.name}</h3>
              <p className="cert-citation">
                for successfully demonstrating proficiency in <b>{tool.name}</b>, including its core
                features, advanced capabilities, workflows, and practical applications with the ability
                to solve real-world problems and create meaningful outcomes.
              </p>
            </div>

            {/* A revoked certificate must say so on its face. Someone holding a
                printed copy of one that was withdrawn should not be able to
                show it as if nothing had happened. */}
            {cert.revoked && <div className="cert-revoked">This certificate has been revoked</div>}

            {/* The website's foot — issued on the left, the id on the right —
                with the QR in front of it: scan it, or type the id, and the
                verification page says whether the certificate is real. */}
            <div className="cert-foot">
              <span className="cert-foot-left">
                {cert.qr && (
                  <img className="cert-qr" src={cert.qr} alt={`QR code linking to ${cert.verifyUrl}`} width="54" height="54" />
                )}
                <span className="cert-meta">Issued {issued(cert.issuedAt)}</span>
              </span>
              <span className="cert-id">{cert.certId}</span>
            </div>
          </div>
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
