import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Upload, Eye, Check, Trash2, X } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfidenceBar } from '@/components/ui/ConfidenceBar'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { UploadModal } from '@/components/ui/UploadModal'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Invoice } from '@/data/mockData'

export function RechnungenPage() {
  const { invoices, approveInvoice, deleteInvoice } = useDataStore()
  const addToast = useUiStore((s) => s.addToast)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch = [inv.supplierName, inv.number, inv.propertyName, inv.category]
        .some((v) => v.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'alle' || inv.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [invoices, search, statusFilter])

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const stats = useMemo(() => ({
    total: invoices.length,
    pending: invoices.filter((i) => i.status === 'zu_pruefen').length,
    overdue: invoices.filter((i) => i.status === 'ueberfaellig').length,
    monthTotal: invoices
      .filter((i) => new Date(i.date).getMonth() === new Date().getMonth())
      .reduce((s, i) => s + i.amountGross, 0),
  }), [invoices])

  const handleApprove = (id: string) => {
    approveInvoice(id)
    addToast({ type: 'success', title: 'Rechnung bestätigt', message: 'Status auf Bezahlt gesetzt.' })
    setSelectedInvoice(null)
  }

  const handleDelete = (id: string) => {
    deleteInvoice(id)
    addToast({ type: 'success', title: 'Rechnung gelöscht' })
    setDeleteTarget(null)
    setSelectedInvoice(null)
  }

  return (
    <div>
      <TopBar
        title="Rechnungen"
        breadcrumb="Rechnungsverwaltung & KI-Erkennung"
        actions={
          <button
            onClick={() => setShowUpload(true)}
            className="btn-gold"
            style={{ padding: '10px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} />
            Rechnung hochladen
          </button>
        }
      />

      {/* Stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', gap: '24px', marginBottom: '20px', fontSize: '13px', color: '#9CA3AF' }}
      >
        <span><strong style={{ color: '#F9FAFB' }}>{stats.total}</strong> Rechnungen gesamt</span>
        <span style={{ color: '#374151' }}>|</span>
        <span><strong style={{ color: '#F59E0B' }}>{stats.pending}</strong> zu prüfen</span>
        <span style={{ color: '#374151' }}>|</span>
        <span><strong style={{ color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(stats.monthTotal)}</strong> diesen Monat</span>
        <span style={{ color: '#374151' }}>|</span>
        <span><strong style={{ color: '#EF4444' }}>{stats.overdue}</strong> überfällig</span>
      </motion.div>

      {/* Search & Filter */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4B5563' }} />
          <input
            type="text"
            placeholder="Suche nach Lieferant, Betrag, Objekt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base"
            style={{ width: '100%', height: '38px', paddingLeft: '36px', paddingRight: '12px', fontSize: '13px' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-base"
          style={{ height: '38px', padding: '0 12px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="alle">Alle Status</option>
          <option value="zu_pruefen">Zu prüfen</option>
          <option value="bezahlt">Bezahlt</option>
          <option value="ausstehend">Ausstehend</option>
          <option value="ueberfaellig">Überfällig</option>
          <option value="storniert">Storniert</option>
        </select>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-base"
        style={{ overflow: 'hidden' }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#111827', borderBottom: '1px solid #1F2937' }}>
                {['Datum', 'Nummer', 'Lieferant', 'Objekt', 'Kategorie', 'Netto', 'MwSt', 'Brutto', 'Status', 'KI', 'Aktionen'].map((h) => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Netto' || h === 'Brutto' ? 'right' : 'left', fontSize: '10px', color: '#4B5563', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((inv) => (
                <tr
                  key={inv.id}
                  style={{ borderBottom: '1px solid #1F2937', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#111827')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => setSelectedInvoice(inv)}
                >
                  <td style={{ padding: '13px 14px', color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatDateShort(inv.date)}
                  </td>
                  <td style={{ padding: '13px 14px', color: '#F9FAFB', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {inv.number}
                  </td>
                  <td style={{ padding: '13px 14px', color: '#F9FAFB', whiteSpace: 'nowrap' }}>
                    {inv.supplierName}
                  </td>
                  <td style={{ padding: '13px 14px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {inv.propertyName}
                  </td>
                  <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: inv.categoryColor, flexShrink: 0 }} />
                      <span style={{ color: '#9CA3AF' }}>{inv.category}</span>
                    </span>
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right', color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(inv.amountNet)}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right', color: '#9CA3AF' }}>
                    {inv.vatRate}%
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right', fontWeight: 600, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(inv.amountGross)}
                  </td>
                  <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                    <StatusBadge status={inv.status} size="sm" pulse={inv.status === 'zu_pruefen'} />
                  </td>
                  <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                    <ConfidenceBar confidence={inv.aiConfidence} />
                  </td>
                  <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                    <div
                      style={{ display: 'flex', gap: '4px', opacity: 0 }}
                      className="row-actions"
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      <ActionBtn icon={Eye} onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv) }} title="Anzeigen" />
                      {inv.status === 'zu_pruefen' && (
                        <ActionBtn icon={Check} color="#10B981" onClick={(e) => { e.stopPropagation(); handleApprove(inv.id) }} title="Bestätigen" />
                      )}
                      <ActionBtn icon={Trash2} color="#EF4444" onClick={(e) => { e.stopPropagation(); setDeleteTarget(inv.id) }} title="Löschen" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #1F2937' }}>
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} von {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-ghost"
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              Zurück
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="btn-ghost"
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              Weiter
            </button>
          </div>
        </div>
      </motion.div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedInvoice && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInvoice(null)}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              style={{
                position: 'fixed', right: 0, top: 0, bottom: 0, width: '540px',
                background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(20px)',
                borderLeft: '1px solid #1F2937', zIndex: 101,
                display: 'flex', flexDirection: 'column', overflowY: 'auto',
              }}
            >
              <div style={{ padding: '24px', borderBottom: '1px solid #1F2937', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', marginBottom: '8px' }}>
                    Rechnung #{selectedInvoice.number}
                  </h2>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusBadge status={selectedInvoice.status} />
                    <ConfidenceBar confidence={selectedInvoice.aiConfidence} />
                  </div>
                </div>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', flex: 1 }}>
                {/* KI Box */}
                <div style={{ background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#D4A843', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
                    KI-Erkennung
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Konfidenz</div>
                      <ConfidenceBar confidence={selectedInvoice.aiConfidence} width={80} />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Modell</div>
                      <div style={{ fontSize: '11px', color: '#4B5563' }}>{selectedInvoice.aiModel}</div>
                    </div>
                  </div>
                </div>

                {/* Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <Field label="Lieferant" value={selectedInvoice.supplierName} />
                  <Field label="Objekt" value={selectedInvoice.propertyName} />
                  <Field label="Rechnungsdatum" value={formatDateShort(selectedInvoice.date)} />
                  <Field label="Fälligkeitsdatum" value={formatDateShort(selectedInvoice.dueDate)} />
                  <Field label="Nettobetrag" value={formatCurrency(selectedInvoice.amountNet)} />
                  <Field label="MwSt-Satz" value={`${selectedInvoice.vatRate}%`} />
                  <Field label="Bruttobetrag" value={formatCurrency(selectedInvoice.amountGross)} highlight />
                  <Field label="Kategorie" value={selectedInvoice.category} />
                </div>

                {selectedInvoice.notes && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notizen</div>
                    <div style={{ fontSize: '13px', color: '#9CA3AF' }}>{selectedInvoice.notes}</div>
                  </div>
                )}
              </div>

              <div style={{ padding: '20px 24px', borderTop: '1px solid #1F2937', display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setDeleteTarget(selectedInvoice.id)}
                  style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'transparent', color: '#EF4444', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                >
                  Ablehnen
                </button>
                {selectedInvoice.status === 'zu_pruefen' && (
                  <button
                    onClick={() => handleApprove(selectedInvoice.id)}
                    className="btn-gold"
                    style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                  >
                    ✓ Bestätigen & Speichern
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!deleteTarget}
        message="Diese Rechnung wird unwiderruflich gelöscht. Sind Sie sicher?"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="Löschen"
        danger
      />

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}

function ActionBtn({ icon: Icon, onClick, title, color = '#9CA3AF' }: {
  icon: React.ElementType; onClick: (e: React.MouseEvent) => void; title: string; color?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', color,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C2333')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={14} />
    </button>
  )
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{
        fontSize: '13px', fontWeight: highlight ? 600 : 400,
        color: highlight ? '#D4A843' : '#F9FAFB',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  )
}
