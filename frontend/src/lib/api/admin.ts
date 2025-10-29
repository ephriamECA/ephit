import apiClient from './client'
import type {
  AdminUserSummary,
  AdminUserDetail,
} from '@/lib/types/api'

export const adminApi = {
  listUsers: async () => {
    const response = await apiClient.get<AdminUserSummary[]>('/admin/users')
    return response.data
  },

  getUser: async (userId: string) => {
    const response = await apiClient.get<AdminUserDetail>(`/admin/users/${userId}`)
    return response.data
  },

  clearUserData: async (userId: string) => {
    const response = await apiClient.post<{ message: string }>(`/admin/users/${userId}/clear`)
    return response.data
  },
}

