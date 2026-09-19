import Link from 'next/link';

export default function ControlNotFound() {
  return (
    <div className="bc-empty">
      <p className="bc-label">Not found</p>
      <p className="bc-display" style={{ marginTop: 10 }}>
        There is nothing at this address.
      </p>
      <p>The booking reference may be mistyped, or the screen does not exist in this version of BoLaGio Control.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/admin" className="bc-btn primary">
          Today
        </Link>
        <Link href="/admin/bookings" className="bc-btn">
          Bookings
        </Link>
      </div>
    </div>
  );
}
