import { motion, AnimatePresence } from 'framer-motion'
import { CircleCheck as CheckCircle, Circle as XCircle, TriangleAlert as AlertTriangle, Info, X } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import type { Toast } from '@/store/uiStore'
import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

const toastConfig: Record<ToastType, { icon: React.ElementType; color: string; borderColor: string }> = {
  success: { icon: CheckCircle, color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' },
  error: { icon: XCircle, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' },
  warning: { icon: AlertTriangle, color: '#F59E0B', borderColor: 'rgba(245,158,11,0.3)' },
  info: { icon: Info, color: '#3B82F6', borderColor: 'rgba(59,130,246,0.3)' },
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const config = toastConfig[toast.type]
  const Icon = config.icon
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true)
      setTimeout(() => onClose(toast.id), 300)
    }, 4000)
    return () => clearTimeout(t)
  }, [toast.id, onClose])

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        backgroundColor: '#111827',
        border: `1px solid ${config.borderColor}`,
        borderRadius: '8px',
        padding: '14px 16px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
        width: '340px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <Icon size={18} color={config.color} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 500, color: '#F9FAFB', margin: 0 }}>
          {toast.title}
        </p>
        {toast.message && (
          <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '3px 0 0 0' }}>
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => { setExiting(true); setTimeout(() => onClose(toast.id), 300) }}
        style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#9CA3AF')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#4B5563')}
      >
        <X size={16} />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore()

  return (
    <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={toast} onClose={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export type { Toast }
