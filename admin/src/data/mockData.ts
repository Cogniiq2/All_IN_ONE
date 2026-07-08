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
    name: 'Münchner Str. 12',
    address: 'Münchner Str. 12, 95445 Bayreuth',
    type: 'wohnhaus',
    purchasePrice: 280000,
    estimatedValue: 340000,
    size: 120,
    yearBuilt: 1972,
    purchaseYear: 2018,
    status: 'aktiv',
    units: [
      { id: 'u1', label: 'EG', size: 60, status: 'vermietet', rentCold: 650, tenant: 'Familie Bauer' },
      { id: 'u2', label: '1.OG', size: 60, status: 'vermietet', rentCold: 680, tenant: 'Herr Schreiber' },
    ],
    monthlyRent: 1330,
    loanIds: ['l1'],
  },
  {
    id: 'p2',
    name: 'Kulmbacher Str. 8',
    address: 'Kulmbacher Str. 8, 95445 Bayreuth',
    type: 'mehrfamilienhaus',
    purchasePrice: 320000,
    estimatedValue: 395000,
    size: 180,
    yearBuilt: 1985,
    purchaseYear: 2015,
    status: 'aktiv',
    units: [
      { id: 'u3', label: 'EG', size: 65, status: 'vermietet', rentCold: 700, tenant: 'Frau Meier' },
      { id: 'u4', label: '1.OG', size: 65, status: 'vermietet', rentCold: 720, tenant: 'Familie Koch' },
      { id: 'u5', label: '2.OG', size: 50, status: 'leerstand', rentCold: 550 },
    ],
    monthlyRent: 1420,
    loanIds: ['l2'],
  },
  {
    id: 'p3',
    name: 'Bahnhofstr. 3',
    address: 'Bahnhofstr. 3, 95444 Bayreuth',
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
  { id: 's1', name: 'BayWa AG', type: 'versorger', defaultCategory: 'Heizöl', iban: 'DE89370400440532013000', trusted: true },
  { id: 's2', name: 'Stadtwerke Bayreuth', type: 'versorger', defaultCategory: 'Strom/Gas', iban: 'DE44200400600526015400', trusted: true },
  { id: 's3', name: 'Allianz Versicherung', type: 'versicherung', defaultCategory: 'Versicherung', trusted: true },
  { id: 's4', name: 'Sparkasse Bayreuth', type: 'bank', defaultCategory: 'Darlehen', iban: 'DE68790500000000123456', trusted: true },
  { id: 's5', name: 'Heizungsbauer Müller GmbH', type: 'handwerker', defaultCategory: 'Handwerker', trusted: true },
  { id: 's6', name: 'Elektro Schmidt', type: 'handwerker', defaultCategory: 'Handwerker', trusted: false },
  { id: 's7', name: 'Finanzamt Bayreuth', type: 'behoerde', defaultCategory: 'Steuern', trusted: true },
  { id: 's8', name: 'BIMA Steuerberatung', type: 'steuerberater', defaultCategory: 'Steuerberatung', trusted: true },
]

// ─── INVOICES ──────────────────────────────────────────────────────

export const invoices: Invoice[] = [
  {
    id: 'i1', number: 'RE-2025-004421', supplierId: 's1', supplierName: 'BayWa AG',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    category: 'Heizöl', categoryColor: '#F59E0B',
    date: '2025-11-03', dueDate: '2025-11-24',
    amountNet: 3269.75, vatRate: 19, amountGross: 3890.99,
    status: 'bezahlt', aiConfidence: 0.97, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i2', number: 'RE-2025-004398', supplierId: 's2', supplierName: 'Stadtwerke Bayreuth',
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
    id: 'i4', number: 'RE-2025-004477', supplierId: 's3', supplierName: 'Allianz Versicherung',
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
    id: 'i6', number: 'RE-2025-004388', supplierId: 's2', supplierName: 'Stadtwerke Bayreuth',
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
    id: 'i9', number: 'RE-2025-004590', supplierId: 's7', supplierName: 'Finanzamt Bayreuth',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Steuern', categoryColor: '#EF4444',
    date: '2025-12-01', dueDate: '2025-12-31',
    amountNet: 2100.00, vatRate: 0, amountGross: 2100.00,
    status: 'ausstehend', aiConfidence: 0.91, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i10', number: 'RE-2025-004221', supplierId: 's1', supplierName: 'BayWa AG',
    propertyId: 'p2', propertyName: 'Kulmbacher Str. 8',
    category: 'Heizöl', categoryColor: '#F59E0B',
    date: '2025-09-12', dueDate: '2025-10-03',
    amountNet: 2714.29, vatRate: 19, amountGross: 3231.00,
    status: 'bezahlt', aiConfidence: 0.96, aiModel: 'GPT-4o mini',
  },
  {
    id: 'i11', number: 'RE-2025-004105', supplierId: 's3', supplierName: 'Allianz Versicherung',
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
  { id: 't1', date: '2025-11-28', valueDate: '2025-11-28', counterparty: 'Familie Bauer', purpose: 'Miete November 2025 EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't2', date: '2025-11-28', valueDate: '2025-11-28', counterparty: 'H. Schreiber', purpose: 'Miete November 2025 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't3', date: '2025-11-27', valueDate: '2025-11-27', counterparty: 'Frau Meier', purpose: 'Miete November EG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 700, status: 'abgeglichen' },
  { id: 't4', date: '2025-11-27', valueDate: '2025-11-27', counterparty: 'Familie Koch', purpose: 'Miete November 1.OG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 720, status: 'abgeglichen' },
  { id: 't5', date: '2025-11-15', valueDate: '2025-11-17', counterparty: 'Sparkasse Bayreuth', purpose: 'Darlehen Rate Mrz-Nov 2025 Kto. 123456', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Darlehen', amount: -983, status: 'abgeglichen', linkedInvoiceId: undefined },
  { id: 't6', date: '2025-11-15', valueDate: '2025-11-17', counterparty: 'HypoVereinsbank', purpose: 'Darlehensrate November 2025', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Darlehen', amount: -1187, status: 'abgeglichen' },
  { id: 't7', date: '2025-11-10', valueDate: '2025-11-12', counterparty: 'BayWa AG', purpose: 'Heizöl Lieferung RE-2025-004421', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Heizöl', amount: -3890.99, linkedInvoiceId: 'i1', status: 'abgeglichen' },
  { id: 't8', date: '2025-11-05', valueDate: '2025-11-05', counterparty: 'Stadtwerke Bayreuth', purpose: 'Strom Oktober RE-2025-004398', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Strom', amount: -379.00, linkedInvoiceId: 'i2', status: 'abgeglichen' },
  { id: 't9', date: '2025-10-28', valueDate: '2025-10-28', counterparty: 'Familie Bauer', purpose: 'Miete Oktober 2025 EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't10', date: '2025-10-28', valueDate: '2025-10-28', counterparty: 'H. Schreiber', purpose: 'Miete Oktober 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't11', date: '2025-10-27', valueDate: '2025-10-27', counterparty: 'Frau Meier', purpose: 'Miete Oktober EG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 700, status: 'abgeglichen' },
  { id: 't12', date: '2025-10-27', valueDate: '2025-10-27', counterparty: 'Familie Koch', purpose: 'Miete Oktober 1.OG', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Mieteinnahmen', amount: 720, status: 'abgeglichen' },
  { id: 't13', date: '2025-10-15', valueDate: '2025-10-17', counterparty: 'Sparkasse Bayreuth', purpose: 'Darlehensrate Oktober 2025', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Darlehen', amount: -983, status: 'abgeglichen' },
  { id: 't14', date: '2025-10-15', valueDate: '2025-10-17', counterparty: 'HypoVereinsbank', purpose: 'Darlehensrate Oktober 2025', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Darlehen', amount: -1187, status: 'abgeglichen' },
  { id: 't15', date: '2025-10-10', valueDate: '2025-10-12', counterparty: 'Allianz Versicherung', purpose: 'Jahresbeitrag Haftpflicht RE-2025-004477', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Versicherung', amount: -1400.00, linkedInvoiceId: 'i4', status: 'abgeglichen' },
  { id: 't16', date: '2025-10-05', valueDate: '2025-10-05', counterparty: 'Stadtwerke Bayreuth', purpose: 'Gas September RE-2025-004388', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Gas', amount: -265.00, linkedInvoiceId: 'i6', status: 'offen' },
  { id: 't17', date: '2025-09-28', valueDate: '2025-09-28', counterparty: 'Familie Bauer', purpose: 'Miete September EG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 650, status: 'abgeglichen' },
  { id: 't18', date: '2025-09-28', valueDate: '2025-09-28', counterparty: 'H. Schreiber', purpose: 'Miete September 1.OG', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Mieteinnahmen', amount: 680, status: 'abgeglichen' },
  { id: 't19', date: '2025-09-15', valueDate: '2025-09-15', counterparty: 'BayWa AG', purpose: 'Heizöl Kulmbacher Str. 8', propertyId: 'p2', propertyName: 'Kulmbacher Str. 8', category: 'Heizöl', amount: -3231.00, linkedInvoiceId: 'i10', status: 'abgeglichen' },
  { id: 't20', date: '2025-09-30', valueDate: '2025-10-02', counterparty: 'BIMA Steuerberatung', purpose: 'Steuerberatung Q3 2025', propertyId: 'p1', propertyName: 'Münchner Str. 12', category: 'Steuerberatung', amount: -900.00, linkedInvoiceId: 'i8', status: 'abgeglichen' },
]

// ─── LOANS ─────────────────────────────────────────────────────────

export const loans: Loan[] = [
  {
    id: 'l1', bankName: 'Sparkasse Bayreuth', loanNumber: 'DAR-2018-00882',
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
    id: 'r1', name: 'Heizungserneuerung',
    propertyId: 'p1', propertyName: 'Münchner Str. 12',
    status: 'in_bearbeitung', budget: 18500, spent: 14229.80,
    startDate: '2025-08-01', endDate: '2025-12-31',
    linkedInvoiceIds: ['i3'], onTrack: true,
  },
  {
    id: 'r2', name: 'Vollsanierung EG',
    propertyId: 'p3', propertyName: 'Bahnhofstr. 3',
    status: 'in_bearbeitung', budget: 45000, spent: 14569.00,
    startDate: '2025-09-15', endDate: '2026-04-30',
    linkedInvoiceIds: ['i5', 'i7'], onTrack: false,
  },
  {
    id: 'r3', name: 'Balkon Sanierung',
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
  { id: 'ea1', email_address: 'info@allinone-residences.de',          display_name: 'Hauptkonto',     provider: 'imap', color: '#1D4ED8', is_active: true },
  { id: 'ea2', email_address: 'verwaltung@allinone-residences.de',    display_name: 'Verwaltung',     provider: 'imap', color: '#7C3AED', is_active: true },
  { id: 'ea3', email_address: 'buchhaltung@allinone-residences.de',   display_name: 'Buchhaltung',    provider: 'imap', color: '#059669', is_active: true },
  { id: 'ea4', email_address: 'muenchnerstr@allinone-residences.de',  display_name: 'Münchner Str.',  provider: 'imap', color: '#D97706', is_active: true },
  { id: 'ea5', email_address: 'kulmbacherstr@allinone-residences.de', display_name: 'Kulmbacher Str.',provider: 'imap', color: '#DC2626', is_active: true },
  { id: 'ea6', email_address: 'bahnhofstr@allinone-residences.de',    display_name: 'Bahnhofstr.',    provider: 'imap', color: '#0891B2', is_active: true },
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
    id: 'em1', account_email: 'info@allinone-residences.de', account_display_name: 'Hauptkonto', account_color: '#1D4ED8',
    message_id: 'msg-001@baywa.de', from_email: 'rechnungen@baywa.de', from_name: 'BayWa AG',
    subject: 'Ihre Rechnung RE-2025-004421 vom 03.11.2025',
    body_text: 'Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie Ihre Rechnung RE-2025-004421 über die Heizöllieferung vom 03.11.2025.\n\nRechnungsbetrag: 1.842,50 EUR (inkl. MwSt.)\nFälligkeitsdatum: 17.11.2025\n\nBitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.\n\nMit freundlichen Grüßen\nBayWa AG Kundenservice',
    body_preview: 'Sehr geehrte Damen und Herren, anbei erhalten Sie Ihre Rechnung über Heizöllieferung...',
    received_at: daysAgo(0, 2), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'BayWa AG', created_at: daysAgo(0, 2),
  },
  {
    id: 'em2', account_email: 'verwaltung@allinone-residences.de', account_display_name: 'Verwaltung', account_color: '#7C3AED',
    message_id: 'msg-002@stadtwerke.de', from_email: 'service@stadtwerke-bayreuth.de', from_name: 'Stadtwerke Bayreuth',
    subject: 'Abschlagszahlung Dezember 2025',
    body_text: 'Sehr geehrte Kundin, sehr geehrter Kunde,\n\nIhre monatliche Abschlagszahlung für Strom und Gas in Höhe von 312,00 EUR wird am 15.12.2025 eingezogen.\n\nBitte stellen Sie sicher, dass Ihr Konto ausreichend gedeckt ist.\n\nMit freundlichen Grüßen\nStadtwerke Bayreuth',
    body_preview: 'Ihre monatliche Abschlagszahlung für Strom und Gas wird am 15.12.2025 eingezogen...',
    received_at: daysAgo(1), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'Stadtwerke Bayreuth', created_at: daysAgo(1),
  },
  {
    id: 'em3', account_email: 'buchhaltung@allinone-residences.de', account_display_name: 'Buchhaltung', account_color: '#059669',
    message_id: 'msg-003@allianz.de', from_email: 'rechnungen@allianz.de', from_name: 'Allianz Versicherung',
    subject: 'Ihre Jahresrechnung Gebäudeversicherung 2026',
    body_text: 'Sehr geehrte Kundin, sehr geehrter Kunde,\n\nIhre Jahresprämie für die Gebäudeversicherung beläuft sich für das Jahr 2026 auf 2.148,00 EUR.\n\nDer Betrag wird am 01.01.2026 von Ihrem Konto abgebucht.\n\nMit freundlichen Grüßen\nAllianz Versicherung',
    body_preview: 'Sehr geehrte Kunden, Ihre Jahresprämie für die Gebäudeversicherung beläuft sich auf...',
    received_at: daysAgo(2), has_attachments: true, attachment_count: 2, is_processed: true, is_read: true,
    supplier_name: 'Allianz Versicherung', invoice_id: 'inv-processed-1', created_at: daysAgo(2),
  },
  {
    id: 'em4', account_email: 'muenchnerstr@allinone-residences.de', account_display_name: 'Münchner Str.', account_color: '#D97706',
    message_id: 'msg-004@elektroschmidt.de', from_email: 'info@elektroschmidt-bayreuth.de', from_name: 'Elektro Schmidt GmbH',
    subject: 'Kostenvoranschlag Elektroarbeiten EG',
    body_text: 'Sehr geehrte Damen und Herren,\n\nanbei der gewünschte Kostenvoranschlag für die Elektroarbeiten im Erdgeschoss der Münchner Str. 12.\n\nGesamtbetrag: 3.240,00 EUR (netto)\nAusführungszeitraum: 10.-14. Januar 2026\n\nBei Rückfragen stehen wir gern zur Verfügung.\n\nMit freundlichen Grüßen\nElektro Schmidt GmbH',
    body_preview: 'Anbei der gewünschte Kostenvoranschlag für die Elektroarbeiten im Erdgeschoss...',
    received_at: daysAgo(3), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    created_at: daysAgo(3),
  },
  {
    id: 'em5', account_email: 'info@allinone-residences.de', account_display_name: 'Hauptkonto', account_color: '#1D4ED8',
    message_id: 'msg-005@sparkasse.de', from_email: 'noreply@sparkasse-bayreuth.de', from_name: 'Sparkasse Bayreuth',
    subject: 'Ihr Kontoauszug November 2025',
    body_text: 'Guten Tag,\n\nIhr Kontoauszug für November 2025 steht im Online-Banking unter sparkasse-bayreuth.de bereit.\n\nZum Download melden Sie sich bitte mit Ihren Zugangsdaten an.\n\nIhre Sparkasse Bayreuth',
    body_preview: 'Ihr Kontoauszug für November 2025 steht im Online-Banking bereit...',
    received_at: daysAgo(4), has_attachments: false, attachment_count: 0, is_processed: false, is_read: true,
    created_at: daysAgo(4),
  },
  {
    id: 'em6', account_email: 'verwaltung@allinone-residences.de', account_display_name: 'Verwaltung', account_color: '#7C3AED',
    message_id: 'msg-006@muellerht.de', from_email: 'heizung@mueller-haustechnik.de', from_name: 'Heizungsbauer Müller GmbH',
    subject: 'Rechnung Heizungswartung Oktober 2025',
    body_text: 'Sehr geehrte Damen und Herren,\n\nfür die durchgeführten Wartungsarbeiten an der Heizungsanlage berechnen wir wie folgt:\n\nWartung Heizkessel: 380,00 EUR\nAustausch Dichtungen: 45,00 EUR\nAnfahrt: 35,00 EUR\nNetto: 460,00 EUR\nMwSt. 19%: 87,40 EUR\nGesamt: 547,40 EUR\n\nZahlungsziel: 14 Tage\n\nMit freundlichen Grüßen\nHeizungsbauer Müller GmbH',
    body_preview: 'Für die durchgeführten Wartungsarbeiten an der Heizungsanlage berechnen wir...',
    received_at: daysAgo(5), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Heizungsbauer Müller GmbH', created_at: daysAgo(5),
  },
  {
    id: 'em7', account_email: 'buchhaltung@allinone-residences.de', account_display_name: 'Buchhaltung', account_color: '#059669',
    message_id: 'msg-007@finanzamt.de', from_email: 'bescheide@finanzamt-bayreuth.de', from_name: 'Finanzamt Bayreuth',
    subject: 'Grundsteuerbescheid 2026',
    body_text: 'Sehr geehrte Damen und Herren,\n\nder Grundsteuerbescheid für das Steuerjahr 2026 wurde festgesetzt.\n\nGrundsteuer B: 1.284,00 EUR\nFälligkeiten: 15.02. / 15.05. / 15.08. / 15.11.2026 (je 321,00 EUR)\n\nBitte beachten Sie die beigefügten Bescheide.\n\nFinanzamt Bayreuth',
    body_preview: 'Der Grundsteuerbescheid für das Steuerjahr 2026 wurde festgesetzt...',
    received_at: daysAgo(6), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(6),
  },
  {
    id: 'em8', account_email: 'kulmbacherstr@allinone-residences.de', account_display_name: 'Kulmbacher Str.', account_color: '#DC2626',
    message_id: 'msg-008@vkb.de', from_email: 'service@vkb.de', from_name: 'Versicherungskammer Bayern',
    subject: 'Beitragsrechnung Haftpflichtversicherung Q1/2026',
    body_text: 'Sehr geehrte Kundin, sehr geehrter Kunde,\n\nIhre Beitragsrechnung für die Haftpflichtversicherung im 1. Quartal 2026 beläuft sich auf 312,50 EUR.\n\nBitte überweisen Sie den Betrag bis zum 31.12.2025.\n\nVersicherungskammer Bayern',
    body_preview: 'Ihre Beitragsrechnung für die Haftpflichtversicherung Q1/2026 beläuft sich auf 312,50 EUR...',
    received_at: daysAgo(7), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Versicherungskammer Bayern', created_at: daysAgo(7),
  },
  {
    id: 'em9', account_email: 'info@allinone-residences.de', account_display_name: 'Hauptkonto', account_color: '#1D4ED8',
    message_id: 'msg-009@telekom.de', from_email: 'rechnung@telekom.de', from_name: 'Telekom Deutschland',
    subject: 'Ihre Rechnung für November 2025',
    body_text: 'Guten Tag,\n\nIhre Telekom-Rechnung für November 2025 ist verfügbar.\n\nRechnungsbetrag: 89,95 EUR\nFälligkeitsdatum: 01.12.2025\n\nDie Rechnung finden Sie in Ihrem Kundencenter.\n\nIhre Telekom',
    body_preview: 'Ihre Telekom-Rechnung für November 2025 beträgt 89,95 EUR, fällig am 01.12.2025...',
    received_at: daysAgo(7), has_attachments: true, attachment_count: 1, is_processed: true, is_read: true,
    supplier_name: 'Telekom Deutschland', invoice_id: 'inv-processed-2', created_at: daysAgo(7),
  },
  {
    id: 'em10', account_email: 'bahnhofstr@allinone-residences.de', account_display_name: 'Bahnhofstr.', account_color: '#0891B2',
    message_id: 'msg-010@meb.de', from_email: 'info@meb-bayreuth.de', from_name: 'Müll-Entsorgungsbetrieb Bayreuth',
    subject: 'Jahresgebührenbescheid Abfallentsorgung 2026',
    body_text: 'Sehr geehrte Damen und Herren,\n\nIhr Jahresgebührenbescheid für die Abfallentsorgung 2026 liegt anbei.\n\nJahresgebühr: 540,00 EUR\nRatenfälligkeit: Quartalsweise (je 135,00 EUR)\n\nMüll-Entsorgungsbetrieb Bayreuth',
    body_preview: 'Ihr Jahresgebührenbescheid für die Abfallentsorgung 2026 liegt anbei. Jahresgebühr: 540,00 EUR...',
    received_at: daysAgo(8), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(8),
  },
  {
    id: 'em11', account_email: 'verwaltung@allinone-residences.de', account_display_name: 'Verwaltung', account_color: '#7C3AED',
    message_id: 'msg-011@maier.de', from_email: 'buero@handwerker-maier.de', from_name: 'Handwerker Maier',
    subject: 'Rechnung Malerarbeiten Treppenhaus Nov. 2025',
    body_text: 'Sehr geehrte Damen und Herren,\n\nbeiliegend erhalten Sie unsere Rechnung für die Malerarbeiten im Treppenhaus.\n\nMalerarbeiten 3 Etagen: 2.100,00 EUR\nMaterial: 380,00 EUR\nNetto: 2.480,00 EUR\nMwSt.: 471,20 EUR\nGesamt: 2.951,20 EUR\n\nMit freundlichen Grüßen\nHandwerker Maier',
    body_preview: 'Beiliegend erhalten Sie unsere Rechnung für die Malerarbeiten im Treppenhaus...',
    received_at: daysAgo(8), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'Handwerker Maier', created_at: daysAgo(8),
  },
  {
    id: 'em12', account_email: 'muenchnerstr@allinone-residences.de', account_display_name: 'Münchner Str.', account_color: '#D97706',
    message_id: 'msg-012@stadtwerke.de', from_email: 'service@stadtwerke-bayreuth.de', from_name: 'Stadtwerke Bayreuth',
    subject: 'Wasserrechnung Oktober 2025',
    body_text: 'Sehr geehrte Kundin, sehr geehrter Kunde,\n\nIhre Wasserrechnung für Oktober 2025 beläuft sich auf 148,20 EUR.\n\nAblesedatum: 31.10.2025\nVerbrauch: 18 m³\nPreis/m³: 8,23 EUR\n\nStadtwerke Bayreuth',
    body_preview: 'Ihre Wasserrechnung für Oktober 2025 beläuft sich auf 148,20 EUR bei 18 m³ Verbrauch...',
    received_at: daysAgo(9), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'Stadtwerke Bayreuth', created_at: daysAgo(9),
  },
  {
    id: 'em13', account_email: 'buchhaltung@allinone-residences.de', account_display_name: 'Buchhaltung', account_color: '#059669',
    message_id: 'msg-013@steuer.de', from_email: 'kanzlei@stb-kurz.de', from_name: 'Steuerberatung Kurz & Partner',
    subject: 'Honorarrechnung Oktober/November 2025',
    body_text: 'Sehr geehrte Damen und Herren,\n\nbeiliegend erhalten Sie unsere Honorarrechnung für die Monate Oktober und November 2025.\n\nLaufende Buchführung (2 Monate): 680,00 EUR\nJahresabschluss Anzahlung: 400,00 EUR\nNetto: 1.080,00 EUR\nMwSt. 19%: 205,20 EUR\nGesamt: 1.285,20 EUR\n\nMit freundlichen Grüßen\nSteuerberatung Kurz & Partner',
    body_preview: 'Beiliegend erhalten Sie unsere Honorarrechnung für die Monate Oktober und November 2025...',
    received_at: daysAgo(10), has_attachments: true, attachment_count: 1, is_processed: true, is_read: true,
    supplier_name: 'Steuerberatung Kurz & Partner', invoice_id: 'inv-processed-3', created_at: daysAgo(10),
  },
  {
    id: 'em14', account_email: 'info@allinone-residences.de', account_display_name: 'Hauptkonto', account_color: '#1D4ED8',
    message_id: 'msg-014@baywa2.de', from_email: 'rechnungen@baywa.de', from_name: 'BayWa AG',
    subject: 'Wartungsvertrag Erneuerung 2026 – Angebot',
    body_text: 'Sehr geehrte Damen und Herren,\n\nIhr Wartungsvertrag läuft am 31.12.2025 aus. Gerne unterbreiten wir Ihnen unser Angebot für die Verlängerung.\n\nJahreswartung Premium: 890,00 EUR/Jahr\nLaufzeit: 2 Jahre\n\nBei Interesse melden Sie sich bitte bis zum 15.12.2025.\n\nBayWa AG',
    body_preview: 'Ihr Wartungsvertrag läuft am 31.12.2025 aus. Angebot zur Verlängerung anbei...',
    received_at: daysAgo(10), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'BayWa AG', created_at: daysAgo(10),
  },
  {
    id: 'em15', account_email: 'kulmbacherstr@allinone-residences.de', account_display_name: 'Kulmbacher Str.', account_color: '#DC2626',
    message_id: 'msg-015@handwerker.de', from_email: 'rechnungen@dachdecker-weber.de', from_name: 'Dachdecker Weber',
    subject: 'Rechnung Dachsanierung Abschnitt 2',
    body_text: 'Sehr geehrte Damen und Herren,\n\nhiermit stellen wir Ihnen für die Dachsanierung, Abschnitt 2, wie vereinbart in Rechnung:\n\nZiegelarbeiten 42 m²: 3.780,00 EUR\nFirstabdichtung: 890,00 EUR\nGerüst anteilig: 420,00 EUR\nNetto: 5.090,00 EUR\nMwSt. 19%: 967,10 EUR\nGesamt: 6.057,10 EUR\n\nDachdecker Weber',
    body_preview: 'Rechnung für Dachsanierung Abschnitt 2: Ziegelarbeiten, Firstabdichtung, Gerüst...',
    received_at: daysAgo(11), has_attachments: true, attachment_count: 2, is_processed: false, is_read: false,
    supplier_name: 'Dachdecker Weber', created_at: daysAgo(11),
  },
  {
    id: 'em16', account_email: 'verwaltung@allinone-residences.de', account_display_name: 'Verwaltung', account_color: '#7C3AED',
    message_id: 'msg-016@mieter.de', from_email: 'k.bauer@gmail.com', from_name: 'Familie Bauer',
    subject: 'Reparaturanfrage Badezimmer – Dringlich',
    body_text: 'Guten Tag,\n\nwir möchten Sie darüber informieren, dass in unserem Badezimmer ein Wasserfleck an der Decke sichtbar ist, der größer wird.\n\nKönnten Sie bitte einen Handwerker vorbeischicken?\n\nMit freundlichen Grüßen\nFamilie Bauer, EG',
    body_preview: 'Wasserfleck an der Decke im Badezimmer wird größer – Handwerker erforderlich...',
    received_at: daysAgo(11), has_attachments: false, attachment_count: 0, is_processed: false, is_read: true,
    created_at: daysAgo(11),
  },
  {
    id: 'em17', account_email: 'bahnhofstr@allinone-residences.de', account_display_name: 'Bahnhofstr.', account_color: '#0891B2',
    message_id: 'msg-017@sparkasse.de', from_email: 'immobilien@sparkasse-bayreuth.de', from_name: 'Sparkasse Bayreuth Immobilien',
    subject: 'Darlehenskontoauszug November 2025',
    body_text: 'Sehr geehrte Kunden,\n\nIhr Darlehenskontoauszug für November 2025 steht bereit.\n\nAktueller Restbetrag: 148.320,00 EUR\nMonatliche Rate: 1.240,00 EUR\nZinsanteil: 432,00 EUR\nTilgungsanteil: 808,00 EUR\n\nSparkasse Bayreuth',
    body_preview: 'Darlehenskontoauszug November 2025: Restbetrag 148.320 EUR, Rate 1.240 EUR...',
    received_at: daysAgo(12), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    created_at: daysAgo(12),
  },
  {
    id: 'em18', account_email: 'buchhaltung@allinone-residences.de', account_display_name: 'Buchhaltung', account_color: '#059669',
    message_id: 'msg-018@eon.de', from_email: 'rechnung@eon-energie.de', from_name: 'E.ON Energie',
    subject: 'Stromrechnung Jahresabrechnung 2025',
    body_text: 'Sehr geehrte Damen und Herren,\n\nIhre Jahresabrechnung für Strom 2025 liegt anbei.\n\nGesamtverbrauch: 12.840 kWh\nJahrespreis: 4.374,00 EUR\nAbschlagszahlungen: -3.840,00 EUR\nNachzahlung: 534,00 EUR\n\nE.ON Energie',
    body_preview: 'Stromrechnung Jahresabrechnung 2025: Nachzahlung 534,00 EUR bei 12.840 kWh...',
    received_at: daysAgo(13), has_attachments: true, attachment_count: 1, is_processed: false, is_read: false,
    supplier_name: 'E.ON Energie', created_at: daysAgo(13),
  },
  {
    id: 'em19', account_email: 'muenchnerstr@allinone-residences.de', account_display_name: 'Münchner Str.', account_color: '#D97706',
    message_id: 'msg-019@schreiber.de', from_email: 'h.schreiber@web.de', from_name: 'Herr Schreiber',
    subject: 'Kündigung Mietvertrag zum 28.02.2026',
    body_text: 'Sehr geehrte Damen und Herren,\n\nhiermit kündige ich meinen Mietvertrag für die Wohnung 1.OG, Münchner Str. 12 fristgerecht zum 28.02.2026.\n\nBitte bestätigen Sie den Erhalt dieser Kündigung.\n\nMit freundlichen Grüßen\nHerr Schreiber',
    body_preview: 'Kündigung Mietvertrag für 1.OG, Münchner Str. 12 zum 28.02.2026...',
    received_at: daysAgo(13), has_attachments: false, attachment_count: 0, is_processed: false, is_read: false,
    created_at: daysAgo(13),
  },
  {
    id: 'em20', account_email: 'info@allinone-residences.de', account_display_name: 'Hauptkonto', account_color: '#1D4ED8',
    message_id: 'msg-020@gvv.de', from_email: 'service@gvv-versicherung.de', from_name: 'GVV Kommunalversicherung',
    subject: 'Rechnung Elementarschadenversicherung 2026',
    body_text: 'Sehr geehrte Damen und Herren,\n\nIhre Beitragsrechnung für die Elementarschadenversicherung 2026 liegt anbei.\n\nJahresbeitrag: 1.890,00 EUR\nFälligkeitsdatum: 01.01.2026\n\nGVV Kommunalversicherung',
    body_preview: 'Jahresbeitrag Elementarschadenversicherung 2026: 1.890,00 EUR fällig am 01.01.2026...',
    received_at: daysAgo(14), has_attachments: true, attachment_count: 1, is_processed: false, is_read: true,
    supplier_name: 'GVV Kommunalversicherung', created_at: daysAgo(14),
  },
]

// ─── MOCK ATTACHMENTS ─────────────────────────────────────────────────────────

export const emailAttachments: EmailAttachment[] = [
  { id: 'att1',  email_id: 'em1',  file_name: 'Rechnung_BayWa_RE-2025-004421.pdf',       file_path: 'emails/em1/Rechnung_BayWa_RE-2025-004421.pdf',       mime_type: 'application/pdf', file_size_bytes: 187432, is_invoice: true,  created_at: daysAgo(0, 2) },
  { id: 'att2',  email_id: 'em2',  file_name: 'Abschlag_Stadtwerke_Dez2025.pdf',          file_path: 'emails/em2/Abschlag_Stadtwerke_Dez2025.pdf',          mime_type: 'application/pdf', file_size_bytes: 94210,  is_invoice: true,  created_at: daysAgo(1) },
  { id: 'att3a', email_id: 'em3',  file_name: 'Jahresrechnung_Allianz_2026.pdf',           file_path: 'emails/em3/Jahresrechnung_Allianz_2026.pdf',           mime_type: 'application/pdf', file_size_bytes: 312880, is_invoice: true,  invoice_id: 'inv-processed-1', created_at: daysAgo(2) },
  { id: 'att3b', email_id: 'em3',  file_name: 'Versicherungsschein_Allianz_2026.pdf',      file_path: 'emails/em3/Versicherungsschein_Allianz_2026.pdf',      mime_type: 'application/pdf', file_size_bytes: 201440, is_invoice: false, invoice_id: 'inv-processed-1', created_at: daysAgo(2) },
  { id: 'att4',  email_id: 'em4',  file_name: 'KVA_Elektroschmidt_EG_Jan2026.pdf',        file_path: 'emails/em4/KVA_Elektroschmidt_EG_Jan2026.pdf',        mime_type: 'application/pdf', file_size_bytes: 145320, is_invoice: false, created_at: daysAgo(3) },
  { id: 'att6',  email_id: 'em6',  file_name: 'Rechnung_Heizungswartung_Okt2025.pdf',     file_path: 'emails/em6/Rechnung_Heizungswartung_Okt2025.pdf',     mime_type: 'application/pdf', file_size_bytes: 98760,  is_invoice: true,  created_at: daysAgo(5) },
  { id: 'att7',  email_id: 'em7',  file_name: 'Grundsteuerbescheid_2026.pdf',              file_path: 'emails/em7/Grundsteuerbescheid_2026.pdf',              mime_type: 'application/pdf', file_size_bytes: 234100, is_invoice: false, created_at: daysAgo(6) },
  { id: 'att8',  email_id: 'em8',  file_name: 'Beitragsrechnung_VKB_Q1_2026.pdf',         file_path: 'emails/em8/Beitragsrechnung_VKB_Q1_2026.pdf',         mime_type: 'application/pdf', file_size_bytes: 112450, is_invoice: true,  created_at: daysAgo(7) },
  { id: 'att9',  email_id: 'em9',  file_name: 'Rechnung_Telekom_Nov2025.pdf',              file_path: 'emails/em9/Rechnung_Telekom_Nov2025.pdf',              mime_type: 'application/pdf', file_size_bytes: 87340,  is_invoice: true,  invoice_id: 'inv-processed-2', created_at: daysAgo(7) },
  { id: 'att10', email_id: 'em10', file_name: 'Jahresgebuehrenbescheid_Muell_2026.pdf',   file_path: 'emails/em10/Jahresgebuehrenbescheid_Muell_2026.pdf',   mime_type: 'application/pdf', file_size_bytes: 198720, is_invoice: false, created_at: daysAgo(8) },
  { id: 'att11', email_id: 'em11', file_name: 'Rechnung_Malerarbeiten_Treppenhaus.pdf',   file_path: 'emails/em11/Rechnung_Malerarbeiten_Treppenhaus.pdf',   mime_type: 'application/pdf', file_size_bytes: 156840, is_invoice: true,  created_at: daysAgo(8) },
  { id: 'att12', email_id: 'em12', file_name: 'Wasserrechnung_Okt2025.pdf',               file_path: 'emails/em12/Wasserrechnung_Okt2025.pdf',               mime_type: 'application/pdf', file_size_bytes: 76580,  is_invoice: true,  created_at: daysAgo(9) },
  { id: 'att13', email_id: 'em13', file_name: 'Honorarrechnung_OktNov2025_StbKurz.pdf',   file_path: 'emails/em13/Honorarrechnung_OktNov2025_StbKurz.pdf',   mime_type: 'application/pdf', file_size_bytes: 124300, is_invoice: true,  invoice_id: 'inv-processed-3', created_at: daysAgo(10) },
  { id: 'att14', email_id: 'em14', file_name: 'Angebot_Wartungsvertrag_2026_BayWa.pdf',   file_path: 'emails/em14/Angebot_Wartungsvertrag_2026_BayWa.pdf',   mime_type: 'application/pdf', file_size_bytes: 203450, is_invoice: false, created_at: daysAgo(10) },
  { id: 'att15a',email_id: 'em15', file_name: 'Rechnung_Dachsanierung_Abschnitt2.pdf',    file_path: 'emails/em15/Rechnung_Dachsanierung_Abschnitt2.pdf',    mime_type: 'application/pdf', file_size_bytes: 287650, is_invoice: true,  created_at: daysAgo(11) },
  { id: 'att15b',email_id: 'em15', file_name: 'Aufmass_Dachsanierung_Abschnitt2.pdf',     file_path: 'emails/em15/Aufmass_Dachsanierung_Abschnitt2.pdf',     mime_type: 'application/pdf', file_size_bytes: 134210, is_invoice: false, created_at: daysAgo(11) },
  { id: 'att17', email_id: 'em17', file_name: 'Darlehenskontoauszug_Nov2025.pdf',          file_path: 'emails/em17/Darlehenskontoauszug_Nov2025.pdf',          mime_type: 'application/pdf', file_size_bytes: 89120,  is_invoice: false, created_at: daysAgo(12) },
  { id: 'att18', email_id: 'em18', file_name: 'Stromrechnung_Jahresabrechnung_2025.pdf',  file_path: 'emails/em18/Stromrechnung_Jahresabrechnung_2025.pdf',  mime_type: 'application/pdf', file_size_bytes: 167450, is_invoice: true,  created_at: daysAgo(13) },
  { id: 'att20', email_id: 'em20', file_name: 'Rechnung_Elementarschadenvers_2026.pdf',   file_path: 'emails/em20/Rechnung_Elementarschadenvers_2026.pdf',   mime_type: 'application/pdf', file_size_bytes: 143280, is_invoice: true,  created_at: daysAgo(14) },
]
