import { motion } from 'framer-motion'
import { Zap, Flame, Droplets, Fuel, Wifi, Trash2 } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { UtilitySparkline } from '@/components/charts/UtilitySparkline'
import { formatCurrency, formatCurrency as fc } from '@/lib/utils'
import { utilityData } from '@/data/mockData'

const UTILITIES = [
  { key: 'strom', label: 'Strom', icon: Zap, color: '#F59E0B' },
  { key: 'gas', label: 'Gas', icon: Flame, color: '#EF4444' },
  { key: 'wasser', label: 'Wasser', icon: Droplets, color: '#3B82F6' },
  { key: 'heizoel', label: 'Heizöl', icon: Fuel, color: '#D4A843' },
  { key: 'internet', label: 'Internet', icon: Wifi, color: '#8B5CF6' },
  { key: 'muell', label: 'Müll', icon: Trash2, color: '#10B981' },
]

export function NebenkostenPage() {
  const yearTotal = (key: string) =>
    (utilityData[key] ?? []).reduce((s, e) => s + e.value, 0)

  return (
    <div>
      <TopBar title="Nebenkosten & Versorgung" breadcrumb="Jahresübersicht aller Versorgungsleistungen" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {UTILITIES.map((u, idx) => {
          const data = utilityData[u.key] ?? []
          const total = yearTotal(u.key)
          const prevTotal = total * (0.88 + Math.random() * 0.2)
          const diff = ((total - prevTotal) / prevTotal) * 100

          return (
            <motion.div
              key={u.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07 }}
              className="card-base"
              style={{ padding: '20px', transition: 'border-color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = u.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1F2937')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: `${u.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <u.icon size={16} color={u.color} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB' }}>{u.label}</span>
                </div>
                <span style={{ fontSize: '11px', color: diff > 0 ? '#EF4444' : '#10B981' }}>
                  {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}%
                </span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums', marginBottom: '4px' }}>
                {formatCurrency(total)}
              </div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '12px' }}>pro Jahr · 3 Objekte</div>
              <UtilitySparkline data={data} color={u.color} />
            </motion.div>
          )
        })}
      </div>

      {/* Heizöl section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-base"
        style={{ padding: '24px' }}
      >
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F9FAFB', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Fuel size={16} color="#D4A843" /> Heizöl — Bestellhistorie
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { date: '2025-11-03', property: 'Münchner Str. 12', liters: 1500, pricePerLiter: 0.89, total: 3890.99 },
            { date: '2025-07-15', property: 'Kulmbacher Str. 8', liters: 1200, pricePerLiter: 0.87, total: 3231.00 },
            { date: '2024-11-18', property: 'Münchner Str. 12', liters: 1400, pricePerLiter: 0.85, total: 3591.00 },
          ].map((order, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', backgroundColor: '#111827', borderRadius: '8px',
              fontSize: '13px',
            }}>
              <div style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', width: '90px' }}>
                {new Date(order.date).toLocaleDateString('de-DE')}
              </div>
              <div style={{ color: '#F9FAFB', flex: 1 }}>{order.property}</div>
              <div style={{ color: '#9CA3AF' }}>{order.liters.toLocaleString('de-DE')} L</div>
              <div style={{ color: '#9CA3AF', width: '90px', textAlign: 'center' }}>
                {order.pricePerLiter.toFixed(2).replace('.', ',')} €/L
              </div>
              <div style={{ fontWeight: 600, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums', width: '100px', textAlign: 'right' }}>
                {formatCurrency(order.total)}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
