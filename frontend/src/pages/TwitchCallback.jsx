import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function TwitchCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [status, setStatus] = useState('Conectando Twitch…')

  useEffect(() => {
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      setStatus(`Error de Twitch: ${error}`)
      return
    }
    if (!token) {
      setStatus('No se recibió token de Twitch')
      return
    }

    ;(async () => {
      try {
        await loginWithToken(token)
        navigate('/', { replace: true })
      } catch {
        setStatus('No se pudo completar el login con Twitch')
      }
    })()
  }, [params, loginWithToken, navigate])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Twitch OAuth</h1>
        <p className="muted">{status}</p>
      </div>
    </div>
  )
}
