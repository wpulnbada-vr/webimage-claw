import { useState, useEffect, createContext, useContext } from 'react'
import SetupScreen from './SetupScreen'
import LoginScreen from './LoginScreen'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthGate({ children, requireAuth }) {
  const [status, setStatus] = useState(null) // null = loading
  const [authenticated, setAuthenticated] = useState(false)

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('wih_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/auth/status', { headers })
      const data = await res.json()
      setStatus(data)
      setAuthenticated(data.authenticated)
    } catch {
      setStatus({ setupComplete: true, authenticated: false })
    }
  }

  useEffect(() => { checkAuth() }, [])

  const handleLogout = () => {
    localStorage.removeItem('wih_token')
    setAuthenticated(false)
    setStatus(prev => prev ? { ...prev, authenticated: false } : prev)
  }

  const getAuthHeaders = () => {
    const token = localStorage.getItem('wih_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  if (status === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">로딩 중...</div>
  }

  if (!status.setupComplete) {
    return <SetupScreen onComplete={() => { setAuthenticated(true); checkAuth() }} />
  }

  if (requireAuth && !authenticated) {
    return <LoginScreen onLogin={() => { setAuthenticated(true); checkAuth() }} />
  }

  return (
    <AuthContext.Provider value={{ authenticated, logout: handleLogout, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  )
}
