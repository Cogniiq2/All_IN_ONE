import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import {
  properties as mockProperties,
  invoices as mockInvoices,
  transactions as mockTransactions,
  loans as mockLoans,
  renovations as mockRenovations,
  suppliers as mockSuppliers,
  type Property,
  type PropertyUnit,
  type Invoice,
  type Transaction,
  type Loan,
  type Renovation,
  type Supplier,
} from '@/data/mockData'

// ─── Supabase row mappers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUnit(row: any): PropertyUnit {
  return {
    id: row.id,
    label: row.label,
    size: Number(row.size),
    status: row.status,
    rentCold: Number(row.rent_cold),
    tenant: row.tenant ?? undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProperty(row: any): Property {
  const units: PropertyUnit[] = (row.property_units ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map(rowToUnit)
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    type: row.type,
    purchasePrice: Number(row.purchase_price),
    estimatedValue: Number(row.estimated_value),
    size: Number(row.size),
    yearBuilt: Number(row.year_built),
    purchaseYear: Number(row.purchase_year),
    status: row.status,
    units,
    monthlyRent: units.filter((u) => u.status === 'vermietet').reduce((s, u) => s + u.rentCold, 0),
    loanIds: [],
  }
}

function computeRent(units: PropertyUnit[]): number {
  return units.filter((u) => u.status === 'vermietet').reduce((s, u) => s + u.rentCold, 0)
}

// ─── State ────────────────────────────────────────────────────────────────────

interface DataState {
  properties: Property[]
  propertiesLoaded: boolean
  invoices: Invoice[]
  transactions: Transaction[]
  loans: Loan[]
  renovations: Renovation[]
  suppliers: Supplier[]

  loadProperties: () => Promise<void>
  saveProperty: (property: Property) => Promise<void>
  createProperty: (data: Omit<Property, 'id' | 'units' | 'loanIds' | 'monthlyRent'>) => Promise<Property>
  removeProperty: (id: string) => Promise<void>
  createUnit: (propertyId: string, unit: Omit<PropertyUnit, 'id'>, sortOrder?: number) => Promise<PropertyUnit>
  saveUnit: (propertyId: string, unit: PropertyUnit) => Promise<void>
  removeUnit: (propertyId: string, unitId: string) => Promise<void>

  updateInvoice: (id: string, updates: Partial<Invoice>) => void
  approveInvoice: (id: string) => void
  deleteInvoice: (id: string) => void
  prependInvoice: (invoice: Invoice) => void

  updateTransaction: (id: string, updates: Partial<Transaction>) => void

  addSupplier: (supplier: Omit<Supplier, 'id'>) => void
  updateSupplier: (id: string, updates: Partial<Supplier>) => void
  deleteSupplier: (id: string) => void
}

export const useDataStore = create<DataState>((set, get) => ({
  properties: mockProperties,
  propertiesLoaded: false,
  invoices: mockInvoices,
  transactions: mockTransactions,
  loans: mockLoans,
  renovations: mockRenovations,
  suppliers: mockSuppliers,

  loadProperties: async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*, property_units(*)')
      .order('created_at')
    if (error) { console.error('loadProperties:', error.message); return }
    if (!data || data.length === 0) {
      await seedProperties()
      return get().loadProperties()
    }
    set({ properties: data.map(rowToProperty), propertiesLoaded: true })
  },

  saveProperty: async (property) => {
    const { error } = await supabase.from('properties').update({
      name: property.name, address: property.address, type: property.type,
      purchase_price: property.purchasePrice, estimated_value: property.estimatedValue,
      size: property.size, year_built: property.yearBuilt,
      purchase_year: property.purchaseYear, status: property.status,
    }).eq('id', property.id)
    if (error) throw new Error(error.message)
    set((s) => ({ properties: s.properties.map((p) => p.id === property.id ? { ...p, ...property } : p) }))
  },

  createProperty: async (data) => {
    const { data: row, error } = await supabase.from('properties').insert({
      name: data.name, address: data.address, type: data.type,
      purchase_price: data.purchasePrice, estimated_value: data.estimatedValue,
      size: data.size, year_built: data.yearBuilt,
      purchase_year: data.purchaseYear, status: data.status,
    }).select().single()
    if (error) throw new Error(error.message)
    const newProperty: Property = rowToProperty({ ...row, property_units: [] })
    set((s) => ({ properties: [...s.properties, newProperty] }))
    return newProperty
  },

  removeProperty: async (id) => {
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) throw new Error(error.message)
    set((s) => ({ properties: s.properties.filter((p) => p.id !== id) }))
  },

  createUnit: async (propertyId, unit, sortOrder = 0) => {
    const { data: row, error } = await supabase.from('property_units').insert({
      property_id: propertyId, label: unit.label, size: unit.size,
      status: unit.status, rent_cold: unit.rentCold,
      tenant: unit.tenant ?? null, sort_order: sortOrder,
    }).select().single()
    if (error) throw new Error(error.message)
    const newUnit = rowToUnit(row)
    set((s) => ({
      properties: s.properties.map((p) => p.id !== propertyId ? p : {
        ...p, units: [...p.units, newUnit], monthlyRent: computeRent([...p.units, newUnit]),
      }),
    }))
    return newUnit
  },

  saveUnit: async (propertyId, unit) => {
    const { error } = await supabase.from('property_units').update({
      label: unit.label, size: unit.size, status: unit.status,
      rent_cold: unit.rentCold, tenant: unit.tenant ?? null,
    }).eq('id', unit.id)
    if (error) throw new Error(error.message)
    set((s) => ({
      properties: s.properties.map((p) => {
        if (p.id !== propertyId) return p
        const units = p.units.map((u) => u.id === unit.id ? unit : u)
        return { ...p, units, monthlyRent: computeRent(units) }
      }),
    }))
  },

  removeUnit: async (propertyId, unitId) => {
    const { error } = await supabase.from('property_units').delete().eq('id', unitId)
    if (error) throw new Error(error.message)
    set((s) => ({
      properties: s.properties.map((p) => {
        if (p.id !== propertyId) return p
        const units = p.units.filter((u) => u.id !== unitId)
        return { ...p, units, monthlyRent: computeRent(units) }
      }),
    }))
  },

  updateInvoice: (id, updates) =>
    set((s) => ({ invoices: s.invoices.map((inv) => inv.id === id ? { ...inv, ...updates } : inv) })),
  approveInvoice: (id) =>
    set((s) => ({ invoices: s.invoices.map((inv) => inv.id === id ? { ...inv, status: 'bezahlt' as const } : inv) })),
  deleteInvoice: (id) =>
    set((s) => ({ invoices: s.invoices.filter((inv) => inv.id !== id) })),
  prependInvoice: (invoice) =>
    set((s) => ({ invoices: [invoice, ...s.invoices] })),

  updateTransaction: (id, updates) =>
    set((s) => ({ transactions: s.transactions.map((t) => t.id === id ? { ...t, ...updates } : t) })),

  addSupplier: (supplier) =>
    set((s) => ({ suppliers: [...s.suppliers, { ...supplier, id: `s${Date.now()}` }] })),
  updateSupplier: (id, updates) =>
    set((s) => ({ suppliers: s.suppliers.map((sup) => sup.id === id ? { ...sup, ...updates } : sup) })),
  deleteSupplier: (id) =>
    set((s) => ({ suppliers: s.suppliers.filter((sup) => sup.id !== id) })),
}))

async function seedProperties() {
  for (const prop of mockProperties) {
    const { data: row, error } = await supabase.from('properties').insert({
      name: prop.name, address: prop.address, type: prop.type,
      purchase_price: prop.purchasePrice, estimated_value: prop.estimatedValue,
      size: prop.size, year_built: prop.yearBuilt,
      purchase_year: prop.purchaseYear, status: prop.status,
    }).select().single()
    if (error || !row) continue
    for (let i = 0; i < prop.units.length; i++) {
      const u = prop.units[i]
      await supabase.from('property_units').insert({
        property_id: row.id, label: u.label, size: u.size,
        status: u.status, rent_cold: u.rentCold, tenant: u.tenant ?? null, sort_order: i,
      })
    }
  }
}
