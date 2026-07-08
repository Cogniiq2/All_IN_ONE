import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, FileText, Paperclip, Mail } from 'lucide-react'
import { useEmailStore } from '@/store/emailStore'
import type { Email } from '@/data/mockData'

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = diffMs / 60000
  const diffHours = diffMins / 60
  const diffDays = diffHours / 24

  if (diffMins < 60) return `${Math.round(diffMins)}m`
  if (diffHours < 24) return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 2) return 'Gestern'
  if (diffDays < 7) return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()]
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function groupEmailsByDate(emails: Email[]): { label: string; emails: Email[] }[] {
  const now = new Date()
  const groups: { label: string; emails: Email[] }[] = [
    { label: 'Heute', emails: [] },
    { label: 'Gestern', emails: [] },
    { label: 'Diese Woche', emails: [] },
    { label: 'Älter', emails: [] },
  ]
  emails.forEach((email) => {
    const d = new Date(email.received_at)
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (diff < 1) groups[0].emails.push(email)
    else if (diff < 2) groups[1].emails.push(email)
    else if (diff < 7) groups[2].emails.push(email)
    else groups[3].emails.push(email)
  })
  return groups.filter((g) => g.emails.length > 0)
}

interface Props {
  emails: Email[]
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  totalFiltered: number
}

export function EmailTable({ emails, page, pageSize, onPageChange, totalFiltered }: Props) {
  const { openEmail, markAsRead } = useEmailStore()
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const paginated = emails.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(totalFiltered / pageSize)
  const groups = groupEmailsByDate(paginated)

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const allSelectedOnPage = paginated.length > 0 && paginated.every((e) => selected.has(e.id))
  const toggleAll = () => {
    setSelected(allSelectedOnPage ? new Set() : new Set(paginated.map((e) => e.id)))
  }

  const thStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#374151',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '11px 16px', textAlign: 'left',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    whiteSpace: 'nowrap', background: '#060A10',
    position: 'sticky', top: 0, zIndex: 1,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{
            margin: '12px 16px 0',
            padding: '10px 16px',
            backgroundColor: 'rgba(212,168,67,0.07)',
            border: '1px solid rgba(212,168,67,0.2)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', gap: '20px',
          }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#D4A843' }}>{selected.size} ausgewählt</span>
          {[
            { label: 'Als gelesen markieren', action: () => { selected.forEach((id) => markAsRead(id)); setSelected(new Set()) } },
            { label: 'Auswahl aufheben', action: () => setSelected(new Set()) },
          ].map((btn) => (
            <button key={btn.label} onClick={btn.action}
              style={{ background: 'none', border: 'none', fontSize: '12px', color: '#9CA3AF', cursor: 'pointer', padding: 0, fontWeight: 500, transition: 'color 0.12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF' }}>
              {btn.label}
            </button>
          ))}
        </motion.div>
      )}

      <div style={{ overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '44px' }}>
                <input type="checkbox" checked={allSelectedOnPage} onChange={toggleAll}
                  style={{ cursor: 'pointer', accentColor: '#D4A843', width: '14px', height: '14px' }} />
              </th>
              <th style={{ ...thStyle, width: '150px' }}>Konto</th>
              <th style={{ ...thStyle, width: '210px' }}>Von</th>
              <th style={{ ...thStyle }}>Betreff &amp; Vorschau</th>
              <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Anhang</th>
              <th style={{ ...thStyle, width: '90px', textAlign: 'right', paddingRight: '18px' }}>Zeit</th>
              <th style={{ ...thStyle, width: '140px' }}>Status</th>
              <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Öffnen</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '80px 24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.07)',
                      background: 'rgba(255,255,255,0.03)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Mail size={22} color="#374151" />
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#6B7280', marginBottom: '6px' }}>Keine E-Mails gefunden</p>
                      <p style={{ fontSize: '12px', color: '#374151' }}>Passen Sie die Filter an oder leeren Sie die Suche</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <>
                  {/* Group header */}
                  <tr key={`grp-${group.label}`}>
                    <td colSpan={8} style={{
                      padding: '10px 16px 8px',
                      fontSize: '10px', fontWeight: 700, color: '#4B5563',
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: 'rgba(0,0,0,0.25)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {group.label}
                      <span style={{ fontWeight: 400, color: '#374151', marginLeft: '8px' }}>
                        {group.emails.length} E-Mail{group.emails.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>

                  {group.emails.map((email) => {
                    const isHovered = hoveredRow === email.id
                    const isSel = selected.has(email.id)

                    return (
                      <tr
                        key={email.id}
                        onClick={() => openEmail(email.id)}
                        onMouseEnter={() => setHoveredRow(email.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          transition: 'background 0.12s',
                          backgroundColor: isSel
                            ? 'rgba(212,168,67,0.05)'
                            : isHovered
                              ? 'rgba(255,255,255,0.03)'
                              : email.is_read ? 'transparent' : 'rgba(59,130,246,0.02)',
                        }}
                      >
                        {/* Checkbox + unread dot */}
                        <td style={{ padding: '0 16px', width: '44px', position: 'relative' }}>
                          {!email.is_read && (
                            <span style={{
                              position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)',
                              width: '4px', height: '4px', borderRadius: '50%',
                              backgroundColor: '#3B82F6',
                              boxShadow: '0 0 6px #3B82F6',
                            }} />
                          )}
                          <input type="checkbox" checked={isSel} onChange={() => {}}
                            onClick={(e) => toggleSelect(email.id, e)}
                            style={{ cursor: 'pointer', accentColor: '#D4A843', width: '14px', height: '14px' }} />
                        </td>

                        {/* Account */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                              background: `linear-gradient(135deg, ${email.account_color ?? '#6B7280'}22, ${email.account_color ?? '#6B7280'}08)`,
                              border: `1px solid ${email.account_color ?? '#6B7280'}33`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: email.account_color ?? '#6B7280' }} />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 500, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                              {email.account_display_name ?? '—'}
                            </span>
                          </div>
                        </td>

                        {/* From */}
                        <td style={{ padding: '14px 16px' }}>
                          <p style={{
                            fontSize: '13px', fontWeight: email.is_read ? 500 : 700,
                            color: email.is_read ? '#D1D5DB' : '#F9FAFB',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px',
                          }}>
                            {email.from_name || email.from_email}
                          </p>
                          <p style={{ fontSize: '11px', color: '#374151', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>
                            {email.from_email}
                          </p>
                        </td>

                        {/* Subject + preview */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <p style={{
                              fontSize: '13px', fontWeight: email.is_read ? 400 : 600,
                              color: email.is_read ? '#D1D5DB' : '#F9FAFB',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {email.subject || '(kein Betreff)'}
                            </p>
                            {email.supplier_name && (
                              <span style={{
                                fontSize: '10px', fontWeight: 700, color: '#D4A843',
                                background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)',
                                padding: '1px 6px', borderRadius: '5px', flexShrink: 0,
                                whiteSpace: 'nowrap',
                              }}>
                                {email.supplier_name}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '11px', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email.body_preview || ''}
                          </p>
                        </td>

                        {/* Attachments */}
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {email.has_attachments ? (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              padding: '3px 9px', borderRadius: '7px',
                              background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)',
                            }}>
                              <Paperclip size={10} color="#D4A843" />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#D4A843', fontVariantNumeric: 'tabular-nums' }}>
                                {email.attachment_count}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#1F2937', fontSize: '16px' }}>—</span>
                          )}
                        </td>

                        {/* Time */}
                        <td style={{ padding: '14px 18px 14px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', color: '#4B5563', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            {formatRelativeTime(email.received_at)}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          {email.is_processed ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              fontSize: '11px', fontWeight: 700, color: '#10B981',
                              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)',
                              padding: '4px 10px', borderRadius: '8px',
                            }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                              Verarbeitet
                            </span>
                          ) : email.has_attachments ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              fontSize: '11px', fontWeight: 700, color: '#F59E0B',
                              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)',
                              padding: '4px 10px', borderRadius: '8px',
                            }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#F59E0B', animation: 'skpulse 2s ease-in-out infinite' }} />
                              Offen
                            </span>
                          ) : (
                            <span style={{ color: '#1F2937', fontSize: '16px' }}>—</span>
                          )}
                        </td>

                        {/* Open button */}
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <motion.button
                            onClick={(e) => { e.stopPropagation(); openEmail(email.id) }}
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            initial={false}
                            animate={{ opacity: isHovered ? 1 : 0 }}
                            style={{
                              width: '30px', height: '30px', borderRadius: '8px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,255,255,0.05)',
                              color: '#9CA3AF', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Eye size={13} />
                          </motion.button>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalFiltered > pageSize && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0, background: 'rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: '12px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalFiltered)} von {totalFiltered}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { label: '← Zurück', disabled: page === 1, action: () => onPageChange(Math.max(1, page - 1)) },
              { label: 'Weiter →', disabled: page === totalPages, action: () => onPageChange(Math.min(totalPages, page + 1)) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
                style={{
                  padding: '7px 16px', fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: btn.disabled ? 'transparent' : 'rgba(255,255,255,0.04)',
                  color: btn.disabled ? '#1F2937' : '#9CA3AF',
                  cursor: btn.disabled ? 'default' : 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { if (!btn.disabled) { e.currentTarget.style.color = '#F9FAFB'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' } }}
                onMouseLeave={(e) => { if (!btn.disabled) { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' } }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
