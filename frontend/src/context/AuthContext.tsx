import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, setAuthToken } from '../lib/api'
import type { TokenResponse, User } from '../lib/types'

type AuthState = {
  user: User | null
  ready: boolean // false while we check a saved session on startup
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthState | null>(null)
const TOKEN_KEY = 'auth_token'

function saveToken(token: string | null) {
  setAuthToken(token)
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(TOKEN_KEY) } catch { /* ignore */ }
    if (!saved) { setReady(true); return }
    setAuthToken(saved)
    api<User>('/api/auth/me')
      .then(setUser)
      .catch((e) => { if (e instanceof ApiError && e.status === 401) saveToken(null) })
      .finally(() => setReady(true))
  }, [])

  const handleToken = (res: TokenResponse) => { saveToken(res.access_token); setUser(res.user) }

  const login = useCallback(async (email: string, password: string) => {
    handleToken(await api<TokenResponse>('/api/auth/login', { method: 'POST', body: { email, password } }))
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    handleToken(await api<TokenResponse>('/api/auth/signup', { method: 'POST', body: { name, email, password } }))
  }, [])

  const logout = useCallback(() => { saveToken(null); setUser(null) }, [])

  return <AuthContext.Provider value={{ user, ready, login, signup, logout, setUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
