import type { Metadata } from 'next';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadFinanceSettings } from '@/lib/finance/queries';
import { PageHeader, ErrorNotice, Notice, BackLink } from '@/components/admin/primitives';
import { ExpenseForm } from '@/components/admin/finance/expense-form';

export const metadata: Metadata = { title: 'Post an expense' };

export default async function NewExpensePage() {
  const [settings, operator] = await Promise.all([loadFinanceSettings(), currentOperator()]);
  const may = can(operator?.role, 'finance.edit') && !operator?.preview;
  return (
    <>
      <BackLink href="/admin/finance/expenses">Expenses</BackLink>
      <PageHeader eyebrow="Finance" title="Post an expense" description="One supplier invoice, split into as many lines as the invoice needs — per unit, per category, per rate. The rule engine suggests; you decide; the reason is recorded." />
      {!settings.ok ? <ErrorNotice title="The form could not be prepared.">{settings.error}</ErrorNotice> : !may ? (
        <Notice tone="caution">{operator?.preview ? 'Preview data is read-only.' : 'Your role can read finance but not post expenses.'}</Notice>
      ) : (
        <ExpenseForm units={settings.data.units} categories={settings.data.categories} taxCodes={settings.data.taxCodes} counterparties={settings.data.counterparties} />
      )}
    </>
  );
}
