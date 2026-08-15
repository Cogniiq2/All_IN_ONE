import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DISABLED — this was never authentication.
 *
 * This store previously compared a password typed in the browser against a
 * constant compiled into the JavaScript bundle (with a hardcoded fallback
 * value). Anyone who opened the bundle could read it, and anyone who wanted
 * to skip it entirely could simply set the persisted `aio_auth` flag in
 * localStorage — the check ran client-side and guarded nothing.
 *
 * More importantly it never protected the data: the admin app talked to
 * Supabase with the anon key, and the database's row-level security allowed
 * the anon role to read and write the private tables directly. The login
 * screen was decoration in front of an open door.
 *
 * `login()` therefore always denies. This app is archived and must not be
 * rebuilt and deployed in its current form.
 *
 * To bring it back, authentication and authorization must both be real:
 *   1. Supabase Auth for identity (no password constant in the client).
 *   2. RLS policies keyed to that identity — see the lockdown migration in
 *      supabase/migrations/ and the design questions recorded alongside it.
 *   3. A non-public deployment target for the built app.
 * ══════════════════════════════════════════════════════════════════════════
 */

interface AuthState {
  isAuthenticated: boolean
  login: (password: string) => Promise<boolean>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: async () => {
        // Fail closed. There is no client-side credential to check against,
        // and there must not be one.
        set({ isAuthenticated: false })
        return false
      },
      logout: () => set({ isAuthenticated: false }),
    }),
    {
      name: 'aio_auth',
      // Nothing is persisted any more: the previous version persisted an
      // `isAuthenticated: true` flag that survived reloads and could simply be
      // written by hand in devtools.
      partialize: () => ({}),
    }
  )
)
