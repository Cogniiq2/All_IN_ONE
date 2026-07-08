import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, ArrowUpRight, ArrowDownLeft, CreditCard } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import type { Transaction } from '@/data/mockData'

const CATEGORIES = [
  'Mieteinnahmen', 'Darlehen', 'Heizöl', 'Strom', 'Gas', 'Wasser',
  'Versicherung', 'Handwerker', 'Steuern', 'Steuerberatung',
  'Instandhaltung', 'Verwaltung', 'Sonstiges',
]
const STATUSES: { value: Transaction['status']; label: string; color: string }[] = [
  { value: 'abgeglichen', label: 'Abgeglichen', color: '#10B981' },
  { value: 'offen',       label: 'Offen',       color: '#F59E0B' },
  { value: 'manuell',     label: 'Manuell',     color: '#3B82F6' },
]

interface Props {
  transaction: Transaction
  onClose: () => void
}

export function TransactionEditDrawer({ transaction, onClose }: Props) {
  const { updateTransaction, properties } = useDataStore()
  const addToast = useUiStore((s) => s.addToast)

  const [form, setForm] = useState({
    date: transaction.date,
    counterparty: transaction.counterparty,
    purpose: transaction.purpose,
    amount: transaction.amount,
    category: transaction.category,
    propertyId: transaction.propertyId ?? '',
    propertyName: transaction.propertyName ?? '',
    status: transaction.status,
  })
  const [saving, setSaving] = useState(false)

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }))

  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    const prop = properties.find((p) => p.id === id)
    setForm((f) => ({ ...f, propertyId: id, propertyName: prop?.name ?? '' }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      updateTransaction(transaction.id, {
        date: form.date, counterparty: form.counterparty, purpose: form.purpose,
        amount: form.amount, category: form.category,
        propertyId: form.propertyId || undefined,
        propertyName: form.propertyName || undefined,
        status: form.status,
      })
      addToast({ type: 'success', title: 'Transaktion gespeichert' })
      onClose()
    } catch {
      addToast({ type: 'error', title: 'Fehler beim Speichern' })
    } finally {
      setSaving(false)
    }
  }

  const isIncome = Number(form.amount) >= 0
  const statusCfg = STATUSES.find((s) => s.value === form.status) ?? STATUSES[0]
  const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100 }}
        />
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: '500px', zIndex: 101,
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(160deg, #0E1118 0%, #090C12 100%)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Top accent */}
          <div style={{ height: '2px', background: isIncome ? 'linear-gradient(90deg, transparent, #10B981, #34D399, #10B981, transparent)' : 'linear-gradient(90deg, transparent, #EF4444, #F87171, #EF4444, transparent)' }} />

          {/* Header */}
          <div style={{ padding: '24px 26px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isIncome ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${isIncome ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isIncome ? <ArrowUpRight size={15} color="#10B981" /> : <ArrowDownLeft size={15} color="#EF4444" />}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Transaktion bearbeiten</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', color: isIncome ? '#10B981' : '#EF4444', fontVariantNumeric: 'tabular-nums' }}>
                  {isIncome ? '+' : ''}{fmtEur(Number(form.amount))}
                </div>
                <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '3px' }}>{form.counterparty}</div>
              </div>
              <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#F9FAFB' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#6B7280' }}
              ><X size={15} /></button>
            </div>

            {/* Status badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '12px', padding: '4px 10px', borderRadius: '20px', background: `${statusCfg.color}14`, border: `1px solid ${statusCfg.color}30` }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusCfg.color, boxShadow: `0 0 4px ${statusCfg.color}` }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: statusCfg.color }}>{statusCfg.label}</span>
            </div>
          </div>

          {/* Form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <FieldGroup label="Datum">
              <StyledInput type="date" value={form.date} onChange={setField('date')} />
            </FieldGroup>

            <FieldGroup label="Empfänger / Auftraggeber">
              <StyledInput value={form.counterparty} onChange={setField('counterparty')} placeholder="Name" />
            </FieldGroup>

            <FieldGroup label="Verwendungszweck">
              <StyledInput value={form.purpose} onChange={setField('purpose')} placeholder="Buchungstext" />
            </FieldGroup>

            <FieldGroup label="Betrag (€)">
              <StyledInput type="number" step="0.01" value={form.amount} onChange={setField('amount')} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {[
                  { label: 'Einnahme', check: (v: number) => v > 0, onClick: () => { if (Number(form.amount) < 0) setForm((f) => ({ ...f, amount: -f.amount })) } },
                  { label: 'Ausgabe', check: (v: number) => v < 0, onClick: () => { if (Number(form.amount) > 0) setForm((f) => ({ ...f, amount: -f.amount })) } },
                ].map((btn) => (
                  <button key={btn.label} onClick={btn.onClick}
                    style={{ flex: 1, padding: '7px', borderRadius: '7px', border: `1px solid ${btn.check(Number(form.amount)) ? (btn.label === 'Einnahme' ? '#10B981' : '#EF4444') : 'rgba(255,255,255,0.08)'}`, background: btn.check(Number(form.amount)) ? (btn.label === 'Einnahme' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') : 'transparent', color: btn.check(Number(form.amount)) ? (btn.label === 'Einnahme' ? '#10B981' : '#EF4444') : '#6B7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </FieldGroup>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <FieldGroup label="Kategorie">
              <StyledSelect value={form.category} onChange={setField('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </StyledSelect>
            </FieldGroup>

            <FieldGroup label="Objekt zuordnen">
              <StyledSelect value={form.propertyId} onChange={handlePropertyChange}>
                <option value="">— Kein Objekt —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </FieldGroup>

            <FieldGroup label="Buchungsstatus">
              <div style={{ display: 'flex', gap: '8px' }}>
                {STATUSES.map((s) => (
                  <button key={s.value} onClick={() => setForm((f) => ({ ...f, status: s.value }))}
                    style={{ flex: 1, padding: '8px', borderRadius: '7px', border: `1px solid ${form.status === s.value ? s.color : 'rgba(255,255,255,0.08)'}`, background: form.status === s.value ? `${s.color}14` : 'transparent', color: form.status === s.value ? s.color : '#6B7280', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </FieldGroup>

            {/* Live preview card */}
            <div style={{ padding: '16px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                <CreditCard size={12} color="#4B5563" />
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vorschau</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: isIncome ? '#10B981' : '#EF4444', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {isIncome ? '+' : ''}{fmtEur(Number(form.amount))}
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{form.counterparty || '—'} · {form.category}</div>
              {form.propertyName && <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '3px' }}>{form.propertyName}</div>}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 26px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)', flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#9CA3AF', cursor: 'pointer' }}>
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 22px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #D4A843, #B8902E)', color: '#080C14', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: saving ? 0.6 : 1, boxShadow: '0 2px 12px rgba(212,168,67,0.25)' }}>
              <Save size={14} /> Speichern
            </button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

const baseStyle: React.CSSProperties = {
  width: '100%', height: '38px', fontSize: '13px', padding: '0 12px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#F9FAFB', outline: 'none',
  transition: 'border-color 0.15s', boxSizing: 'border-box',
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...baseStyle, ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; props.onBlur?.(e) }}
    />
  )
}

function StyledSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...baseStyle, cursor: 'pointer', ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; props.onBlur?.(e) }}
    />
  )
}
