# Layout Visual Guide

## Current Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Root Layout (app/layout.tsx)                           │
│  ├─ ThemeProvider                                        │
│  ├─ QueryProvider                                       │
│  └─ ConnectionGuard                                     │
│     ┌──────────────────────────────────────────────────┐│
│     │  Dashboard Layout (app/(dashboard)/layout.tsx)  ││
│     │  ├─ Auth Check                                    ││
│     │  └─ ModalProvider                                 ││
│     │     ┌──────────────────────────────────────────┐  ││
│     │     │  AppShell (components/layout/AppShell.tsx)│ ││
│     │     │  ┌──────────┬──────────────────────────┐ │  ││
│     │     │  │ SIDEBAR  │   MAIN CONTENT            │ │  ││
│     │     │  │          │                          │ │  ││
│     │     │  │ [Logo]   │   ┌────────────────────┐│ │  ││
│     │     │  │          │   │ Page Component     ││ │  ││
│     │     │  │ [Create] │   │                    ││ │  ││
│     │     │  │          │   │ <Children>         ││ │  ││
│     │     │  │ Collect  │   │                    ││ │  ││
│     │     │  │ Process  │   │                    ││ │  ││
│     │     │  │ Create   │   │                    ││ │  ││
│     │     │  │ Manage   │   └────────────────────┘│ │  ││
│     │     │  │          │                          │ │  ││
│     │     │  │ [Theme]  │                          │ │  ││
│     │     │  │ [SignOut]│                          │ │  ││
│     │     │  └──────────┴──────────────────────────┘ │  ││
│     │     └──────────────────────────────────────────┘  ││
│     └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Layout Hierarchy

```
Root Layout
├── Provides: Theme, Query, Error Boundaries
│
└── Dashboard Layout (Route Group)
   ├── Provides: Auth Check, Modals
   │
   └── AppShell
      ├── AppSidebar (Fixed Left)
      │   ├── Logo & Collapse Button
      │   ├── Create Dropdown
      │   ├── Navigation Sections
      │   └── Theme Toggle & Sign Out
      │
      └── Main Content Area
          └── <Page Content>
```

## Component Stack (Reading Order)

1. **app/layout.tsx** - Root providers
2. **app/(dashboard)/layout.tsx** - Auth protection
3. **components/layout/AppShell.tsx** - Shell structure
4. **components/layout/AppSidebar.tsx** - Sidebar content
5. **app/(dashboard)/[page]/page.tsx** - Page content

## Layout Dimensions

### Sidebar
- **Expanded**: 256px (w-64)
- **Collapsed**: 64px (w-16)
- **Height**: Full height (h-screen)

### Main Content
- **Width**: Remaining space (flex-1)
- **Height**: Full height
- **Scroll**: Managed by page component

## CSS Classes Used

```css
/* AppShell container */
.flex.h-screen.overflow-hidden

/* Sidebar */
.app-sidebar.flex.h-full.flex-col
.bg-sidebar.border-sidebar-border.border-r

/* Main content */
.flex-1.flex.flex-col.min-h-0
.flex-1.flex.flex-col.min-h-0.overflow-hidden
```

## Adding New Layout Layers

### Pattern 1: Prepend (Add before content)

```tsx
<AppShell>
  <header>New Header</header>  {/* ← Add here */}
  <div className="flex-1">{children}</div>
</AppShell>
```

### Pattern 2: Append (Add after content)

```tsx
<AppShell>
  <div className="flex-1">{children}</div>
  <footer>New Footer</footer>  {/* ← Add here */}
</AppShell>
```

### Pattern 3: Wrap (Surround content)

```tsx
<AppShell>
  <div className="custom-wrapper">
    <aside>Left Panel</aside>
    <main className="flex-1">{children}</main>
    <aside>Right Panel</aside>
  </div>
</AppShell>
```

### Pattern 4: Replace (Change structure)

```tsx
// Create new component that replaces AppShell
<div className="grid grid-cols-[1fr_3fr_1fr]">
  <nav>Custom Nav</nav>
  <main>{children}</main>
  <aside>Custom Side</aside>
</div>
```

## Layout States

### Sidebar Expanded
```
┌──────┬────────────────────────────────────────┐
│ 256px│            Main Content                │
│      │                                         │
│      │                                         │
│      │                                         │
└──────┴────────────────────────────────────────┘
```

### Sidebar Collapsed
```
┌──┬─────────────────────────────────────────────┐
│64│        Main Content                        │
│  │                                             │
│  │                                             │
│  │                                             │
└──┴─────────────────────────────────────────────┘
```

## Navigation Flow

```
User clicks "Notebooks" in sidebar
  ↓
Next.js router.push('/notebooks')
  ↓
app/(dashboard)/notebooks/page.tsx loads
  ↓
Wraps content in <AppShell>
  ↓
AppShell renders:
  - AppSidebar (navigation, unchanged)
  - Main content area (page-specific content)
  ↓
User sees page with sidebar intact
```

## State Management in Layout

### Sidebar State
- **Store**: `sidebar-store.ts`
- **Persistence**: localStorage (via Zustand persist)
- **Actions**: `toggleCollapse()`, `setCollapsed()`

### Theme State
- **Store**: `theme-store.ts`
- **Persistence**: localStorage
- **Values**: 'light' | 'dark'

### Auth State
- **Store**: `auth-store.ts`
- **Persistence**: session
- **Methods**: `logout()`

## Responsive Breakpoints

```css
/* Tailwind breakpoints */
sm: 640px   /* Small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Desktops */
xl: 1280px  /* Large desktops */
```

### Mobile Behavior
- Sidebar can be overlay on mobile
- Main content takes full width
- Hamburger menu toggles sidebar

## Key Files for Modification

### To Change Visual Layout
- `components/layout/AppShell.tsx` - Shell structure
- `components/layout/AppSidebar.tsx` - Sidebar content
- `app/globals.css` - Global styles

### To Change Navigation
- `components/layout/AppSidebar.tsx` - Nav items
- Edit `navigation` array in the component

### To Change Routing
- `app/(dashboard)/[page]/page.tsx` - Page components
- Add new folders under `app/(dashboard)/`

### To Change Theme
- `app/globals.css` - CSS variables
- `lib/stores/theme-store.ts` - Theme logic

## Example: Three-Column Layout

```tsx
export function ThreeColumnLayout({ 
  left, 
  center, 
  right 
}: {
  left: React.ReactNode
  center: React.ReactNode
  right: React.ReactNode
}) {
  return (
    <AppShell>
      <div className="grid grid-cols-[200px_1fr_250px] h-full">
        <aside className="border-r overflow-auto">
          {left}
        </aside>
        <main className="overflow-auto">
          {center}
        </main>
        <aside className="border-l overflow-auto">
          {right}
        </aside>
      </div>
    </AppShell>
  )
}
```

Result:
```
┌──────┬──────────┬────────────────────────┬───────┐
│ Side │ SIDEBAR  │   Main Content         │ Panel │
│ bar  │          │                        │       │
│      │          │                        │       │
└──────┴──────────┴────────────────────────┴───────┘
```

## Summary

**Layout system is modular and hierarchical:**
- ✅ Root → Dashboard → AppShell → Page
- ✅ Each layer adds specific functionality
- ✅ Sidebar is independent from page content
- ✅ Pages wrap content with AppShell
- ✅ State is managed by Zustand stores
- ✅ Styles use CSS variables for theming
- ✅ Fully responsive with Tailwind

**To create new layouts:**
1. Keep AppShell structure
2. Wrap or extend AppShell as needed
3. Add new UI layers (headers, panels, etc.)
4. Preserve sidebar functionality
5. Use CSS variables for theming
6. Test on multiple breakpoints






