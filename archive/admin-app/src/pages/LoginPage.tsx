import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Loader as Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

function Particle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: 'rgba(212,168,67,0.25)',
      }}
      animate={{ y: [0, -window.innerHeight] }}
      transition={{ duration: 20 + delay * 5, repeat: Infinity, ease: 'linear', delay }}
    />
  )
}

function AnimatedBackground() {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 15,
  }))

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D4A843" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Glow circles */}
      {[
        { x: 20, y: 30 }, { x: 75, y: 20 }, { x: 50, y: 70 },
      ].map((pos, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            left: `${pos.x}%`, top: `${pos.y}%`,
            width: '400px', height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,168,67,0.03) 0%, transparent 70%)',
            transform: 'translate(-50%, -50%)',
          }}
          animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
          transition={{ duration: 60 + i * 15, repeat: Infinity, ease: 'linear' }}
        />
      ))}
      {/* Particles */}
      {particles.map((p) => (
        <Particle key={p.id} x={p.x} y={p.y} size={p.size} delay={p.delay} />
      ))}
    </div>
  )
}

function LogoMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <g transform="translate(22,22)">
        <rect x="-10" y="-10" width="20" height="20" fill="none" stroke="#D4A843" strokeWidth="1.5" transform="rotate(45)" />
        <rect x="-6" y="-6" width="12" height="12" fill="none" stroke="#D4A843" strokeWidth="1.5" transform="rotate(45) translate(3.5,3.5)" />
      </g>
    </svg>
  )
}

export function LoginPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const success = await login(password)
    setLoading(false)
    if (success) {
      navigate('/dashboard', { replace: true })
    } else {
      setError('Falsches Passwort. Bitte erneut versuchen.')
      setShaking(true)
      setTimeout(() => setShaking(false), 600)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#080C14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <AnimatedBackground />

      <motion.div
        className={shaking ? 'shake' : ''}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          position: 'relative', zIndex: 10,
          width: '420px',
          background: 'rgba(13, 17, 23, 0.9)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(212,168,67,0.2)',
          borderRadius: '16px',
          padding: '48px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Logo area */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' }}>
          <LogoMark />
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#D4A843', letterSpacing: '0.25em', fontWeight: 500, textTransform: 'uppercase' }}>
              ALL IN ONE
            </div>
            <div style={{ fontSize: '11px', color: '#D4A843', letterSpacing: '0.25em', fontWeight: 500, textTransform: 'uppercase' }}>
              RESIDENCES
            </div>
          </div>
          <div style={{ width: '40px', height: '1px', backgroundColor: 'rgba(212,168,67,0.4)', margin: '10px 0' }} />
          <div style={{ fontSize: '10px', color: '#4B5563', letterSpacing: '0.15em', textTransform: 'uppercase' }}>OS</div>
        </div>

        {/* Headline */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#F9FAFB', margin: '0 0 6px 0' }}>
            Willkommen zurück
          </h1>
          <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>
            Bitte geben Sie Ihr Passwort ein
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Password input */}
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Zugangspasswort"
              autoFocus
              style={{
                width: '100%',
                height: '52px',
                padding: '0 48px 0 16px',
                backgroundColor: '#111827',
                border: `1px solid ${error ? '#EF4444' : '#1F2937'}`,
                borderRadius: '8px',
                color: '#F9FAFB',
                fontSize: '15px',
                letterSpacing: '0.05em',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#D4A843'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(212,168,67,0.2)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = error ? '#EF4444' : '#1F2937'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: '14px', top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#D4A843', padding: 0, display: 'flex', alignItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading || !password}
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            style={{
              width: '100%',
              height: '52px',
              background: 'linear-gradient(135deg, #D4A843 0%, #92701F 100%)',
              color: '#080C14',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !password ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'opacity 0.15s, filter 0.15s',
            }}
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 size={18} />
                </motion.div>
                Anmelden...
              </>
            ) : 'Einloggen'}
          </motion.button>
        </form>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ color: '#EF4444', fontSize: '13px', textAlign: 'center', margin: '14px 0 0 0' }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      <p style={{
        position: 'fixed', bottom: '24px',
        fontSize: '11px', color: '#4B5563', letterSpacing: '0.05em',
        textAlign: 'center', zIndex: 10,
      }}>
        © 2026 All in One Residences — Privater Bereich
      </p>
    </div>
  )
}
