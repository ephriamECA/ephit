'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAdminUsers, useAdminUserDetail, useClearUserData } from '@/lib/hooks/use-admin'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Loader2, ShieldAlert, Trash2, Users } from 'lucide-react'
import type { AdminUserSummary } from '@/lib/types/api'

export default function AdminDashboardPage() {
  const router = useRouter()
  const authState = useAuthStore()
  const hasHydrated = authState.hasHydrated
  const isAdmin = authState.user?.is_admin ?? false

  const [selectedUserId, setSelectedUserId] = useState<string | undefined>()

  const { data: users, isLoading: usersLoading, refetch } = useAdminUsers()
  const { data: userDetail, isLoading: detailLoading } = useAdminUserDetail(selectedUserId)
  const clearUserData = useClearUserData()

  useEffect(() => {
    if (hasHydrated && !isAdmin) {
      router.replace('/notebooks')
    }
  }, [hasHydrated, isAdmin, router])

  useEffect(() => {
    if (!selectedUserId && users && users.length > 0) {
      setSelectedUserId(users[0].id)
    } else if (selectedUserId && users && !users.find((u) => u.id === selectedUserId)) {
      setSelectedUserId(undefined)
    }
  }, [users, selectedUserId])

  const totalCounts = useMemo(() => {
    if (!users) {
      return { notebooks: 0, sources: 0, notes: 0, episodes: 0 }
    }
    return users.reduce(
      (acc, user) => ({
        notebooks: acc.notebooks + user.notebook_count,
        sources: acc.sources + user.source_count,
        notes: acc.notes + user.note_count,
        episodes: acc.episodes + user.episode_count,
      }),
      { notebooks: 0, sources: 0, notes: 0, episodes: 0 }
    )
  }, [users])

  if (!hasHydrated || !isAdmin) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Checking admin permissions…</p>
        </div>
      </AppShell>
    )
  }

  const handleSelectUser = (user: AdminUserSummary) => {
    setSelectedUserId(user.id)
  }

  const handleClearUser = async (user: AdminUserSummary) => {
    if (authState.user?.id === user.id) {
      window.alert('Admins cannot clear their own data.')
      return
    }
    const confirmed = window.confirm(
      `This will permanently delete notebooks, notes, sources, and podcast episodes for ${user.email}. Continue?`
    )
    if (!confirmed) {
      return
    }
    await clearUserData.mutateAsync(user.id)
    refetch()
  }

  return (
    <AppShell>
      <div className="relative px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
                <Users className="h-8 w-8 text-primary" />
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground">
                Review workspace usage and manage user data.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={usersLoading}>
              <RefreshIcon spinning={usersLoading} />
              Refresh
            </Button>
          </header>

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div>
                  <h2 className="text-lg font-semibold">Usage overview</h2>
                  <p className="text-sm text-muted-foreground">
                    Totals across all users.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <OverviewStat label="Notebooks" value={totalCounts.notebooks} />
                    <OverviewStat label="Sources" value={totalCounts.sources} />
                    <OverviewStat label="Notes" value={totalCounts.notes} />
                    <OverviewStat label="Episodes" value={totalCounts.episodes} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Users</h2>
                    <span className="text-sm text-muted-foreground">
                      {users?.length ?? 0} total
                    </span>
                  </div>
                  <ScrollArea className="h-[360px]">
                    <div className="space-y-2 pr-2">
                      {usersLoading && (
                        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading users…
                        </div>
                      )}
                      {!usersLoading && users?.length === 0 && (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          No users found.
                        </div>
                      )}
                      {users?.map((user) => {
                        const isSelected = user.id === selectedUserId
                        return (
                          <button
                            key={user.id}
                            onClick={() => handleSelectUser(user)}
                            className={`w-full rounded-xl border p-3 text-left transition hover:border-primary/40 hover:shadow ${
                              isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{user.email}</p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {user.display_name || '—'}
                                </p>
                              </div>
                              {user.is_admin && (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <span>Notebooks: {user.notebook_count}</span>
                              <span>Sources: {user.source_count}</span>
                              <span>Notes: {user.note_count}</span>
                              <span>Episodes: {user.episode_count}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                {(!users || users.length === 0) && (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No user selected.
                  </div>
                )}

                {users && users.length > 0 && selectedUserId && (
                  <>
                    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold">
                          {userDetail?.email ??
                            users.find((u) => u.id === selectedUserId)?.email}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {userDetail?.display_name ??
                            users.find((u) => u.id === selectedUserId)?.display_name ??
                            'No display name'}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          const user = users.find((u) => u.id === selectedUserId)
                          if (user) handleClearUser(user)
                        }}
                        disabled={clearUserData.isPending}
                        className="flex items-center gap-2"
                      >
                        {clearUserData.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Clear User Data
                      </Button>
                    </header>

                    <Separator className="my-4" />

                    {detailLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading user details…
                      </div>
                    )}

                    {!detailLoading && userDetail && (
                      <div className="space-y-6">
                        <DetailSection title="Notebooks" items={userDetail.notebooks} emptyLabel="No notebooks">
                          {(item) => (
                            <>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatDate(item.created)} · Updated {formatDate(item.updated)}
                              </p>
                            </>
                          )}
                        </DetailSection>

                        <DetailSection title="Sources" items={userDetail.sources} emptyLabel="No sources">
                          {(item) => (
                            <>
                              <p className="font-medium">{item.title || 'Untitled source'}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatDate(item.created)} · Updated {formatDate(item.updated)}
                              </p>
                            </>
                          )}
                        </DetailSection>

                        <DetailSection title="Notes" items={userDetail.notes} emptyLabel="No notes">
                          {(item) => (
                            <>
                              <p className="font-medium">{item.title || 'Untitled note'}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatDate(item.created)} · Updated {formatDate(item.updated)}
                              </p>
                            </>
                          )}
                        </DetailSection>

                        <DetailSection title="Podcast Episodes" items={userDetail.episodes} emptyLabel="No episodes">
                          {(item) => (
                            <>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Created {formatDate(item.created)} · Updated {formatDate(item.updated)}
                              </p>
                            </>
                          )}
                        </DetailSection>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-xs uppercase tracking-tight text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  }
  return <Loader2 className="mr-2 h-4 w-4" />
}

interface DetailSectionProps<T> {
  title: string
  items: T[]
  emptyLabel: string
  children: (item: T) => ReactNode
}

function DetailSection<T>({ title, items, emptyLabel, children }: DetailSectionProps<T>) {
  return (
    <section>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 space-y-2">
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyLabel}</div>
        )}
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border bg-muted/30 p-3 text-sm">
            {children(item)}
          </div>
        ))}
      </div>
    </section>
  )
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}
