# Frontend Architecture

## Overview

The frontend is built with **Next.js 15** (App Router), **React 19**, **TypeScript**, and **Tailwind CSS**.

## Tech Stack

```
┌─────────────────────────────────────────────────────┐
│              Next.js 15 (App Router)                 │
│  • Server Components                                 │
│  • API Route Handlers                                │
│  • Server Actions                                    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                  React 19                            │
│  • Client Components                                 │
│  • Hooks (useState, useEffect, custom)              │
│  • Context API                                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              State Management                        │
│  • Zustand (global state)                           │
│  • TanStack Query (server state)                    │
│  • React Hook Form (form state)                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                 UI Layer                             │
│  • Tailwind CSS (styling)                           │
│  • Shadcn/ui (components)                           │
│  • Radix UI (primitives)                            │
│  • Lucide React (icons)                             │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
frontend/
├── src/
│   ├── app/                    # App Router (pages)
│   │   ├── (auth)/            # Auth layout group
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/       # Dashboard layout group
│   │   │   ├── notebooks/
│   │   │   ├── chat/
│   │   │   ├── search/
│   │   │   └── settings/
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Home page
│   │
│   ├── components/             # React components
│   │   ├── ui/                # Shadcn/ui components
│   │   ├── notebooks/         # Notebook-specific
│   │   ├── sources/           # Source-specific
│   │   ├── chat/              # Chat interface
│   │   └── layout/            # Layout components
│   │
│   ├── lib/                    # Utilities
│   │   ├── api/               # API client functions
│   │   ├── hooks/             # Custom React hooks
│   │   ├── types/             # TypeScript types
│   │   ├── utils/             # Helper functions
│   │   └── config.ts          # Runtime config
│   │
│   └── styles/
│       └── globals.css        # Global styles
│
├── public/                     # Static assets
├── next.config.ts             # Next.js configuration
├── tailwind.config.ts         # Tailwind configuration
└── tsconfig.json              # TypeScript configuration
```

## Routing (App Router)

### Route Groups

```typescript
// (auth) group - No auth layout
app/(auth)/
  ├── login/page.tsx          // /login
  ├── register/page.tsx       // /register
  └── layout.tsx              // Auth-specific layout

// (dashboard) group - With sidebar
app/(dashboard)/
  ├── notebooks/page.tsx      // /notebooks
  ├── chat/page.tsx           // /chat
  ├── search/page.tsx         // /search
  ├── settings/page.tsx       // /settings
  └── layout.tsx              // Dashboard layout with sidebar
```

### Dynamic Routes

```typescript
// Single notebook
app/(dashboard)/notebooks/[id]/page.tsx
// URL: /notebooks/notebook:abc123

// Source detail
app/(dashboard)/sources/[id]/page.tsx
// URL: /sources/source:xyz789
```

### API Routes (Server-side)

```typescript
// Runtime config endpoint
app/config/route.ts
// Serves: GET /config
// Returns: { apiUrl: "https://..." }

// Could add more API routes here
// app/api/health/route.ts → GET /api/health
```

## State Management

### 1. Global State (Zustand)

**Location:** `src/lib/hooks/use-auth.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  
  // Actions
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      
      setAuth: (user, token) => set({
        user,
        accessToken: token,
        isAuthenticated: true
      }),
      
      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false
      })
    }),
    {
      name: 'auth-storage',  // localStorage key
    }
  )
)

// Usage in components
function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth()
  
  if (!isAuthenticated) {
    return <LoginPrompt />
  }
  
  return <div>Hello, {user.name}!</div>
}
```

### 2. Server State (TanStack Query)

**Location:** `src/lib/hooks/use-notebooks.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useNotebooks() {
  return useQuery({
    queryKey: ['notebooks'],
    queryFn: async () => {
      const response = await apiClient.get('/notebooks')
      return response.data
    },
    // Refetch every 30 seconds
    refetchInterval: 30000
  })
}

export function useCreateNotebook() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateNotebookData) => {
      const response = await apiClient.post('/notebooks', data)
      return response.data
    },
    onSuccess: () => {
      // Invalidate notebooks query to refetch
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    }
  })
}

// Usage
function NotebookList() {
  const { data: notebooks, isLoading } = useNotebooks()
  const createNotebook = useCreateNotebook()
  
  const handleCreate = () => {
    createNotebook.mutate({
      title: "New Notebook"
    })
  }
  
  if (isLoading) return <Loading />
  
  return (
    <div>
      {notebooks.map(nb => <NotebookCard key={nb.id} notebook={nb} />)}
      <button onClick={handleCreate}>Create</button>
    </div>
  )
}
```

### 3. Form State (React Hook Form)

**Location:** `src/components/sources/AddSourceDialog.tsx`

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// Define validation schema
const schema = z.object({
  type: z.enum(['link', 'upload', 'text']),
  url: z.string().url().optional(),
  file: z.instanceof(File).optional(),
  content: z.string().optional(),
  title: z.string().optional(),
  embed: z.boolean().default(false),
})

type FormData = z.infer<typeof schema>

function AddSourceDialog() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })
  
  const onSubmit = async (data: FormData) => {
    const formData = new FormData()
    formData.append('type', data.type)
    if (data.file) formData.append('file', data.file)
    if (data.url) formData.append('url', data.url)
    
    await apiClient.post('/sources', formData)
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('url')} />
      {errors.url && <span>{errors.url.message}</span>}
      
      <button type="submit">Submit</button>
    </form>
  )
}
```

## Authentication Flow

### 1. Login

```typescript
// src/app/(auth)/login/page.tsx
'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const { setAuth } = useAuth()
  const router = useRouter()
  
  const handleLogin = async (email: string, password: string) => {
    // Call API
    const response = await apiClient.post('/auth/login', {
      email,
      password
    })
    
    // Save auth state
    setAuth(response.data.user, response.data.access_token)
    
    // Redirect to dashboard
    router.push('/notebooks')
  }
  
  return <LoginForm onSubmit={handleLogin} />
}
```

### 2. Protected Routes

```typescript
// src/components/auth/ProtectedRoute.tsx
'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  
  useEffect(() => {
    if (!isAuthenticated) {
      redirect('/login')
    }
  }, [isAuthenticated])
  
  if (!isAuthenticated) {
    return null  // Or loading spinner
  }
  
  return <>{children}</>
}

// Usage in layout
export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <Sidebar />
      <main>{children}</main>
    </ProtectedRoute>
  )
}
```

### 3. API Client with Auth

```typescript
// src/lib/api/client.ts
import axios from 'axios'
import { getApiUrl } from '@/lib/config'

export const apiClient = axios.create({
  timeout: 300000,  // 5 minutes
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to all requests
apiClient.interceptors.request.use(async (config) => {
  // Set base URL
  if (!config.baseURL) {
    const apiUrl = await getApiUrl()
    config.baseURL = `${apiUrl}/api`
  }
  
  // Add auth token
  if (typeof window !== 'undefined') {
    const authStorage = localStorage.getItem('auth-storage')
    if (authStorage) {
      const { state } = JSON.parse(authStorage)
      const token = state?.accessToken
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
  }
  
  return config
})

// Handle 401 (unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

## Component Patterns

### 1. Server Components (Default)

```typescript
// app/(dashboard)/notebooks/page.tsx
// This is a Server Component (no 'use client')

import { getNotebooks } from '@/lib/api/notebooks'

export default async function NotebooksPage() {
  // Can fetch data directly in Server Component
  const notebooks = await getNotebooks()
  
  return (
    <div>
      <h1>Notebooks</h1>
      {notebooks.map(notebook => (
        <NotebookCard key={notebook.id} notebook={notebook} />
      ))}
    </div>
  )
}
```

### 2. Client Components (Interactive)

```typescript
// src/components/notebooks/NotebookCard.tsx
'use client'  // Required for interactivity

import { useState } from 'react'

interface Props {
  notebook: Notebook
}

export function NotebookCard({ notebook }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      <h3>{notebook.title}</h3>
      {isExpanded && (
        <p>{notebook.description}</p>
      )}
    </div>
  )
}
```

### 3. Compound Components

```typescript
// src/components/ui/dialog.tsx
interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </RadixDialog.Root>
  )
}

function DialogTrigger({ children }: { children: React.ReactNode }) {
  return <RadixDialog.Trigger asChild>{children}</RadixDialog.Trigger>
}

function DialogContent({ children }: { children: React.ReactNode }) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay />
      <RadixDialog.Content>{children}</RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

// Export as compound component
Dialog.Trigger = DialogTrigger
Dialog.Content = DialogContent

// Usage
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger>
    <button>Open Dialog</button>
  </Dialog.Trigger>
  <Dialog.Content>
    <h2>Dialog Title</h2>
    <p>Dialog content</p>
  </Dialog.Content>
</Dialog>
```

## Styling

### Tailwind CSS

```typescript
// Example component with Tailwind classes
export function Button({ variant = 'primary', children }) {
  const baseClasses = 'px-4 py-2 rounded-md font-medium transition-colors'
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  }
  
  return (
    <button className={`${baseClasses} ${variantClasses[variant]}`}>
      {children}
    </button>
  )
}
```

### CSS Variables

```css
/* globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
}
```

## Performance Optimization

### 1. Code Splitting

```typescript
// Lazy load heavy components
import dynamic from 'next/dynamic'

const PodcastPlayer = dynamic(
  () => import('@/components/podcasts/PodcastPlayer'),
  { 
    loading: () => <LoadingSpinner />,
    ssr: false  // Don't render on server
  }
)
```

### 2. Image Optimization

```typescript
import Image from 'next/image'

<Image
  src="/hero.png"
  alt="Hero image"
  width={800}
  height={600}
  priority  // Load immediately
  placeholder="blur"  // Show blur while loading
/>
```

### 3. Memoization

```typescript
import { useMemo, useCallback } from 'react'

function ExpensiveComponent({ data }) {
  // Memoize expensive calculation
  const processedData = useMemo(() => {
    return data.map(item => expensiveTransform(item))
  }, [data])
  
  // Memoize callback
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id)
  }, [])
  
  return <div>{processedData.map(...)}</div>
}
```

## Error Handling

### 1. Error Boundaries

```typescript
// src/components/errors/ErrorBoundary.tsx
'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  
  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught:', error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    
    return this.props.children
  }
}

// Usage
<ErrorBoundary fallback={<ErrorPage />}>
  <MyComponent />
</ErrorBoundary>
```

### 2. API Error Handling

```typescript
import { toast } from 'sonner'

async function fetchData() {
  try {
    const response = await apiClient.get('/notebooks')
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server error (4xx, 5xx)
        toast.error(error.response.data.detail || 'Server error')
      } else if (error.request) {
        // Network error
        toast.error('Network error. Please check your connection.')
      }
    }
    throw error
  }
}
```

## Testing

### Component Testing (Jest + Testing Library)

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })
  
  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    
    fireEvent.click(screen.getByText('Click'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

## Build & Deployment

### Build Configuration

```typescript
// next.config.ts
const nextConfig = {
  // Standalone output for Docker
  output: 'standalone',
  
  // Memory optimization
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog'],
  },
  
  // API proxy
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: `${process.env.INTERNAL_API_URL}/api/:path*`,
    }]
  },
}
```

### Production Build

```bash
# Build for production
npm run build

# Output structure:
.next/
├── standalone/        # Minimal server files
├── static/           # Static assets
└── cache/            # Build cache
```

## Related Documentation
- [API Client](./API_CLIENT.md)
- [Component Library](./COMPONENTS.md)
- [State Management](./STATE_MANAGEMENT.md)
- [Routing Guide](./ROUTING.md)



