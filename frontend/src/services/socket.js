import { io } from 'socket.io-client'
import { getApiBaseUrl } from '../lib/apiBase'

const baseURL = getApiBaseUrl()

let socket = null

export function connectAkoeNet(token) {
  if (socket?.connected) {
    socket.disconnect()
  }
  if (typeof token === 'string' && token) {
    localStorage.setItem('token', token)
  }
  socket = io(baseURL, {
    auth: (cb) => {
      cb({ token: localStorage.getItem('token') || '' })
    },
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectAkoeNet() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
