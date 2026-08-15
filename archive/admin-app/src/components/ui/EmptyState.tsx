import React from 'react'

interface EmptyStateProps {
  icon?: React.ElementType
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      {Icon && (
        <div style={{ color: '#D4A843', marginBottom: '20px', opacity: 0.6 }}>
          <Icon size={48} strokeWidth={1.5} />
        </div>
      )}
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F9FAFB', margin: '0 0 8px 0' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '0 0 24px 0', maxWidth: '360px' }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-gold"
          style={{ padding: '10px 24px', fontSize: '13px' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
