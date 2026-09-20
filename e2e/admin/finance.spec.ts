/**
 * F01–F07 · Finance in BoLaGio Control: every section renders for a viewer
 * without a write, a paid stay shows up as revenue and cash, an operator
 * posts an expense, reclassifies and uploads a document, an administrator
 * moves a period through review to locked, and nothing overflows on a phone.
 * Every write is proven in the database afterwards.
 */

import { expect, test, type Page } from '@playwright/test';
import { confirmedBooking, isolateClient, operatorSession, reconcile, resetAll, sql } from '../support';
import { FINANCE_SECTIONS } from '../../components/admin/shell/nav-items';

const HEADINGS: Record<string, string> = {
  '/admin/finance': 'Finance', '/admin/finance/inbox': 'Finance inbox', '/admin/finance/revenue': 'Revenue', '/admin/finance/expenses': 'Expenses',
  '/admin/finance/transactions': 'Transactions', '/admin/finance/documents': 'Documents', '/admin/finance/vat': 'VAT', '/admin/finance/taxes': 'Taxes',
  '/admin/finance/profit-loss': 'Profit & loss', '/admin/finance/cash-flow': 'Cash flow', '/admin/finance/properties': 'Property profitability',
  '/admin/finance/reconciliation': 'Reconciliation', '/admin/finance/minibar': 'Minibar', '/admin/finance/invoices': 'Invoices',
  '/admin/finance/imports': 'Imports', '/admin/finance/accountant': 'Accountant', '/admin/finance/settings': 'Settings',
};

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function noHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `scrollWidth ${scroll} > innerWidth ${inner} on ${page.url()}`).toBeLessThanOrEqual(inner);
}

/** Post an expense straight into the ledger through the command function (what the action calls). */
function postExpenseViaDb(bookedOn: string, supplier: string, invoiceNo: string, netCents: number, vatCents: number, category = 'cleaning'): string {
  return sql(`select (bolagio_finance_post_transaction(
    jsonb_build_object('kind','expense','booked_on','${bookedOn}','currency','EUR','counterparty_label','${supplier}','supplier_invoice_no','${invoiceNo}','description','${supplier} ${invoiceNo}',
      'source_type','manual','source_system','manual','source_reference','e2e:${invoiceNo}','review_state','reviewed','document_state','missing','payment_state','unpaid','reconciliation_state','unmatched'),
    jsonb_build_array(jsonb_build_object('line_no',1,'category','${category}','description','${invoiceNo}','tax_code','DE_STANDARD','rate_bp',1900,'net_cents',${netCents},'vat_cents',${vatCents},'gross_cents',${netCents + vatCents},'input_vat_treatment','deductible','allocation_method','unallocated','classification','reviewed')),
    'e2e@example.com'))->>'id'`);
}

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
});

test('F01 · a viewer reads every finance section and is offered no write', async ({ page, context }) => {
  await operatorSession(context, 'viewer');
  for (const s of FINANCE_SECTIONS) {
    const response = await page.goto(s.href);
    expect(response?.status(), s.href).toBe(200);
    expect(response?.headers()['x-robots-tag'], s.href).toContain('noindex');
    // The overview's H1 is the verdict sentence ("Everything reconciled" / "n items require attention"); every other section names itself.
    if (s.href === '/admin/finance') await expect(page.getByRole('heading', { level: 1, name: /Everything reconciled|requires? attention/ }), s.href).toBeVisible();
    else await expect(page.getByRole('heading', { level: 1, name: HEADINGS[s.href] }), s.href).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Finance sections' }), s.href).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Post expense|Apply with reason|Upload and link|Reverse with reason|Mark reviewed|Hand to accountant|Record|Add|Set|Stage|Commit)/ }), s.href).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Post an expense' }), s.href).toHaveCount(0);
  }
  await page.goto('/admin/finance/expenses/new');
  await expect(page.getByText(/can read finance but not post expenses/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post expense' })).toHaveCount(0);
});

test('F02 · a paid stay becomes a revenue fact and a cash fact, reconciled, visible on the ledger and on the booking', async ({ page, context }) => {
  const reference = await confirmedBooking();
  await reconcile();
  expect(sql(`select count(*) from bolagio_finance_transactions where booking_reference = '${reference}' and kind = 'revenue' and reconciliation_state = 'matched'`)).toBe('1');
  await operatorSession(context, 'operator');
  await page.goto('/admin/finance/transactions');
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
  const row = page.getByRole('link', { name: new RegExp(reference) }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Transaction' })).toBeVisible();
  await expect(page.getByText(reference).first()).toBeVisible();
  await expect(page.getByText('R1 booking-key exact')).toBeVisible();
  await page.goto(`/admin/bookings/${reference}`);
  await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
  await expect(page.locator('a[href^="/admin/finance/transactions/"]').first()).toBeVisible();
  await page.goto('/admin/finance/revenue');
  await expect(page.getByRole('heading', { level: 1, name: 'Revenue' })).toBeVisible();
  await page.goto('/admin/finance/reconciliation');
  await expect(page.getByText(/matched/i).first()).toBeVisible();
});

test('F03 · an operator posts an expense through the form; the ledger, the lines and the audit trail agree', async ({ page, context }) => {
  const { email } = await operatorSession(context, 'operator');
  await page.goto('/admin/finance/expenses/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post an expense' })).toBeVisible();
  await page.getByLabel('Supplier', { exact: true }).fill('Reinigung Nord GmbH');
  await page.getByLabel('Invoice number').fill('RN-2026-0042');
  await page.getByLabel('Service / booking date').fill('2026-03-05');
  await page.getByLabel('Description', { exact: true }).fill('Cleaning March');
  await page.getByLabel('Category').first().selectOption('cleaning');
  await page.getByLabel('Tax code').first().selectOption('DE_STANDARD');
  await page.getByLabel('Net €').first().fill('100,00');
  await expect(page.getByLabel('VAT €').first()).toHaveValue('19,00'); // derived from net and code by the form
  await page.getByRole('button', { name: 'Post expense' }).click();
  await expect(page.getByText('Posted.')).toBeVisible();
  const id = sql(`select id from bolagio_finance_transactions where supplier_invoice_no = 'RN-2026-0042'`);
  expect(id).not.toBe('');
  expect(sql(`select kind || '|' || net_cents || '|' || vat_cents || '|' || gross_cents || '|' || document_state || '|' || posted_by from bolagio_finance_transactions where id = '${id}'`)).toBe(`expense|10000|1900|11900|missing|${email}`);
  expect(sql(`select category || '|' || tax_code || '|' || classification from bolagio_finance_transaction_lines where transaction_id = '${id}'`)).toBe('cleaning|DE_STANDARD|reviewed');
  expect(sql(`select outcome || '|' || operator_email from bolagio_admin_audit_log where action = 'finance.expense.post'`)).toBe(`ok|${email}`);
  await page.getByRole('link', { name: 'Open the transaction →' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Cleaning March/ })).toBeVisible();
  // The same invoice cannot be posted twice from the form either.
  await page.goto('/admin/finance/expenses/new');
  await page.getByLabel('Supplier', { exact: true }).fill('Reinigung Nord GmbH');
  await page.getByLabel('Invoice number').fill('RN-2026-0042');
  await page.getByLabel('Service / booking date').fill('2026-03-05');
  await page.getByLabel('Description', { exact: true }).fill('Cleaning March');
  await page.getByLabel('Category').first().selectOption('cleaning');
  await page.getByLabel('Tax code').first().selectOption('DE_STANDARD');
  await page.getByLabel('Net €').first().fill('100,00');
  await page.getByRole('button', { name: 'Post expense' }).click();
  await expect(page.getByText(/already posted/)).toBeVisible();
  expect(sql(`select count(*) from bolagio_finance_transactions where supplier_invoice_no = 'RN-2026-0042'`)).toBe('1');
});

test('F04 · on a transaction an operator reclassifies a line with a reason and uploads the invoice; the inbox item disappears', async ({ page, context }) => {
  const id = postExpenseViaDb('2026-03-05', 'Reinigung Nord GmbH', 'RN-7', 10000, 1900);
  const { email } = await operatorSession(context, 'operator');
  await page.goto('/admin/finance/inbox');
  await expect(page.getByText(/Missing document · Reinigung Nord GmbH/)).toBeVisible();
  await page.goto(`/admin/finance/transactions/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: /Reinigung Nord GmbH RN-7/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Classify a line' }).click();
  await page.getByLabel('Category').selectOption('laundry');
  await page.getByLabel('Reason (required, recorded)').fill('It was the laundry invoice');
  await page.getByRole('button', { name: 'Apply with reason' }).click();
  await expect(page.getByText(/^Reclassified/)).toBeVisible();
  expect(sql(`select category from bolagio_finance_transaction_lines where transaction_id = '${id}'`)).toBe('laundry');
  expect(sql(`select field || '|' || old_value || '>' || new_value || '|' || actor from bolagio_finance_overrides where target_type = 'line'`)).toBe(`category|cleaning>laundry|${email}`);

  await page.getByRole('tab', { name: 'Upload document' }).click();
  await page.getByLabel('File (PDF, image, XML)').setInputFiles({ name: 'RN-7.png', mimeType: 'image/png', buffer: TINY_PNG });
  await page.getByLabel('Document date').fill('2026-03-01');
  await page.getByRole('button', { name: 'Upload and link' }).click();
  await expect(page.getByText(/Registered, hashed and linked|already registered/)).toBeVisible();
  const doc = sql(`select id from bolagio_finance_documents where original_filename = 'RN-7.png'`);
  expect(doc).not.toBe('');
  expect(sql(`select sha256 ~ '^[0-9a-f]{64}$' from bolagio_finance_documents where id = '${doc}'`)).toBe('t');
  expect(sql(`select retention_class || '|' || retain_until from bolagio_finance_documents where id = '${doc}'`)).toBe('invoice|2034-12-31');
  expect(sql(`select count(*) from bolagio_finance_document_links where document_id = '${doc}' and target_id = '${id}'`)).toBe('1');
  expect(sql(`select document_state from bolagio_finance_transactions where id = '${id}'`)).toBe('complete');
  await page.goto('/admin/finance/inbox');
  await expect(page.getByText(/Missing document · Reinigung Nord GmbH/)).toHaveCount(0);
  await page.goto('/admin/finance/documents');
  await expect(page.getByText('RN-7.png')).toBeVisible();
});

test('F05 · an administrator moves a clean period to reviewed and then locks it; an operator cannot; the lock holds in the database', async ({ page, context }) => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 10);
  const key = d.toISOString().slice(0, 7);
  const label = d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  postExpenseViaDb(`${key}-10`, 'Stadtwerke Bayreuth', `SW-${key}`, 5000, 950, 'electricity');
  await operatorSession(context, 'operator');
  await page.goto('/admin/finance/accountant');
  await expect(page.getByRole('heading', { level: 1, name: 'Accountant' })).toBeVisible();
  const row = () => page.getByRole('row', { name: new RegExp(label) });
  await expect(row()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);

  await context.clearCookies();
  const { email } = await operatorSession(context, 'admin');
  await page.goto('/admin/finance/accountant');
  await row().getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByText('Period is now accountant reviewed.')).toBeVisible();
  expect(sql(`select status || '|' || status_by from bolagio_finance_periods where period_key = '${key}'`)).toBe(`accountant_reviewed|${email}`);
  page.once('dialog', (dlg) => dlg.accept());
  await row().getByRole('button', { name: /^Lock/ }).click();
  await expect(page.getByText('Period is now locked.')).toBeVisible();
  expect(sql(`select status from bolagio_finance_periods where period_key = '${key}'`)).toBe('locked');
  expect(sql(`select count(*) from bolagio_admin_audit_log where action = 'finance.period.status' and operator_email = '${email}'`)).toBe('2');
  // The lock is enforced by the database, not the screen.
  let refused = false;
  try { postExpenseViaDb(`${key}-20`, 'Late Supplier', 'LATE-1', 100, 19); } catch { refused = true; }
  expect(refused).toBe(true);
});

test('F06 · taxes and VAT say what is an estimate, and the accountant page offers exports without inventing a DATEV file', async ({ page, context }) => {
  const reference = await confirmedBooking();
  await reconcile();
  await operatorSession(context, 'admin');
  await page.goto('/admin/finance/vat');
  await expect(page.getByRole('heading', { level: 1, name: 'VAT' })).toBeVisible();
  await expect(page.getByText(/estimate/i).first()).toBeVisible();
  await page.goto('/admin/finance/taxes');
  await expect(page.getByRole('heading', { level: 1, name: 'Taxes' })).toBeVisible();
  await expect(page.getByText(/review/i).first()).toBeVisible();
  await page.goto('/admin/finance/accountant');
  await expect(page.getByRole('button', { name: /DATEV/ })).toHaveCount(0);
  await expect(page.getByText(/DATEV/).first()).toBeVisible();
  await page.goto('/admin/finance/invoices');
  await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible();
  await expect(page.getByText(/§ 14/).first()).toBeVisible();
  void reference;
});

test('F07 · on a phone, no finance section scrolls sideways and the section navigation stays reachable', async ({ page, context }) => {
  await confirmedBooking();
  await reconcile();
  postExpenseViaDb('2026-03-05', 'Reinigung Nord GmbH', 'RN-9', 10000, 1900);
  await operatorSession(context, 'operator');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const href of ['/admin/finance', '/admin/finance/inbox', '/admin/finance/transactions', '/admin/finance/expenses', '/admin/finance/vat', '/admin/finance/taxes', '/admin/finance/profit-loss', '/admin/finance/cash-flow', '/admin/finance/properties', '/admin/finance/accountant', '/admin/finance/settings', '/admin/finance/expenses/new']) {
    await page.goto(href);
    await expect(page.getByRole('navigation', { name: 'Finance sections' })).toBeVisible();
    await noHorizontalOverflow(page);
  }
  const id = sql(`select id from bolagio_finance_transactions where supplier_invoice_no = 'RN-9'`);
  await page.goto(`/admin/finance/transactions/${id}`);
  await noHorizontalOverflow(page);
});
