import { useState } from 'react'
import { useAuth } from './AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Alert } from '../components/ui/Alert'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { login, signup, confirmationSent } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-brand-50/50 p-4">
        <div className="w-full max-w-sm text-center">
          <span className="mb-3 inline-grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-tile-hover">
            J
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Check your email</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back here to log in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-brand-50/50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-tile-hover">
            J
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Jobpls</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === 'login' ? 'Welcome back — sign in to continue.' : 'Create your account to get started.'}
          </p>
        </div>

        <Card padding="lg" className="space-y-4 shadow-pop">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-muted p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError('') }}
                className={
                  'rounded-md py-1.5 text-sm font-medium transition-colors ' +
                  (mode === m ? 'bg-surface text-ink shadow-tile' : 'text-ink-muted hover:text-ink')
                }
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <Input
                type="password"
                placeholder={supabase ? 'At least 6 characters' : 'At least 8 characters'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <Button variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-ink-muted">
          Discover, match, tailor, and apply — with you in control at every step.
        </p>
      </div>
    </div>
  )
}
