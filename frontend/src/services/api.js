import axios from 'axios'
import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()

const api = axios.create({ baseURL })
const rawApi = axios.create({ baseURL })

let refreshInFlight = null

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err.response?.status
    const cfg = err.config
    if (
      status !== 401 ||
      !cfg ||
      cfg._retry ||
      String(cfg.url || '').includes('/auth/refresh') ||
      String(cfg.url || '').includes('/auth/login')
    ) {
      return Promise.reject(err)
    }
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) return Promise.reject(err)
    cfg._retry = true
    try {
      if (!refreshInFlight) {
        refreshInFlight = rawApi
          .post('/auth/refresh', { refresh_token: refresh })
          .then((res) => res.data)
          .finally(() => {
            refreshInFlight = null
          })
      }
      const data = await refreshInFlight
      if (data?.token) localStorage.setItem('token', data.token)
      if (data?.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
      cfg.headers.Authorization = `Bearer ${data.token}`
      return api(cfg)
    } catch (e) {
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      return Promise.reject(e)
    }
  }
)

export default api
