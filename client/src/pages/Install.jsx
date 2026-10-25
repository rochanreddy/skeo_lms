import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SkeoWordmark from '../components/SkeoWordmark.jsx';
import IosInstallSteps from '../components/IosInstallSteps.jsx';
import { isIOS, isStandalone, promptInstall, useInstall } from '../pwa.js';

// The link to send students: /install. Public, like /verify -- it is opened
// from WhatsApp or a QR code, usually before anyone has signed in. Each device
// gets the one thing that works on it: Chrome's install button on Android,
// the Add to Home Screen steps on iPhone, a QR code on a laptop.
function platform() {
  const ua = navigator.userAgent;
  if (isStandalone()) return 'standalone';
  // Instagram, Facebook, LinkedIn and Android WebViews can't install anything.
  if (/FBAN|FBAV|Instagram|LinkedInApp|Snapchat|Line\/|; wv\)/i.test(ua)) return 'in-app';
  if (isIOS()) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export default function Install() {
  const { canPrompt } = useInstall();
  const [where] = useState(platform);
  const [done, setDone] = useState(false);
  const [installedAlready, setInstalledAlready] = useState(false);

  // Chrome on Android can tell when the app is already on this phone.
  useEffect(() => {
    navigator.getInstalledRelatedApps?.().then((apps) => setInstalledAlready(apps.length > 0)).catch(() => {});
  }, []);

  const install = async () => { if (await promptInstall()) setDone(true); };
  const isAndroid = where === 'android' || (where === 'in-app' && /Android/i.test(navigator.userAgent));

  let body;
  if (where === 'standalone') {
    body = (
      <>
        <p className="install-lead">You’re already using the skeo app.</p>
        <Link className="btn install-cta" to="/app">Go to skeo</Link>
      </>
    );
  } else if (done || installedAlready) {
    body = (
      <>
        <p className="install-lead"><strong>skeo is on your home screen.</strong> Open it from there, like any other app.</p>
        <p className="muted install-note">Turn on notifications in the app under Profile → This device.</p>
      </>
    );
  } else if (where === 'in-app') {
    body = (
      <>
        <p className="install-lead">This page is open inside another app, which can’t install skeo.</p>
        {isAndroid ? (
          <a className="btn install-cta" href={`intent://${window.location.host}/install#Intent;scheme=https;package=com.android.chrome;end`}>Open in Chrome</a>
        ) : (
          <p className="install-note">Tap <strong>•••</strong> or the compass icon and choose <strong>Open in Safari</strong>, then follow the steps there.</p>
        )}
        <CopyLink />
      </>
    );
  } else if (where === 'ios') {
    body = (
      <>
        <p className="install-lead">Add skeo to your Home Screen in three taps.</p>
        <IosInstallSteps />
        <p className="muted install-note">Needs iOS 16.4 or later for notifications.</p>
      </>
    );
  } else if (canPrompt) {
    body = (
      <>
        <p className="install-lead">Get skeo on your {where === 'desktop' ? 'computer' : 'phone'}. It opens full screen and sends you notifications.</p>
        <button type="button" className="btn install-cta" onClick={install}>Install skeo</button>
        {where === 'desktop' && <PhoneQr />}
      </>
    );
  } else if (where === 'android') {
    body = (
      <>
        <p className="install-lead">Get skeo on your phone.</p>
        <ol className="pwa-steps">
          <li>Tap <strong>⋮</strong> at the top right of Chrome</li>
          <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></li>
          <li>Tap <strong>Install</strong></li>
        </ol>
        <p className="muted install-note">Using another browser? Open this link in Chrome for the quickest install.</p>
      </>
    );
  } else {
    body = (
      <>
        <p className="install-lead">skeo installs on phones and in Chrome or Edge on a computer.</p>
        <p className="install-note">Here, use the install icon at the right of the address bar, or in Safari choose <strong>File → Add to Dock</strong>.</p>
        <PhoneQr />
      </>
    );
  }

  return (
    <div className="verify">
      <div className="verify-card install-card">
        <div className="install-head">
          <img src="/icons/icon-192.png" alt="" width="64" height="64" />
          <div>
            <SkeoWordmark size={26} />
            <div className="muted install-sub">The skeo app</div>
          </div>
        </div>
        {body}
        {where !== 'standalone' && (
          <p className="install-foot"><Link to="/app">Continue in the browser instead</Link></p>
        )}
      </div>
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/install`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {});
  return (
    <button type="button" className="btn quiet install-copy" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
  );
}

// On a laptop the person is often an admin putting the link on a slide, or a
// student who wants it on their phone: a QR code serves both. The encoder is
// only loaded here.
function PhoneQr() {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    import('qrcode')
      .then((QR) => QR.toString(`${window.location.origin}/install`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#191817', light: '#ffffff' } }))
      .then(setSvg)
      .catch(() => {});
  }, []);
  if (!svg) return null;
  return (
    <div className="install-qr">
      <div className="install-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="muted">Scan with your phone’s camera to install skeo there.</p>
    </div>
  );
}
