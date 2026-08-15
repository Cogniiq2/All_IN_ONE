import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { type Email, type EmailAccount, type EmailAttachment } from '@/data/mockData'

type AttachmentFilter = 'all' | 'with' | 'without'
type StatusFilter = 'all' | 'unprocessed' | 'processed' | 'unread'
type DateFilter = 'all' | 'today' | 'week' | 'month'

interface EmailStore {
  emails: Email[]
  accounts: EmailAccount[]
  attachments: EmailAttachment[]
  loading: boolean
  loadError: string | null
  attachmentsLoading: boolean

  selectedAccountFilter: string | null
  attachmentFilter: AttachmentFilter
  statusFilter: StatusFilter
  dateFilter: DateFilter
  searchQuery: string
  selectedEmailId: string | null

  filteredEmails: (state: EmailStore) => Email[]
  unprocessedWithAttachments: (state: EmailStore) => number

  loadEmails: () => Promise<void>
  loadAttachmentsForEmail: (emailId: string) => Promise<void>
  setAccountFilter: (email: string | null) => void
  setAttachmentFilter: (filter: AttachmentFilter) => void
  setStatusFilter: (filter: StatusFilter) => void
  setDateFilter: (filter: DateFilter) => void
  setSearchQuery: (query: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  markAsProcessed: (id: string, invoiceId: string) => void
  openEmail: (id: string) => void
  closeEmail: () => void
  getAttachmentsForEmail: (emailId: string) => EmailAttachment[]
  updateAttachmentInvoiceId: (attachmentId: string, invoiceId: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEmail(row: any): Email {
  return {
    id: row.id,
    account_email: row.account_email,
    account_display_name: row.account_display_name,
    account_color: row.account_color,
    message_id: row.message_id,
    from_email: row.from_email,
    from_name: row.from_name,
    subject: row.subject,
    body_text: row.body_text,
    body_preview: row.body_preview,
    received_at: row.received_at,
    has_attachments: row.has_attachments,
    attachment_count: row.attachment_count,
    is_processed: row.is_processed,
    is_read: row.is_read,
    invoice_id: row.invoice_id ?? undefined,
    supplier_name: row.supplier_name ?? undefined,
    property_id: row.property_id ?? undefined,
    created_at: row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAttachment(row: any): EmailAttachment {
  return {
    id: row.id,
    email_id: row.email_id,
    file_name: row.file_name,
    file_path: row.file_path,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    is_invoice: row.is_invoice,
    invoice_id: row.invoice_id ?? undefined,
    created_at: row.created_at,
  }
}

const ACCOUNT_COLORS = ['#1D4ED8', '#059669', '#D97706', '#DC2626', '#0891B2', '#7C3AED', '#BE185D', '#0F766E']

function deriveAccounts(emails: Email[]): EmailAccount[] {
  const seen = new Map<string, EmailAccount>()
  emails.forEach((e) => {
    if (!e.account_email || seen.has(e.account_email)) return
    const idx = seen.size % ACCOUNT_COLORS.length
    seen.set(e.account_email, {
      id: e.account_email,
      email_address: e.account_email,
      display_name: e.account_display_name || e.account_email,
      provider: 'imap',
      color: e.account_color || ACCOUNT_COLORS[idx],
      is_active: true,
    })
  })
  return Array.from(seen.values())
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  emails: [],
  accounts: [],
  attachments: [],
  loading: false,
  loadError: null,
  attachmentsLoading: false,

  selectedAccountFilter: null,
  attachmentFilter: 'all',
  statusFilter: 'all',
  dateFilter: 'all',
  searchQuery: '',
  selectedEmailId: null,

  filteredEmails: (state) => {
    const now = new Date()
    return state.emails.filter((email) => {
      if (state.selectedAccountFilter && email.account_email !== state.selectedAccountFilter) return false
      if (state.attachmentFilter === 'with' && !email.has_attachments) return false
      if (state.attachmentFilter === 'without' && email.has_attachments) return false
      if (state.statusFilter === 'unread' && email.is_read) return false
      if (state.statusFilter === 'processed' && !email.is_processed) return false
      if (state.statusFilter === 'unprocessed' && (email.is_processed || !email.has_attachments)) return false
      if (state.dateFilter !== 'all') {
        const diffDays = (now.getTime() - new Date(email.received_at).getTime()) / (1000 * 60 * 60 * 24)
        if (state.dateFilter === 'today' && diffDays > 1) return false
        if (state.dateFilter === 'week' && diffDays > 7) return false
        if (state.dateFilter === 'month' && diffDays > 30) return false
      }
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase()
        return (
          (email.subject ?? '').toLowerCase().includes(q) ||
          (email.from_name ?? '').toLowerCase().includes(q) ||
          (email.from_email ?? '').toLowerCase().includes(q) ||
          (email.body_preview ?? '').toLowerCase().includes(q) ||
          (email.body_text ?? '').toLowerCase().includes(q) ||
          (email.supplier_name ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  },

  unprocessedWithAttachments: (state) =>
    state.emails.filter((e) => e.has_attachments && !e.is_processed && !e.is_read).length,

  loadEmails: async () => {
    const url = import.meta.env.VITE_SUPABASE_URL
    console.log('[emailStore] VITE_SUPABASE_URL =', url)
    set({ loading: true, loadError: null })
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })

      console.log('[emailStore] Supabase error =', error)
      console.log('[emailStore] Rows returned =', data?.length ?? 0)
      console.log('[emailStore] First row =', data?.[0] ?? null)

      if (error) {
        set({ loadError: `${error.code}: ${error.message}` })
        return
      }
      const mapped = (data ?? []).map(rowToEmail)
      set({ emails: mapped, accounts: deriveAccounts(mapped) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[emailStore] Unexpected error =', msg)
      set({ loadError: msg })
    } finally {
      set({ loading: false })
    }
  },

  loadAttachmentsForEmail: async (emailId) => {
    const existing = get().attachments.filter((a) => a.email_id === emailId)
    if (existing.length > 0) return
    set({ attachmentsLoading: true })
    try {
      const { data, error } = await supabase
        .from('email_attachments')
        .select('*')
        .eq('email_id', emailId)
        .order('created_at')
      if (error) throw error
      set((s) => ({
        attachments: [
          ...s.attachments.filter((a) => a.email_id !== emailId),
          ...(data ?? []).map(rowToAttachment),
        ],
      }))
    } finally {
      set({ attachmentsLoading: false })
    }
  },

  setAccountFilter: (email) => set({ selectedAccountFilter: email }),
  setAttachmentFilter: (filter) => set({ attachmentFilter: filter }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setDateFilter: (filter) => set({ dateFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  markAsRead: (id) =>
    set((s) => ({ emails: s.emails.map((e) => e.id === id ? { ...e, is_read: true } : e) })),

  markAllAsRead: () =>
    set((s) => ({ emails: s.emails.map((e) => ({ ...e, is_read: true })) })),

  markAsProcessed: (id, invoiceId) =>
    set((s) => ({ emails: s.emails.map((e) => e.id === id ? { ...e, is_processed: true, invoice_id: invoiceId } : e) })),

  openEmail: (id) => {
    set({ selectedEmailId: id })
    get().markAsRead(id)
    get().loadAttachmentsForEmail(id)
  },

  closeEmail: () => set({ selectedEmailId: null }),

  getAttachmentsForEmail: (emailId) => get().attachments.filter((a) => a.email_id === emailId),

  updateAttachmentInvoiceId: (attachmentId, invoiceId) =>
    set((s) => ({
      attachments: s.attachments.map((a) => a.id === attachmentId ? { ...a, invoice_id: invoiceId } : a),
    })),
}))
