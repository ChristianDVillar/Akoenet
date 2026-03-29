import { io } from 'socket.io-client'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket = null

export function connectAkoeNet(token) {
  if (socket?.connected) {
    socket.disconnect()
  }
  socket = io(baseURL, {
    auth: { token },
    autoConnect: true,
    transports: ['websocket', 'polling'],
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
