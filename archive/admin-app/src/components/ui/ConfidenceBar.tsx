interface ConfidenceBarProps {
  confidence: number
  showLabel?: boolean
  width?: number
}

export function ConfidenceBar({ confidence, showLabel = true, width = 48 }: ConfidenceBarProps) {
  const percent = Math.round(confidence * 100)
  const color = confidence > 0.85 ? '#10B981' : confidence > 0.6 ? '#F59E0B' : '#EF4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width: `${width}px`,
          height: '4px',
          backgroundColor: '#1F2937',
          borderRadius: '2px',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: '2px',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: '11px', color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {percent}%
        </span>
      )}
    </div>
  )
}
