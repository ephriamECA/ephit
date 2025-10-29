'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

import { providerSecretsApi } from '@/lib/api/provider-secrets'
import { QUERY_KEYS, queryClient } from '@/lib/api/query-client'
import type { ProviderSecretDetail, ProviderSecretSummary } from '@/lib/types/api'

export interface UpsertProviderSecretPayload {
  provider: string
  value: string
  display_name?: string | null
}

export function useProviderSecrets() {
  return useQuery<ProviderSecretSummary[]>({
    queryKey: QUERY_KEYS.providerSecrets,
    queryFn: () => providerSecretsApi.list(),
  })
}

export function useUpsertProviderSecret() {
  return useMutation({
    mutationFn: (payload: UpsertProviderSecretPayload) => providerSecretsApi.upsert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.providerSecrets })
    },
  })
}

export function useDeleteProviderSecret() {
  return useMutation({
    mutationFn: (provider: string) => providerSecretsApi.remove(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.providerSecrets })
    },
  })
}

export function useRevealProviderSecret() {
  return useMutation<ProviderSecretDetail, Error, string>({
    mutationFn: (provider: string) => providerSecretsApi.get(provider),
  })
}
