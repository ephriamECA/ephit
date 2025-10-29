'use client'

/**
 * Example: New Layout Implementation
 * 
 * This demonstrates how to create a new layout without breaking existing functionality.
 * It wraps AppShell with additional UI elements.
 */

import { AppShell } from './AppShell'
import { Button } from '@/components/ui/button'
import { Bell, Search } from 'lucide-react'

interface ExampleNewLayoutProps {
  children: React.ReactNode
}

/**
 * Example Layout 1: With Top Header Bar
 * Adds a header bar above the main content but keeps sidebar intact
 */
export function HeaderLayout({ children }: ExampleNewLayoutProps) {
  return (
    <AppShell>
      {/* New header bar */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Workspace</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      
      {/* Main content area with scrolling */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </AppShell>
  )
}

/**
 * Example Layout 2: Split View
 * Divides content into two panels
 */
export function SplitLayout({ 
  children, 
  leftPanel, 
  rightPanel 
}: ExampleNewLayoutProps & { 
  leftPanel?: React.ReactNode
  rightPanel?: React.ReactNode 
}) {
  return (
    <AppShell>
      <div className="flex h-full">
        {/* Left panel */}
        {leftPanel && (
          <aside className="w-80 border-r overflow-auto">
            {leftPanel}
          </aside>
        )}
        
        {/* Center content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        
        {/* Right panel */}
        {rightPanel && (
          <aside className="w-80 border-l overflow-auto">
            {rightPanel}
          </aside>
        )}
      </div>
    </AppShell>
  )
}

/**
 * Example Layout 3: Dashboard Grid
 * Shows content in a grid layout with widgets
 */
export function DashboardLayout({ children }: ExampleNewLayoutProps) {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Dashboard header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        
        {/* Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children}
        </div>
      </div>
    </AppShell>
  )
}

/**
 * Example Layout 4: Full Width No Padding
 * Removes default padding for edge-to-edge content
 */
export function FullWidthLayout({ children }: ExampleNewLayoutProps) {
  return (
    <AppShell>
      <div className="h-full w-full">
        {children}
      </div>
    </AppShell>
  )
}

/**
 * Example Layout 5: With Bottom Action Bar
 * Adds a fixed action bar at the bottom
 */
export function ActionBarLayout({ 
  children,
  actions 
}: ExampleNewLayoutProps & { 
  actions: React.ReactNode 
}) {
  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {/* Main content with scroll */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
        
        {/* Fixed bottom action bar */}
        <footer className="border-t bg-background">
          <div className="flex h-16 items-center px-6 justify-end gap-2">
            {actions}
          </div>
        </footer>
      </div>
    </AppShell>
  )
}

/**
 * Example Layout 6: Tabbed Interface
 * Adds tabs above content area
 */
export function TabbedLayout({ 
  children,
  tabs 
}: ExampleNewLayoutProps & { 
  tabs: { id: string; label: string; content: React.ReactNode }[]
}) {
  // This is a simplified example - you'd want to add tab state management
  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {/* Tab bar */}
        <div className="border-b bg-background">
          <div className="flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className="px-6 py-3 border-b-2 border-transparent hover:border-primary/50"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </AppShell>
  )
}






