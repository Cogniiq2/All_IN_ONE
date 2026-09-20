'use server';

/**
 * Read-only finance lookup for the command palette. `finance.view` only;
 * answers descriptions, counterparties, booking references and supplier
 * invoice numbers with links. No mutation is reachable from search.
 */

import { operatorFor } from '@/lib/admin/auth';
import { financeRowSource } from '@/lib/finance/source';
import { formatCents } from '@/lib/finance/money';
import { KIND_LABEL } from '@/lib/finance/presentation';

export interface FinanceHit { label: string; hint: string; href: string }

export async function searchFinanceAction(query: string): Promise<{ ok: true; items: FinanceHit[] } | { ok: false }> {
  const gate = await operatorFor('finance.view');
  if (!gate.ok) return { ok: false };
  const q = String(query ?? '').trim().slice(0, 80);
  if (q.length < 2) return { ok: true, items: [] };
  try {
    const source = await financeRowSource();
    const [tx, docs] = await Promise.all([
      source.transactions({ search: q, page: 1, pageSize: 6, status: 'posted' }),
      source.documents({ search: q, page: 1, pageSize: 3 }),
    ]);
    const items: FinanceHit[] = tx.rows.map((t) => ({ label: `${KIND_LABEL[t.kind] ?? t.kind} · ${t.counterparty_label ?? t.booking_reference ?? t.description}`, hint: `${t.booked_on} · ${formatCents(t.gross_cents)}`, href: `/admin/finance/transactions/${t.id}` }));
    for (const d of docs.rows) items.push({ label: `Document · ${d.original_filename}`, hint: d.document_type.replace(/_/g, ' '), href: `/admin/finance/documents?q=${encodeURIComponent(d.original_filename)}` });
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}
