'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { CreateModelRequest, ProviderAvailability } from '@/lib/types/models'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useCreateModel } from '@/lib/hooks/use-models'
import { Plus } from 'lucide-react'

interface AddModelFormProps {
  modelType: 'language' | 'embedding' | 'text_to_speech' | 'speech_to_text'
  providers: ProviderAvailability
}

export function AddModelForm({ modelType, providers }: AddModelFormProps) {
  const [open, setOpen] = useState(false)
  const createModel = useCreateModel()
  const { register, handleSubmit, formState: { errors }, reset, control, watch } = useForm<CreateModelRequest>({
    defaultValues: {
      type: modelType,
      provider: '',
      name: ''
    }
  })

  // Get available providers that support this model type
  const availableProviders = providers.available.filter(provider =>
    providers.supported_types[provider]?.includes(modelType)
  )

  // Debug: Log the providers data
  console.log('Available providers for', modelType, ':', {
    available: providers.available,
    supported_types: providers.supported_types,
    filtered: availableProviders
  })

  const onSubmit = async (data: CreateModelRequest) => {
    await createModel.mutateAsync(data)
    reset()
    setOpen(false)
  }

  const getModelTypeName = () => {
    return modelType.replace(/_/g, ' ')
  }

  const getModelPlaceholder = () => {
    switch (modelType) {
      case 'language':
        return 'e.g., gpt-5-mini, claude, gemini'
      case 'embedding':
        return 'e.g., text-embedding-3-small'
      case 'text_to_speech':
        return 'e.g., tts-gpt-4o-mini-tts, tts-1-hd'
      case 'speech_to_text':
        return 'e.g., whisper-1'
      default:
        return 'Enter model name'
    }
  }

  if (availableProviders.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {providers.available.length > 0 
          ? `No providers support ${getModelTypeName()} models. Add an API key in Settings → Provider Keys.`
          : 'Add an API key in Settings → Provider Keys to configure models.'
        }
      </div>
    )
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Model
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle>Add {getModelTypeName()} Model</DialogTitle>
          <DialogDescription>
            Configure a new {getModelTypeName()} model from available providers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-0">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Controller
              name="provider"
              control={control}
              rules={{ required: 'Provider is required' }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent className="z-[100] max-h-[200px]">
                    {availableProviders.length === 0 ? (
                      <div className="py-2 text-center text-sm text-muted-foreground">
                        No providers available
                      </div>
                    ) : (
                      availableProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          <span className="capitalize">{provider}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.provider && (
              <p className="text-sm text-destructive">{errors.provider.message as string}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Model Name</Label>
            <Input
              id="name"
              {...register('name', { required: 'Model name is required' })}
              placeholder={getModelPlaceholder()}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
            {modelType === 'language' && watch('provider') === 'azure' && (
              <p className="text-xs text-muted-foreground">
                For Azure, use the deployment name as the model name
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createModel.isPending}>
              {createModel.isPending ? 'Adding...' : 'Add Model'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}