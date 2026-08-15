import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Wrench } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export function RenovierungenPage() {
  const renovations = useDataStore((s) => s.renovations)
  const [showCompleted, setShowCompleted] = useState(false)

  const active = useMemo(() =>
    renovations.filter((r) => r.status === 'in_bearbeitung' || r.status === 'geplant')
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [renovations]
  )
  const completed = useMemo(() =>
    renovations.filter((r) => r.status === 'abgeschlossen')
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()),
    [renovations]
  )

  const getBudgetColor = (spent: number, budget: number) => {
    const pct = (spent / budget) * 100
    if (pct > 100) return '#EF4444'
    if (pct > 80) return '#F59E0B'
    return '#10B981'
  }

  return (
    <div>
      <TopBar
        title="Renovierungen & Bauprojekte"
        breadcrumb="Aktive Projekte & Abgeschlossen"
        actions={
          <button className="btn-gold" style={{ padding: '9px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Plus size={14} /> Neues Projekt
          </button>
        }
      />

      {/* Active */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
          Aktive Projekte
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {active.map((proj, idx) => {
            const pct = (proj.spent / proj.budget) * 100
            const barColor = getBudgetColor(proj.spent, proj.budget)
            return (
              <motion.div
                key={proj.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="card-base"
                style={{ padding: '24px', transition: 'border-color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1F2937')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#F9FAFB', marginBottom: '4px' }}>{proj.name}</h3>
                    <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{proj.propertyName}</p>
                  </div>
                  <StatusBadge status={proj.status} />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#F9FAFB' }}>Budget: {formatCurrency(proj.budget)}</span>
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{formatCurrency(proj.spent)} ({Math.round(pct)}%)</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#1F2937', borderRadius: '3px', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.2 + idx * 0.07 }}
                      style={{ height: '100%', backgroundColor: barColor, borderRadius: '3px' }}
                    />
                  </div>
                  {pct > 100 && (
                    <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>
                      Überschritten um {formatCurrency(proj.spent - proj.budget)}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9CA3AF' }}>
                    <Wrench size={12} />
                    {formatDateShort(proj.startDate)} – {formatDateShort(proj.endDate)}
                  </div>
                  {proj.onTrack ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '5px', padding: '3px 8px' }}>
                      <CheckCircle size={11} color="#10B981" />
                      <span style={{ fontSize: '10px', color: '#10B981', fontWeight: 600 }}>On Track</span>
                    </div>
                  ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '5px', padding: '3px 8px' }}>
                      <AlertTriangle size={11} color="#F59E0B" />
                      <span style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600 }}>Verzögert</span>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '12px' }}>
                  {proj.linkedInvoiceIds.length > 0
                    ? `${proj.linkedInvoiceIds.length} Rechnungen verknüpft`
                    : 'Keine Rechnungen verknüpft'}
                </div>

                <div style={{ borderTop: '1px solid rgba(31,41,55,0.5)', paddingTop: '12px', textAlign: 'right' }}>
                  <button style={{ background: 'none', border: 'none', color: '#D4A843', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Details →
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Completed */}
      <button
        onClick={() => setShowCompleted(!showCompleted)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', transition: 'color 0.15s', padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#D4A843')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
      >
        <ChevronDown size={14} style={{ transform: showCompleted ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        Abgeschlossene Projekte ({completed.length})
      </button>

      <AnimatePresence>
        {showCompleted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {completed.map((proj, idx) => (
                <motion.div
                  key={proj.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  whileHover={{ opacity: 1 }}
                  className="card-base"
                  style={{ padding: '20px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB', marginBottom: '3px' }}>{proj.name}</h3>
                      <p style={{ fontSize: '11px', color: '#9CA3AF' }}>{proj.propertyName}</p>
                    </div>
                    <StatusBadge status={proj.status} size="sm" />
                  </div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    {formatCurrency(proj.spent)} von {formatCurrency(proj.budget)} ({Math.round((proj.spent / proj.budget) * 100)}%)
                  </div>
                  <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px' }}>
                    {formatDateShort(proj.startDate)} – {formatDateShort(proj.endDate)}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
