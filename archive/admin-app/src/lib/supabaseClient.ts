import { createClient } from '@supabase/supabase-js'

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The hardcoded project URL and anon key were removed from this file.
 *
 * The anon key is designed to be public, so publishing it was not the
 * vulnerability — the vulnerability was that the database granted the anon
 * role full read/write access to private business tables, so that public key
 * was all anyone needed. That is fixed in the database, not here.
 *
 * The literals are still gone for two reasons: they hardcoded one specific
 * project into an archived app, and a fallback that silently works is exactly
 * how this app came to be deployed against production data by accident.
 *
 * Configuration is now required and this module fails closed without it.
 * ══════════════════════════════════════════════════════════════════════════
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. This app is ' +
      'archived and has no default project — see archive/README.md.'
  )
}

export const supabase = createClient(url, anonKey)
