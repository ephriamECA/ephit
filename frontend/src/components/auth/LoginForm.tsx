'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowRight, CheckCircle2, Info } from 'lucide-react'
import { useAuth } from '@/lib/hooks/use-auth'
import { getConfig } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Label } from '@/components/ui/label'

type AuthMode = 'login' | 'register'

const PASSWORD_RULES = [
  'At least 8 characters long',
  'Includes an uppercase letter',
  'Includes a lowercase letter',
  'Includes a number',
  'Includes a special character',
]

const passwordChecklist = [
  { label: '8+ characters', test: (value: string) => value.length >= 8 },
  { label: 'Uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Number', test: (value: string) => /[0-9]/.test(value) },
  { label: 'Special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
]

const validatePassword = (password: string) => {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.'
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.'
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.'
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character.'
  }
  return null
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, register, isAuthenticated, isLoading, error } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [configInfo, setConfigInfo] = useState<{ apiUrl: string; version: string; buildTime: string } | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfigInfo({
          apiUrl: cfg.apiUrl,
          version: cfg.version,
          buildTime: cfg.buildTime,
        })
      })
      .catch((err) => {
        console.error('Failed to load config:', err)
      })
  }, [])

  useEffect(() => {
    const nextPath = searchParams.get('next')
    if (nextPath) {
      sessionStorage.setItem('redirectAfterLogin', nextPath)
    }
  }, [searchParams])

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/notebooks')
    }
  }, [isAuthenticated, router])

  const passwordChecks = useMemo(
    () => passwordChecklist.map((check) => ({
      label: check.label,
      passed: check.test(password),
    })),
    [password],
  )

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'))
    setLocalError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLocalError(null)

    if (!email.trim() || !password.trim()) {
      setLocalError('Email and password are required.')
      return
    }

    if (mode === 'register') {
      const passwordError = validatePassword(password)
      if (passwordError) {
        setLocalError(passwordError)
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.')
        return
      }

      setIsRegistering(true)
      try {
        const success = await register(email.trim(), password, displayName || undefined)
        if (!success) {
          setIsRegistering(false)
          return
        }
        // Registration successful - redirect will happen via useEffect
      } catch (err) {
        setIsRegistering(false)
        console.error('Registration error:', err)
      }
    } else {
      const success = await login(email.trim(), password)
      if (!success) {
        return
      }
    }
  }

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  const activeError = localError || error

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">EphItUp</CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Sign in to access your notebooks and research'
              : 'Create an account to start organizing your research'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name (optional)</Label>
                <Input
                  id="displayName"
                  placeholder="How should we address you?"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="rounded-lg border border-dashed bg-muted/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                    <Info className="h-4 w-4" />
                    Password requirements
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {PASSWORD_RULES.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {passwordChecks.map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                          item.passed ? 'border-green-500/60 bg-green-500/10 text-green-600' : 'border-border text-muted-foreground'
                        }`}
                      >
                        {item.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeError && (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{activeError}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full flex items-center justify-center gap-2"
              disabled={isLoading || isRegistering}
            >
              {mode === 'login' ? (
                <>
                  {isLoading ? 'Signing in...' : 'Sign in'}
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  {isRegistering ? 'Creating account...' : 'Create account'}
                  {!isRegistering && <ArrowRight className="h-4 w-4" />}
                  {isRegistering && <LoadingSpinner />}
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 text-sm text-center text-muted-foreground">
            {mode === 'login' ? (
              <>
                Need an account?{' '}
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Register now
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Sign in instead
                </button>
              </>
            )}
          </div>

          {configInfo && (
            <div className="mt-6 border-t pt-4 text-xs text-muted-foreground space-y-1 text-center">
              <div>Version {configInfo.version}</div>
              <div>Built {new Date(configInfo.buildTime).toLocaleString()}</div>
              <div className="font-mono text-[10px] break-all">{configInfo.apiUrl}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
