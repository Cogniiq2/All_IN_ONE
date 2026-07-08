import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  isAuthenticated: boolean
  login: (password: string) => Promise<boolean>
  logout: () => void
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'aio2024'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: async (password: string) => {
        await new Promise((r) => setTimeout(r, 800))
        if (password === ADMIN_PASSWORD) {
          set({ isAuthenticated: true })
          return true
        }
        return false
      },
      logout: () => set({ isAuthenticated: false }),
    }),
    {
      name: 'aio_auth',
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated }),
    }
  )
)
