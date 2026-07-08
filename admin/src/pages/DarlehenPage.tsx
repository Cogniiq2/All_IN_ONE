import { motion } from 'framer-motion'
import { useDataStore } from '@/store/dataStore'
import { TopBar } from '@/components/layout/TopBar'
import { formatCurrency, formatDateShort, daysUntil } from '@/lib/utils'

export function DarlehenPage() {
  const loans = useDataStore((s) => s.loans)
  const totalRemaining = loans.reduce((s, l) => s + l.remainingAmount, 0)
  const totalOriginal = loans.reduce((s, l) => s + l.originalAmount, 0)
  const paidPct = ((totalOriginal - totalRemaining) / totalOriginal) * 100

  return (
    <div>
      <TopBar title="Darlehen & Finanzierung" breadcrumb="Kreditübersicht & Zinsbindungen" />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-base"
        style={{ padding: '32px', marginBottom: '24px' }}
      >
        <div style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          Gesamtrestschuld
        </div>
        <div style={{ fontSize: '48px', fontWeight: 800, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums', marginBottom: '16px' }}>
          {formatCurrency(totalRemaining)}
        </div>
        <div style={{ height: '6px', backgroundColor: '#1F2937', borderRadius: '3px', overflow: 'hidden', maxWidth: '400px' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${paidPct}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{ height: '100%', background: 'linear-gradient(90deg, #10B981, #D4A843)', borderRadius: '3px' }}
          />
        </div>
        <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '6px' }}>
          {formatCurrency(totalOriginal - totalRemaining)} getilgt ({Math.round(paidPct)}% von {formatCurrency(totalOriginal)})
        </div>
      </motion.div>

      {/* Loan cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {loans.map((loan, idx) => {
          const days = daysUntil(loan.fixedRateUntil)
          const isExpiringSoon = days < 365
          const paidPct = ((loan.originalAmount - loan.remainingAmount) / loan.originalAmount) * 100

          return (
            <motion.div
              key={loan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="card-base"
              style={{ overflow: 'hidden' }}
            >
              {isExpiringSoon && (
                <div style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 600 }}>
                    ⚠ Zinsbindung läuft in {days} Tagen ab — Jetzt verhandeln
                  </span>
                </div>
              )}
              <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '24px', alignItems: 'center' }}>
                {/* Left */}
                <div>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#1C2333', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#D4A843' }}>
                      {loan.bankName.charAt(0)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, color: '#F9FAFB', fontSize: '14px', marginBottom: '3px' }}>{loan.bankName}</div>
                  <div style={{ fontSize: '11px', color: '#4B5563', fontFamily: 'monospace' }}>{loan.loanNumber}</div>
                </div>

                {/* Center */}
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums', marginBottom: '6px' }}>
                    {formatCurrency(loan.remainingAmount)}
                  </div>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Rate: <strong style={{ color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(loan.monthlyRate)}/Mo</strong></span>
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Zins: <strong style={{ color: '#F9FAFB' }}>{loan.interestRate.toFixed(2).replace('.', ',')}%</strong></span>
                  </div>
                  <div style={{ height: '4px', backgroundColor: '#1F2937', borderRadius: '2px', overflow: 'hidden', maxWidth: '280px' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${paidPct}%` }}
                      transition={{ duration: 0.7, delay: 0.2 + idx * 0.08 }}
                      style={{ height: '100%', backgroundColor: '#D4A843', borderRadius: '2px' }}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px' }}>{Math.round(paidPct)}% getilgt</div>
                </div>

                {/* Right */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ padding: '4px 10px', border: '1px solid rgba(212,168,67,0.4)', borderRadius: '5px', color: '#D4A843', fontSize: '12px' }}>
                    {loan.propertyName}
                  </span>
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '3px' }}>Nächste Rate</div>
                    <div style={{ fontSize: '13px', color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateShort(loan.nextPaymentDate)}
                    </div>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: isExpiringSoon ? '#F59E0B' : '#9CA3AF', marginBottom: '3px' }}>Zinsbindung bis</div>
                    <div style={{ fontSize: '13px', color: isExpiringSoon ? '#F59E0B' : '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateShort(loan.fixedRateUntil)}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
