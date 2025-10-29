'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getApiUrl } from '@/lib/config'
import type { AuthResponse, AuthUser } from '@/lib/types/api'
import { queryClient } from '@/lib/api/query-client'

const TOKEN_COOKIE = 'auth-token'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

const setAuthCookie = (token: string | null) => {
  if (typeof document === 'undefined') {
    return
  }

  if (token) {
    document.cookie = `${TOKEN_COOKIE}=${token}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; sameSite=Lax`
  } else {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; sameSite=Lax`
  }
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  hasHydrated: boolean
  setHasHydrated: (value: boolean) => void
  setSession: (payload: AuthResponse) => void
  clearSession: () => void
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, displayName?: string) => Promise<boolean>
  logout: () => void
  refreshSession: () => Promise<void>
}

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json()
    if (data?.detail) {
      if (Array.isArray(data.detail)) {
        return data.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(', ')
      }
      if (typeof data.detail === 'string') {
        return data.detail
      }
    }
  } catch {
    // Ignore parse errors and fall back to status text
  }
  return response.status === 0 ? 'Network error' : response.statusText || 'Request failed'
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      hasHydrated: false,

      setHasHydrated: (value: boolean) => set({ hasHydrated: value }),

      setSession: (payload: AuthResponse) => {
        queryClient.clear()
        set({
          user: payload.user,
          accessToken: payload.access_token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        })
        setAuthCookie(payload.access_token)
      },

      clearSession: () => {
        queryClient.clear()
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        })
        setAuthCookie(null)
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()
          const response = await fetch(`${apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          })

          if (!response.ok) {
            const message = await parseErrorMessage(response)
            set({ error: message, isLoading: false })
            return false
          }

          const data: AuthResponse = await response.json()
          get().setSession(data)
          return true
        } catch (error) {
          console.error('Login error:', error)
          set({ error: 'Unable to connect to server.', isLoading: false })
          return false
        }
      },

      register: async (email: string, password: string, displayName?: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()
          const response = await fetch(`${apiUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              password,
              display_name: displayName,
            }),
          })

          if (!response.ok) {
            const message = await parseErrorMessage(response)
            set({ error: message, isLoading: false })
            return false
          }

          const data: AuthResponse = await response.json()
          get().setSession(data)
          return true
        } catch (error) {
          console.error('Registration error:', error)
          set({ error: 'Unable to connect to server.', isLoading: false })
          return false
        }
      },

      refreshSession: async () => {
        const token = get().accessToken
        if (!token) {
          return
        }

        try {
          const apiUrl = await getApiUrl()
          const response = await fetch(`${apiUrl}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            get().clearSession()
            return
          }

          const user: AuthUser = await response.json()
          set({
            user,
            isAuthenticated: true,
            error: null,
          })
        } catch (error) {
          console.error('Failed to refresh session:', error)
          get().clearSession()
        }
      },

      logout: () => {
        get().clearSession()
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
