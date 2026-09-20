import 'server-only';

/**
 * Draw the next number of a series — gaplessly, in the database, once.
 *
 * `bolagio_next_invoice_number` increments under a row lock, so two issuers
 * never receive the same number and no number is skipped. Call it only at
 * the moment a document is issued; a draft that is discarded must not have
 * consumed one (§ 14 UStG: fortlaufend). Nothing here retries: a lost answer
 * after the increment is a gap the accountant must be told about, which is
 * why the caller records the number before anything else.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { formatInvoiceNumber } from '@/lib/invoicing/contract';

export async function allocateInvoiceNumber(series: string): Promise<{ counter: number; number: string }> {
  if (!/^[A-Z][A-Z0-9-]{2,30}$/.test(series)) throw new Error('invoice series must be upper-case letters, digits and hyphens');
  const { data, error } = await supabaseAdmin().rpc('bolagio_next_invoice_number', { p_series: series });
  if (error) throw error;
  const counter = Number(data);
  return { counter, number: formatInvoiceNumber(series, counter) };
}
