'use client'
import { useEffect, useState } from 'react'
import { TriangleAlert as AlertTriangle } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { AccountChips } from '@/components/emails/AccountChips'
import { EmailFilters } from '@/components/emails/EmailFilters'
import { EmailTable } from '@/components/emails/EmailTable'
import { EmailDrawer } from '@/components/emails/EmailDrawer'
import { useEmailStore } from '@/store/emailStore'

const PAGE_SIZE = 50

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid #0F1824' }}>
      {[40, 140, 200, undefined, 80, 110, 130, 80].map((w, i) => (
        <td key={i} style={{ padding: '16px 14px', width: w }}>
          <div style={{
            height: '13px', borderRadius: '6px', backgroundColor: '#111827',
            width: i === 3 ? '75%' : '55%',
            animation: 'skpulse 1.6s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, borderRadius: '14px', border: '1px solid #0F1824', backgroundColor: '#060A10', overflow: 'hidden' }}>
      <style>{`@keyframes skpulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['', 'Konto', 'Von', 'Betreff', 'Anhang', 'Empfangen', 'Status', 'Aktionen'].map((h) => (
              <th key={h} style={{
                fontSize: '10px', fontWeight: 700, color: '#374151', letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left',
                borderBottom: '1px solid #0F1824', background: '#060A10',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}
        </tbody>
      </table>
    </div>
  )
}

export function EmailsPage() {
  const store = useEmailStore()
  const [page, setPage] = useState(1)

  useEffect(() => {
    store.loadEmails()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wire up all active filters from the store
  const filtered = store.filteredEmails(store)

  const accountCounts: Record<string, number> = {}
  store.emails.forEach((e) => {
    accountCounts[e.account_email] = (accountCounts[e.account_email] ?? 0) + 1
  })

  const stats = {
    total: store.emails.length,
    unread: store.emails.filter((e) => !e.is_read).length,
    withAttachments: store.emails.filter((e) => e.has_attachments).length,
    unprocessed: store.emails.filter((e) => e.has_attachments && !e.is_processed).length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#04080E' }}>
      <TopBar title="E-Mails" breadcrumb="Alle Konten im Überblick" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {/* Error banner */}
        {store.loadError && (
          <div style={{
            padding: '12px 18px', borderRadius: '10px',
            border: '1px solid rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444', marginBottom: '2px' }}>Supabase-Fehler</p>
              <p style={{ fontSize: '12px', color: '#FCA5A5', fontFamily: 'monospace' }}>{store.loadError}</p>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div style={{
          padding: '16px 24px', borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
          display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Gesamt', value: stats.total, color: '#F9FAFB' },
            { label: 'Ungelesen', value: stats.unread, color: '#60A5FA' },
            { label: 'Mit Anhang', value: stats.withAttachments, color: '#D4A843' },
            { label: 'Offen', value: stats.unprocessed, color: '#F59E0B' },
          ].map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.06)', margin: '0 24px' }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {store.loading ? (
                  <div style={{ width: '40px', height: '28px', borderRadius: '6px', backgroundColor: '#111827', animation: 'skpulse 1.6s ease-in-out infinite' }} />
                ) : (
                  <span style={{ fontSize: '26px', fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {s.value}
                  </span>
                )}
                <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Account filter chips */}
        <AccountChips accountCounts={accountCounts} />

        {/* Search + filters */}
        <EmailFilters filteredCount={filtered.length} totalCount={store.emails.length} />

        {/* Table or skeleton */}
        {store.loading ? (
          <LoadingSkeleton />
        ) : (
          <div style={{
            flex: 1, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)',
            background: '#060A10', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: '400px',
          }}>
            <EmailTable
              emails={filtered}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              totalFiltered={filtered.length}
            />
          </div>
        )}
      </div>

      <EmailDrawer />
    </div>
  )
}
