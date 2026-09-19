import { Skeleton } from '@/components/admin/primitives';

/** Page geometry while a screen's server components resolve. No spinner; the shape of what is coming. */
export default function ControlLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="bc-page-head">
        <div>
          <Skeleton w={120} h={10} />
          <Skeleton w={280} h={30} className="mt-4" />
          <Skeleton w={360} h={12} className="mt-4" />
        </div>
      </div>
      <div className="bc-panel" style={{ padding: 20 }}>
        <Skeleton w="40%" h={12} />
        <Skeleton w="72%" h={12} className="mt-3" />
        <Skeleton w="56%" h={12} className="mt-3" />
      </div>
      <div className="bc-section">
        <div className="bc-section-head">
          <Skeleton w={140} h={14} />
        </div>
        <div className="bc-rows">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="bc-row" style={{ gridTemplateColumns: '120px 1fr 160px 90px' }}>
              <Skeleton h={12} />
              <Skeleton h={12} w="70%" />
              <Skeleton h={12} />
              <Skeleton h={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
