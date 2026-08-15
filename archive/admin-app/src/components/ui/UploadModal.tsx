import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileText, Image, CircleAlert as AlertCircle, CircleCheck as CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useUiStore } from '@/store/uiStore'
import { useDataStore } from '@/store/dataStore'

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const ACCEPTED_EXT = '.pdf,.jpg,.jpeg,.png'
const WEBHOOK_URL = 'https://n8n.cogniiq.co/webhook/invoice-processing'

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={32} color="#D4A843" />
  return <FileText size={32} color="#D4A843" />
}

interface Props {
  onClose: () => void
}

export function UploadModal({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const addToast = useUiStore((s) => s.addToast)
  const prependInvoice = useDataStore((s) => s.prependInvoice)

  const pickFile = (f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      addToast({
        type: 'error',
        title: 'Ungültiges Dateiformat',
        message: 'Bitte nur PDF, JPG oder PNG hochladen.',
      })
      return
    }
    setFile(f)
    setProgress(0)
    setDone(false)
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }, [])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
    // reset so same file can be re-selected
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (!file || uploading) return
    setUploading(true)
    setProgress(0)

    // Simulate progress while upload is in-flight
    progressRef.current = setInterval(() => {
      setProgress((p) => (p < 80 ? p + 6 : p))
    }, 250)

    try {
      // 1. Upload file to Supabase Storage
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const uuid = crypto.randomUUID()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const filePath = `raw/${year}/${month}/${uuid}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file, { contentType: file.type, upsert: false })

      if (uploadError) throw new Error(`Speicher-Fehler: ${uploadError.message}`)

      setProgress(85)

      // 2. Insert row into invoices table
      const { data: row, error: insertError } = await supabase
        .from('invoices')
        .insert({
          file_path: filePath,
          file_name: file.name,
          mime_type: file.type,
          status: 'pending',
          review_status: 'pending_review',
        })
        .select('id, file_path, file_name, created_at')
        .single()

      if (insertError) throw new Error(`Datenbank-Fehler: ${insertError.message}`)

      setProgress(92)

      // 3. Call n8n webhook
      const webhookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: row.id, file_path: row.file_path }),
      })

      if (!webhookRes.ok) {
        throw new Error(`Webhook-Fehler (${webhookRes.status}): ${await webhookRes.text().catch(() => '')}`)
      }

      clearInterval(progressRef.current!)
      setProgress(100)
      setDone(true)

      // 4. Success toast
      addToast({ type: 'success', title: 'Rechnung wird verarbeitet...' })

      // 5. After 3 seconds, prepend new invoice to store and close
      setTimeout(() => {
        prependInvoice({
          id: row.id,
          number: row.file_name,
          supplierId: '',
          supplierName: 'Ausstehend (KI)',
          propertyId: '',
          propertyName: '—',
          category: 'Unkategorisiert',
          categoryColor: '#4B5563',
          date: row.created_at,
          dueDate: row.created_at,
          amountNet: 0,
          vatRate: 0,
          amountGross: 0,
          status: 'zu_pruefen',
          aiConfidence: 0,
          aiModel: '—',
          notes: `Hochgeladen: ${file.name}`,
        })
        onClose()
      }, 3000)
    } catch (err) {
      clearInterval(progressRef.current!)
      setProgress(0)
      setUploading(false)
      addToast({
        type: 'error',
        title: 'Upload fehlgeschlagen',
        message: err instanceof Error ? err.message : 'Unbekannter Fehler',
      })
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={uploading ? undefined : onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
            cursor: uploading ? 'default' : 'pointer',
          }}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '480px',
            background: '#0D1117',
            border: '1px solid #1F2937',
            borderRadius: '16px',
            zIndex: 201,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 24px', borderBottom: '1px solid #1F2937',
          }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#F9FAFB' }}>Rechnung hochladen</h2>
              <p style={{ fontSize: '12px', color: '#4B5563', marginTop: '2px' }}>PDF, JPG oder PNG · Max. 50 MB</p>
            </div>
            <button
              onClick={uploading ? undefined : onClose}
              disabled={uploading}
              style={{
                background: 'none', border: 'none', color: '#4B5563', cursor: uploading ? 'default' : 'pointer',
                padding: '4px', borderRadius: '6px', transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = '#F9FAFB' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#4B5563' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: '24px' }}>
            {/* Drop zone */}
            {!file && (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragOver ? '#D4A843' : '#1F2937'}`,
                  borderRadius: '12px',
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: isDragOver ? 'rgba(212,168,67,0.05)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'
                  e.currentTarget.style.backgroundColor = 'rgba(212,168,67,0.03)'
                }}
                onMouseLeave={(e) => {
                  if (!isDragOver) {
                    e.currentTarget.style.borderColor = '#1F2937'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  backgroundColor: 'rgba(212,168,67,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                }}>
                  <Upload size={22} color="#D4A843" />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#F9FAFB', marginBottom: '4px' }}>
                  Datei hierher ziehen
                </p>
                <p style={{ fontSize: '12px', color: '#4B5563' }}>
                  oder <span style={{ color: '#D4A843', textDecoration: 'underline' }}>Datei auswählen</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXT}
                  onChange={handleInputChange}
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {/* File selected / progress */}
            {file && (
              <div style={{
                border: '1px solid #1F2937', borderRadius: '12px',
                padding: '16px', backgroundColor: '#111827',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: progress > 0 ? '16px' : 0 }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '8px',
                    backgroundColor: 'rgba(212,168,67,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileIcon mime={file.type} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '13px', fontWeight: 500, color: '#F9FAFB',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px' }}>
                      {formatSize(file.size)}
                    </p>
                  </div>
                  {done ? (
                    <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0 }} />
                  ) : !uploading ? (
                    <button
                      onClick={() => setFile(null)}
                      style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#4B5563')}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>

                {/* Progress bar */}
                {progress > 0 && (
                  <div>
                    <div style={{
                      height: '4px', backgroundColor: '#1F2937', borderRadius: '2px',
                      overflow: 'hidden',
                    }}>
                      <motion.div
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          background: done
                            ? 'linear-gradient(90deg, #10B981, #34D399)'
                            : 'linear-gradient(90deg, #D4A843, #F59E0B)',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginTop: '6px', fontSize: '11px', color: '#4B5563',
                    }}>
                      <span>{done ? 'Abgeschlossen' : getProgressLabel(progress)}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error hint */}
            {!file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
                <AlertCircle size={12} color="#4B5563" />
                <p style={{ fontSize: '11px', color: '#4B5563' }}>
                  Die KI verarbeitet die Rechnung automatisch und füllt alle Felder aus.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px', borderTop: '1px solid #1F2937',
            display: 'flex', gap: '10px', justifyContent: 'flex-end',
          }}>
            <button
              onClick={onClose}
              disabled={uploading}
              className="btn-ghost"
              style={{ padding: '9px 18px', fontSize: '13px', opacity: uploading ? 0.4 : 1, cursor: uploading ? 'default' : 'pointer' }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading || done}
              className="btn-gold"
              style={{
                padding: '9px 22px', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '7px',
                opacity: !file || uploading || done ? 0.5 : 1,
                cursor: !file || uploading || done ? 'default' : 'pointer',
              }}
            >
              {uploading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    style={{ width: '14px', height: '14px', border: '2px solid rgba(8,12,20,0.3)', borderTopColor: '#080C14', borderRadius: '50%' }}
                  />
                  Wird hochgeladen...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Hochladen & verarbeiten
                </>
              )}
            </button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}

function getProgressLabel(p: number): string {
  if (p < 40) return 'Wird hochgeladen...'
  if (p < 88) return 'Wird hochgeladen...'
  if (p < 93) return 'Wird gespeichert...'
  if (p < 99) return 'KI wird benachrichtigt...'
  return 'Abgeschlossen'
}
