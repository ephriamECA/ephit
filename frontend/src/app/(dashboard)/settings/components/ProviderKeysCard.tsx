'use client'

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, KeyRound, Loader2, Trash2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'
import {
  UpsertProviderSecretPayload,
  useDeleteProviderSecret,
  useProviderSecrets,
  useRevealProviderSecret,
  useUpsertProviderSecret,
} from '@/lib/hooks/use-provider-secrets'
import type { ProviderSecretSummary } from '@/lib/types/api'

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'vertexai', label: 'Google Vertex AI' },
  { value: 'groq', label: 'Groq' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI' },
  { value: 'voyage', label: 'Voyage AI' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'openrouter', label: 'OpenRouter' },
]

const providerSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  value: z.string().min(4, 'API key is required'),
  display_name: z.string().max(120).optional().or(z.literal('')),
})

type ProviderFormData = z.infer<typeof providerSchema>

function formatTimestamp(value?: string | null) {
  if (!value) return 'Unknown'
  try {
    return new Date(value).toLocaleString()
  } catch (error) {
    return value
  }
}

function humanizeProvider(value: string) {
  return PROVIDER_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function ProviderKeysCard() {
  const { toast } = useToast()
  const { data: storedSecrets, isLoading, error } = useProviderSecrets()
  const upsertSecret = useUpsertProviderSecret()
  const deleteSecret = useDeleteProviderSecret()
  const revealSecret = useRevealProviderSecret()

  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [revealedProviders, setRevealedProviders] = useState<Record<string, boolean>>({})

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      provider: '',
      value: '',
      display_name: '',
    },
  })

  const selectedProvider = watch('provider')

  const knownProviders = useMemo(() => PROVIDER_OPTIONS, [])

  useEffect(() => {
    if (!selectedProvider && knownProviders.length > 0) {
      setValue('provider', knownProviders[0].value)
    }
  }, [knownProviders, selectedProvider, setValue])

  const onSubmit = async (data: ProviderFormData) => {
    const payload: UpsertProviderSecretPayload = {
      provider: data.provider,
      value: data.value.trim(),
      display_name: data.display_name?.trim() || undefined,
    }

    try {
      await upsertSecret.mutateAsync(payload)
      toast({
        title: 'Saved',
        description: `${humanizeProvider(payload.provider)} credentials updated`,
      })
      setEditingProvider(null)
      setRevealedProviders((prev) => ({ ...prev, [payload.provider]: false }))
      reset({ provider: payload.provider, value: '', display_name: payload.display_name ?? '' })
    } catch (mutationError) {
      toast({
        title: 'Failed to save credentials',
        description:
          mutationError instanceof Error ? mutationError.message : 'An unexpected error occurred.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = async (secret: ProviderSecretSummary) => {
    setEditingProvider(secret.provider)
    setValue('provider', secret.provider)
    setValue('display_name', secret.display_name ?? '')
    try {
      const detail = await revealSecret.mutateAsync(secret.provider)
      setValue('value', detail.value)
      setRevealedProviders((prev) => ({ ...prev, [secret.provider]: true }))
    } catch (revealError) {
      toast({
        title: 'Unable to load credential',
        description: revealError instanceof Error ? revealError.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (provider: string) => {
    try {
      await deleteSecret.mutateAsync(provider)
      toast({
        title: 'Removed',
        description: `${humanizeProvider(provider)} credentials removed`,
      })
      if (editingProvider === provider) {
        setEditingProvider(null)
        reset({ provider: '', value: '', display_name: '' })
      }
    } catch (mutationError) {
      toast({
        title: 'Failed to remove credentials',
        description:
          mutationError instanceof Error ? mutationError.message : 'An unexpected error occurred.',
        variant: 'destructive',
      })
    }
  }

  const toggleReveal = async (provider: string) => {
    const currentlyRevealed = revealedProviders[provider]
    if (currentlyRevealed) {
      setRevealedProviders((prev) => ({ ...prev, [provider]: false }))
      if (editingProvider !== provider) {
        setValue('value', '')
      }
      return
    }

    try {
      const detail = await revealSecret.mutateAsync(provider)
      setValue('value', detail.value)
      setRevealedProviders((prev) => ({ ...prev, [provider]: true }))
    } catch (errorReveal) {
      toast({
        title: 'Unable to reveal credential',
        description: errorReveal instanceof Error ? errorReveal.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider Credentials</CardTitle>
        <CardDescription>
          Store API keys securely per user. Keys are encrypted using your FERNET_SECRET_KEY and applied only while jobs run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="provider-select">Provider</Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => {
                setValue('provider', value)
                if (editingProvider !== value) {
                  setEditingProvider(null)
                  setValue('value', '')
                  setValue('display_name', '')
                  setRevealedProviders((prev) => ({ ...prev, [value]: false }))
                }
              }}
              disabled={isLoading || upsertSecret.isPending}
            >
              <SelectTrigger id="provider-select" className="mt-1">
                <SelectValue placeholder="Choose provider" />
              </SelectTrigger>
              <SelectContent>
                {knownProviders.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display name (optional)</Label>
            <Input id="display_name" placeholder="Personal label" {...register('display_name')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider_value">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="provider_value"
                type={selectedProvider && revealedProviders[selectedProvider] ? 'text' : 'password'}
                placeholder="Paste API key"
                {...register('value')}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedProvider && toggleReveal(selectedProvider)}
                disabled={!selectedProvider || revealSecret.isPending}
              >
                {revealSecret.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedProvider && revealedProviders[selectedProvider] ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    <span className="sr-only">Hide key</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    <span className="sr-only">Reveal key</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {editingProvider && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingProvider(null)
                  reset({ provider: '', value: '', display_name: '' })
                  setRevealedProviders({})
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting || upsertSecret.isPending || !selectedProvider}
            >
              {(isSubmitting || upsertSecret.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingProvider ? 'Update Key' : 'Save Key'}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Stored credentials</h3>
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading credentials…</div>
          ) : error ? (
            <div className="text-sm text-destructive">Failed to load credentials</div>
          ) : storedSecrets && storedSecrets.length > 0 ? (
            <div className="space-y-2">
              {storedSecrets.map((secret) => (
                <div
                  key={secret.provider}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{humanizeProvider(secret.provider)}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatTimestamp(secret.updated)}
                      {secret.display_name ? ` • ${secret.display_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(secret)}
                      disabled={revealSecret.isPending}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(secret.provider)}
                      disabled={deleteSecret.isPending}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No credentials saved yet. Add your provider keys above so background jobs can access the right APIs.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
