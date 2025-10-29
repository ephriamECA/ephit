'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateNotebook } from '@/lib/hooks/use-notebooks'
import { Sparkles } from 'lucide-react'

// Custom event to trigger scroll after notebook creation
export const NOTEBOOK_CREATED_EVENT = 'notebook-created'

const createNotebookSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type CreateNotebookFormData = z.infer<typeof createNotebookSchema>

interface CreateNotebookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateNotebookDialog({ open, onOpenChange }: CreateNotebookDialogProps) {
  const createNotebook = useCreateNotebook()
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CreateNotebookFormData>({
    resolver: zodResolver(createNotebookSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const closeDialog = () => onOpenChange(false)

  const onSubmit = async (data: CreateNotebookFormData) => {
    await createNotebook.mutateAsync(data)
    closeDialog()
    reset()
    // Dispatch event to trigger scroll to top
    window.dispatchEvent(new CustomEvent(NOTEBOOK_CREATED_EVENT))
  }

  useEffect(() => {
    if (!open) {
      reset()
    }
  }, [open, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="group relative overflow-hidden border border-primary/40 bg-gradient-to-br from-background via-background/80 to-primary/10 shadow-[0_40px_80px_-40px_rgba(59,130,246,0.55)] backdrop-blur-2xl sm:max-w-[520px]">
        <div className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-700 group-hover:opacity-80">
          <div className="absolute -top-28 right-[-25%] h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute -bottom-32 left-[-20%] h-56 w-56 rounded-full bg-muted/40 blur-2xl" />
        </div>

        <div className="relative z-10 space-y-6">
          <DialogHeader className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3 w-3" />
              Notebook Studio
            </div>
            <DialogTitle className="text-2xl font-semibold">
              Create New Notebook
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Craft a dedicated space for this research thread—add a memorable title and a short description so collaborators know what belongs here.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="notebook-name" className="text-xs uppercase tracking-wide text-muted-foreground">
                Name *
              </Label>
              <Input
                id="notebook-name"
                {...register('name')}
                placeholder="Enter notebook name"
                autoFocus
                className="rounded-2xl border border-primary/20 bg-background/60 backdrop-blur-sm transition-shadow focus-visible:border-primary/70 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notebook-description" className="text-xs uppercase tracking-wide text-muted-foreground">
                Description
              </Label>
              <Textarea
                id="notebook-description"
                {...register('description')}
                placeholder="Describe the purpose and scope of this notebook..."
                rows={4}
                className="rounded-2xl border border-primary/20 bg-background/60 backdrop-blur-sm transition-shadow focus-visible:border-primary/70 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]"
              />
            </div>

            <DialogFooter className="gap-3 pt-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={closeDialog} className="rounded-xl border-muted-foreground/30">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || createNotebook.isPending}
                className="rounded-xl bg-primary shadow-[0_20px_30px_-20px_rgba(59,130,246,0.85)] hover:shadow-[0_30px_45px_-20px_rgba(59,130,246,0.95)]"
              >
                {createNotebook.isPending ? 'Creating…' : 'Create Notebook'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
