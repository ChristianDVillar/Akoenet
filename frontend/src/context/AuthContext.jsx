import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import api from '../services/api'
import { connectAkoNet, disconnectAkoNet } from '../services/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    disconnectAkoNet()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      connectAkoNet(token)
    } catch {
      localStorage.removeItem('token')
      disconnectAkoNet()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    connectAkoNet(data.token)
    return data
  }, [])

  const loginWithToken = useCallback(async (token) => {
    localStorage.setItem('token', token)
    connectAkoNet(token)
    const { data } = await api.get('/auth/me')
    setUser(data)
    return data
  }, [])

  const register = useCallback(async (username, email, password) => {
    await api.post('/auth/register', { username, email, password })
    return login(email, password)
  }, [login])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithToken,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, loginWithToken, register, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
