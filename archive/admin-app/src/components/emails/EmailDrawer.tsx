import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Mail, Send, Paperclip, CircleCheck as CheckCircle, Clock } from 'lucide-react'
import { useEmailStore } from '@/store/emailStore'
import { useUiStore } from '@/store/uiStore'
import { AttachmentCard } from './AttachmentCard'

const REPLY_WEBHOOK = 'https://n8n.cogniiq.co/webhook/send-email-reply'

function formatFullDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
}

function getInitials(name: string): string {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
      {children}
    </div>
  )
}

export function EmailDrawer() {
  const { emails, accounts, selectedEmailId, closeEmail, openEmail, getAttachmentsForEmail, markAsRead, attachmentsLoading } = useEmailStore()
  const addToast = useUiStore((s) => s.addToast)

  const [replyText, setReplyText] = useState('')
  const [fromAccount, setFromAccount] = useState<string>('')
  const [replying, setReplying] = useState(false)
  const [replySent, setReplySent] = useState(false)

  const selectedIndex = emails.findIndex((e) => e.id === selectedEmailId)
  const email = selectedIndex >= 0 ? emails[selectedIndex] : null
  const prevEmail = selectedIndex > 0 ? emails[selectedIndex - 1] : null
  const nextEmail = selectedIndex < emails.length - 1 ? emails[selectedIndex + 1] : null

  const accentColor = email?.account_color ?? '#6B7280'
  const resolvedFromAccount = fromAccount || (email?.account_email ?? '')

  const handleOpenEmail = (id: string) => {
    setReplyText('')
    setFromAccount('')
    setReplySent(false)
    openEmail(id)
  }

  const handleSendReply = async () => {
    if (!email || !replyText.trim() || replying) return
    setReplying(true)
    try {
      const res = await fetch(REPLY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: email.id,
          reply_text: replyText.trim(),
          from_account: resolvedFromAccount,
          to_email: email.from_email,
          subject: `Re: ${email.subject}`,
        }),
      })
      if (!res.ok) throw new Error(`Webhook ${res.status}`)
      setReplyText('')
      setReplySent(true)
      addToast({ type: 'success', title: 'Antwort gesendet', message: `Antwort an ${email.from_name} wurde gesendet.` })
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler beim Senden', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    } finally {
      setReplying(false)
    }
  }

  return (
    <AnimatePresence>
      {email && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeEmail}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100 }}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: 680 }} animate={{ x: 0 }} exit={{ x: 680 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0, width: '680px', zIndex: 101,
              display: 'flex', flexDirection: 'column',
              background: 'linear-gradient(170deg, #0D1118 0%, #080C12 100%)',
              borderLeft: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '-32px 0 80px rgba(0,0,0,0.8)',
            }}
          >
            {/* Top accent bar */}
            <div style={{
              height: '3px',
              background: `linear-gradient(90deg, transparent 0%, ${accentColor} 30%, ${accentColor} 70%, transparent 100%)`,
            }} />

            {/* ── HEADER ─────────────────────────────────────── */}
            <div style={{
              padding: '20px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0, background: 'rgba(0,0,0,0.15)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <h2 style={{
                  fontSize: '16px', fontWeight: 700, color: '#F9FAFB',
                  lineHeight: 1.4, flex: 1, letterSpacing: '-0.01em',
                }}>
                  {email.subject || '(kein Betreff)'}
                </h2>
                <button
                  onClick={closeEmail}
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#F9FAFB' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#6B7280' }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                {/* Account badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', borderRadius: '6px',
                  backgroundColor: `${accentColor}18`, border: `1px solid ${accentColor}35`,
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: accentColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: accentColor }}>{email.account_display_name}</span>
                </div>

                {/* Status badges */}
                {email.is_processed && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 10px', borderRadius: '6px',
                    backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                  }}>
                    <CheckCircle size={11} color="#10B981" />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#10B981' }}>Verarbeitet</span>
                  </div>
                )}
                {!email.is_read && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 10px', borderRadius: '6px',
                    backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#60A5FA' }}>Ungelesen</span>
                  </div>
                )}
                {email.has_attachments && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 10px', borderRadius: '6px',
                    backgroundColor: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)',
                  }}>
                    <Paperclip size={10} color="#D4A843" />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#D4A843' }}>
                      {email.attachment_count} Anhang{email.attachment_count !== 1 ? 'e' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── SENDER INFO ────────────────────────────────── */}
            <div style={{
              padding: '16px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              {/* Avatar */}
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
                border: `1.5px solid ${accentColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: accentColor }}>
                  {getInitials(email.from_name)}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#F9FAFB', letterSpacing: '-0.01em' }}>
                  {email.from_name || email.from_email}
                </p>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  {email.from_email}
                </p>
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={11} color="#374151" />
                  <span style={{ fontSize: '11px', color: '#374151' }}>→</span>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: accentColor }} />
                  <span style={{ fontSize: '11px', fontWeight: 500, color: accentColor }}>{email.account_display_name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Clock size={10} color="#4B5563" />
                  <span style={{ fontSize: '11px', color: '#4B5563' }}>{formatFullDate(email.received_at)}</span>
                </div>
              </div>
            </div>

            {/* ── SCROLLABLE BODY ────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Message body */}
              <div>
                <SectionLabel>Nachricht</SectionLabel>
                <div style={{
                  padding: '18px 20px', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
                  maxHeight: '260px', overflowY: 'auto',
                }}>
                  {email.body_text ? (
                    <pre style={{
                      fontSize: '13px', lineHeight: 1.75, color: '#D1D5DB',
                      fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0,
                    }}>
                      {email.body_text}
                    </pre>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#4B5563', fontStyle: 'italic' }}>Kein Nachrichteninhalt verfügbar.</p>
                  )}
                </div>
              </div>

              {/* Supplier / Property metadata */}
              {(email.supplier_name || email.property_id) && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {email.supplier_name && (
                    <div style={{
                      padding: '8px 14px', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      <p style={{ fontSize: '10px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '3px' }}>Lieferant</p>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#E5E7EB' }}>{email.supplier_name}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              {email.has_attachments && (() => {
                const attachments = getAttachmentsForEmail(email.id)
                return (
                  <div>
                    <SectionLabel>Anhänge {!attachmentsLoading && `(${attachments.length})`}</SectionLabel>
                    {attachmentsLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[1, 2].map((i) => (
                          <div key={i} style={{
                            border: '1px solid #1F2937', borderRadius: '10px', padding: '14px 16px',
                            backgroundColor: '#0D1117',
                          }}>
                            <div style={{ height: '36px', borderRadius: '8px', backgroundColor: '#1F2937', animation: 'pulse 1.5s ease-in-out infinite' }} />
                          </div>
                        ))}
                        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                      </div>
                    ) : attachments.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#4B5563', fontStyle: 'italic' }}>Anhänge werden geladen…</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {attachments.map((att) => (
                          <AttachmentCard key={att.id} attachment={att} emailId={email.id} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── REPLY AREA ─────────────────────────────── */}
              <div>
                <SectionLabel>Antworten</SectionLabel>
                <div style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
                  id="reply-box"
                >
                  {/* To / From header */}
                  <div style={{
                    padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
                      <span style={{ fontSize: '11px', color: '#4B5563', fontWeight: 700 }}>An:</span>
                      <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {email.from_name} &lt;{email.from_email}&gt;
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: '#4B5563', fontWeight: 700 }}>Von:</span>
                      <div style={{ position: 'relative' }}>
                        <select
                          value={resolvedFromAccount}
                          onChange={(e) => setFromAccount(e.target.value)}
                          style={{
                            height: '30px', paddingLeft: '28px', paddingRight: '24px',
                            fontSize: '11px', fontWeight: 500,
                            background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px', color: '#F9FAFB', cursor: 'pointer', outline: 'none',
                            appearance: 'none',
                          }}
                        >
                          {accounts.map((acc) => (
                            <option key={acc.email_address} value={acc.email_address}>
                              {acc.display_name} ({acc.email_address})
                            </option>
                          ))}
                        </select>
                        <span style={{
                          position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                          width: '6px', height: '6px', borderRadius: '50%', pointerEvents: 'none',
                          backgroundColor: accounts.find((a) => a.email_address === resolvedFromAccount)?.color ?? '#6B7280',
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Subject hint */}
                  <div style={{ padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '11px', color: '#374151' }}>Betreff: </span>
                    <span style={{ fontSize: '11px', color: '#4B5563' }}>Re: {email.subject}</span>
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={replyText}
                    onChange={(e) => { setReplyText(e.target.value); setReplySent(false) }}
                    placeholder="Antwort schreiben…"
                    onFocus={() => { const el = document.getElementById('reply-box'); if (el) el.style.borderColor = `${accentColor}50` }}
                    onBlur={() => { const el = document.getElementById('reply-box'); if (el) el.style.borderColor = 'rgba(255,255,255,0.08)' }}
                    style={{
                      width: '100%', minHeight: '130px', padding: '16px',
                      fontSize: '13px', lineHeight: 1.7, color: '#F9FAFB',
                      background: 'transparent', border: 'none', outline: 'none',
                      resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                  />

                  {/* Send row */}
                  <div style={{
                    padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px',
                    background: 'rgba(0,0,0,0.1)',
                  }}>
                    {replySent && (
                      <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                        style={{ fontSize: '12px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <CheckCircle size={13} /> Gesendet
                      </motion.span>
                    )}
                    <motion.button
                      onClick={handleSendReply}
                      disabled={replying || !replyText.trim()}
                      whileHover={!replying && replyText.trim() ? { scale: 1.02 } : {}}
                      whileTap={!replying && replyText.trim() ? { scale: 0.98 } : {}}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '9px 20px', borderRadius: '8px', border: 'none',
                        background: replying || !replyText.trim()
                          ? 'rgba(212,168,67,0.15)'
                          : 'linear-gradient(135deg, #D4A843, #B8902E)',
                        color: replying || !replyText.trim() ? 'rgba(212,168,67,0.4)' : '#080C14',
                        fontSize: '12px', fontWeight: 700,
                        cursor: replying || !replyText.trim() ? 'default' : 'pointer',
                        boxShadow: replying || !replyText.trim() ? 'none' : '0 2px 14px rgba(212,168,67,0.25)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {replying ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={{ width: '12px', height: '12px', border: '2px solid rgba(212,168,67,0.2)', borderTopColor: 'rgba(212,168,67,0.6)', borderRadius: '50%' }}
                          />
                          Wird gesendet…
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          Antwort senden
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── FOOTER ─────────────────────────────────────── */}
            <div style={{
              padding: '14px 28px', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => prevEmail && handleOpenEmail(prevEmail.id)}
                  disabled={!prevEmail}
                  style={{
                    padding: '7px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
                    color: prevEmail ? '#9CA3AF' : '#2D3748',
                    cursor: prevEmail ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                  }}
                >
                  ‹ Zurück
                </button>
                <button
                  onClick={() => nextEmail && handleOpenEmail(nextEmail.id)}
                  disabled={!nextEmail}
                  style={{
                    padding: '7px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
                    color: nextEmail ? '#9CA3AF' : '#2D3748',
                    cursor: nextEmail ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                  }}
                >
                  Weiter ›
                </button>
              </div>
              <button
                onClick={() => { if (!email.is_read) markAsRead(email.id) }}
                style={{
                  padding: '7px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
                  color: '#9CA3AF', cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#F9FAFB' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' }}
              >
                {email.is_read ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
