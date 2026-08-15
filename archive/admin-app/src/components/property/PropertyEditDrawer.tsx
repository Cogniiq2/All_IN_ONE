import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Trash2, Pencil, Plus, Check, ChevronRight, Chrome as Home, TrendingUp, Ruler, Calendar, Building2, MapPin, TriangleAlert as AlertTriangle } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import type { Property, PropertyUnit } from '@/data/mockData'

const PROPERTY_TYPES = [
  { value: 'wohnhaus', label: 'Wohnhaus' },
  { value: 'mehrfamilienhaus', label: 'Mehrfamilienhaus' },
  { value: 'eigentumswohnung', label: 'Eigentumswohnung' },
]
const PROPERTY_STATUSES = [
  { value: 'aktiv', label: 'Aktiv', color: '#10B981' },
  { value: 'renovierung', label: 'Renovierung', color: '#F59E0B' },
  { value: 'leerstand', label: 'Leerstand', color: '#EF4444' },
]
const UNIT_STATUSES = [
  { value: 'vermietet', label: 'Vermietet', color: '#10B981' },
  { value: 'leerstand', label: 'Leerstand', color: '#6B7280' },
  { value: 'renovierung', label: 'Renovierung', color: '#F59E0B' },
]

type Tab = 'grunddaten' | 'einheiten'
type FormData = Omit<Property, 'id' | 'units' | 'loanIds' | 'monthlyRent'>
type UnitForm = Omit<PropertyUnit, 'id'>

const emptyUnit = (): UnitForm => ({ label: '', size: 0, status: 'leerstand', rentCold: 0, tenant: '' })

interface Props {
  property: Property | null
  onClose: () => void
  isNew?: boolean
}

export function PropertyEditDrawer({ property, onClose, isNew = false }: Props) {
  const { saveProperty, createProperty, removeProperty, createUnit, saveUnit, removeUnit } = useDataStore()
  const addToast = useUiStore((s) => s.addToast)

  const [activeTab, setActiveTab] = useState<Tab>('grunddaten')
  const [form, setForm] = useState<FormData>({
    name: property?.name ?? '',
    address: property?.address ?? '',
    type: property?.type ?? 'wohnhaus',
    purchasePrice: property?.purchasePrice ?? 0,
    estimatedValue: property?.estimatedValue ?? 0,
    size: property?.size ?? 0,
    yearBuilt: property?.yearBuilt ?? 2000,
    purchaseYear: property?.purchaseYear ?? new Date().getFullYear(),
    status: property?.status ?? 'aktiv',
  })
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editingUnit, setEditingUnit] = useState<UnitForm>(emptyUnit())
  const [addingUnit, setAddingUnit] = useState(false)
  const [newUnit, setNewUnit] = useState<UnitForm>(emptyUnit())
  const [unitBusy, setUnitBusy] = useState<string | null>(null)

  const setField = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }))

  const statusCfg = PROPERTY_STATUSES.find((s) => s.value === form.status) ?? PROPERTY_STATUSES[0]
  const units = property?.units ?? []
  const rentTotal = units.filter((u) => u.status === 'vermietet').reduce((s, u) => s + u.rentCold, 0)
  const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  const handleSave = async () => {
    if (!form.name.trim()) { addToast({ type: 'error', title: 'Name fehlt' }); return }
    setSaving(true)
    try {
      if (isNew) { await createProperty(form); addToast({ type: 'success', title: 'Objekt erstellt' }) }
      else if (property) { await saveProperty({ ...property, ...form }); addToast({ type: 'success', title: 'Gespeichert' }) }
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!property) return
    setDeleting(true)
    try { await removeProperty(property.id); addToast({ type: 'success', title: 'Objekt gelöscht' }); onClose() }
    catch (err) { addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' }); setDeleting(false) }
  }

  const beginEditUnit = (unit: PropertyUnit) => {
    setEditingUnitId(unit.id)
    setEditingUnit({ label: unit.label, size: unit.size, status: unit.status, rentCold: unit.rentCold, tenant: unit.tenant ?? '' })
    setAddingUnit(false)
  }

  const handleSaveUnit = async (unitId: string) => {
    if (!property) return
    setUnitBusy(unitId)
    try {
      await saveUnit(property.id, { ...editingUnit, id: unitId, tenant: editingUnit.tenant || undefined })
      setEditingUnitId(null)
      addToast({ type: 'success', title: 'Einheit gespeichert' })
    } catch (err) { addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' }) }
    finally { setUnitBusy(null) }
  }

  const handleAddUnit = async () => {
    if (!property || !newUnit.label.trim()) { addToast({ type: 'error', title: 'Bezeichnung fehlt' }); return }
    setUnitBusy('new')
    try {
      await createUnit(property.id, { ...newUnit, tenant: newUnit.tenant || undefined }, units.length)
      setAddingUnit(false); setNewUnit(emptyUnit())
      addToast({ type: 'success', title: 'Einheit hinzugefügt' })
    } catch (err) { addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' }) }
    finally { setUnitBusy(null) }
  }

  const handleDeleteUnit = async (unitId: string) => {
    if (!property) return
    setUnitBusy(unitId)
    try { await removeUnit(property.id, unitId) }
    catch (err) { addToast({ type: 'error', title: 'Fehler', message: err instanceof Error ? err.message : '' }) }
    finally { setUnitBusy(null) }
  }

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 100 }}
        />

        {/* Drawer */}
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: '620px', zIndex: 101,
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(160deg, #0E1118 0%, #090C12 100%)',
            borderLeft: '1px solid rgba(212,168,67,0.15)',
            boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Gold top bar */}
          <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #D4A843, #F59E0B, #D4A843, transparent)' }} />

          {/* Header */}
          <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={16} color="#D4A843" />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#4B5563', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {isNew ? 'Neues Objekt' : 'Objekt bearbeiten'}
                  </span>
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#F9FAFB', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  {form.name || (isNew ? 'Unbenanntes Objekt' : '—')}
                </h2>
                {form.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                    <MapPin size={11} color="#4B5563" />
                    <span style={{ fontSize: '12px', color: '#4B5563' }}>{form.address}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isNew && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: 'rgba(16,24,40,0.8)', border: `1px solid ${statusCfg.color}40` }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusCfg.color, boxShadow: `0 0 6px ${statusCfg.color}` }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: statusCfg.color }}>{statusCfg.label}</span>
                  </div>
                )}
                <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#F9FAFB' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#6B7280' }}
                ><X size={15} /></button>
              </div>
            </div>

            {/* Quick stats strip (only for existing) */}
            {!isNew && property && (
              <div style={{ display: 'flex', gap: '0', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                {[
                  { icon: Ruler, label: 'Wohnfläche', value: `${property.size} m²` },
                  { icon: TrendingUp, label: 'Akt. Wert', value: fmtEur(property.estimatedValue) },
                  { icon: Home, label: 'Einheiten', value: `${units.length}` },
                  { icon: Calendar, label: 'Monatsmiete', value: fmtEur(rentTotal) },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: '12px 14px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <s.icon size={11} color="#4B5563" />
                      <span style={{ fontSize: '10px', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F9FAFB', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            {!isNew && (
              <div style={{ display: 'flex', gap: '0', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '3px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {([
                  { key: 'grunddaten', label: 'Grunddaten' },
                  { key: 'einheiten', label: `Einheiten (${units.length})` },
                ] as { key: Tab; label: string }[]).map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
                      background: activeTab === tab.key ? 'rgba(212,168,67,0.12)' : 'transparent',
                      color: activeTab === tab.key ? '#D4A843' : '#4B5563',
                      boxShadow: activeTab === tab.key ? 'inset 0 1px 0 rgba(212,168,67,0.1)' : 'none',
                    }}
                  >{tab.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

            {/* GRUNDDATEN TAB */}
            {(isNew || activeTab === 'grunddaten') && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label>Objektname</Label>
                    <Input value={form.name} onChange={setField('name')} placeholder="z. B. Münchner Str. 12" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label>Vollständige Adresse</Label>
                    <Input value={form.address} onChange={setField('address')} placeholder="Straße, Hausnr., PLZ, Ort" />
                  </div>
                  <div>
                    <Label>Objekttyp</Label>
                    <Select value={form.type} onChange={setField('type')}>
                      {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onChange={setField('status')}>
                      {PROPERTY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Wohnfläche (m²)</Label>
                    <Input type="number" min={0} value={form.size} onChange={setField('size')} />
                  </div>
                  <div>
                    <Label>Baujahr</Label>
                    <Input type="number" min={1800} max={2030} value={form.yearBuilt} onChange={setField('yearBuilt')} />
                  </div>

                  {/* Divider */}
                  <div style={{ gridColumn: '1 / -1', height: '1px', background: 'rgba(255,255,255,0.04)', margin: '4px 0' }} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Finanzen</div>
                  </div>

                  <div>
                    <Label>Kaufpreis (€)</Label>
                    <Input type="number" min={0} value={form.purchasePrice} onChange={setField('purchasePrice')} />
                  </div>
                  <div>
                    <Label>Kaufjahr</Label>
                    <Input type="number" min={1950} max={2030} value={form.purchaseYear} onChange={setField('purchaseYear')} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label>Geschätzter Marktwert (€)</Label>
                    <Input type="number" min={0} value={form.estimatedValue} onChange={setField('estimatedValue')} />
                    {form.estimatedValue > 0 && form.purchasePrice > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: form.estimatedValue > form.purchasePrice ? '#10B981' : '#EF4444' }}>
                        {form.estimatedValue > form.purchasePrice ? '▲' : '▼'} {' '}
                        {((( form.estimatedValue - form.purchasePrice) / form.purchasePrice) * 100).toFixed(1)}% gegenüber Kaufpreis
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete zone */}
                {!isNew && (
                  <div style={{ marginTop: '28px', padding: '16px 20px', borderRadius: '10px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <AlertTriangle size={14} color="#EF4444" />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444' }}>Gefahrenzone</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px', lineHeight: 1.5 }}>
                      Das Löschen des Objekts entfernt alle Einheiten, zugehörigen Daten und kann nicht rückgängig gemacht werden.
                    </p>
                    {!showDeleteConfirm ? (
                      <button onClick={() => setShowDeleteConfirm(true)}
                        style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontWeight: 500 }}>
                        Objekt löschen
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 500 }}>Wirklich löschen?</span>
                        <button onClick={handleDelete} disabled={deleting}
                          style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                          {deleting ? '...' : 'Endgültig löschen'}
                        </button>
                        <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
                          Abbrechen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* EINHEITEN TAB */}
            {!isNew && activeTab === 'einheiten' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

                {/* Add unit form */}
                <AnimatePresence>
                  {addingUnit && (
                    <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -10, height: 0 }}
                      style={{ marginBottom: '16px', background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ padding: '16px 18px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#D4A843', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>Neue Einheit</div>
                        <UnitFormFields form={newUnit} onChange={setNewUnit} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setAddingUnit(false)} style={ghostBtnStyle}>Abbrechen</button>
                          <button onClick={handleAddUnit} disabled={unitBusy === 'new'} style={goldBtnStyle}>
                            {unitBusy === 'new' ? <Spinner /> : <><Check size={12} /> Hinzufügen</>}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Empty state */}
                {units.length === 0 && !addingUnit && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px' }}>
                    <Home size={28} color="#1F2937" style={{ margin: '0 auto 10px' }} />
                    <p style={{ fontSize: '13px', color: '#4B5563', marginBottom: '16px' }}>Noch keine Einheiten · Fügen Sie Wohnungen oder Etagen hinzu</p>
                    <button onClick={() => setAddingUnit(true)} style={goldBtnStyle}>
                      <Plus size={13} /> Erste Einheit hinzufügen
                    </button>
                  </div>
                )}

                {/* Units list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {units.map((unit, idx) => {
                    const sCfg = UNIT_STATUSES.find((s) => s.value === unit.status) ?? UNIT_STATUSES[1]
                    const isEditing = editingUnitId === unit.id
                    return (
                      <motion.div
                        key={unit.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        style={{ borderRadius: '12px', border: isEditing ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(255,255,255,0.06)', background: isEditing ? 'rgba(212,168,67,0.04)' : 'rgba(255,255,255,0.02)', overflow: 'hidden', transition: 'border-color 0.2s, background 0.2s' }}
                      >
                        {/* Unit header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${sCfg.color}14`, border: `1px solid ${sCfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: sCfg.color, fontFamily: 'monospace' }}>{unit.label}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB' }}>{unit.label}</span>
                              <span style={{ fontSize: '11px', color: '#4B5563' }}>{unit.size} m²</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', background: `${sCfg.color}14`, fontSize: '10px', fontWeight: 600, color: sCfg.color }}>
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sCfg.color }} />
                                {sCfg.label}
                              </span>
                            </div>
                            {unit.tenant && <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>{unit.tenant}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                            {unit.status === 'vermietet' && (
                              <span style={{ fontSize: '15px', fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtEur(unit.rentCold)}<span style={{ fontSize: '10px', fontWeight: 400, color: '#4B5563' }}>/Mo</span>
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <IconBtn icon={Pencil} onClick={() => isEditing ? setEditingUnitId(null) : beginEditUnit(unit)} active={isEditing} />
                              <IconBtn icon={Trash2} onClick={() => handleDeleteUnit(unit.id)} busy={unitBusy === unit.id} danger />
                            </div>
                          </div>
                        </div>

                        {/* Inline edit form */}
                        <AnimatePresence>
                          {isEditing && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={{ borderTop: '1px solid rgba(212,168,67,0.15)', padding: '16px', background: 'rgba(0,0,0,0.15)' }}>
                              <UnitFormFields form={editingUnit} onChange={setEditingUnit} />
                              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingUnitId(null)} style={ghostBtnStyle}>Abbrechen</button>
                                <button onClick={() => handleSaveUnit(unit.id)} disabled={unitBusy === unit.id} style={goldBtnStyle}>
                                  {unitBusy === unit.id ? <Spinner /> : <><Check size={12} /> Speichern</>}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Add unit button */}
                {units.length > 0 && !addingUnit && (
                  <button onClick={() => { setAddingUnit(true); setEditingUnitId(null); setNewUnit(emptyUnit()) }}
                    style={{ marginTop: '12px', width: '100%', padding: '12px', borderRadius: '10px', border: '1px dashed rgba(212,168,67,0.25)', background: 'transparent', color: '#D4A843', cursor: 'pointer', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,168,67,0.05)'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(212,168,67,0.25)' }}
                  >
                    <Plus size={14} /> Einheit hinzufügen
                  </button>
                )}

                {/* Summary card */}
                {units.length > 0 && (
                  <div style={{ marginTop: '20px', padding: '16px 18px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#4B5563', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Portfolio-Übersicht</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {[
                        { label: 'Gesamt', value: units.length.toString(), color: '#F9FAFB' },
                        { label: 'Vermietet', value: units.filter((u) => u.status === 'vermietet').length.toString(), color: '#10B981' },
                        { label: 'Monatsmiete', value: fmtEur(rentTotal), color: '#D4A843' },
                      ].map((s) => (
                        <div key={s.label}>
                          <div style={{ fontSize: '10px', color: '#4B5563', marginBottom: '3px' }}>{s.label}</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)' }}>
            <button onClick={onClose} style={ghostBtnStyle}>Abbrechen</button>
            {(isNew || activeTab === 'grunddaten') && (
              <button onClick={handleSave} disabled={saving} style={{ ...goldBtnStyle, padding: '9px 22px', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
                {saving ? <><Spinner /> Speichert...</> : <><Save size={14} /> {isNew ? 'Objekt erstellen' : 'Änderungen speichern'}</>}
              </button>
            )}
            {!isNew && activeTab === 'einheiten' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ChevronRight size={14} color="#4B5563" />
                <span style={{ fontSize: '12px', color: '#4B5563' }}>Einheiten werden sofort gespeichert</span>
              </div>
            )}
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}

// ─── Shared field sub-components ─────────────────────────────────────────────

function UnitFormFields({ form, onChange }: { form: UnitForm; onChange: (f: UnitForm) => void }) {
  const f = (key: keyof UnitForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
      <div>
        <Label>Bezeichnung</Label>
        <Input value={form.label} onChange={f('label')} placeholder="EG · 1.OG · DG" />
      </div>
      <div>
        <Label>Größe (m²)</Label>
        <Input type="number" min={0} value={form.size} onChange={f('size')} />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={form.status} onChange={f('status')}>
          {UNIT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <div>
        <Label>Kaltmiete (€/Mo)</Label>
        <Input type="number" min={0} value={form.rentCold} onChange={f('rentCold')} />
      </div>
      <div style={{ gridColumn: '2 / -1' }}>
        <Label>Mieter / Nutzung</Label>
        <Input value={form.tenant ?? ''} onChange={f('tenant')} placeholder="Name des Mieters" />
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '5px', fontWeight: 500 }}>{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="input-base"
      style={{ width: '100%', height: '36px', fontSize: '13px', padding: '0 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#F9FAFB', outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box', ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; props.onBlur?.(e) }}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="input-base"
      style={{ width: '100%', height: '36px', fontSize: '13px', padding: '0 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#F9FAFB', outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s', boxSizing: 'border-box', ...props.style }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; props.onBlur?.(e) }}
    />
  )
}

function IconBtn({ icon: Icon, onClick, active = false, danger = false, busy = false }: {
  icon: React.ElementType; onClick: () => void; active?: boolean; danger?: boolean; busy?: boolean
}) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{ width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${active ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.06)'}`, background: active ? 'rgba(212,168,67,0.1)' : 'transparent', color: active ? '#D4A843' : danger ? '#EF4444' : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: busy ? 0.5 : 1 }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    ><Icon size={13} /></button>
  )
}

function Spinner() {
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      style={{ width: '12px', height: '12px', border: '2px solid rgba(8,12,20,0.3)', borderTopColor: '#080C14', borderRadius: '50%' }} />
  )
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#9CA3AF', cursor: 'pointer',
}
const goldBtnStyle: React.CSSProperties = {
  padding: '8px 16px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: 'none',
  background: 'linear-gradient(135deg, #D4A843, #B8902E)', color: '#080C14', cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 12px rgba(212,168,67,0.25)',
}
