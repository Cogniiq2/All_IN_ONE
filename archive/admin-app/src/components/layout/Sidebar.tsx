import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, FileText, ArrowLeftRight, BarChart3,
  Building2, Wrench, Zap, CreditCard, Bot, Settings,
  LogOut, ChevronLeft, ChevronRight, Mail, type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useEmailStore } from '@/store/emailStore'

const EXPANDED = 240
const COLLAPSED = 64

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  badge?: { text: string; color: 'amber' | 'blue' }
}

interface NavSection {
  label?: string
  items: NavItem[]
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <g transform="translate(14,14)">
        <rect x="-7" y="-7" width="14" height="14" fill="none" stroke="#D4A843" strokeWidth="1.5" transform="rotate(45)" />
        <rect x="-4" y="-4" width="8" height="8" fill="none" stroke="#D4A843" strokeWidth="1.5" transform="rotate(45) translate(2.5,2.5)" />
      </g>
    </svg>
  )
}

function Tooltip({ label, visible }: { label: string; visible: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -6 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute',
        left: '56px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: '#1C2333',
        color: '#F9FAFB',
        fontSize: '12px',
        fontWeight: 500,
        padding: '5px 10px',
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 100,
        border: '1px solid #374151',
      }}
    >
      {label}
    </motion.div>
  )
}

function NavItemButton({
  item, isActive, isExpanded, onNavigate,
}: {
  item: NavItem
  isActive: boolean
  isExpanded: boolean
  onNavigate: (href: string) => void
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const Icon = item.icon

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => onNavigate(item.href)}
        onMouseEnter={() => !isExpanded && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          width: '100%',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0 12px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          backgroundColor: isActive ? 'rgba(212,168,67,0.1)' : 'transparent',
          borderLeft: isActive ? '2px solid #D4A843' : '2px solid transparent',
          color: isActive ? '#D4A843' : '#9CA3AF',
        }}
        onMouseOver={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = '#1C2333'
            e.currentTarget.style.color = '#F9FAFB'
          }
        }}
        onMouseOut={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#9CA3AF'
          }
        }}
      >
        <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.5 }} />
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: '13px', fontWeight: 500, flex: 1, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap' }}
          >
            {item.label}
          </motion.span>
        )}
        {isExpanded && item.badge && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: item.badge.color === 'amber' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
              color: item.badge.color === 'amber' ? '#F59E0B' : '#3B82F6',
              flexShrink: 0,
            }}
          >
            {item.badge.text}
          </span>
        )}
      </button>
      {!isExpanded && <Tooltip label={item.label} visible={showTooltip} />}
    </div>
  )
}

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const invoices = useDataStore((s) => s.invoices)
  const pendingCount = invoices.filter((inv) => inv.status === 'zu_pruefen').length
  const emailStore = useEmailStore()
  const unreadEmailCount = emailStore.unprocessedWithAttachments(emailStore)

  const navSections: NavSection[] = [
    {
      items: [{ label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' }],
    },
    {
      label: 'FINANZEN',
      items: [
        { label: 'Rechnungen', icon: FileText, href: '/rechnungen', badge: pendingCount > 0 ? { text: String(pendingCount), color: 'amber' } : undefined },
        { label: 'E-Mails', icon: Mail, href: '/e-mails', badge: unreadEmailCount > 0 ? { text: String(unreadEmailCount), color: 'amber' } : undefined },
        { label: 'Transaktionen', icon: ArrowLeftRight, href: '/transaktionen' },
        { label: 'Berichte', icon: BarChart3, href: '/berichte' },
      ],
    },
    {
      label: 'OBJEKTE',
      items: [
        { label: 'Immobilien', icon: Building2, href: '/immobilien' },
        { label: 'Renovierungen', icon: Wrench, href: '/renovierungen' },
        { label: 'Nebenkosten', icon: Zap, href: '/nebenkosten' },
      ],
    },
    {
      label: 'FINANZEN & KREDITE',
      items: [{ label: 'Darlehen', icon: CreditCard, href: '/darlehen' }],
    },
    {
      label: 'SYSTEM',
      items: [
        { label: 'KI-Assistent', icon: Bot, href: '/ki-assistent', badge: { text: 'BETA', color: 'blue' } },
        { label: 'Einstellungen', icon: Settings, href: '/einstellungen' },
      ],
    },
  ]

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <motion.div
      animate={{ width: isExpanded ? EXPANDED : COLLAPSED }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        height: '100vh',
        backgroundColor: '#0D1117',
        borderRight: '1px solid #1F2937',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 16px 16px', flexShrink: 0 }}>
        <LogoMark />
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: '15px', fontWeight: 700, color: '#D4A843', whiteSpace: 'nowrap' }}
          >
            AIO OS
          </motion.span>
        )}
      </div>
      <div style={{ height: '1px', backgroundColor: '#1F2937', flexShrink: 0 }} />

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 10px' }} className="scrollbar-hide">
        {navSections.map((section, si) => (
          <div key={si} style={{ marginBottom: '20px' }}>
            {section.label && isExpanded && (
              <div style={{
                fontSize: '10px', fontWeight: 700, color: '#4B5563',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '0 10px', marginBottom: '6px',
              }}>
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <NavItemButton
                key={item.href}
                item={item}
                isActive={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
                isExpanded={isExpanded}
                onNavigate={(href) => navigate(href)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid #1F2937', padding: '12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 6px', marginBottom: '8px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            backgroundColor: '#D4A843', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#080C14' }}>A</span>
          </div>
          {isExpanded && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ fontSize: '13px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
              Admin
            </motion.span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              flex: 1, height: '36px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', backgroundColor: 'transparent', border: 'none',
              borderRadius: '8px', cursor: 'pointer', color: '#4B5563', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1C2333'; e.currentTarget.style.color = '#F9FAFB' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#4B5563' }}
          >
            {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <button
            onClick={handleLogout}
            style={{
              flex: 1, height: '36px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', backgroundColor: 'transparent', border: 'none',
              borderRadius: '8px', cursor: 'pointer', color: '#4B5563', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#EF4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#4B5563' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
