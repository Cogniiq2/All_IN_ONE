import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileWarning, TrendingDown, TrendingUp, CreditCard,
  Building2, MapPin, ChevronRight,
} from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { formatCurrency, formatDateShort, formatMonthYear } from '@/lib/utils'

function KpiCard({
  icon: Icon, iconColor, label, value, subtext, valueColor, delay = 0,
}: {
  icon: React.ElementType; iconColor: string; label: string; value: string
  subtext: string; valueColor?: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="card-base"
      style={{ padding: '24px', cursor: 'default', transition: 'border-color 0.15s, transform 0.15s' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#374151'
        e.currentTarget.style.transform = 'scale(1.01)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1F2937'
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <Icon size={18} color={iconColor} />
        <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{
        fontSize: '32px', fontWeight: 700, color: valueColor || '#F9FAFB',
        fontVariantNumeric: 'tabular-nums', marginBottom: '6px', lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{subtext}</div>
    </motion.div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { invoices, transactions, properties, loans } = useDataStore()

  const now = new Date()
  const monthLabel = formatMonthYear(now)

  const stats = useMemo(() => {
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const monthTx = transactions.filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    const income = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const totalLoan = loans.reduce((s, l) => s + l.remainingAmount, 0)
    const pendingReview = invoices.filter((i) => i.status === 'zu_pruefen')
    return { income, expenses, totalLoan, pendingReview }
  }, [invoices, transactions, loans])

  const recentActivity = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8),
    [transactions]
  )

  return (
    <div>
      <TopBar title="Dashboard" breadcrumb={`Übersicht — ${monthLabel}`} />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <KpiCard
          icon={FileWarning} iconColor="#F59E0B" label="Rechnungen zu prüfen"
          value={String(stats.pendingReview.length)} subtext="Warten auf Bestätigung"
          valueColor="#F59E0B" delay={0}
        />
        <KpiCard
          icon={TrendingDown} iconColor="#EF4444" label={`Ausgaben im ${monthLabel.split(' ')[0]}`}
          value={formatCurrency(stats.expenses)} subtext="↑ 12% vs. Vormonat"
          valueColor="#EF4444" delay={0.05}
        />
        <KpiCard
          icon={TrendingUp} iconColor="#10B981" label={`Einnahmen im ${monthLabel.split(' ')[0]}`}
          value={formatCurrency(stats.income)} subtext="4 aktive Mietverhältnisse"
          valueColor="#10B981" delay={0.1}
        />
        <KpiCard
          icon={CreditCard} iconColor="#3B82F6" label="Offene Darlehen"
          value={formatCurrency(stats.totalLoan)} subtext="3 Darlehen aktiv"
          delay={0.15}
        />
      </div>

      {/* Row 2: Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '16px', marginBottom: '24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-base"
          style={{ padding: '24px' }}
        >
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', marginBottom: '20px' }}>
            Cashflow — Letzte 6 Monate
          </h2>
          <CashflowChart />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card-base"
          style={{ padding: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB' }}>Zu prüfen</h2>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '2px 8px',
              borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B',
            }}>
              {stats.pendingReview.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {stats.pendingReview.slice(0, 5).map((inv) => (
              <div
                key={inv.id}
                onClick={() => navigate('/rechnungen')}
                style={{
                  display: 'flex', alignItems: 'center', padding: '10px 8px',
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
                  gap: '10px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C2333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#F9FAFB', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {inv.supplierName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{inv.propertyName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(inv.amountGross)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#4B5563' }}>{formatDateShort(inv.date)}</div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/rechnungen')}
            style={{ marginTop: '12px', background: 'none', border: 'none', color: '#D4A843', fontSize: '12px', cursor: 'pointer', padding: 0 }}
          >
            Alle anzeigen →
          </button>
        </motion.div>
      </div>

      {/* Row 3: Properties */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{ marginBottom: '24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#F9FAFB' }}>Immobilien</h2>
          <button onClick={() => navigate('/immobilien')} style={{ background: 'none', border: 'none', color: '#D4A843', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
            Alle ansehen →
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {properties.map((prop, idx) => {
            const rented = prop.units.filter((u) => u.status === 'vermietet').length
            const occupancy = prop.units.length > 0 ? (rented / prop.units.length) * 100 : 0
            const statusColor = prop.status === 'aktiv' ? '#10B981' : prop.status === 'renovierung' ? '#F59E0B' : '#EF4444'
            return (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 + idx * 0.05 }}
                className="card-base"
                style={{ padding: '20px', cursor: 'pointer', transition: 'all 0.2s' }}
                onClick={() => navigate('/immobilien')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#1F2937'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                <div style={{ height: '3px', borderRadius: '2px', backgroundColor: statusColor, marginBottom: '16px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Building2 size={14} color={statusColor} />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#F9FAFB' }}>{prop.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '14px' }}>
                  <MapPin size={11} color="#4B5563" />
                  <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{prop.address}</span>
                </div>
                <div style={{ height: '1px', backgroundColor: '#1F2937', marginBottom: '14px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{rented}/{prop.units.length} vermietet</span>
                  <span style={{ fontSize: '12px', color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                    {prop.monthlyRent > 0 ? `+${formatCurrency(prop.monthlyRent)}/Mo` : '—'}
                  </span>
                  <StatusBadge status={prop.status} size="sm" />
                </div>
                <div style={{ height: '4px', backgroundColor: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${occupancy}%` }}
                    transition={{ duration: 0.6, delay: 0.5 + idx * 0.05 }}
                    style={{ height: '100%', backgroundColor: statusColor, borderRadius: '2px' }}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Row 4: Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-base"
        style={{ overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1F2937' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#F9FAFB' }}>Letzte Aktivitäten</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#111827' }}>
              {['Datum', 'Beschreibung', 'Lieferant', 'Betrag', 'Status', 'Objekt'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: '#4B5563', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentActivity.map((tx) => (
              <tr
                key={tx.id}
                style={{ borderBottom: '1px solid #1F2937', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#111827')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '12px 16px', color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDateShort(tx.date)}
                </td>
                <td style={{ padding: '12px 16px', color: '#F9FAFB', maxWidth: '200px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {tx.purpose}
                </td>
                <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>{tx.counterparty}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tx.amount > 0 ? '#10B981' : '#EF4444' }}>
                  {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <StatusBadge status={tx.status} size="sm" />
                </td>
                <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: '12px' }}>
                  {tx.propertyName ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  )
}
