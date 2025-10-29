'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/lib/hooks/use-toast'
import { useUpsertProviderSecret } from '@/lib/hooks/use-provider-secrets'

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { value: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  { value: 'mistral', label: 'Mistral', placeholder: '...' },
]

interface ApiKeyStepProps {
  onComplete: () => void
  onSkip: () => void
}

export function ApiKeyStep({ onComplete, onSkip }: ApiKeyStepProps) {
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const upsertSecret = useUpsertProviderSecret()

  const currentProvider = PROVIDER_OPTIONS.find((p) => p.value === provider)
  const isValidKey = apiKey.trim().length >= 4

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValidKey) {
      toast({
        title: 'Invalid API Key',
        description: 'Please enter a valid API key',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      await upsertSecret.mutateAsync({
        provider,
        value: apiKey.trim(),
        display_name: null,
      })

      toast({
        title: 'API Key Saved',
        description: `Your ${currentProvider?.label} API key has been securely stored`,
      })

      // Continue to next step
      onComplete()
    } catch (error) {
      toast({
        title: 'Failed to Save API Key',
        description: 'There was an error saving your API key',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <AlertCircle className="h-4 w-4" />
          <span>Your API keys are encrypted and stored securely. You can add more later in Settings.</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-provider">AI Provider (Optional)</Label>
          <select
            id="api-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
            disabled={isSubmitting}
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">
            {currentProvider?.label} API Key
          </Label>
          <div className="relative">
            <Input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              placeholder={currentProvider?.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isSubmitting}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Card className="p-4 bg-muted/50 border-dashed">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Don't have an API key?</p>
              <p className="text-muted-foreground">
                You can skip this step and add your API key later in Settings. The platform can also work with
                global API keys configured by your organization.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4 pt-4">
        <Button variant="ghost" onClick={onSkip} disabled={isSubmitting}>
          Skip This Step
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!isValidKey || isSubmitting}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Saving...
            </>
          ) : (
            <>
              {isValidKey ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save & Continue
                </>
              ) : (
                'Continue'
              )}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

