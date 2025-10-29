import { apiClient } from './client'
import type { UserResponse } from '../types/api'

export async function completeOnboarding(): Promise<UserResponse> {
  const response = await apiClient.put<UserResponse>('/auth/onboarding/complete')
  return response.data
}

