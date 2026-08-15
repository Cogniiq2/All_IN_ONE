import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TopBarProps {
  title: string
  breadcrumb?: string
  actions?: React.ReactNode
}

export function TopBar({ title, breadcrumb, actions }: TopBarProps) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-between mb-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-[#F9FAFB]">{title}</h1>
        {breadcrumb && <p className="text-[13px] text-[#9CA3AF] mt-1">{breadcrumb}</p>}
      </div>
      <div className="flex items-center gap-6">
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {time && (
          <div
            className="text-[13px] text-[#9CA3AF]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {time}
          </div>
        )}
      </div>
    </motion.div>
  )
}
