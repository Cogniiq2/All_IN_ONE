import { useEmailStore } from '@/store/emailStore'

interface Props {
  accountCounts: Record<string, number>
}

export function AccountChips({ accountCounts }: Props) {
  const { accounts, selectedAccountFilter, emails, setAccountFilter } = useEmailStore()
  const totalCount = emails.length

  const chips = [
    { key: null, label: 'Alle Konten', color: '#6B7280', count: totalCount },
    ...accounts
      .filter((a) => a.is_active)
      .map((a) => ({ key: a.email_address, label: a.display_name, color: a.color, count: accountCounts[a.email_address] ?? 0 })),
  ]

  return (
    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', flexShrink: 0 }}>
      {chips.map((chip) => {
        const isActive = selectedAccountFilter === chip.key
        return (
          <button
            key={chip.key ?? 'all'}
            onClick={() => setAccountFilter(chip.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.18s',
              border: isActive
                ? `1px solid ${chip.color}55`
                : '1px solid rgba(255,255,255,0.06)',
              background: isActive
                ? `linear-gradient(135deg, ${chip.color}18, ${chip.color}08)`
                : 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
              boxShadow: isActive ? `0 0 16px ${chip.color}18` : 'none',
            }}
            onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))' } }}
          >
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              backgroundColor: chip.color,
              boxShadow: isActive ? `0 0 8px ${chip.color}80` : 'none',
              transition: 'box-shadow 0.18s',
            }} />
            <span style={{
              fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
              color: isActive ? '#F9FAFB' : '#6B7280',
              transition: 'color 0.15s',
            }}>
              {chip.label}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 700,
              color: isActive ? chip.color : '#374151',
              backgroundColor: isActive ? `${chip.color}18` : 'rgba(255,255,255,0.04)',
              border: isActive ? `1px solid ${chip.color}30` : '1px solid rgba(255,255,255,0.05)',
              padding: '2px 7px', borderRadius: '6px',
              minWidth: '22px', textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              transition: 'all 0.15s',
            }}>
              {chip.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
