'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/lib/stores/auth-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { Separator } from '@/components/ui/separator'
import { Search, Bell, Settings, User, LogOut, Shield } from 'lucide-react'
import { Input } from '@/components/ui/input'

const navItems = [
  { name: 'Notebooks', href: '/notebooks', icon: '📚' },
  { name: 'Sources', href: '/sources', icon: '📄' },
  { name: 'Search', href: '/search', icon: '🔍' },
  { name: 'Podcasts', href: '/podcasts', icon: '🎙️' },
]

export function TopNav() {
  const pathname = usePathname()
  const { logout } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const isAdmin = useAuthStore((state) => state.user?.is_admin ?? false)

  const items = isAdmin
    ? [...navItems, { name: 'Admin', href: '/admin', icon: '🛡️' }]
    : navItems

  return (
    <>
      {/* Floating Top Nav Bar */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/60 shadow-lg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo and Navigation */}
            <div className="flex items-center gap-8">
              <Link href="/notebooks" className="flex items-center gap-3 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg group-hover:blur-xl transition-all duration-300"></div>
                  <Image 
                    src="/logo.svg" 
                    alt="Open Notebook" 
                    width={32} 
                    height={32}
                    className="relative z-10 group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="hidden sm:block">
                  <div className="text-lg font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Open Notebook
                  </div>
                  <div className="text-xs text-muted-foreground">Research Hub</div>
                </div>
              </Link>

              {/* Navigation Links */}
              <nav className="hidden md:flex items-center gap-1">
                {items.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 relative group",
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <span className="mr-2">{item.icon}</span>
                      {item.name}
                      {isActive && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                      )}
                    </Link>
                  )
                })}
              </nav>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="hidden sm:block">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="relative"
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative hidden md:block">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-sm font-semibold text-primary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <Link href="/admin">
                      <DropdownMenuItem>
                        <Shield className="mr-2 h-4 w-4" />
                        Admin Dashboard
                      </DropdownMenuItem>
                    </Link>
                  )}
                  {isAdmin && <DropdownMenuSeparator />}
                  <Link href="/settings">
                    <DropdownMenuItem>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden border-t border-border/60 py-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {items.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground"
                    )}
                  >
                    <span>{item.icon}</span>
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Search Panel */}
      {searchOpen && (
        <div className="sticky top-16 z-40 backdrop-blur-xl bg-background/95 border-b border-border/60 shadow-lg">
          <div className="container mx-auto px-4 py-3">
            <Input
              placeholder="Search everything..."
              className="w-full"
              autoFocus
            />
          </div>
        </div>
      )}
    </>
  )
}



