/**
 * `Preview data` — the persistent marker on a preview-demo deployment.
 *
 * Rendered in the sidebar footer on desktop and in the top bar on a phone,
 * so it is on screen on every route at every width. Deliberately quiet: a
 * champagne hairline and a small dot, not a banner. Its job is that nobody
 * ever mistakes a fixture for an operational fact, not to shout.
 */
export function PreviewFlag({ compact }: { compact?: boolean }) {
  return (
    <span className="bc-preview-flag" data-compact={compact ? 'true' : undefined} title="Synthetic demonstration data. Not live operational data.">
      <i aria-hidden="true" />
      Preview data
    </span>
  );
}
