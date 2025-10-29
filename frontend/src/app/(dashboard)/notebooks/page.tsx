'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { NotebookList } from './components/NotebookList'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, Search, BookOpen, Calendar, Sparkles } from 'lucide-react'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { CreateNotebookDialog, NOTEBOOK_CREATED_EVENT } from '@/components/notebooks/CreateNotebookDialog'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog'
import { useAuthStore } from '@/lib/stores/auth-store'
import { completeOnboarding } from '@/lib/api/onboarding'

// Modern Notebook Card Component
function NotebookCard({ notebook, archived = false }: { notebook: any, archived?: boolean }) {
  return (
    <Link href={`/notebooks/${notebook.id}`}>
      <Card className="h-full group hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] cursor-pointer overflow-hidden relative specular-highlight">
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Side Accent Bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-r-full" />
        
        <CardContent className="p-6 relative">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold mb-1 truncate group-hover:text-primary transition-colors">
                {notebook.name}
              </h3>
              {archived && (
                <Badge variant="secondary" className="mt-2">
                  Archived
                </Badge>
              )}
            </div>
            <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span>{notebook.sources_count || 0} sources</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                {formatDistanceToNow(new Date(notebook.updated), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Description */}
          {notebook.description && (
            <p className="mt-4 text-sm text-muted-foreground line-clamp-2">
              {notebook.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export default function NotebooksPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const { data: notebooks, isLoading, refetch } = useNotebooks(false)
  const { data: archivedNotebooks } = useNotebooks(true)
  const mainContentRef = useRef<HTMLDivElement>(null)
  const { user, setSession, accessToken } = useAuthStore()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Check if user needs onboarding
  useEffect(() => {
    if (user && !user.has_completed_onboarding) {
      setShowOnboarding(true)
    } else if (user && user.has_completed_onboarding) {
      setShowOnboarding(false)
    }
  }, [user])

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false)
    try {
      await completeOnboarding()
      // Update user in store to reflect onboarding completion
      if (user && accessToken) {
        const updatedUser = { ...user, has_completed_onboarding: true }
        setSession({
          access_token: accessToken,
          token_type: 'bearer',
          user: updatedUser
        })
      }
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
      // Still close the dialog even if API call fails
      setShowOnboarding(false)
    }
  }

  const normalizedQuery = searchTerm.trim().toLowerCase()

  // Listen for notebook creation and scroll to top
  useEffect(() => {
    const handleNotebookCreated = () => {
      // Wait for query to invalidate and rerender
      setTimeout(() => {
        // Scroll to show the notebooks section with smooth animation
        if (mainContentRef.current) {
          mainContentRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          })
        } else {
          // Fallback: try to find the main content div and scroll
          const mainContent = document.querySelector('[class*="max-w-7xl mx-auto px-4"]')
          if (mainContent) {
            mainContent.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start',
              inline: 'nearest'
            })
          }
        }
      }, 500)
    }

    window.addEventListener(NOTEBOOK_CREATED_EVENT, handleNotebookCreated)
    return () => {
      window.removeEventListener(NOTEBOOK_CREATED_EVENT, handleNotebookCreated)
    }
  }, [])

  const filteredActive = useMemo(() => {
    if (!notebooks) {
      return undefined
    }
    if (!normalizedQuery) {
      return notebooks
    }
    return notebooks.filter((notebook) =>
      notebook.name.toLowerCase().includes(normalizedQuery)
    )
  }, [notebooks, normalizedQuery])

  const filteredArchived = useMemo(() => {
    if (!archivedNotebooks) {
      return undefined
    }
    if (!normalizedQuery) {
      return archivedNotebooks
    }
    return archivedNotebooks.filter((notebook) =>
      notebook.name.toLowerCase().includes(normalizedQuery)
    )
  }, [archivedNotebooks, normalizedQuery])

  const hasArchived = (archivedNotebooks?.length ?? 0) > 0
  const isSearching = normalizedQuery.length > 0

  return (
    <AppShell>
      <div className="relative">
          {/* Hero Section - Liquid Glass */}
        <div className="relative px-4 sm:px-6 py-8 sm:py-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-6 sm:gap-8">
              <div className="flex-1 w-full sm:w-auto">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 tracking-tight">
                  Your Notebooks
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground mb-6">
                  Organize your research and knowledge in one place
                </p>
                
                {/* Quick stats - Liquid Glass */}
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                  <div className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl liquid-glass backdrop-blur-xl border border-border/20 shadow-lg">
                    <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">
                      {(notebooks?.length ?? 0) + (archivedNotebooks?.length ?? 0)}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
                  </div>
                </div>
              </div>
              
              {/* Floating Action Button */}
              <Button 
                size="lg"
                onClick={() => setCreateDialogOpen(true)}
                className="w-full sm:w-auto rounded-2xl shadow-2xl shadow-primary/30 hover:shadow-primary/40 liquid-glass backdrop-blur-2xl transition-all duration-300 hover:scale-105"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="hidden sm:inline">New Notebook</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div ref={mainContentRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Search and Filters - Liquid Glass */}
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground z-10" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search notebooks..."
                className="pl-9 sm:pl-12"
              />
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => refetch()}
              className="shrink-0 rounded-xl sm:rounded-2xl liquid-glass backdrop-blur-xl w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>

          {/* Masonry Grid Layout */}
          <div className="space-y-12">
            {/* Active Notebooks */}
            <section>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Active</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your current research projects
                  </p>
                </div>
              </div>
              
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-64 rounded-2xl bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredActive && filteredActive.length > 0 ? (
                    filteredActive.map((notebook) => (
                      <NotebookCard key={notebook.id} notebook={notebook} />
                    ))
                  ) : (
                    <div className="col-span-full py-16 text-center">
                      <div className="text-6xl mb-4">📝</div>
                      <h3 className="text-xl font-semibold mb-2">
                        {isSearching ? 'No notebooks match your search' : 'No notebooks yet'}
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        {isSearching ? 'Try using a different term' : 'Create your first notebook to get started'}
                      </p>
                      {!isSearching && (
                        <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                          <Plus className="h-5 w-5 mr-2" />
                          Create Your First Notebook
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Archived Notebooks */}
            {hasArchived && (
              <section>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Archived</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Completed or inactive projects
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredArchived && filteredArchived.length > 0 ? (
                    filteredArchived.map((notebook) => (
                      <NotebookCard key={notebook.id} notebook={notebook} archived />
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No archived notebooks match your search
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <CreateNotebookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <OnboardingDialog
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </AppShell>
  )
}
