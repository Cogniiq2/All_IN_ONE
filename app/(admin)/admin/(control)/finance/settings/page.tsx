import type { Metadata } from 'next';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadFinanceSettings } from '@/lib/finance/queries';
import { formatRate } from '@/lib/finance/money';
import { PageHeader, Section, ErrorNotice, Notice, KeyValue } from '@/components/admin/primitives';
import { Money } from '@/components/admin/finance/primitives';
import { SettingsForms } from '@/components/admin/finance/settings-forms';

export const metadata: Metadata = { title: 'Finance settings' };

export default async function FinanceSettingsPage() {
  const [result, operator] = await Promise.all([loadFinanceSettings(), currentOperator()]);
  if (!result.ok) return <><PageHeader eyebrow="Finance" title="Settings" /><ErrorNotice title="Settings could not be loaded.">{result.error}</ErrorNotice></>;
  const s = result.data;
  const mayConfigure = can(operator?.role, 'finance.configure') && !operator?.preview;
  const latest = (key: string) => [...s.policy].filter((p) => p.key === key).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return (
    <>
      <PageHeader eyebrow="Finance" title="Settings" description="Tax policy, rates, codes, categories, counterparties and accounts. Identifiers live in the deployment configuration and are shown masked. Every change is effective-dated and audited." />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Section title="Company and issuer" meta="from the deployment configuration" id="issuer">
            <KeyValue rows={[['Legal name', s.config.issuerLegalName ?? <span className="dim">INVOICE_ISSUER_LEGAL_NAME not set</span>], ['Address', s.config.issuerAddress ?? <span className="dim">not set</span>], ['Tax identifier', s.config.issuerTaxIdConfigured ? `${s.config.issuerTaxIdKind === 'ust_idnr' ? 'USt-IdNr' : 'Steuernummer'} ${s.config.issuerTaxIdMasked}` : <span className="dim">INVOICE_ISSUER_TAX_ID not set</span>], ['Invoice series', s.config.invoiceSeries ?? <span className="dim">INVOICE_SERIES not set</span>], ['§ 19 UStG', s.config.smallBusinessScheme === null ? 'undecided' : s.config.smallBusinessScheme ? 'small business' : 'regular taxation'], ['Accommodation code', s.config.accommodationTaxCode], ['Document storage', s.config.documentStorageConfigured ? 'private bucket configured' : <span className="dim">FINANCE_DOCUMENT_BUCKET not set</span>], ['E-invoice generation', s.config.eInvoiceGenerationEnabled ? 'enabled' : 'gated'], ['DATEV export', s.config.datevExportEnabled ? 'enabled' : 'gated']]} />
          </Section>
          <Section title="Tax policy" meta="effective-dated" id="policy">
            <KeyValue rows={[['VAT filing frequency', <>{latest('vat_filing_frequency')?.value ?? 'quarterly'} <span className="bc-meta">— {latest('vat_filing_frequency')?.source_reference}</span></>], ['Dauerfristverlängerung', latest('dauerfristverlaengerung')?.value ?? 'false'], ['Fiscal year starts', `month ${latest('fiscal_year_start_month')?.value ?? '1'}`], ['Annual VAT return', `month ${latest('vat_annual_return_month')?.value ?? '7'} of the following year`], ['Reserve policy', latest('tax_reserve_policy')?.value ?? 'estimate_less_paid'], ['Local levy', <>{latest('local_levy_enabled')?.value ?? 'false'} <span className="bc-meta">— {latest('local_levy_enabled')?.source_reference}</span></>], ['Shared-cost allocation', latest('default_shared_cost_allocation')?.value ?? 'occupied_nights']]} />
            {mayConfigure && <div className="mt-3"><SettingsForms mode="policy" categories={s.categories} taxCodes={s.taxCodes} /></div>}
          </Section>
          <Section title="Company tax rates" meta="review-flagged rows are placeholders until confirmed" id="rates">
            <table className="bc-mini-table"><thead><tr><th>Tax</th><th>Jurisdiction</th><th className="num">Rate</th><th>From</th><th>To</th><th>Reference</th></tr></thead><tbody>{s.rates.map((r) => <tr key={r.id}><td>{r.tax_type}</td><td>{r.jurisdiction}</td><td className="num">{formatRate(r.rate_bp)}</td><td>{r.effective_from}</td><td>{r.effective_to ?? '—'}</td><td className="bc-meta">{r.legal_reference}{r.review_required && <span className="bc-badge ghost ml-2" data-tone="caution">confirm</span>}</td></tr>)}</tbody></table>
            {mayConfigure && <div className="mt-3"><SettingsForms mode="rate" categories={s.categories} taxCodes={s.taxCodes} /></div>}
          </Section>
        </div>
        <div>
          <Section title="Tax codes" meta="effective-dated; rates in the migration and the mirror agree by test" id="codes">
            <table className="bc-mini-table"><thead><tr><th>Code</th><th className="num">Rate</th><th>Treatment</th><th>Reference</th></tr></thead><tbody>{s.taxCodes.map((c) => <tr key={c.code}><td><div style={{ fontWeight: 500 }}>{c.label}</div><div className="bc-mono bc-meta">{c.code}</div></td><td className="num">{formatRate(c.rate_bp)}</td><td>{c.treatment.replace('_', ' ')}{c.review_required && <span className="bc-badge ghost ml-1" data-tone="caution">review</span>}</td><td className="bc-meta">{c.legal_reference}</td></tr>)}</tbody></table>
          </Section>
          <Section title="Categories" meta="management P&L; DATEV mapping is a proposal until confirmed" id="categories">
            <table className="bc-mini-table"><thead><tr><th>Category</th><th>P&L group</th><th>Default code</th><th>SKR03 / 04</th></tr></thead><tbody>{s.categories.filter((c) => c.active).map((c) => <tr key={c.code}><td>{c.label}{c.asset_candidate && <span className="bc-badge ghost ml-1" data-tone="neutral">asset?</span>}</td><td>{c.pl_group.replace('_', ' ')}</td><td className="bc-mono bc-meta">{c.default_tax_code ?? '—'}</td><td className="bc-meta">{c.datev_account_skr03 ?? '—'} / {c.datev_account_skr04 ?? '—'}{c.datev_confirmed ? ' ✓' : ''}</td></tr>)}</tbody></table>
          </Section>
          <Section title="Counterparties and rules" meta="auto-verify only where every input is unambiguous" id="counterparties">
            <div className="bc-rows">{s.counterparties.map((c) => <div key={c.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span className="min-w-0"><div style={{ fontWeight: 500 }}>{c.name} <span className="bc-meta">· {c.kind} · {c.country ?? '—'}{c.vat_id ? ` · ${c.vat_id}` : ''}</span></div><div className="bc-meta">{c.default_category ?? '—'} · {c.default_tax_code ?? '—'} · {c.default_input_vat ?? '—'} · {c.default_allocation ?? '—'}{c.match_patterns.length ? ` · matches: ${c.match_patterns.join(', ')}` : ''}</div></span><span className="bc-badge ghost" data-tone={c.auto_verify ? 'positive' : 'neutral'}>{c.auto_verify ? 'auto-verify' : 'suggest only'}</span></div>)}</div>
            {mayConfigure && <div className="mt-3"><SettingsForms mode="counterparty" categories={s.categories} taxCodes={s.taxCodes} /></div>}
          </Section>
          <Section title="Accounts" id="accounts">
            <table className="bc-mini-table"><thead><tr><th>Account</th><th>Kind</th><th className="num">Opening balance</th></tr></thead><tbody>{s.accounts.map((a) => <tr key={a.id}><td>{a.label}<div className="bc-meta">{a.code} · {a.iban_masked ?? ''}</div></td><td>{a.kind}</td><td className="num">{a.opening_balance_on ? <><Money cents={a.opening_balance_cents} /> <span className="bc-meta">as of {a.opening_balance_on}</span></> : <span className="dim">not set</span>}</td></tr>)}{s.accounts.length === 0 && <tr><td colSpan={3} className="bc-meta">None. Cash and free cash stay unknown until an account with an opening balance exists.</td></tr>}</tbody></table>
            {mayConfigure && <div className="mt-3"><SettingsForms mode="account" categories={s.categories} taxCodes={s.taxCodes} /></div>}
          </Section>
          {s.assets.length > 0 && (
            <Section title="Asset register (foundation)" id="assets">
              <table className="bc-mini-table"><thead><tr><th>Asset</th><th>Purchased</th><th className="num">Cost</th><th>Life / method</th><th>Status</th></tr></thead><tbody>{s.assets.map((a) => <tr key={a.id}><td>{a.description}</td><td>{a.purchased_on}</td><td className="num"><Money cents={a.acquisition_cents} /></td><td>{a.useful_life_months ? `${a.useful_life_months} months · ${a.depreciation_method}` : <span className="dim">adviser to decide</span>}</td><td><span className="bc-badge ghost" data-tone={a.accountant_confirmed ? 'positive' : 'caution'}>{a.status}</span></td></tr>)}</tbody></table>
            </Section>
          )}
          {!mayConfigure && <Notice tone="neutral">Configuration changes are made by administrators.</Notice>}
        </div>
      </div>
    </>
  );
}
