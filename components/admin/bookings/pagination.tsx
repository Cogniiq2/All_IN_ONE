import Link from 'next/link';

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 bc-meta" aria-label="Pagination">
      <span className="bc-num">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="bc-btn quiet sm" aria-label="Previous page">
            ← Previous
          </Link>
        ) : (
          <span className="bc-btn quiet sm" aria-disabled="true" style={{ opacity: 0.4 }}>
            ← Previous
          </span>
        )}
        <span className="bc-num px-2">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="bc-btn quiet sm" aria-label="Next page">
            Next →
          </Link>
        ) : (
          <span className="bc-btn quiet sm" aria-disabled="true" style={{ opacity: 0.4 }}>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
