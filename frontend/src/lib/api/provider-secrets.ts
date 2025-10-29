import apiClient from './client'
import {
  ProviderSecretDetail,
  ProviderSecretSummary,
} from '@/lib/types/api'

export const providerSecretsApi = {
  async list(): Promise<ProviderSecretSummary[]> {
    const response = await apiClient.get<ProviderSecretSummary[]>('/provider-secrets')
    return response.data
  },

  async get(provider: string): Promise<ProviderSecretDetail> {
    const response = await apiClient.get<ProviderSecretDetail>(`/provider-secrets/${provider}`)
    return response.data
  },

  async upsert(payload: { provider: string; value: string; display_name?: string | null }) {
    const response = await apiClient.post<ProviderSecretSummary>('/provider-secrets', payload)
    return response.data
  },

  async remove(provider: string) {
    await apiClient.delete(`/provider-secrets/${provider}`)
  },
}
