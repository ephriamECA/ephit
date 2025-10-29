# Frontend Layout Architecture

This document explains how the Open Notebook frontend layout system works and how to create new layouts without changing functionality.

## High-Level Architecture

```
app/
├── layout.tsx                    # Root layout (providers, themes, auth guards)
├── (auth)/                       # Auth route group
│   └── login/page.tsx           # Login page (no sidebar)
└── (dashboard)/                  # Dashboard route group
    ├── layout.tsx               # Dashboard auth guard + ModalProvider
    ├── page.tsx                 # Redirects to /notebooks
    ├── notebooks/page.tsx       # Uses AppShell wrapper
    ├── sources/page.tsx         # Uses AppShell wrapper
    └── ...other pages           # All use AppShell wrapper
```

## Key Components

### 1. **Root Layout** (`app/layout.tsx`)
- **Purpose**: Global providers and error boundaries
- **Wraps**: All pages (auth and dashboard)
- **Contains**: 
  - ThemeProvider (dark/light mode)
  - QueryProvider (React Query)
  - ErrorBoundary
  - ConnectionGuard (API connection status)
  - Toaster (notifications)

### 2. **Dashboard Layout** (`app/(dashboard)/layout.tsx`)
- **Purpose**: Auth protection for dashboard routes
- **Wraps**: Only dashboard pages
- **Contains**:
  - Authentication check with redirect to `/login`
  - Loading states during auth
  - ModalProvider (global modals)
  - ErrorBoundary

### 3. **AppShell Component** (`components/layout/AppShell.tsx`)
- **Purpose**: Main UI shell with sidebar
- **Structure**:
  ```tsx
  <div className="flex h-screen overflow-hidden">
    <AppSidebar />           {/* Fixed left sidebar */}
    <div className="flex-1"> {/* Main content area */}
      <main>{children}</main>
    </div>
  </div>
  ```

### 4. **AppSidebar** (`components/layout/AppSidebar.tsx`)
- **Purpose**: Navigation sidebar with collapsible functionality
- **Features**:
  - Collapsible (stored in Zustand store)
  - Navigation sections (Collect, Process, Create, Manage)
  - Create button with dropdown
  - Theme toggle
  - Sign out button
- **State**: Managed by `sidebar-store.ts`

## How Pages Use the Layout

Every dashboard page follows this pattern:

```tsx
export default function SomePage() {
  return (
    <AppShell>
      {/* Page content here */}
      <div className="p-6">
        <h1>Page Title</h1>
        {/* content */}
      </div>
    </AppShell>
  )
}
```

## Creating a New Layout

To create a new layout **without changing functionality**, you have these options:

### Option 1: Wrap AppShell (Recommended)
Create a new wrapper component that extends AppShell:

```tsx
// components/layout/NewAppShell.tsx
import { AppShell } from './AppShell'

interface NewAppShellProps {
  children: React.ReactNode
}

export function NewAppShell({ children }: NewAppShellProps) {
  return (
    <AppShell>
      {/* Add new layout elements here */}
      <div className="custom-header">
        {/* Custom header content */}
      </div>
      <div className="custom-main">
        {children}
      </div>
    </AppShell>
  )
}
```

Then use it in pages:
```tsx
import { NewAppShell } from '@/components/layout/NewAppShell'

export default function SomePage() {
  return (
    <NewAppShell>
      {/* page content */}
    </NewAppShell>
  )
}
```

### Option 2: Modify AppShell
Edit `AppShell.tsx` to add new layout features:

```tsx:11:20:frontend/src/components/layout/AppShell.tsx
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      {/* Add top header here */}
      <div className="flex-1 flex flex-col">
        <header className="custom-header">New Header</header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
```

### Option 3: Create Alternative Layout Component
Create a completely new layout that coexists:

```tsx
// components/layout/AlternativeLayout.tsx
export function AlternativeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] h-screen">
      {/* Custom sidebar */}
      <aside>Custom sidebar</aside>
      {/* Main content */}
      <div>{children}</div>
    </div>
  )
}
```

## Layout Characteristics

### Sidebar Behavior
- **Collapsible**: Click chevron to toggle
- **State**: Persisted in localStorage via Zustand
- **Width**: 256px expanded, 64px collapsed
- **Sections**: Grouped by workflow (Collect, Process, Create, Manage)

### Main Content Area
- **Flex layout**: Takes remaining space
- **Scroll**: Each page manages its own scroll
- **Padding**: Pages apply their own padding

### Responsive Design
- Tailwind CSS classes
- Uses `@apply` directives
- CSS variables for theming
- Custom sidebar theme colors

## Theme System

### CSS Variables (Light/Dark)
Defined in `globals.css`:
- `--sidebar`: Sidebar background
- `--sidebar-foreground`: Sidebar text
- `--sidebar-border`: Sidebar border
- `--sidebar-accent`: Active/hover states

### Theme Toggle
Located in sidebar footer
- Stored in theme-store.ts
- Uses localStorage for persistence

## State Management

### Sidebar Store (`sidebar-store.ts`)
```typescript
interface SidebarState {
  isCollapsed: boolean
  toggleCollapse: () => void
  setCollapsed: (collapsed: boolean) => void
}
```

### Auth Store (`auth-store.ts`)
- Manages authentication state
- Provides `logout()` function
- Connected to API auth endpoints

### Navigation Store (`navigation-store.ts`)
- Manages navigation state
- Used for programmatic navigation

## Layout Components Usage Examples

### Example 1: Notebooks Page
```tsx
// app/(dashboard)/notebooks/page.tsx
export default function NotebooksPage() {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Content */}
      </div>
    </AppShell>
  )
}
```

### Example 2: Sources Page
```tsx
// app/(dashboard)/sources/page.tsx
export default function SourcesPage() {
  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Content */}
      </div>
    </AppShell>
  )
}
```

## Best Practices for New Layouts

1. **Keep AppShell**: Don't break the sidebar integration
2. **Add new layers**: Wrap AppShell rather than replace it
3. **Maintain scroll**: Let each page manage its own scroll area
4. **Respect theme**: Use CSS variables for colors
5. **Test responsive**: Ensure works on mobile/tablet
6. **Preserve state**: Keep sidebar collapse state working

## Common Layout Modifications

### Add Top Header
```tsx
export function HeaderAppShell({ children }: Props) {
  return (
    <AppShell>
      <header className="bg-background border-b">
        <div className="px-6 py-4">
          <h1>Custom Header</h1>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </AppShell>
  )
}
```

### Add Bottom Footer
```tsx
export function FooterAppShell({ children }: Props) {
  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <footer className="bg-background border-t">
        <div className="px-6 py-4">
          <p>Custom Footer</p>
        </div>
      </footer>
    </AppShell>
  )
}
```

### Change Sidebar Width
Modify `AppSidebar.tsx`:
```tsx
className={cn(
  'app-sidebar flex h-full',
  isCollapsed ? 'w-16' : 'w-80' // Changed from w-64 to w-80
)}
```

### Add Breadcrumbs
```tsx
export function BreadcrumbShell({ children, breadcrumbs }: Props) {
  return (
    <AppShell>
      <nav className="px-6 py-2 border-b">
        {/* Breadcrumb component */}
      </nav>
      {children}
    </AppShell>
  )
}
```

## Testing Your New Layout

1. Start dev server: `cd frontend && npm run dev`
2. Navigate to different pages
3. Test sidebar collapse/expand
4. Test theme toggle (light/dark)
5. Test responsive breakpoints
6. Verify all navigation links work
7. Test keyboard navigation
8. Verify modal overlays display correctly

## Summary

- **AppShell** provides the base layout (sidebar + content)
- Pages wrap content with **AppShell**
- **AppSidebar** handles navigation and state
- Create new layouts by **wrapping** AppShell
- Maintain functionality by preserving provider hierarchy
- Use CSS variables for theming
- State managed by Zustand stores

To create a new layout, start by wrapping AppShell with your custom components while keeping the existing functionality intact.






