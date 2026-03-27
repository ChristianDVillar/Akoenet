import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../services/socket'

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function VoiceRoom({ channelId, user }) {
  const [joined, setJoined] = useState(false)
  const [participants, setParticipants] = useState([])
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [speakingMap, setSpeakingMap] = useState({})
  const localStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const remoteAudioRef = useRef(new Map())
  const audioContextRef = useRef(null)
  const localAnalyserRef = useRef(null)
  const localDataRef = useRef(null)
  const remoteAnalysersRef = useRef(new Map())
  const meterIntervalRef = useRef(null)

  useEffect(() => {
    return () => {
      leaveVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  function upsertParticipant(participant) {
    setParticipants((prev) => {
      const exists = prev.some((p) => p.socketId === participant.socketId)
      if (exists) {
        return prev.map((p) => (p.socketId === participant.socketId ? participant : p))
      }
      return [...prev, participant]
    })
  }

  function removeParticipant(socketId) {
    setParticipants((prev) => prev.filter((p) => p.socketId !== socketId))
    remoteAnalysersRef.current.delete(socketId)
    setSpeakingMap((prev) => {
      const next = { ...prev }
      delete next[socketId]
      return next
    })
  }

  function attachRemoteStream(socketId, stream) {
    const current = remoteAudioRef.current.get(socketId)
    if (!current) return
    current.srcObject = stream
    setupRemoteAnalyser(socketId, stream)
  }

  function ensureAudioContext() {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioContextRef.current = new Ctx()
    }
    return audioContextRef.current
  }

  function computeLevel(analyser, dataArray) {
    analyser.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i += 1) {
      const centered = (dataArray[i] - 128) / 128
      sum += centered * centered
    }
    return Math.sqrt(sum / dataArray.length)
  }

  function startMeterLoop() {
    if (meterIntervalRef.current) return
    meterIntervalRef.current = window.setInterval(() => {
      let nextMicLevel = 0
      if (localAnalyserRef.current && localDataRef.current) {
        nextMicLevel = computeLevel(localAnalyserRef.current, localDataRef.current)
      }
      setMicLevel(Math.min(1, nextMicLevel * 4))

      const nextSpeaking = {}
      remoteAnalysersRef.current.forEach((entry, socketId) => {
        const level = computeLevel(entry.analyser, entry.dataArray)
        nextSpeaking[socketId] = level > 0.03
      })
      setSpeakingMap(nextSpeaking)
    }, 120)
  }

  function stopMeterLoop() {
    if (!meterIntervalRef.current) return
    window.clearInterval(meterIntervalRef.current)
    meterIntervalRef.current = null
  }

  function setupLocalAnalyser(stream) {
    const ctx = ensureAudioContext()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    localAnalyserRef.current = analyser
    localDataRef.current = new Uint8Array(analyser.fftSize)
    startMeterLoop()
  }

  function setupRemoteAnalyser(socketId, stream) {
    if (remoteAnalysersRef.current.has(socketId)) return
    const ctx = ensureAudioContext()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    remoteAnalysersRef.current.set(socketId, {
      analyser,
      dataArray: new Uint8Array(analyser.fftSize),
    })
    startMeterLoop()
  }

  function createPeer(targetSocketId, initiateOffer) {
    const socket = getSocket()
    if (!socket) return null
    if (peersRef.current.has(targetSocketId)) return peersRef.current.get(targetSocketId)

    const pc = new RTCPeerConnection(rtcConfig)
    peersRef.current.set(targetSocketId, pc)

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    const remoteStream = new MediaStream()
    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track))
      attachRemoteStream(targetSocketId, remoteStream)
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      socket.emit('voice:signal', {
        channelId,
        targetSocketId,
        candidate: e.candidate,
      })
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        pc.close()
        peersRef.current.delete(targetSocketId)
        removeParticipant(targetSocketId)
      }
    }

    if (initiateOffer) {
      ;(async () => {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('voice:signal', {
          channelId,
          targetSocketId,
          description: pc.localDescription,
        })
      })().catch(() => {})
    }

    return pc
  }

  async function handleSignal({ fromSocketId, description, candidate }) {
    const pc = createPeer(fromSocketId, false)
    if (!pc) return
    try {
      if (description) {
        await pc.setRemoteDescription(new RTCSessionDescription(description))
        if (description.type === 'offer') {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          getSocket()?.emit('voice:signal', {
            channelId,
            targetSocketId: fromSocketId,
            description: pc.localDescription,
          })
        }
      } else if (candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch {
      /* ignore transient RTC errors */
    }
  }

  async function joinVoice() {
    const socket = getSocket()
    if (!socket || !channelId || joined) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      setupLocalAnalyser(stream)
      socket.emit('voice:join', { channelId, username: user?.username }, (ack) => {
        if (!ack?.ok) {
          setError('No se pudo entrar al canal de voz')
          stream.getTracks().forEach((t) => t.stop())
          localStreamRef.current = null
          return
        }
        setJoined(true)
        setParticipants(ack.participants || [])
        ;(ack.participants || [])
          .filter((p) => p.socketId !== socket.id)
          .forEach((p) => {
            createPeer(p.socketId, true)
          })
      })
    } catch {
      setError('No hay acceso al microfono')
    }
  }

  function leaveVoice() {
    const socket = getSocket()
    if (socket && channelId) {
      socket.emit('voice:leave', { channelId })
    }
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    remoteAnalysersRef.current.clear()
    localAnalyserRef.current = null
    localDataRef.current = null
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    audioContextRef.current = null
    stopMeterLoop()
    setMicLevel(0)
    setSpeakingMap({})
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setParticipants([])
    setJoined(false)
  }

  function toggleMute() {
    if (!localStreamRef.current) return
    const next = !muted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !channelId) return
    const onJoined = (participant) => {
      upsertParticipant(participant)
      if (participant.socketId !== socket.id && joined) createPeer(participant.socketId, true)
    }
    const onLeft = ({ socketId }) => {
      removeParticipant(socketId)
      const pc = peersRef.current.get(socketId)
      if (pc) {
        pc.close()
        peersRef.current.delete(socketId)
      }
    }
    socket.on('voice:user-joined', onJoined)
    socket.on('voice:user-left', onLeft)
    socket.on('voice:signal', handleSignal)
    return () => {
      socket.off('voice:user-joined', onJoined)
      socket.off('voice:user-left', onLeft)
      socket.off('voice:signal', handleSignal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, joined])

  return (
    <div className="channel-mode-box">
      <h3>Canal de voz activo</h3>
      <p>Audio P2P con WebRTC. Puedes entrar/salir y silenciar microfono.</p>
      {joined && (
        <div className="mic-status">
          <span className="muted small">{muted ? 'Microfono silenciado' : 'Nivel de microfono'}</span>
          <div className="mic-meter">
            <span
              className={`mic-meter-fill ${muted ? 'muted' : ''}`}
              style={{ width: `${Math.max(6, Math.round(micLevel * 100))}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="error-banner">{error}</p>}
      <div className="voice-controls">
        {!joined ? (
          <button type="button" className="btn primary" onClick={joinVoice}>
            Unirse a voz
          </button>
        ) : (
          <>
            <button type="button" className="btn secondary" onClick={toggleMute}>
              {muted ? 'Activar microfono' : 'Silenciar microfono'}
            </button>
            <button type="button" className="btn ghost" onClick={leaveVoice}>
              Salir del canal
            </button>
          </>
        )}
      </div>
      <ul className="voice-users">
        {participants.map((p) => (
          <li key={p.socketId} className={speakingMap[p.socketId] ? 'speaking' : ''}>
            <span className="voice-user">
              <span>{p.username}</span>
              {speakingMap[p.socketId] && (
                <span className="voice-wave" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </span>
            <span className="voice-indicator">
              {speakingMap[p.socketId] ? 'hablando' : 'en silencio'}
            </span>
            <audio
              autoPlay
              ref={(el) => {
                if (el) remoteAudioRef.current.set(p.socketId, el)
                else remoteAudioRef.current.delete(p.socketId)
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
