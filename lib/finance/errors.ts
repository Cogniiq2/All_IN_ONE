/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE ERRORS — keeping what the database said.
 *
 * `supabase-js` resolves with `{ data, error }` where `error` is a PLAIN
 * OBJECT (`{ message, code, details, hint }`), not an `Error`. Thrown as-is
 * it fails every `cause instanceof Error` test downstream, and the message
 * the database took care to write — "period 2026-12 is locked", code BLG11 —
 * is replaced by the word "unknown".
 *
 * That is not cosmetic. `lib/finance/actions.ts` maps BLG codes to the
 * sentence that tells an operator what to do instead ("The period is locked.
 * Post the correction into the open period."); with the code lost, every
 * refusal reads "The command failed", and an ingestion run reports
 * `BLG-XXXXXX: unknown` rather than naming the locked period.
 *
 * So: commands throw `FinanceCommandError`, and every place that turns a
 * caught value into text uses `errorMessage`, which reads a PostgREST error
 * object as well as an `Error`.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

function isPostgrestLike(value: unknown): value is PostgrestLikeError {
  return typeof value === 'object' && value !== null && 'message' in value && typeof (value as { message: unknown }).message === 'string';
}

export class FinanceCommandError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(fn: string, error: PostgrestLikeError) {
    const code = error.code ?? null;
    super(`${fn}: ${code ? `${code} ` : ''}${error.message ?? 'the database refused the command'}`);
    this.name = 'FinanceCommandError';
    this.code = code;
    this.details = error.details ?? null;
    this.hint = error.hint ?? null;
  }
}

/** Normalise anything thrown under a finance call into a real `Error`. */
export function asFinanceError(fn: string, cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (isPostgrestLike(cause)) return new FinanceCommandError(fn, cause);
  return new FinanceCommandError(fn, { message: String(cause) });
}

/**
 * The message of a caught value, whatever shape it arrived in. Never
 * "unknown" when the thrower had something to say.
 */
export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (isPostgrestLike(cause)) return `${cause.code ? `${cause.code} ` : ''}${cause.message}`;
  if (typeof cause === 'string' && cause.trim()) return cause;
  return 'unknown';
}
