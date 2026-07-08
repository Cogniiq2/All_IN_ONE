export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`shimmer ${className ?? ''}`}
      style={{ borderRadius: '6px', ...style }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="card-base" style={{ padding: '24px' }}>
      <Skeleton style={{ height: '24px', marginBottom: '16px' }} />
      <Skeleton style={{ height: '16px', marginBottom: '12px' }} />
      <Skeleton style={{ height: '16px', width: '75%' }} />
    </div>
  )
}
