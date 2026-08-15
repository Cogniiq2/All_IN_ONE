// All mock data for German real estate management system

export interface PropertyUnit {
  id: string
  label: string
  size: number
  status: 'vermietet' | 'leerstand' | 'renovierung'
  rentCold: number
  tenant?: string
}

export interface Property {
  id: string
  name: string
  address: string
  type: 'wohnhaus' | 'eigentumswohnung' | 'mehrfamilienhaus'
  purchasePrice: number
  estimatedValue: number
  size: number
  yearBuilt: number
  purchaseYear: number
  status: 'aktiv' | 'renovierung' | 'leerstand'
  units: PropertyUnit[]
  monthlyRent: number
  loanIds: string[]
}

export interface Supplier {
  id: string
  name: string
  type: 'versorger' | 'handwerker' | 'versicherung' | 'bank' | 'behoerde' | 'steuerberater'
  defaultCategory: string
  iban?: string
  trusted: boolean
}

export interface Invoice {
  id: string
  number: string
  supplierId: string
  supplierName: string
  propertyId: string
  propertyName: string
  category: string
  categoryColor: string
  date: string
  dueDate: string
  amountNet: number
  vatRate: number
  amountGross: number
  status: 'bezahlt' | 'ausstehend' | 'ueberfaellig' | 'zu_pruefen' | 'storniert'
  aiConfidence: number
  aiModel: string
  notes?: string
  renovationId?: string
}

export interface Transaction {
  id: string
  date: string
  valueDate: string
  counterparty: string
  purpose: string
  propertyId?: string
  propertyName?: string
  category: string
  amount: number
  linkedInvoiceId?: string
  status: 'abgeglichen' | 'offen' | 'manuell'
}

export interface Loan {
  id: string
  bankName: string
  loanNumber: string
  propertyId: string
  propertyName: string
  originalAmount: number
  remainingAmount: number
  monthlyRate: number
  interestRate: number
  fixedRateUntil: string
  nextPaymentDate: string
  startDate: string
}

export interface Renovation {
  id: string
  name: string
  propertyId: string
  propertyName: string
  status: 'in_bearbeitung' | 'abgeschlossen' | 'geplant'
  budget: number
  spent: number
  startDate: string
  endDate: string
  linkedInvoiceIds: string[]
  onTrack: boolean
}

export interface CashflowEntry {
  month: string
  einnahmen: number
  ausgaben: number
}

export interface UtilityEntry {
  month: string
  value: number
}

// ─── PROPERTIES ───────────────────────────────────────────────────

export const properties: Property[] = [
  {
    id: 'p1',
    name: 'Beispiel 1',
    address: 'Musterstraße 1, 00000 Musterstadt',
    type: 'wohnhaus',
    purchasePrice: 280000,
    estimatedValue: 340000,
    size: 120,
    yearBuilt: 1972,
    purchaseYear: 2018,
    status: 'aktiv',
    units: [
      { id: 'u1', label: 'EG', size: 60, status: 'vermietet', rentCold: 650, tenant: 'Erika Mustermann' },
      { id: 'u2', label: '1.OG', size: 60, status: 'vermietet', rentCold: 680, tenant: 'Max Mustermann' },
    ],
    monthlyRent: 1330,
    loanIds: ['l1'],
  },
  {
    id: 'p2',
    name: 'Beispiel 2',
    address: 'Musterstraße 2, 00000 Musterstadt',
    type: 'mehrfamilienhaus',
    purchasePrice: 320000,
    estimatedValue: 395000,
    size: 180,
    yearBuilt: 1985,
    purchaseYear: 2015,
    status: 'aktiv',
    units: [
      { id: 'u3', label: 'EG', size: 65, status: 'vermietet', rentCold: 700, tenant: 'Lena Beispiel' },
      { id: 'u4', label: '1.OG', size: 65, status: 'vermietet', rentCold: 720, tenant: 'Jonas Beispiel' },
      { id: 'u5', label: '2.OG', size: 50, status: 'leerstand', rentCold: 550 },
    ],
    monthlyRent: 1420,
    loanIds: ['l2'],
  },
  {
    id: 'p3',
    name: 'Beispiel 3',
    address: 'Musterstraße 3, 00000 Musterstadt',
    type: 'wohnhaus',
    purchasePrice: 195000,
    estimatedValue: 230000,
    size: 90,
    yearBuilt: 1960,
    purchaseYear: 2022,
    status: 'renovierung',
    units: [
      { id: 'u6', label: 'EG', size: 45, status: 'renovierung', rentCold: 450 },
      { id: 'u7', label: '1.OG', size: 45, status: 'leerstand', rentCold: 450 },
    ],
    monthlyRent: 0,
    loanIds: [],
  },
]

// ─── SUPPLIERS ─────────────────────────────────────────────────────

export const suppliers: Supplier[] = [
  { id: 's1', name: 'Beispiel 4', type: 'versorger', defaultCategory: 'Heizöl', iban: 'DE00 0000 0000 0000 0000 00', trusted: true },
  { id: 's2', name: 'Beispiel 5', type: 'versorger', defaultCategory: 'Strom/Gas', iban: 'DE00 0000 0000 0000 0000 00', trusted: true },
  { id: 's3', name: 'Beispiel 6', type: 'versicherung', defaultCategory: 'Versicherung', trusted: true },
  { id: 's4', name: 'Beispiel 7', type: 'bank', defaultCategory: 'Darlehen', iban: 'DE00 0000 0000 0000 0000 00', trusted: true },
  { id: 's5', name: 'Beispiel 8', type: 'handwerker', defaultCategory: 'Handwerker', trusted: true },
  { id: 's6', name: 'Beispiel 9', type: 'handwerker', defaultCategory: 'Handwerker', trusted: false },
  { id: 's7', name: 'Beispiel 10', type: 'behoerde', defaultCategory: 'Steuern', trusted: true },
  { id: 's8', name: 'Beispiel 11', type: 'steuerberater', defaultCategory: 'Steuerberatung', trusted: true },
]

// ─── INVOICES ──────────────────────────────────────────────────────

export const invoices: Invoice[] = [
  {
    id: 'i1', number: 'RE-2025-004421', supplierId: 's1', supplierName: 'Beispielhandel AG',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Heizöl', categoryColor: '#F59E0B',
    date: '2025-11-03', dueDate: '2025-11-24',
    amountNet: 3269.75, vatRate: 19, amountGross: 3890.99,
    status: 'bezahlt', aiConfidence: 0.97, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i2', number: 'RE-2025-004398', supplierId: 's2', supplierName: 'Beispielversorger Musterstadt',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Strom', categoryColor: '#F59E0B',
    date: '2025-10-28', dueDate: '2025-11-18',
    amountNet: 318.49, vatRate: 19, amountGross: 379.00,
    status: 'bezahlt', aiConfidence: 0.99, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i3', number: 'RE-2025-004502', supplierId: 's5', supplierName: 'Heizungsbauer Müller GmbH',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Handwerker', categoryColor: '#3B82F6',
    date: '2025-11-15', dueDate: '2025-12-05',
    amountNet: 11789.00, vatRate: 19, amountGross: 14229.80,
    status: 'zu_pruefen', aiConfidence: 0.73, aiModel: 'GPT-4o mini',
    renovationId: 'r1',
  },
  {
    id: 'i4', number: 'RE-2025-004477', supplierId: 's3', supplierName: 'Beispielversicherung Versicherung',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Versicherung', categoryColor: '#10B981',
    date: '2025-10-01', dueDate: '2025-10-31',
    amountNet: 1176.47, vatRate: 19, amountGross: 1400.00,
    status: 'bezahlt', aiConfidence: 0.95, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i5', number: 'RE-2025-004531', supplierId: 's6', supplierName: 'Elektro Schmidt',
    propertyId: 'p3', propertyName: 'Bahnhofstr. 3',
    category: 'Handwerker', categoryColor: '#3B82F6',
    date: '2025-11-20', dueDate: '2025-12-10',
    amountNet: 2142.86, vatRate: 19, amountGross: 2550.00,
    status: 'zu_pruefen', aiConfidence: 0.61, aiModel: 'GPT-4o mini',
    renovationId: 'r2',
  },
  {
    id: 'i6', number: 'RE-2025-004388', supplierId: 's2', supplierName: 'Beispielversorger Musterstadt',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Gas', categoryColor: '#EF4444',
    date: '2025-10-05', dueDate: '2025-10-26',
    amountNet: 222.69, vatRate: 19, amountGross: 265.00,
    status: 'ueberfaellig', aiConfidence: 0.98, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i7', number: 'RE-2025-004560', supplierId: 's5', supplierName: 'Heizungsbauer Müller GmbH',
    propertyId: 'p3', propertyName: 'Bahnhofstr. 3',
    category: 'Handwerker', categoryColor: '#3B82F6',
    date: '2025-11-25', dueDate: '2025-12-15',
    amountNet: 12242.86, vatRate: 19, amountGross: 14569.00,
    status: 'zu_pruefen', aiConfidence: 0.55, aiModel: 'GPT-4o mini',
    renovationId: 'r2',
  },
  {
    id: 'i8', number: 'RE-2025-004312', supplierId: 's8', supplierName: 'BIMA Steuerberatung',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Steuerberatung', categoryColor: '#8B5CF6',
    date: '2025-09-30', dueDate: '2025-10-21',
    amountNet: 756.30, vatRate: 19, amountGross: 900.00,
    status: 'bezahlt', aiConfidence: 0.89, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i9', number: 'RE-2025-004590', supplierId: 's7', supplierName: 'Behoerde Musterstadt',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Steuern', categoryColor: '#EF4444',
    date: '2025-12-01', dueDate: '2025-12-31',
    amountNet: 2100.00, vatRate: 0, amountGross: 2100.00,
    status: 'ausstehend', aiConfidence: 0.91, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i10', number: 'RE-2025-004221', supplierId: 's1', supplierName: 'Beispielhandel AG',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Heizöl', categoryColor: '#F59E0B',
    date: '2025-09-12', dueDate: '2025-10-03',
    amountNet: 2714.29, vatRate: 19, amountGross: 3231.00,
    status: 'bezahlt', aiConfidence: 0.96, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i11', number: 'RE-2025-004105', supplierId: 's3', supplierName: 'Beispielversicherung Versicherung',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Versicherung', categoryColor: '#10B981',
    date: '2025-07-01', dueDate: '2025-07-31',
    amountNet: 840.34, vatRate: 19, amountGross: 1000.00,
    status: 'bezahlt', aiConfidence: 0.94, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i12', number: 'RE-2025-004610', supplierId: 's6', supplierName: 'Elektro Schmidt',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Handwerker', categoryColor: '#3B82F6',
    date: '2025-12-03', dueDate: '2025-12-24',
    amountNet: 672.27, vatRate: 19, amountGross: 800.00,
    status: 'ausstehend', aiConfidence: 0.79, aiModel: 'GPT-4o mini',
  },
]

// ─── TRANSACTIONS ──────────────────────────────────────────────────

export const transactions: Transaction[] = [
  { id: 't1', date: '2025-11-28', valueDate: '2025-11-28', counterparty: 'Familie Beispielperson', purpose: 'Miete November 2025 EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't2', date: '2025-11-28', valueDate: '2025-11-28', counterparty: 'H. Beispielperson', purpose: 'Miete November 2025 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't3', date: '2025-11-27', valueDate: '2025-11-27', counterparty: 'Frau Meier', purpose: 'Miete November EG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 700, status: 'abgeglichen' },
  { id: 't4', date: '2025-11-27', valueDate: '2025-11-27', counterparty: 'Familie Koch', purpose: 'Miete November 1.OG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 720, status: 'abgeglichen' },
  { id: 't5', date: '2025-11-15', valueDate: '2025-11-17', counterparty: 'Beispielbank Musterstadt', purpose: 'Darlehen Rate Mrz-Nov 2025 Kto. 123456', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Darlehen', amount: -983, status: 'abgeglichen', linkedInvoiceId: undefined },
  { id: 't6', date: '2025-11-15', valueDate: '2025-11-17', counterparty: 'HypoVereinsbank', purpose: 'Darlehensrate November 2025', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Darlehen', amount: -1187, status: 'abgeglichen' },
  { id: 't7', date: '2025-11-10', valueDate: '2025-11-12', counterparty: 'Beispielhandel AG', purpose: 'Heizöl Lieferung RE-2025-004421', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Heizöl', amount: -3890.99, linkedInvoiceId: 'i1', status: 'abgeglichen' },
  { id: 't8', date: '2025-11-05', valueDate: '2025-11-05', counterparty: 'Beispielversorger Musterstadt', purpose: 'Strom Oktober RE-2025-004398', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Strom', amount: -379.00, linkedInvoiceId: 'i2', status: 'abgeglichen' },
  { id: 't9', date: '2025-10-28', valueDate: '2025-10-28', counterparty: 'Familie Beispielperson', purpose: 'Miete Oktober 2025 EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't10', date: '2025-10-28', valueDate: '2025-10-28', counterparty: 'H. Beispielperson', purpose: 'Miete Oktober 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't11', date: '2025-10-27', valueDate: '2025-10-27', counterparty: 'Frau Meier', purpose: 'Miete Oktober EG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 700, status: 'abgeglichen' },
  { id: 't12', date: '2025-10-27', valueDate: '2025-10-27', counterparty: 'Familie Koch', purpose: 'Miete Oktober 1.OG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 720, status: 'abgeglichen' },
  { id: 't13', date: '2025-10-15', valueDate: '2025-10-17', counterparty: 'Beispielbank Musterstadt', purpose: 'Darlehensrate Oktober 2025', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Darlehen', amount: -983, status: 'abgeglichen' },
  { id: 't14', date: '2025-10-15', valueDate: '2025-10-17', counterparty: 'HypoVereinsbank', purpose: 'Darlehensrate Oktober 2025', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Darlehen', amount: -1187, status: 'abgeglichen' },
  { id: 't15', date: '2025-10-10', valueDate: '2025-10-12', counterparty: 'Beispielversicherung Versicherung', purpose: 'Jahresbeitrag Haftpflicht RE-2025-004477', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Versicherung', amount: -1400.00, linkedInvoiceId: 'i4', status: 'abgeglichen' },
  { id: 't16', date: '2025-10-05', valueDate: '2025-10-05', counterparty: 'Beispielversorger Musterstadt', purpose: 'Gas September RE-2025-004388', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Gas', amount: -265.00, linkedInvoiceId: 'i6', status: 'offen' },
  { id: 't17', date: '2025-09-28', valueDate: '2025-09-28', counterparty: 'Familie Beispielperson', purpose: 'Miete September EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't18', date: '2025-09-28', valueDate: '2025-09-28', counterparty: 'H. Beispielperson', purpose: 'Miete September 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't19', date: '2025-09-15', valueDate: '2025-09-15', counterparty: 'Beispielhandel AG', purpose: 'Heizöl Kulmbacher Str. 8', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Heizöl', amount: -3231.00, linkedInvoiceId: 'i10', status: 'abgeglichen' },
  { id: 't20', date: '2025-09-30', valueDate: '2025-10-02', counterparty: 'BIMA Steuerberatung', purpose: 'Steuerberatung Q3 2025', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Steuerberatung', amount: -900.00, linkedInvoiceId: 'i8', status: 'abgeglichen' },
]

// ─── LOANS ─────────────────────────────────────────────────────────

export const loans: Loan[] = [
  {
    id: 'l1', bankName: 'Beispielbank Musterstadt', loanNumber: 'DAR-2018-00882',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    originalAmount: 180000, remainingAmount: 142000,
    monthlyRate: 983, interestRate: 1.85,
    fixedRateUntil: '2027-06-30', nextPaymentDate: '2025-12-15', startDate: '2018-07-01',
  },
  {
    id: 'l2', bankName: 'HypoVereinsbank', loanNumber: 'DAR-2015-04412',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    originalAmount: 220000, remainingAmount: 195000,
    monthlyRate: 1187, interestRate: 2.30,
    fixedRateUntil: '2028-03-31', nextPaymentDate: '2025-12-15', startDate: '2015-04-01',
  },
  {
    id: 'l3', bankName: 'Deutsche Bank', loanNumber: 'DAR-2022-09912',
    propertyId: 'p3', propertyName: 'Bahnhofstr. 3',
    originalAmount: 148000, remainingAmount: 148000,
    monthlyRate: 0, interestRate: 3.20,
    fixedRateUntil: '2032-12-31', nextPaymentDate: '2026-01-15', startDate: '2022-09-01',
  },
]

// ─── RENOVATIONS ───────────────────────────────────────────────────

export const renovations: Renovation[] = [
  {
    id: 'r1', name: 'Beispiel 12',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    status: 'in_bearbeitung', budget: 18500, spent: 14229.80,
    startDate: '2025-08-01', endDate: '2025-12-31',
    linkedInvoiceIds: ['i3'], onTrack: true,
  },
  {
    id: 'r2', name: 'Beispiel 13',
    propertyId: 'p3', propertyName: 'Bahnhofstr. 3',
    status: 'in_bearbeitung', budget: 45000, spent: 14569.00,
    startDate: '2025-09-15', endDate: '2026-04-30',
    linkedInvoiceIds: ['i5', 'i7'], onTrack: false,
  },
  {
    id: 'r3', name: 'Beispiel 14',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    status: 'abgeschlossen', budget: 8200, spent: 7890,
    startDate: '2024-05-01', endDate: '2024-08-31',
    linkedInvoiceIds: [], onTrack: true,
  },
]

// ─── CASHFLOW DATA ─────────────────────────────────────────────────

export const cashflowData: CashflowEntry[] = [
  { month: 'Jan', einnahmen: 2750, ausgaben: 3120 },
  { month: 'Feb', einnahmen: 2750, ausgaben: 2890 },
  { month: 'Mär', einnahmen: 2750, ausgaben: 4230 },
  { month: 'Apr', einnahmen: 3200, ausgaben: 2640 },
  { month: 'Mai', einnahmen: 3200, ausgaben: 3890 },
  { month: 'Jun', einnahmen: 3200, ausgaben: 4872 },
]

// ─── UTILITY DATA ──────────────────────────────────────────────────

export const utilityData: Record<string, UtilityEntry[]> = {
  strom: [
    { month: 'Jan', value: 412 }, { month: 'Feb', value: 398 }, { month: 'Mär', value: 365 },
    { month: 'Apr', value: 289 }, { month: 'Mai', value: 244 }, { month: 'Jun', value: 231 },
    { month: 'Jul', value: 198 }, { month: 'Aug', value: 205 }, { month: 'Sep', value: 278 },
    { month: 'Okt', value: 334 }, { month: 'Nov', value: 379 }, { month: 'Dez', value: 421 },
  ],
  gas: [
    { month: 'Jan', value: 542 }, { month: 'Feb', value: 488 }, { month: 'Mär', value: 412 },
    { month: 'Apr', value: 198 }, { month: 'Mai', value: 89 }, { month: 'Jun', value: 74 },
    { month: 'Jul', value: 62 }, { month: 'Aug', value: 68 }, { month: 'Sep', value: 145 },
    { month: 'Okt', value: 312 }, { month: 'Nov', value: 265 }, { month: 'Dez', value: 498 },
  ],
  wasser: [
    { month: 'Jan', value: 89 }, { month: 'Feb', value: 91 }, { month: 'Mär', value: 88 },
    { month: 'Apr', value: 95 }, { month: 'Mai', value: 102 }, { month: 'Jun', value: 108 },
    { month: 'Jul', value: 115 }, { month: 'Aug', value: 112 }, { month: 'Sep', value: 98 },
    { month: 'Okt', value: 94 }, { month: 'Nov', value: 91 }, { month: 'Dez', value: 86 },
  ],
  heizoel: [
    { month: 'Jan', value: 0 }, { month: 'Feb', value: 0 }, { month: 'Mär', value: 0 },
    { month: 'Apr', value: 0 }, { month: 'Mai', value: 0 }, { month: 'Jun', value: 0 },
    { month: 'Jul', value: 3231 }, { month: 'Aug', value: 0 }, { month: 'Sep', value: 0 },
    { month: 'Okt', value: 0 }, { month: 'Nov', value: 3891 }, { month: 'Dez', value: 0 },
  ],
  internet: [
    { month: 'Jan', value: 89 }, { month: 'Feb', value: 89 }, { month: 'Mär', value: 89 },
    { month: 'Apr', value: 89 }, { month: 'Mai', value: 89 }, { month: 'Jun', value: 89 },
    { month: 'Jul', value: 89 }, { month: 'Aug', value: 89 }, { month: 'Sep', value: 89 },
    { month: 'Okt', value: 89 }, { month: 'Nov', value: 89 }, { month: 'Dez', value: 89 },
  ],
  muell: [
    { month: 'Jan', value: 45 }, { month: 'Feb', value: 45 }, { month: 'Mär', value: 45 },
    { month: 'Apr', value: 45 }, { month: 'Mai', value: 45 }, { month: 'Jun', value: 45 },
    { month: 'Jul', value: 45 }, { month: 'Aug', value: 45 }, { month: 'Sep', value: 45 },
    { month: 'Okt', value: 45 }, { month: 'Nov', value: 45 }, { month: 'Dez', value: 45 },
  ],
}

// ─── EMAIL TYPES ──────────────────────────────────────────────────────────────

export interface EmailAccount {
  id: string
  email_address: string
  display_name: string
  provider: string
  color: string
  is_active: boolean
}

export interface Email {
  id: string
  account_email: string
  account_display_name: string
  account_color: string
  message_id: string
  from_email: string
  from_name: string
  subject: string
  body_text: string
  body_preview: string
  received_at: string
  has_attachments: boolean
  attachment_count: number
  is_processed: boolean
  is_read: boolean
  invoice_id?: string
  supplier_name?: string
  property_id?: string
  created_at: string
}

export interface EmailAttachment {
  id: string
  email_id: string
  file_name: string
  file_path: string
  mime_type: string
  file_size_bytes: number
  is_invoice: boolean
  invoice_id?: string
  created_at: string
}

// ─── EMAIL ACCOUNTS ───────────────────────────────────────────────────────────

export const emailAccounts: EmailAccount[] = [
  { id: 'ea1', email_address: 'Musterstraße 4, 00000 Musterstadt',          display_name: 'Hauptkonto',     provider: 'imap', color: '#1D4ED8', is_active: true },
  { id: 'ea2', email_address: 'Musterstraße 5, 00000 Musterstadt',    display_name: 'Verwaltung',     provider: 'imap', color: '#7C3AED', is_active: true },
  { id: 'ea3', email_address: 'Musterstraße 6, 00000 Musterstadt',   display_name: 'Buchhaltung',    provider: 'imap', color: '#059669', is_active: true },
  { id: 'ea4', email_address: 'Musterstraße 7, 00000 Musterstadt',  display_name: 'Münchner Str.',  provider: 'imap', color: '#D97706', is_active: true },
  { id: 'ea5', email_address: 'Musterstraße 8, 00000 Musterstadt', display_name: 'Kulmbacher Str.',provider: 'imap', color: '#DC2626', is_active: true },
  { id: 'ea6', email_address: 'Musterstraße 9, 00000 Musterstadt',    display_name: 'Bahnhofstr.',    provider: 'imap', color: '#0891B2', is_active: true },
]

// Helper: date offset from now
function daysAgo(d: number, hoursAgo = 0): string {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  dt.setHours(dt.getHours() - hoursAgo)
  return dt.toISOString()
}

// ─── MOCK EMAILS ──────────────────────────────────────────────────────────────

export const emails: Email[] = [
  {
    id: 'em1', account_email: 'fixture01@example.com', account_display_name: 'Postfach 1', account_color: '#1D4ED8',
    message_id: 'fixture07@example.com', from_email: 'fixture08@example.com', from_name: 'Absender 1',
    subject: 'Beispielbetreff 1',
    body_text: 'Synthetischer Beispieltext 1. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 1.',
    received_at: daysAgo(0, 2), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 1', created_at: daysAgo(0, 2),
  },
  {
    id: 'em2', account_email: 'fixture02@example.com', account_display_name: 'Postfach 2', account_color: '#7C3AED',
    message_id: 'fixture09@example.com', from_email: 'fixture10@example.com', from_name: 'Absender 2',
    subject: 'Beispielbetreff 2',
    body_text: 'Synthetischer Beispieltext 2. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 2.',
    received_at: daysAgo(1), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'Lieferant 2', created_at: daysAgo(1),
  },
  {
    id: 'em3', account_email: 'fixture03@example.com', account_display_name: 'Postfach 3', account_color: '#059669',
    message_id: 'fixture11@example.com', from_email: 'fixture12@example.com', from_name: 'Absender 3',
    subject: 'Beispielbetreff 3',
    body_text: 'Synthetischer Beispieltext 3. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 3.',
    received_at: daysAgo(2), has_attachments: true, attachment_count: 2, is_processed: true, is_read: true,
    supplier_name: 'Lieferant 3', invoice_id: 'inv-processed-1', created_at: daysAgo(2),
  },
  {
    id: 'em4', account_email: 'fixture04@example.com', account_display_name: 'Postfach 4', account_color: '#D97706',
    message_id: 'fixture13@example.com', from_email: 'fixture14@example.com', from_name: 'Absender 4',
    subject: 'Beispielbetreff 4',
    body_text: 'Synthetischer Beispieltext 4. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 4.',
    received_at: daysAgo(3), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    created_at: daysAgo(3),
  },
  {
    id: 'em5', account_email: 'fixture01@example.com', account_display_name: 'Postfach 5', account_color: '#1D4ED8',
    message_id: 'fixture15@example.com', from_email: 'fixture16@example.com', from_name: 'Absender 5',
    subject: 'Beispielbetreff 5',
    body_text: 'Synthetischer Beispieltext 5. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 5.',
    received_at: daysAgo(4), has_attachments: false, attachment_count: 0, is_processed: false, is_read: true,
    created_at: daysAgo(4),
  },
  {
    id: 'em6', account_email: 'fixture02@example.com', account_display_name: 'Postfach 6', account_color: '#7C3AED',
    message_id: 'fixture17@example.com', from_email: 'fixture18@example.com', from_name: 'Absender 6',
    subject: 'Beispielbetreff 6',
    body_text: 'Synthetischer Beispieltext 6. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 6.',
    received_at: daysAgo(5), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 4', created_at: daysAgo(5),
  },
  {
    id: 'em7', account_email: 'fixture03@example.com', account_display_name: 'Postfach 7', account_color: '#059669',
    message_id: 'fixture19@example.com', from_email: 'fixture20@example.com', from_name: 'Absender 7',
    subject: 'Beispielbetreff 7',
    body_text: 'Synthetischer Beispieltext 7. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 7.',
    received_at: daysAgo(6), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(6),
  },
  {
    id: 'em8', account_email: 'fixture05@example.com', account_display_name: 'Postfach 8', account_color: '#DC2626',
    message_id: 'fixture21@example.com', from_email: 'fixture22@example.com', from_name: 'Absender 8',
    subject: 'Beispielbetreff 8',
    body_text: 'Synthetischer Beispieltext 8. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 8.',
    received_at: daysAgo(7), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 5', created_at: daysAgo(7),
  },
  {
    id: 'em9', account_email: 'fixture01@example.com', account_display_name: 'Postfach 9', account_color: '#1D4ED8',
    message_id: 'fixture23@example.com', from_email: 'fixture24@example.com', from_name: 'Absender 9',
    subject: 'Beispielbetreff 9',
    body_text: 'Synthetischer Beispieltext 9. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 9.',
    received_at: daysAgo(7), has_attachments: true, attachment_count: 1, is_processed: true, is_read: true,
    supplier_name: 'Lieferant 6', invoice_id: 'inv-processed-2', created_at: daysAgo(7),
  },
  {
    id: 'em10', account_email: 'fixture06@example.com', account_display_name: 'Postfach 10', account_color: '#0891B2',
    message_id: 'fixture25@example.com', from_email: 'fixture26@example.com', from_name: 'Absender 10',
    subject: 'Beispielbetreff 10',
    body_text: 'Synthetischer Beispieltext 10. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 10.',
    received_at: daysAgo(8), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(8),
  },
  {
    id: 'em11', account_email: 'fixture02@example.com', account_display_name: 'Postfach 11', account_color: '#7C3AED',
    message_id: 'fixture27@example.com', from_email: 'fixture28@example.com', from_name: 'Absender 11',
    subject: 'Beispielbetreff 11',
    body_text: 'Synthetischer Beispieltext 11. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 11.',
    received_at: daysAgo(8), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 7', created_at: daysAgo(8),
  },
  {
    id: 'em12', account_email: 'fixture04@example.com', account_display_name: 'Postfach 12', account_color: '#D97706',
    message_id: 'fixture29@example.com', from_email: 'fixture10@example.com', from_name: 'Absender 12',
    subject: 'Beispielbetreff 12',
    body_text: 'Synthetischer Beispieltext 12. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 12.',
    received_at: daysAgo(9), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'Lieferant 8', created_at: daysAgo(9),
  },
  {
    id: 'em13', account_email: 'fixture03@example.com', account_display_name: 'Postfach 13', account_color: '#059669',
    message_id: 'fixture30@example.com', from_email: 'fixture31@example.com', from_name: 'Absender 13',
    subject: 'Beispielbetreff 13',
    body_text: 'Synthetischer Beispieltext 13. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 13.',
    received_at: daysAgo(10), has_attachments: true, attachment_count: 1, is_processed: true, is_read: true,
    supplier_name: 'Lieferant 9', invoice_id: 'inv-processed-3', created_at: daysAgo(10),
  },
  {
    id: 'em14', account_email: 'fixture01@example.com', account_display_name: 'Postfach 14', account_color: '#1D4ED8',
    message_id: 'fixture32@example.com', from_email: 'fixture08@example.com', from_name: 'Absender 14',
    subject: 'Beispielbetreff 14',
    body_text: 'Synthetischer Beispieltext 14. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 14.',
    received_at: daysAgo(10), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 10', created_at: daysAgo(10),
  },
  {
    id: 'em15', account_email: 'fixture05@example.com', account_display_name: 'Postfach 15', account_color: '#DC2626',
    message_id: 'fixture33@example.com', from_email: 'fixture34@example.com', from_name: 'Absender 15',
    subject: 'Beispielbetreff 15',
    body_text: 'Synthetischer Beispieltext 15. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 15.',
    received_at: daysAgo(11), has_attachments: true, attachment_count: 2, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 11', created_at: daysAgo(11),
  },
  {
    id: 'em16', account_email: 'fixture02@example.com', account_display_name: 'Postfach 16', account_color: '#7C3AED',
    message_id: 'fixture35@example.com', from_email: 'fixture36@example.com', from_name: 'Absender 16',
    subject: 'Beispielbetreff 16',
    body_text: 'Synthetischer Beispieltext 16. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 16.',
    received_at: daysAgo(11), has_attachments: false, attachment_count: 0, is_processed: false, is_read: true,
    created_at: daysAgo(11),
  },
  {
    id: 'em17', account_email: 'fixture06@example.com', account_display_name: 'Postfach 17', account_color: '#0891B2',
    message_id: 'fixture37@example.com', from_email: 'fixture38@example.com', from_name: 'Absender 17',
    subject: 'Beispielbetreff 17',
    body_text: 'Synthetischer Beispieltext 17. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 17.',
    received_at: daysAgo(12), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(12),
  },
  {
    id: 'em18', account_email: 'fixture03@example.com', account_display_name: 'Postfach 18', account_color: '#059669',
    message_id: 'fixture39@example.com', from_email: 'fixture40@example.com', from_name: 'Absender 18',
    subject: 'Beispielbetreff 18',
    body_text: 'Synthetischer Beispieltext 18. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 18.',
    received_at: daysAgo(13), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Lieferant 12', created_at: daysAgo(13),
  },
  {
    id: 'em19', account_email: 'fixture04@example.com', account_display_name: 'Postfach 19', account_color: '#D97706',
    message_id: 'fixture41@example.com', from_email: 'fixture42@example.com', from_name: 'Absender 19',
    subject: 'Beispielbetreff 19',
    body_text: 'Synthetischer Beispieltext 19. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 19.',
    received_at: daysAgo(13), has_attachments: false, attachment_count: 0, is_processed: false, is_read: false,
    created_at: daysAgo(13),
  },
  {
    id: 'em20', account_email: 'fixture01@example.com', account_display_name: 'Postfach 20', account_color: '#1D4ED8',
    message_id: 'fixture43@example.com', from_email: 'fixture44@example.com', from_name: 'Absender 20',
    subject: 'Beispielbetreff 20',
    body_text: 'Synthetischer Beispieltext 20. Keine echten Daten.',
    body_preview: 'Synthetischer Beispieltext 20.',
    received_at: daysAgo(14), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'Lieferant 13', created_at: daysAgo(14),
  },
]

// ─── MOCK ATTACHMENTS ─────────────────────────────────────────────────────────

export const emailAttachments: EmailAttachment[] = [
  { id: 'att1',  email_id: 'em1',  file_name: 'beispiel-dokument-1.pdf',       file_path: 'raw/2026/01/beispiel-1.pdf',       mime_type: 'application/pdf', file_size_bytes: 187432, is_invoice: true,  created_at: daysAgo(0, 2) },
  { id: 'att2',  email_id: 'em2',  file_name: 'beispiel-dokument-2.pdf',          file_path: 'raw/2026/01/beispiel-2.pdf',          mime_type: 'application/pdf', file_size_bytes: 94210,  is_invoice: true,  created_at: daysAgo(1) },
  { id: 'att3a', email_id: 'em3',  file_name: 'beispiel-dokument-3.pdf',           file_path: 'raw/2026/01/beispiel-3.pdf',           mime_type: 'application/pdf', file_size_bytes: 312880, is_invoice: true,  invoice_id: 'inv-processed-1', created_at: daysAgo(2) },
  { id: 'att3b', email_id: 'em3',  file_name: 'beispiel-dokument-4.pdf',      file_path: 'raw/2026/01/beispiel-4.pdf',      mime_type: 'application/pdf', file_size_bytes: 201440, is_invoice: false, invoice_id: 'inv-processed-1', created_at: daysAgo(2) },
  { id: 'att4',  email_id: 'em4',  file_name: 'beispiel-dokument-5.pdf',        file_path: 'raw/2026/01/beispiel-5.pdf',        mime_type: 'application/pdf', file_size_bytes: 145320, is_invoice: false, created_at: daysAgo(3) },
  { id: 'att6',  email_id: 'em6',  file_name: 'beispiel-dokument-6.pdf',     file_path: 'raw/2026/01/beispiel-6.pdf',     mime_type: 'application/pdf', file_size_bytes: 98760,  is_invoice: true,  created_at: daysAgo(5) },
  { id: 'att7',  email_id: 'em7',  file_name: 'beispiel-dokument-7.pdf',              file_path: 'raw/2026/01/beispiel-7.pdf',              mime_type: 'application/pdf', file_size_bytes: 234100, is_invoice: false, created_at: daysAgo(6) },
  { id: 'att8',  email_id: 'em8',  file_name: 'beispiel-dokument-8.pdf',         file_path: 'raw/2026/01/beispiel-8.pdf',         mime_type: 'application/pdf', file_size_bytes: 112450, is_invoice: true,  created_at: daysAgo(7) },
  { id: 'att9',  email_id: 'em9',  file_name: 'beispiel-dokument-9.pdf',              file_path: 'raw/2026/01/beispiel-9.pdf',              mime_type: 'application/pdf', file_size_bytes: 87340,  is_invoice: true,  invoice_id: 'inv-processed-2', created_at: daysAgo(7) },
  { id: 'att10', email_id: 'em10', file_name: 'beispiel-dokument-10.pdf',   file_path: 'raw/2026/01/beispiel-10.pdf',   mime_type: 'application/pdf', file_size_bytes: 198720, is_invoice: false, created_at: daysAgo(8) },
  { id: 'att11', email_id: 'em11', file_name: 'beispiel-dokument-11.pdf',   file_path: 'raw/2026/01/beispiel-11.pdf',   mime_type: 'application/pdf', file_size_bytes: 156840, is_invoice: true,  created_at: daysAgo(8) },
  { id: 'att12', email_id: 'em12', file_name: 'beispiel-dokument-12.pdf',               file_path: 'raw/2026/01/beispiel-12.pdf',               mime_type: 'application/pdf', file_size_bytes: 76580,  is_invoice: true,  created_at: daysAgo(9) },
  { id: 'att13', email_id: 'em13', file_name: 'beispiel-dokument-13.pdf',   file_path: 'raw/2026/01/beispiel-13.pdf',   mime_type: 'application/pdf', file_size_bytes: 124300, is_invoice: true,  invoice_id: 'inv-processed-3', created_at: daysAgo(10) },
  { id: 'att14', email_id: 'em14', file_name: 'beispiel-dokument-14.pdf',   file_path: 'raw/2026/01/beispiel-14.pdf',   mime_type: 'application/pdf', file_size_bytes: 203450, is_invoice: false, created_at: daysAgo(10) },
  { id: 'att15a',email_id: 'em15', file_name: 'beispiel-dokument-15.pdf',    file_path: 'raw/2026/01/beispiel-15.pdf',    mime_type: 'application/pdf', file_size_bytes: 287650, is_invoice: true,  created_at: daysAgo(11) },
  { id: 'att15b',email_id: 'em15', file_name: 'beispiel-dokument-16.pdf',     file_path: 'raw/2026/01/beispiel-16.pdf',     mime_type: 'application/pdf', file_size_bytes: 134210, is_invoice: false, created_at: daysAgo(11) },
  { id: 'att17', email_id: 'em17', file_name: 'beispiel-dokument-17.pdf',          file_path: 'raw/2026/01/beispiel-17.pdf',          mime_type: 'application/pdf', file_size_bytes: 89120,  is_invoice: false, created_at: daysAgo(12) },
  { id: 'att18', email_id: 'em18', file_name: 'beispiel-dokument-18.pdf',  file_path: 'raw/2026/01/beispiel-18.pdf',  mime_type: 'application/pdf', file_size_bytes: 167450, is_invoice: true,  created_at: daysAgo(13) },
  { id: 'att20', email_id: 'em20', file_name: 'beispiel-dokument-19.pdf',   file_path: 'raw/2026/01/beispiel-19.pdf',   mime_type: 'application/pdf', file_size_bytes: 143280, is_invoice: true,  created_at: daysAgo(14) },
]
