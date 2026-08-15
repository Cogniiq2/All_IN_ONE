import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, Download, FileText, SquareCheck as CheckSquare } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useEmailStore } from '@/store/emailStore'
import { useUiStore } from '@/store/uiStore'
import type { EmailAttachment } from '@/data/mockData'

const WEBHOOK_URL = 'https://n8n.cogniiq.co/webhook/invoice-processing'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  attachment: EmailAttachment
  emailId: string
}

export function AttachmentCard({ attachment, emailId }: Props) {
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(!!attachment.invoice_id)
  const { markAsProcessed, updateAttachmentInvoiceId } = useEmailStore()
  const addToast = useUiStore((s) => s.addToast)

  const handleProcess = async () => {
    if (processing || done) return
    setProcessing(true)
    try {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const uuid = crypto.randomUUID()
      const ext = attachment.file_name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const newFilePath = `raw/${year}/${month}/${uuid}.${ext}`

      // Insert invoice row (file is mock — no actual storage copy needed for mock data)
      const { data: row, error: insertError } = await supabase
        .from('invoices')
        .insert({
          file_path: newFilePath,
          file_name: attachment.file_name,
          mime_type: attachment.mime_type,
          status: 'pending',
          review_status: 'pending_review',
        })
        .select('id, file_path')
        .single()

      if (insertError) throw new Error(insertError.message)

      // Call n8n webhook
      const webhookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: row.id, file_path: row.file_path }),
      })
      if (!webhookRes.ok) throw new Error(`Webhook ${webhookRes.status}`)

      markAsProcessed(emailId, row.id)
      updateAttachmentInvoiceId(attachment.id, row.id)
      setDone(true)
      addToast({ type: 'success', title: 'Rechnung wird verarbeitet.', message: 'In wenigen Sekunden in der Prüfliste.' })
    } catch (err) {
      addToast({ type: 'error', title: 'Verarbeitung fehlgeschlagen', message: err instanceof Error ? err.message : 'Fehler' })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{
      border: '1px solid #1F2937', borderRadius: '10px', padding: '14px 16px',
      backgroundColor: '#0D1117', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      {/* File info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
          backgroundColor: attachment.is_invoice ? 'rgba(212,168,67,0.1)' : 'rgba(75,85,99,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={16} color={attachment.is_invoice ? '#D4A843' : '#6B7280'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachment.file_name}
          </p>
          <p style={{ fontSize: '11px', color: '#4B5563', marginTop: '1px' }}>
            {formatBytes(attachment.file_size_bytes)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            title="Vorschau"
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #1F2937', background: 'transparent', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#F9FAFB' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1F2937'; e.currentTarget.style.color = '#6B7280' }}
          >
            <Eye size={13} />
          </button>
          <button
            title="Herunterladen"
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #1F2937', background: 'transparent', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#F9FAFB' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1F2937'; e.currentTarget.style.color = '#6B7280' }}
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* AI hint */}
      {attachment.is_invoice && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', borderRadius: '6px',
          backgroundColor: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.12)',
        }}>
          <span style={{ fontSize: '13px' }}>🤖</span>
          <span style={{ fontSize: '11px', color: '#D4A843', fontWeight: 500 }}>KI-Erkennung: Wahrscheinlich eine Rechnung</span>
        </div>
      )}

      {/* Process button */}
      {done ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '9px 16px', borderRadius: '8px',
          backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
        }}>
          <CheckSquare size={14} color="#10B981" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#10B981' }}>Bereits als Rechnung verarbeitet</span>
        </div>
      ) : (
        <motion.button
          onClick={handleProcess}
          disabled={processing}
          whileHover={!processing ? { scale: 1.01 } : {}}
          whileTap={!processing ? { scale: 0.99 } : {}}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: '8px', border: 'none',
            background: processing ? 'rgba(212,168,67,0.3)' : 'linear-gradient(135deg, #D4A843, #B8902E)',
            color: '#080C14', fontSize: '12px', fontWeight: 700, cursor: processing ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            boxShadow: processing ? 'none' : '0 2px 12px rgba(212,168,67,0.2)',
          }}
        >
          {processing ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ width: '12px', height: '12px', border: '2px solid rgba(8,12,20,0.3)', borderTopColor: '#080C14', borderRadius: '50%' }}
              />
              Wird verarbeitet...
            </>
          ) : (
            <>
              <FileText size={13} />
              Als Rechnung verarbeiten
            </>
          )}
        </motion.button>
      )}
    </div>
  )
}
