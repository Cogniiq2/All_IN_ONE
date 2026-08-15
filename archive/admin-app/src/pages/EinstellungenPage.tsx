import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { Check, X, Plus, Trash2 } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { TopBar } from '@/components/layout/TopBar'

const sections = ['Allgemein', 'Datenbank', 'KI & Automatisierung', 'Lieferanten', 'Passwort'] as const
type Section = typeof sections[number]

export function EinstellungenPage() {
  const [activeSection, setActiveSection] = useState<Section>('Allgemein')
  const { suppliers, updateSupplier, deleteSupplier, addSupplier } = useDataStore()
  const addToast = useUiStore((s) => s.addToast)
  const [dbConnected, setDbConnected] = useState<boolean | null>(null)
  const [aiKey, setAiKey] = useState('')
  const [showAiKey, setShowAiKey] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(70)
  const [autoApprove, setAutoApprove] = useState(90)

  const { register, handleSubmit } = useForm({
    defaultValues: { companyName: 'All in One Residences', address: 'Musterstraße 1, 95445 Bayreuth', datevNumber: '1234567' },
  })

  const onSaveGeneral = () => {
    addToast({ type: 'success', title: 'Einstellungen gespeichert' })
  }

  const testConnection = async () => {
    await new Promise((r) => setTimeout(r, 1200))
    setDbConnected(false)
    addToast({ type: 'error', title: 'Verbindung fehlgeschlagen', message: 'Keine gültigen Supabase-Zugangsdaten.' })
  }

  return (
    <div>
      <TopBar title="Einstellungen" breadcrumb="System & Konfiguration" />

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px' }}>
        {/* Left nav */}
        <div className="card-base" style={{ padding: '12px', height: 'fit-content' }}>
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px',
                borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: activeSection === s ? 600 : 400,
                backgroundColor: activeSection === s ? 'rgba(212,168,67,0.1)' : 'transparent',
                color: activeSection === s ? '#D4A843' : '#9CA3AF',
                borderLeft: activeSection === s ? '2px solid #D4A843' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeSection === 'Allgemein' && (
            <div className="card-base" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', marginBottom: '24px' }}>Allgemeine Einstellungen</h2>
              <form onSubmit={handleSubmit(onSaveGeneral)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '480px' }}>
                  <FormField label="Firmenname">
                    <input {...register('companyName')} className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                  </FormField>
                  <FormField label="Adresse">
                    <input {...register('address')} className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                  </FormField>
                  <FormField label="DATEV-Beraternummer">
                    <input {...register('datevNumber')} className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                  </FormField>
                  <FormField label="Währung">
                    <input value="€ EUR" disabled className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px', opacity: 0.5 }} />
                  </FormField>
                  <FormField label="Sprache">
                    <input value="Deutsch" disabled className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px', opacity: 0.5 }} />
                  </FormField>
                  <button type="submit" className="btn-gold" style={{ padding: '10px 24px', fontSize: '13px', width: 'fit-content' }}>
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeSection === 'Datenbank' && (
            <div className="card-base" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', marginBottom: '24px' }}>Datenbankverbindung (Supabase)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '480px' }}>
                <FormField label="Supabase URL">
                  <input type="text" placeholder="https://xxx.supabase.co" className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                </FormField>
                <FormField label="Anon Key">
                  <input type="password" placeholder="eyJ..." className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                </FormField>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button onClick={testConnection} className="btn-ghost" style={{ padding: '9px 18px', fontSize: '13px' }}>
                    Verbindung testen
                  </button>
                  {dbConnected === true && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10B981', fontSize: '13px' }}>
                      <Check size={14} /> Verbunden
                    </span>
                  )}
                  {dbConnected === false && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#EF4444', fontSize: '13px' }}>
                      <X size={14} /> Fehler
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'KI & Automatisierung' && (
            <div className="card-base" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', marginBottom: '24px' }}>KI & Automatisierung</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
                <FormField label="OpenAI API Key">
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showAiKey ? 'text' : 'password'}
                      value={aiKey}
                      onChange={(e) => setAiKey(e.target.value)}
                      placeholder="sk-..."
                      className="input-base"
                      style={{ width: '100%', height: '40px', padding: '0 40px 0 12px', fontSize: '14px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAiKey(!showAiKey)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: '11px' }}
                    >
                      {showAiKey ? 'Verstecken' : 'Zeigen'}
                    </button>
                  </div>
                </FormField>
                <FormField label="KI-Modell">
                  <select className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px', cursor: 'pointer' }}>
                    <option>gpt-4o-mini</option>
                    <option>gpt-4o</option>
                    <option>lokal</option>
                  </select>
                </FormField>
                <FormField label={`Konfidenz-Schwelle: ${confidenceThreshold}%`}>
                  <input type="range" min={60} max={100} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#D4A843' }} />
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>Unter diesem Wert → immer zur manuellen Prüfung</div>
                </FormField>
                <FormField label={`Auto-Bestätigung ab: ${autoApprove}%`}>
                  <input type="range" min={85} max={100} value={autoApprove} onChange={(e) => setAutoApprove(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#D4A843' }} />
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>Über diesem Wert → automatisch bestätigen</div>
                </FormField>
                <button className="btn-gold" style={{ padding: '10px 24px', fontSize: '13px', width: 'fit-content' }}>
                  Speichern
                </button>
              </div>
            </div>
          )}

          {activeSection === 'Lieferanten' && (
            <div className="card-base" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #1F2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB' }}>Lieferanten</h2>
                <button className="btn-gold" style={{ padding: '7px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Plus size={13} /> Lieferant
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#111827' }}>
                    {['Name', 'Typ', 'Kategorie', 'Vertrauenswürdig', 'Aktionen'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', color: '#4B5563', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((sup) => (
                    <tr key={sup.id} style={{ borderBottom: '1px solid #1F2937', transition: 'background 0.12s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#111827')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', color: '#F9FAFB', fontWeight: 500 }}>{sup.name}</td>
                      <td style={{ padding: '12px 16px', color: '#9CA3AF', textTransform: 'capitalize' }}>{sup.type}</td>
                      <td style={{ padding: '12px 16px', color: '#9CA3AF' }}>{sup.defaultCategory}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: sup.trusted ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: sup.trusted ? '#10B981' : '#EF4444' }}>
                          {sup.trusted ? 'Ja' : 'Nein'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => { deleteSupplier(sup.id); addToast({ type: 'success', title: 'Lieferant gelöscht' }) }}
                          style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', padding: 0, transition: 'color 0.12s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#4B5563')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeSection === 'Passwort' && (
            <div className="card-base" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#F9FAFB', marginBottom: '24px' }}>Passwort ändern</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '360px' }}>
                <FormField label="Aktuelles Passwort">
                  <input type="password" className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                </FormField>
                <FormField label="Neues Passwort">
                  <input type="password" className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                </FormField>
                <FormField label="Passwort bestätigen">
                  <input type="password" className="input-base" style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px' }} />
                </FormField>
                <button
                  onClick={() => addToast({ type: 'success', title: 'Passwort aktualisiert' })}
                  className="btn-gold"
                  style={{ padding: '10px 24px', fontSize: '13px', width: 'fit-content' }}
                >
                  Passwort ändern
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', color: '#4B5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
