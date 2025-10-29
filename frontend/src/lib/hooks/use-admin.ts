import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/lib/api/admin'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useToast } from '@/lib/hooks/use-toast'
import type { AdminUserSummary, AdminUserDetail } from '@/lib/types/api'

const ADMIN_USERS_KEY = ['admin', 'users'] as const

export function useAdminUsers() {
  const isAdmin = useAuthStore((state) => state.user?.is_admin ?? false)

  return useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: () => adminApi.listUsers(),
    enabled: isAdmin,
  })
}

export function useAdminUserDetail(userId?: string) {
  const isAdmin = useAuthStore((state) => state.user?.is_admin ?? false)

  return useQuery<AdminUserDetail>({
    queryKey: ['admin', 'users', userId],
    queryFn: () => adminApi.getUser(userId as string),
    enabled: isAdmin && !!userId,
  })
}

export function useClearUserData() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (userId: string) => adminApi.clearUserData(userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY })
      toast({
        title: 'Success',
        description: data.message ?? 'User data cleared successfully.',
      })
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to clear user data.'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    },
  })
}
