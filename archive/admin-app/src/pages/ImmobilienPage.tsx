import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, MapPin, Plus, TrendingUp, Pencil, Users, Layers } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { PropertyEditDrawer } from '@/components/property/PropertyEditDrawer'
import { formatCurrency } from '@/lib/utils'
import type { Property } from '@/data/mockData'

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  aktiv:      { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  label: 'Aktiv' },
  renovierung:{ color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Renovierung' },
  leerstand:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  label: 'Leerstand' },
}
const TYPE_LABELS: Record<string, string> = {
  wohnhaus: 'Wohnhaus', mehrfamilienhaus: 'MFH', eigentumswohnung: 'ETW',
}

export function ImmobilienPage() {
  const { properties, loadProperties, propertiesLoaded } = useDataStore()
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { if (!propertiesLoaded) loadProperties() }, [propertiesLoaded, loadProperties])

  const stats = (() => {
    let rented = 0, vacant = 0, renovation = 0, monthlyRent = 0, totalValue = 0
    properties.forEach((p) => {
      totalValue += p.estimatedValue
      if (p.status === 'renovierung') renovation++
      else if (p.status === 'leerstand') vacant++
      else rented++
      p.units.forEach((u) => { if (u.status === 'vermietet') monthlyRent += u.rentCold })
    })
    return { total: properties.length, rented, vacant, renovation, monthlyRent, totalValue }
  })()

  return (
    <div>
      <TopBar
        title="Immobilien"
        breadcrumb="Portfolioübersicht"
        actions={
          <button
            onClick={() => setShowNew(true)}
            className="btn-gold"
            style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 12px rgba(212,168,67,0.25)' }}
          >
            <Plus size={14} /> Objekt hinzufügen
          </button>
        }
      />

      {/* ── Portfolio KPI strip ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}
      >
        {[
          { icon: Building2,   label: 'Objekte',      value: stats.total,                     color: '#F9FAFB',  suffix: '' },
          { icon: Users,       label: 'Vermietet',    value: stats.rented,                    color: '#10B981',  suffix: '' },
          { icon: Layers,      label: 'Leerstand',    value: stats.vacant,                    color: '#EF4444',  suffix: '' },
          { icon: TrendingUp,  label: 'Portfoliowert',value: formatCurrency(stats.totalValue), color: '#D4A843',  suffix: '' },
          { icon: TrendingUp,  label: 'Monatsmiete',  value: formatCurrency(stats.monthlyRent),color: '#10B981',  suffix: '' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="card-base"
            style={{ padding: '16px 18px', position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at top left, ${s.color}08 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
              <s.icon size={13} color={s.color} />
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.value}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Property grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {properties.map((prop, idx) => {
          const sCfg = STATUS_CFG[prop.status] ?? STATUS_CFG.aktiv
          const rentedUnits = prop.units.filter((u) => u.status === 'vermietet').length
          const occ = prop.units.length ? (rentedUnits / prop.units.length) * 100 : 0
          const monthlyRent = prop.units.filter((u) => u.status === 'vermietet').reduce((s, u) => s + u.rentCold, 0)
          const gain = prop.estimatedValue - prop.purchasePrice
          const gainPct = prop.purchasePrice > 0 ? (gain / prop.purchasePrice) * 100 : 0

          return (
            <motion.div
              key={prop.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07 }}
              className="card-base"
              style={{ overflow: 'hidden', cursor: 'pointer', transition: 'all 0.25s', position: 'relative' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${sCfg.color}50`; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${sCfg.color}20` }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1F2937'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* Status top bar */}
              <div style={{ height: '3px', background: `linear-gradient(90deg, ${sCfg.color}, ${sCfg.color}80)` }} />

              {/* Hero area */}
              <div style={{ height: '150px', backgroundColor: '#0A0C12', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {/* Radial glow */}
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${sCfg.color}12 0%, transparent 70%)` }} />
                {/* Grid pattern */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, #0D1117)' }} />

                <Building2 size={44} color={sCfg.color} style={{ opacity: 0.2, position: 'relative', zIndex: 1 }} />

                {/* Bottom label */}
                <div style={{ position: 'absolute', bottom: '14px', left: '16px', right: '50px', zIndex: 2 }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', letterSpacing: '-0.01em' }}>{prop.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <MapPin size={10} color="#4B5563" />
                    <span style={{ fontSize: '10px', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prop.address}</span>
                  </div>
                </div>

                {/* Type badge */}
                <div style={{ position: 'absolute', top: '12px', left: '14px', zIndex: 2, padding: '3px 8px', borderRadius: '20px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '10px', fontWeight: 600, color: '#9CA3AF', backdropFilter: 'blur(8px)' }}>
                  {TYPE_LABELS[prop.type] ?? prop.type}
                </div>

                {/* Edit button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingProperty(prop) }}
                  style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 2, width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(212,168,67,0.3)', background: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(8px)', color: '#D4A843', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.15)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.6)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,17,23,0.7)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)' }}
                >
                  <Pencil size={13} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 18px' }}>
                {/* Key metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { l: 'Kaufpreis', v: formatCurrency(prop.purchasePrice) },
                    { l: 'Akt. Wert', v: formatCurrency(prop.estimatedValue) },
                    { l: 'Fläche', v: `${prop.size} m²` },
                    { l: 'Baujahr', v: String(prop.yearBuilt) },
                  ].map((s) => (
                    <div key={s.l}>
                      <div style={{ fontSize: '9px', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '2px' }}>{s.l}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                    </div>
                  ))}
                </div>

                {/* Gain pill */}
                {gainPct !== 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '20px', background: gainPct >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', marginBottom: '14px' }}>
                    <TrendingUp size={10} color={gainPct >= 0 ? '#10B981' : '#EF4444'} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: gainPct >= 0 ? '#10B981' : '#EF4444' }}>
                      {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}% Wertsteigerung
                    </span>
                  </div>
                )}

                {/* Units list */}
                <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {prop.units.map((unit) => {
                    const uCfg = STATUS_CFG[unit.status] ?? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: unit.status }
                    return (
                      <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '7px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: `${uCfg.color}18`, color: uCfg.color, fontFamily: 'monospace', fontWeight: 700, flexShrink: 0 }}>
                          {unit.label}
                        </span>
                        <span style={{ fontSize: '11px', color: '#6B7280', flexShrink: 0 }}>{unit.size} m²</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: uCfg.color, flexShrink: 0 }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: uCfg.color }} />
                          {uCfg.label}
                        </span>
                        {unit.tenant && <span style={{ fontSize: '11px', color: '#4B5563', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit.tenant}</span>}
                        {!unit.tenant && <span style={{ flex: 1 }} />}
                        {unit.status === 'vermietet' && (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatCurrency(unit.rentCold)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Occupancy bar */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '10px', color: '#4B5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Belegung</span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
                      {rentedUnits}/{prop.units.length} · {fmtEur(monthlyRent)}/Mo
                    </span>
                  </div>
                  <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${occ}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + idx * 0.07, ease: 'easeOut' }}
                      style={{ height: '100%', borderRadius: '3px', background: `linear-gradient(90deg, ${sCfg.color}, ${sCfg.color}90)`, boxShadow: `0 0 8px ${sCfg.color}60` }}
                    />
                  </div>
                </div>

                {/* Status + actions */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '20px', background: sCfg.bg, border: `1px solid ${sCfg.color}30`, fontSize: '10px', fontWeight: 700, color: sCfg.color, letterSpacing: '0.04em' }}>
                    {sCfg.label}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => setEditingProperty(prop)}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '7px', border: '1px solid rgba(212,168,67,0.25)', background: 'rgba(212,168,67,0.06)', color: '#D4A843', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '5px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.12)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.06)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.25)' }}
                  >
                    <Pencil size={11} /> Bearbeiten
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}

        {/* Add new card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: properties.length * 0.07 }}
          onClick={() => setShowNew(true)}
          style={{ border: '1px dashed rgba(212,168,67,0.2)', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '280px', gap: '10px', transition: 'all 0.2s', background: 'rgba(212,168,67,0.02)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; e.currentTarget.style.background = 'rgba(212,168,67,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.2)'; e.currentTarget.style.background = 'rgba(212,168,67,0.02)' }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={22} color="#D4A843" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#D4A843' }}>Objekt hinzufügen</span>
          <span style={{ fontSize: '11px', color: '#4B5563' }}>Neues Objekt anlegen</span>
        </motion.div>
      </div>

      {/* Drawers */}
      <AnimatePresence>
        {editingProperty && (
          <PropertyEditDrawer key={editingProperty.id} property={editingProperty} onClose={() => setEditingProperty(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNew && (
          <PropertyEditDrawer key="new" property={null} onClose={() => setShowNew(false)} isNew />
        )}
      </AnimatePresence>
    </div>
  )
}

const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
