import { headers } from 'next/headers';
import { requireOperator } from '@/lib/admin/auth';
import { FinanceSubnav } from '@/components/admin/finance/subnav';

/**
 * The finance section. `finance.view` is checked here, on top of the
 * control layout's `view`, before any finance data is read. Every finance
 * page renders inside it with the section navigation.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const path = headers().get('x-invoke-path') ?? undefined;
  await requireOperator('finance.view', path);
  return (
    <>
      <FinanceSubnav />
      {children}
    </>
  );
}
