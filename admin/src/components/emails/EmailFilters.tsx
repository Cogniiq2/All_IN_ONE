import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, Check, X, SlidersHorizontal } from 'lucide-react'
import { useEmailStore } from '@/store/emailStore'

interface DropdownOption { value: string; label: string; dot?: string }

function PremiumDropdown({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: DropdownOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const isActive = value !== 'all'

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '38px', padding: '0 14px', borderRadius: '10px',
          border: `1px solid ${isActive ? 'rgba(212,168,67,0.35)' : 'rgba(255,255,255,0.07)'}`,
          background: isActive
            ? 'linear-gradient(135deg, rgba(212,168,67,0.1), rgba(212,168,67,0.04))'
            : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
          color: isActive ? '#D4A843' : '#9CA3AF',
          cursor: 'pointer', fontSize: '12px', fontWeight: 600,
          transition: 'all 0.15s', whiteSpace: 'nowrap',
          boxShadow: isActive ? '0 0 0 1px rgba(212,168,67,0.1) inset' : 'none',
        }}
        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#E5E7EB' } }}
        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#9CA3AF' } }}
      >
        {selected?.dot && (
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: selected.dot, flexShrink: 0 }} />
        )}
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: '2px', opacity: 0.5 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, minWidth: '180px',
          background: 'linear-gradient(160deg, #0E1520 0%, #080D14 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
        }}>
          {options.map((opt, i) => {
            const isSel = opt.value === value
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '10px', padding: '10px 14px', background: 'transparent', border: 'none',
                  borderBottom: i < options.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
                  backgroundColor: isSel ? 'rgba(212,168,67,0.08)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {opt.dot && (
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: opt.dot, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '12px', fontWeight: isSel ? 600 : 400, color: isSel ? '#D4A843' : '#D1D5DB' }}>
                    {opt.label}
                  </span>
                </div>
                {isSel && <Check size={12} color="#D4A843" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ATTACHMENT_OPTIONS: DropdownOption[] = [
  { value: 'all', label: 'Alle Anhänge' },
  { value: 'with', label: 'Mit Anhang', dot: '#D4A843' },
  { value: 'without', label: 'Ohne Anhang', dot: '#4B5563' },
]

const STATUS_OPTIONS: DropdownOption[] = [
  { value: 'all', label: 'Alle Status' },
  { value: 'unread', label: 'Ungelesen', dot: '#3B82F6' },
  { value: 'unprocessed', label: 'Zu verarbeiten', dot: '#F59E0B' },
  { value: 'processed', label: 'Verarbeitet', dot: '#10B981' },
]

const DATE_OPTIONS: DropdownOption[] = [
  { value: 'all', label: 'Alle Zeiträume' },
  { value: 'today', label: 'Heute' },
  { value: 'week', label: 'Letzte 7 Tage' },
  { value: 'month', label: 'Letzte 30 Tage' },
]

export function EmailFilters({ filteredCount, totalCount }: { filteredCount: number; totalCount: number }) {
  const {
    searchQuery, attachmentFilter, statusFilter, dateFilter,
    setSearchQuery, setAttachmentFilter, setStatusFilter, setDateFilter, markAllAsRead,
  } = useEmailStore()

  const hasActiveFilters = searchQuery || attachmentFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all'

  const clearAll = () => {
    setSearchQuery('')
    setAttachmentFilter('all')
    setStatusFilter('all')
    setDateFilter('all')
  }

  return (
    <div style={{
      padding: '14px 18px', borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.05)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>

        {/* Filter icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
          <SlidersHorizontal size={13} color="#4B5563" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filter</span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={13} color="#4B5563" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Betreff, Absender, Inhalt…"
            style={{
              height: '38px', width: '260px', paddingLeft: '34px', paddingRight: searchQuery ? '34px' : '12px',
              fontSize: '12px', fontWeight: 500,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
              border: searchQuery ? '1px solid rgba(212,168,67,0.35)' : '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px', color: '#F9FAFB', outline: 'none', boxSizing: 'border-box',
              transition: 'all 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,168,67,0.06)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = searchQuery ? 'rgba(212,168,67,0.35)' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#6B7280',
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6B7280' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <PremiumDropdown
          value={attachmentFilter}
          onChange={(v) => setAttachmentFilter(v as 'all' | 'with' | 'without')}
          options={ATTACHMENT_OPTIONS}
          placeholder="Anhang"
        />
        <PremiumDropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as 'all' | 'unprocessed' | 'processed' | 'unread')}
          options={STATUS_OPTIONS}
          placeholder="Status"
        />
        <PremiumDropdown
          value={dateFilter}
          onChange={(v) => setDateFilter(v as 'all' | 'today' | 'week' | 'month')}
          options={DATE_OPTIONS}
          placeholder="Datum"
        />

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              height: '38px', padding: '0 12px', borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)',
              color: '#EF4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)' }}
          >
            <X size={11} />
            Filter zurücksetzen
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
        <button
          onClick={markAllAsRead}
          style={{ background: 'none', border: 'none', fontSize: '12px', color: '#4B5563', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#9CA3AF' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#4B5563' }}
        >
          Alle gelesen
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>{filteredCount}</span>
          <span style={{ fontSize: '11px', color: '#4B5563' }}>/ {totalCount}</span>
        </div>
      </div>
    </div>
  )
}
