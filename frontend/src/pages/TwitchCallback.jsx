import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function TwitchCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [status, setStatus] = useState('Connecting Twitch…')

  useEffect(() => {
    const token = params.get('token')
    const error = params.get('error')

    if (error) {
      setStatus(`Twitch error: ${error}`)
      return
    }
    if (!token) {
      setStatus('No Twitch token received')
      return
    }

    ;(async () => {
      try {
        await loginWithToken(token)
        navigate('/', { replace: true })
      } catch {
        setStatus('Could not complete Twitch login')
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
