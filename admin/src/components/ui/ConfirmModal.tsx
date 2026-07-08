import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmModalProps {
  isOpen: boolean
  title?: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmModal({
  isOpen,
  title = 'Sind Sie sicher?',
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Bestätigen',
  danger = false,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              backgroundColor: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 201,
              background: 'rgba(17,24,39,0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '32px',
              width: '400px',
              maxWidth: 'calc(100vw - 48px)',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#F9FAFB', margin: '0 0 10px 0' }}>
              {title}
            </h3>
            <p style={{ fontSize: '14px', color: '#9CA3AF', margin: '0 0 28px 0', lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={onCancel}
                className="btn-ghost"
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 500 }}
              >
                Abbrechen
              </button>
              <button
                onClick={onConfirm}
                style={{
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  background: danger
                    ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                    : 'linear-gradient(135deg, #D4A843 0%, #92701F 100%)',
                  color: '#080C14',
                  transition: 'filter 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
