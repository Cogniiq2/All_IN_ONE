import { motion } from 'framer-motion'

type Status =
  | 'bezahlt' | 'ausstehend' | 'ueberfaellig' | 'storniert'
  | 'in_bearbeitung' | 'zu_pruefen' | 'aktiv' | 'vermietet'
  | 'leerstand' | 'renovierung' | 'abgeglichen' | 'offen'
  | 'geplant' | 'abgeschlossen' | 'manuell'

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  pulse?: boolean
}

const statusMap: Record<string, { label: string; color: string; bgColor: string }> = {
  bezahlt: { label: 'Bezahlt', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)' },
  ausstehend: { label: 'Ausstehend', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)' },
  ueberfaellig: { label: 'Überfällig', color: '#EF4444', bgColor: 'rgba(239,68,68,0.1)' },
  storniert: { label: 'Storniert', color: '#6B7280', bgColor: 'rgba(107,114,128,0.1)' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.1)' },
  zu_pruefen: { label: 'Zu prüfen', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)' },
  aktiv: { label: 'Aktiv', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)' },
  vermietet: { label: 'Vermietet', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)' },
  leerstand: { label: 'Leerstand', color: '#EF4444', bgColor: 'rgba(239,68,68,0.1)' },
  renovierung: { label: 'Renovierung', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)' },
  abgeglichen: { label: 'Abgeglichen', color: '#10B981', bgColor: 'rgba(16,185,129,0.1)' },
  offen: { label: 'Offen', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.1)' },
  geplant: { label: 'Geplant', color: '#9CA3AF', bgColor: 'rgba(156,163,175,0.1)' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#6B7280', bgColor: 'rgba(107,114,128,0.1)' },
  manuell: { label: 'Manuell', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.1)' },
}

export function StatusBadge({ status, size = 'md', pulse = false }: StatusBadgeProps) {
  const config = statusMap[status] ?? { label: status, color: '#9CA3AF', bgColor: 'rgba(156,163,175,0.1)' }
  const fontSize = size === 'sm' ? '10px' : '11px'
  const padding = size === 'sm' ? '2px 6px' : '3px 8px'
  const isPending = status === 'zu_pruefen'

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding,
        borderRadius: '6px',
        backgroundColor: config.bgColor,
        color: config.color,
        fontSize,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
      }}
    >
      {pulse && isPending && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: config.color,
            flexShrink: 0,
          }}
        />
      )}
      {config.label}
    </div>
  )
}
