import axios from 'axios'
import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()

const api = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
