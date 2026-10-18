import { NextResponse, type NextRequest } from 'next/server';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { parseReservationFilter } from '@/lib/admin/reservation-filters';
import { loadReservationExplorer } from '@/lib/admin/reservation-explorer';
import { buildReservationsReport, reportFileName } from '@/lib/admin/pdf/reservations-report';

export const dynamic = 'force-dynamic';

/**
 * GET /admin/reservations/export?<the explorer's own query string>
 *
 * The reservations on screen, as a PDF download. Read-only: it runs the same
 * loader as the page and writes nothing anywhere. The middleware has already
 * verified the session cookie; the operator allowlist is checked here again,
 * as every protected page does, because a route handler has no layout.
 */
export async function GET(request: NextRequest) {
  const operator = await currentOperator();
  if (!operator || !can(operator.role, 'view')) {
    return NextResponse.json({ error: 'Sign in again to save this report.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    if (!(key in params)) params[key] = value;
  });
  const filter = parseReservationFilter(params);
  const now = new Date();
  const view = await loadReservationExplorer(filter, now);
  if (!view.result.ok || !view.summary) {
    return NextResponse.json({ error: 'The reservations could not be loaded, so no report was made. Try again in a moment.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const bytes = buildReservationsReport({
    description: view.description,
    items: view.result.data.items,
    total: view.result.data.total,
    summary: view.summary,
    generatedAt: now,
  });
  const name = reportFileName(now);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
