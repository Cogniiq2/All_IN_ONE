import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Upload, TrendingUp, TrendingDown, Pencil } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TransactionEditDrawer } from '@/components/transactions/TransactionEditDrawer'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Transaction } from '@/data/mockData'

export function TransaktionenPage() {
  const transactions = useDataStore((s) => s.transactions)
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  const filtered = useMemo(() => transactions.filter((t) => {
    const matchSearch = t.counterparty.toLowerCase().includes(search.toLowerCase())
      || t.purpose.toLowerCase().includes(search.toLowerCase())
    const matchProp = !propertyFilter || t.propertyId === propertyFilter
    return matchSearch && matchProp
  }), [transactions, search, propertyFilter])

  const grouped = useMemo(() => {
    const map: Record<string, Transaction[]> = {}
    filtered.forEach((t) => {
      const key = new Date(t.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return Object.entries(map)
      .sort((a, b) => new Date(b[1][0].date).getTime() - new Date(a[1][0].date).getTime())
  }, [filtered])

  const stats = useMemo(() => {
    const now = new Date()
    const cur = filtered.filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const income = cur.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = cur.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    return { income, expenses, net: income - expenses, pending: cur.filter((t) => t.status === 'offen').reduce((s, t) => s + Math.abs(t.amount), 0) }
  }, [filtered])

  const properties = useMemo(() => [...new Set(transactions.map((t) => t.propertyName).filter(Boolean))], [transactions])

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedRows(next)
  }

  return (
    <div>
      <TopBar
        title="Transaktionen"
        breadcrumb="Kontoauszüge & Buchungen"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Upload size={13} /> CSV importieren
            </button>
            <button className="btn-gold" style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={13} /> Transaktion
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { icon: TrendingUp, color: '#10B981', label: 'Einnahmen', value: formatCurrency(stats.income) },
          { icon: TrendingDown, color: '#EF4444', label: 'Ausgaben', value: formatCurrency(stats.expenses) },
          { icon: TrendingDown, color: stats.net >= 0 ? '#10B981' : '#EF4444', label: 'Netto', value: formatCurrency(stats.net) },
          { icon: TrendingDown, color: '#F59E0B', label: 'Ausstehend', value: formatCurrency(stats.pending) },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="card-base"
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', height: '72px' }}
          >
            <s.icon size={18} color={s.color} />
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{s.label}</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4B5563' }} />
          <input
            type="text"
            placeholder="Nach Empfänger oder Verwendungszweck suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base"
            style={{ width: '100%', height: '38px', paddingLeft: '36px', paddingRight: '12px', fontSize: '13px' }}
          />
        </div>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="input-base"
          style={{ height: '38px', padding: '0 12px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">Alle Objekte</option>
          {properties.map((p) => <option key={p} value={p!}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card-base"
        style={{ overflow: 'hidden' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#111827', borderBottom: '1px solid #1F2937' }}>
              <th style={{ width: '36px', padding: '10px 12px' }}>
                <input type="checkbox" style={{ cursor: 'pointer', accentColor: '#D4A843' }} />
              </th>
              {['Datum', 'Empfänger', 'Verwendungszweck', 'Objekt', 'Kategorie', 'Betrag', 'Abgleich', 'Status', ''].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Betrag' ? 'right' : 'left', fontSize: '10px', color: '#4B5563', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([month, txs]) => (
              <>
                <tr key={`group-${month}`} style={{ backgroundColor: '#111827', borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                  <td colSpan={9} style={{ padding: '8px 14px', fontSize: '11px', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {month}
                  </td>
                </tr>
                {txs.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{ borderBottom: '1px solid #1F2937', transition: 'background 0.12s', backgroundColor: selectedRows.has(tx.id) ? 'rgba(212,168,67,0.04)' : 'transparent' }}
                    onMouseEnter={(e) => { if (!selectedRows.has(tx.id)) e.currentTarget.style.backgroundColor = '#111827' }}
                    onMouseLeave={(e) => { if (!selectedRows.has(tx.id)) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <td style={{ padding: '11px 12px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        style={{ cursor: 'pointer', accentColor: '#D4A843' }}
                      />
                    </td>
                    <td style={{ padding: '11px 12px', color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatDateShort(tx.date)}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#F9FAFB', maxWidth: '140px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {tx.counterparty}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#9CA3AF', maxWidth: '180px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {tx.purpose}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {tx.propertyName ?? '—'}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {tx.category}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tx.amount > 0 ? '#10B981' : '#EF4444', whiteSpace: 'nowrap' }}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </td>
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      {tx.linkedInvoiceId ? (
                        <span style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid rgba(212,168,67,0.4)', borderRadius: '4px', color: '#D4A843', fontFamily: 'monospace' }}>
                          RE-{tx.linkedInvoiceId.slice(0, 6)}
                        </span>
                      ) : (
                        <button style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
                          Zuordnen
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <StatusBadge status={tx.status} size="sm" />
                    </td>
                    <td style={{ padding: '11px 8px', width: '36px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTx(tx) }}
                        style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'transparent', border: '1px solid transparent', color: '#4B5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.1)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; e.currentTarget.style.color = '#D4A843' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#4B5563' }}
                      >
                        <Pencil size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'fixed', bottom: '24px', left: '280px', right: '24px',
              backgroundColor: '#0D1117', border: '1px solid rgba(212,168,67,0.4)',
              borderRadius: '10px', padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 50,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB' }}>
              {selectedRows.size} Transaktionen ausgewählt
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['Kategorie zuweisen', 'Objekt zuweisen', 'Exportieren'].map((label) => (
                <button key={label} className="btn-ghost" style={{ padding: '7px 14px', fontSize: '12px' }}>{label}</button>
              ))}
              <button style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                Löschen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingTx && (
          <TransactionEditDrawer key={editingTx.id} transaction={editingTx} onClose={() => setEditingTx(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
