// "Add to Home Screen" on iPhone and iPad, which has no install dialog a page
// can open. Shared by the in-app sheet (PwaPrompts) and the /install page.
export default function IosInstallSteps() {
  return (
    <ol className="pwa-steps">
      <li>
        Tap <strong>Share</strong>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="the Share icon">
          <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </svg>
        in the browser bar
      </li>
      <li>Choose <strong>Add to Home Screen</strong> (scroll down if you don’t see it)</li>
      <li>Tap <strong>Add</strong>, then open skeo from your Home Screen</li>
    </ol>
  );
}
