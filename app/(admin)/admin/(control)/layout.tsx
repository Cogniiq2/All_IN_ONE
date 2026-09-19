import { headers } from 'next/headers';
import { requireOperator } from '@/lib/admin/auth';
import { adminPosture } from '@/lib/admin/config';
import { cachedAttention, cachedUnits } from '@/lib/admin/request-cache';
import { AdminShell } from '@/components/admin/shell/admin-shell';

/**
 * The protected layout. Every screen of BoLaGio Control renders inside it,
 * and it renders nothing until `requireOperator` has resolved a signed-in,
 * allowlisted, active operator — or redirected. There is no path to a child
 * page that skips this, and no protected data is fetched before it runs.
 */
export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const path = headers().get('x-invoke-path') ?? undefined;
  const operator = await requireOperator('view', path);
  const posture = adminPosture();

  const [attention, units] = await Promise.all([cachedAttention(), cachedUnits()]);
  const attentionCount = attention.ok ? attention.data.items.filter((i) => i.level === 'critical' || i.level === 'high').length : 0;
  const properties = units.ok ? units.data.map((u) => ({ slug: u.slug, name: u.displayName })) : [];

  return (
    <AdminShell operator={operator} posture={posture} attentionCount={attentionCount} properties={properties}>
      {children}
    </AdminShell>
  );
}
