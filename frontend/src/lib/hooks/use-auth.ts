'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'

export function useAuth() {
  const router = useRouter()
  const {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    error,
    hasHydrated,
    login,
    register,
    logout,
    refreshSession,
  } = useAuthStore()

  useEffect(() => {
    if (!hasHydrated) {
      return
    }
    if (accessToken && !user) {
      void refreshSession()
    }
  }, [accessToken, user, refreshSession, hasHydrated])

  const handleLogin = async (email: string, password: string) => {
    const success = await login(email, password)
    if (success) {
      const redirectPath = sessionStorage.getItem('redirectAfterLogin')
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin')
        router.push(redirectPath)
      } else {
        router.push('/notebooks')
      }
    }
    return success
  }

  const handleRegister = async (email: string, password: string, displayName?: string) => {
    const success = await register(email, password, displayName)
    if (success) {
      router.push('/notebooks')
    }
    return success
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return {
    user,
    accessToken,
    isAuthenticated,
    isLoading: isLoading || !hasHydrated,
    error,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  }
}
