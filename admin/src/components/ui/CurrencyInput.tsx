import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function CurrencyInput({ value, onChange, placeholder, disabled, className }: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(value > 0 ? value.toFixed(2).replace('.', ',') : '')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value)
  }

  const handleBlur = () => {
    const numeric = parseFloat(displayValue.replace(',', '.').replace(/[^0-9.]/g, ''))
    if (!isNaN(numeric)) {
      onChange(numeric)
      setDisplayValue(numeric.toFixed(2).replace('.', ','))
    } else {
      setDisplayValue(value > 0 ? value.toFixed(2).replace('.', ',') : '')
    }
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: '12px', color: '#9CA3AF', fontSize: '14px', pointerEvents: 'none' }}>
        €
      </span>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder ?? '0,00'}
        disabled={disabled}
        className={`input-base ${className ?? ''}`}
        style={{
          paddingLeft: '28px',
          paddingRight: '12px',
          height: '40px',
          width: '100%',
          fontSize: '14px',
          fontVariantNumeric: 'tabular-nums',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  )
}
