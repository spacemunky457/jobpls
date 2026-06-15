import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, login as apiLogin, signup as apiSignup, type User } from '../api/client'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: User | null
  loading: boolean
  confirmationSent: boolean   // true after Supabase signUp when email confirm is required
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmationSent, setConfirmationSent] = useState(false)

  useEffect(() => {
    if (supabase) {
      // Supabase mode: pick up an existing session and subscribe to changes
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          localStorage.setItem('jobpls_token', session.access_token)
          fetchMe().then(setUser).catch(() => {}).finally(() => setLoading(false))
        } else {
          setLoading(false)
        }
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) {
          localStorage.setItem('jobpls_token', session.access_token)
          fetchMe().then(setUser).catch(() => {})
        } else {
          localStorage.removeItem('jobpls_token')
          setUser(null)
        }
      })

      return () => subscription.unsubscribe()
    } else {
      // Dev mode: check existing token in localStorage
      const token = localStorage.getItem('jobpls_token')
      if (!token) { setLoading(false); return }
      fetchMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('jobpls_token'))
        .finally(() => setLoading(false))
    }
  }, [])

  const login = async (email: string, password: string) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      if (data.session) {
        localStorage.setItem('jobpls_token', data.session.access_token)
        setUser(await fetchMe())
      }
    } else {
      const { access_token } = await apiLogin(email, password)
      localStorage.setItem('jobpls_token', access_token)
      setUser(await fetchMe())
    }
  }

  const signup = async (email: string, password: string) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw new Error(error.message)
      if (data.session) {
        // Email confirmation disabled in Supabase dashboard → immediate session
        localStorage.setItem('jobpls_token', data.session.access_token)
        setUser(await fetchMe())
      } else {
        // Email confirmation required — tell the UI to show the "check your email" state
        setConfirmationSent(true)
      }
    } else {
      const { access_token } = await apiSignup(email, password)
      localStorage.setItem('jobpls_token', access_token)
      setUser(await fetchMe())
    }
  }

  const logout = () => {
    if (supabase) supabase.auth.signOut()
    localStorage.removeItem('jobpls_token')
    setUser(null)
    setConfirmationSent(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, confirmationSent, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
