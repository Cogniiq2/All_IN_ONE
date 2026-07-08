import { motion } from 'framer-motion'
import { Download, FileText, ChartBar as BarChart3, Calendar } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { ExpensePieChart } from '@/components/charts/ExpensePieChart'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { useDataStore } from '@/store/dataStore'
import { formatCurrency } from '@/lib/utils'

export function BerichtePage() {
  const { properties, invoices } = useDataStore()

  const monthlyReports = [
    { label: 'Mai 2026', date: '01.05.2026', size: '142 KB' },
    { label: 'April 2026', date: '01.04.2026', size: '138 KB' },
    { label: 'März 2026', date: '01.03.2026', size: '155 KB' },
    { label: 'Februar 2026', date: '01.02.2026', size: '129 KB' },
    { label: 'Januar 2026', date: '01.01.2026', size: '141 KB' },
  ]

  const propertyPL = properties.map((p) => {
    const pInvoices = invoices.filter((i) => i.propertyId === p.id)
    const expenses = pInvoices.reduce((s, i) => s + i.amountGross, 0)
    const income = p.monthlyRent * 6
    return { name: p.name, income, expenses, net: income - expenses }
  })

  return (
    <div>
      <TopBar title="Berichte & Analysen" breadcrumb="Automatische und manuelle Auswertungen" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {/* Monatsbericht */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-base"
          style={{ padding: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={16} color="#D4A843" />
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB' }}>Monatsbericht</h3>
          </div>
          <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>Automatisch erstellt am 1. jedes Monats</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {monthlyReports.map((r) => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#111827', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C2333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#111827')}
              >
                <div>
                  <div style={{ fontSize: '12px', color: '#F9FAFB' }}>{r.label}</div>
                  <div style={{ fontSize: '10px', color: '#4B5563' }}>{r.size}</div>
                </div>
                <Download size={13} color="#D4A843" />
              </div>
            ))}
          </div>
          <button className="btn-gold" style={{ width: '100%', padding: '9px', fontSize: '12px' }}>
            Jetzt erstellen
          </button>
        </motion.div>

        {/* DATEV */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="card-base"
          style={{ padding: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Calendar size={16} color="#3B82F6" />
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB' }}>DATEV-Export</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', display: 'block' }}>Von</label>
              <input type="date" defaultValue="2026-01-01" className="input-base" style={{ width: '100%', height: '36px', padding: '0 10px', fontSize: '12px', colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', display: 'block' }}>Bis</label>
              <input type="date" defaultValue="2026-06-30" className="input-base" style={{ width: '100%', height: '36px', padding: '0 10px', fontSize: '12px', colorScheme: 'dark' }} />
            </div>
          </div>
          <button className="btn-gold" style={{ width: '100%', padding: '9px', fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Download size={13} /> Exportieren
          </button>
          <p style={{ fontSize: '11px', color: '#4B5563', textAlign: 'center' }}>Letzter Export: 01.06.2026</p>
        </motion.div>

        {/* Jahresübersicht */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="card-base"
          style={{ padding: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <BarChart3 size={16} color="#10B981" />
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB' }}>Jahresübersicht 2026</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Objekt', 'Einnahmen', 'Ausgaben', 'Netto'].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Objekt' ? 'left' : 'right', fontSize: '10px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {propertyPL.map((row) => (
                <tr key={row.name} style={{ borderTop: '1px solid #1F2937' }}>
                  <td style={{ padding: '8px', color: '#F9FAFB', fontSize: '11px' }}>{row.name.split(',')[0]}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#10B981', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>{formatCurrency(row.income)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#EF4444', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>{formatCurrency(row.expenses)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: row.net >= 0 ? '#10B981' : '#EF4444', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-base" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB', marginBottom: '16px' }}>Kostenanalyse — Ausgaben nach Kategorie</h3>
          <ExpensePieChart />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card-base" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB', marginBottom: '16px' }}>Cashflow — Letzte 6 Monate</h3>
          <CashflowChart />
        </motion.div>
      </div>
    </div>
  )
}
