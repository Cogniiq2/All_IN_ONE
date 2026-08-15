import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function getMockResponse(input: string): string {
  const q = input.toLowerCase()
  if (q.includes('heizöl') || q.includes('öl'))
    return 'Seit Januar 2023 haben Sie insgesamt **€ 14.230,00** für Heizöl ausgegeben — verteilt auf 3 Objekte.\nDer größte Einzelkauf war **€ 3.890,00** im November 2024 (BayWa Lieferung, Münchner Str. 12).\nIm Vergleich zu 2023 sind Ihre Heizölkosten 2024 um **8,3 %** gestiegen.'
  if (q.includes('renovierung'))
    return 'Das Objekt **Bahnhofstr. 3** hatte mit **€ 14.567,60** (laufend) die höchsten Renovierungskosten, gefolgt von Münchner Str. 12 mit **€ 14.229,80** für die Heizungserneuerung.'
  if (q.includes('darlehen') || q.includes('zinsbindung'))
    return 'Ihr nächstes auslaufendes Darlehen ist das **Sparkasse-Darlehen** für Münchner Str. 12 — Zinsbindung endet am **30.06.2027** (in ca. 384 Tagen). Empfehlung: Beginnen Sie Verhandlungen spätestens 6 Monate vorher.'
  if (q.includes('cashflow'))
    return 'Im Vergleich: 2024 hatten Sie **€ 38.400 Einnahmen** gegenüber **€ 41.230 Ausgaben** (Netto: **-€ 2.830**). 2025 läuft ähnlich — Hochrechnungsergebnis: **-€ 3.100** bis Jahresende.'
  return 'Ich habe Ihre Anfrage verarbeitet. Basierend auf Ihren Finanzdaten für alle 3 Objekte kann ich aktuell **€ 14.872** an monatlichen Gesamtausgaben und **€ 3.200** an Mieteinnahmen identifizieren. Für detailliertere Analysen verbinden Sie bitte den KI-Assistenten mit Ihren Live-Daten.'
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/)
  return parts.flatMap((part, idx) => {
    if (idx % 2 === 1) return [<strong key={idx}>{part}</strong>]
    return part.split('\n').map((line, li) => <div key={`${idx}-${li}`}>{line}</div>)
  })
}

export function KiAssistentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const suggestions = [
    'Wie viel haben wir seit 2023 für Heizöl ausgegeben?',
    'Welches Objekt hatte die höchsten Renovierungskosten?',
    'Alle Rechnungen über € 5.000 anzeigen',
    'Cashflow-Vergleich 2024 vs. 2025',
    'Wann läuft unser nächstes Darlehen aus?',
    'Zeige alle überfälligen Rechnungen',
  ]

  const handleSubmit = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: input, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    const q = input
    setInput('')
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1400))
    setMessages((prev) => [...prev, {
      id: `a-${Date.now()}`, role: 'assistant',
      content: getMockResponse(q), timestamp: new Date(),
    }])
    setLoading(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const userQueries = messages.filter((m) => m.role === 'user')

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        title="KI-Finanzassistent"
        breadcrumb="Stellen Sie Fragen zu Ihren Finanzen"
        actions={
          <span style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6', borderRadius: '4px', fontWeight: 600, letterSpacing: '0.05em' }}>
            BETA
          </span>
        }
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', overflow: 'hidden', minHeight: 0 }}>
        {/* Left panel */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          className="card-base"
          style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ padding: '18px 18px 10px', borderBottom: '1px solid #1F2937' }}>
            <div style={{ fontSize: '10px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Vorschläge
            </div>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {suggestions.map((s, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.01 }}
                onClick={() => setInput(s)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: '#111827', border: '1px solid #1F2937',
                  color: '#9CA3AF', fontSize: '12px', lineHeight: 1.5, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'
                  e.currentTarget.style.color = '#F9FAFB'
                  e.currentTarget.style.backgroundColor = '#1C2333'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#1F2937'
                  e.currentTarget.style.color = '#9CA3AF'
                  e.currentTarget.style.backgroundColor = '#111827'
                }}
              >
                {s}
              </motion.button>
            ))}
          </div>

          {userQueries.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #1F2937', margin: '8px 14px' }} />
              <div style={{ padding: '6px 18px 8px' }}>
                <div style={{ fontSize: '10px', color: '#4B5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  Frühere Anfragen
                </div>
                {userQueries.map((m) => (
                  <motion.button
                    key={m.id}
                    whileHover={{ x: 3 }}
                    onClick={() => setInput(m.content)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '5px 0', color: '#9CA3AF', fontSize: '12px', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', transition: 'color 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#F9FAFB')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
                  >
                    {m.content}
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* Chat panel */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          className="card-base"
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Bot size={40} color="#D4A843" style={{ marginBottom: '14px', opacity: 0.7 }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F9FAFB', marginBottom: '6px' }}>Stellen Sie Ihre erste Frage</h3>
                <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Ich helfe Ihnen mit Ihren Finanzdaten</p>
              </div>
            ) : (
              <>
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '10px', alignItems: 'flex-start' }}
                    >
                      {msg.role === 'assistant' && (
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #1F2937', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Bot size={13} color="#D4A843" />
                        </div>
                      )}
                      <div>
                        <div style={{
                          padding: '11px 14px',
                          borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          maxWidth: '560px',
                          fontSize: '14px',
                          lineHeight: 1.6,
                          backgroundColor: msg.role === 'user' ? '#D4A843' : '#111827',
                          color: msg.role === 'user' ? '#080C14' : '#F9FAFB',
                          border: msg.role === 'assistant' ? '1px solid #1F2937' : 'none',
                        }}>
                          {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                        </div>
                        <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px', paddingLeft: '4px' }}>
                          {msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {loading && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #1F2937', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Bot size={13} color="#D4A843" />
                    </div>
                    <div style={{ padding: '12px 16px', backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '12px 12px 12px 4px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                            style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#D4A843' }}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={endRef} />
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid #1F2937', padding: '16px 20px', backgroundColor: '#0D1117' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '8px' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Stellen Sie eine Frage zu Ihren Finanzen..."
                rows={1}
                className="input-base"
                style={{ flex: 1, resize: 'none', minHeight: '42px', maxHeight: '120px', padding: '11px 14px', fontSize: '14px', overflowY: 'auto' }}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSubmit}
                disabled={!input.trim() || loading}
                className="btn-gold"
                style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: !input.trim() || loading ? 0.5 : 1 }}
              >
                <Send size={16} />
              </motion.button>
            </div>
            <p style={{ fontSize: '11px', color: '#4B5563', textAlign: 'center' }}>
              Hinweis: Der KI-Assistent ist noch in Entwicklung und verwendet Beispieldaten.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
