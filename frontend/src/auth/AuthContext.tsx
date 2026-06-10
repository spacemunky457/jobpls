import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, login as apiLogin, signup as apiSignup, type User } from '../api/client'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('jobpls_token')
    if (!token) { setLoading(false); return }
    fetchMe()
      .then(setUser)
      .catch(() => localStorage.removeItem('jobpls_token'))
      .finally(() => setLoading(false))
  }, [])

  const finish = async (token: string) => {
    localStorage.setItem('jobpls_token', token)
    setUser(await fetchMe())
  }

  const login = async (email: string, password: string) => finish((await apiLogin(email, password)).access_token)
  const signup = async (email: string, password: string) => finish((await apiSignup(email, password)).access_token)
  const logout = () => { localStorage.removeItem('jobpls_token'); setUser(null) }

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
