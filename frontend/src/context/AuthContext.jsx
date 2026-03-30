import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import api from '../services/api'
import { connectAkoeNet, disconnectAkoeNet } from '../services/socket'

const AuthContext = createContext(null)
const SESSION_NOTICE_KEY = 'akoenet_session_notice'

/** True when the browser got no HTTP response (server down, restarting, wrong port, etc.). */
function isUnreachableApiError(err) {
  if (!err) return false
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true
  if (err.message === 'Network Error') return true
  return !err.response
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [serverUnreachable, setServerUnreachable] = useState(false)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    disconnectAkoeNet()
    setUser(null)
    setServerUnreachable(false)
  }, [])

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setServerUnreachable(false)
      setLoading(false)
      return
    }
    setServerUnreachable(false)
    setLoading(true)

    const delays = [0, 900, 1800]
    let lastErr = null
    for (let i = 0; i < delays.length; i += 1) {
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]))
      }
      try {
        const { data } = await api.get('/auth/me')
        setUser(data)
        connectAkoeNet(token)
        setServerUnreachable(false)
        setLoading(false)
        return
      } catch (err) {
        lastErr = err
        if (isUnreachableApiError(err) && i < delays.length - 1) {
          continue
        }
        if (isUnreachableApiError(err)) {
          disconnectAkoeNet()
          setUser(null)
          setServerUnreachable(true)
          setLoading(false)
          return
        }
        break
      }
    }

    if (!lastErr) {
      setLoading(false)
      return
    }
    if (lastErr.response?.data?.error === 'Token expired, please login again') {
      localStorage.setItem(
        SESSION_NOTICE_KEY,
        'Your session expired due to a security update. Please sign in again.'
      )
    }
    localStorage.removeItem('token')
    disconnectAkoeNet()
    setUser(null)
    setServerUnreachable(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    setServerUnreachable(false)
    connectAkoeNet(data.token)
    return data
  }, [])

  const loginWithToken = useCallback(async (token) => {
    localStorage.setItem('token', token)
    connectAkoeNet(token)
    const { data } = await api.get('/auth/me')
    setUser(data)
    return data
  }, [])

  const register = useCallback(async (username, email, password, birth_date) => {
    await api.post('/auth/register', { username, email, password, birth_date })
    return login(email, password)
  }, [login])

  const updateCurrentUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev
      return { ...prev, ...(partial || {}) }
    })
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      serverUnreachable,
      login,
      loginWithToken,
      register,
      logout,
      refreshUser,
      updateCurrentUser,
    }),
    [user, loading, serverUnreachable, login, loginWithToken, register, logout, refreshUser, updateCurrentUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
