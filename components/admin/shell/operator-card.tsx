import { signOutAction } from '@/lib/admin/actions';
import { ROLE_LABEL, type OperatorRole } from '@/lib/admin/permissions';
import type { AdminPosture } from '@/lib/admin/config';
import { PreviewFlag } from '@/components/admin/shell/preview-flag';

/**
 * Who is signed in, where this is running, and the way out. Sign-out is a
 * form posting to a server action: the cookie is cleared by the server, the
 * sign-out is audited, and it works without JavaScript.
 */
export function OperatorCard({ operator, posture }: { operator: { displayName: string; email: string; role: OperatorRole }; posture: AdminPosture }) {
  const env = environmentLine(posture);
  const initial = (operator.displayName || operator.email).trim().charAt(0).toUpperCase() || '·';

  return (
    <div>
      {posture.previewDemo ? (
        <PreviewFlag />
      ) : (
        <div className="bc-env" data-tone={env.tone}>
          <i aria-hidden="true" />
          <span>{env.label}</span>
        </div>
      )}
      <div className="bc-operator">
        <span className="bc-operator-initial" aria-hidden="true">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="bc-operator-name" title={operator.email}>
            {operator.displayName}
          </div>
          <div className="bc-operator-role">{ROLE_LABEL[operator.role]}</div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="bc-icon-btn" aria-label="Sign out" title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4M15 8l4 4-4 4M19 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function environmentLine(p: AdminPosture): { label: string; tone: 'neutral' | 'positive' | 'caution' | 'critical' } {
  if (p.mode === 'preview') return { label: 'Preview data', tone: 'caution' };
  if (p.mode === 'fixture') return { label: 'Development fixtures', tone: 'caution' };
  if (p.mode === 'unconfigured') return { label: 'Backend not configured', tone: 'critical' };
  if (p.paypalMode === 'sandbox') return { label: 'PayPal sandbox · booking off', tone: 'caution' };
  if (!p.directBookingEnabled) return { label: 'Direct booking disabled', tone: 'neutral' };
  return { label: 'Live · direct booking on', tone: 'positive' };
}
