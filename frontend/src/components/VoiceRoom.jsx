import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../services/socket'
import { getVoiceAudioConstraints, getVoiceVideoConstraints } from '../lib/voiceConstraints'
import { getSavedVoiceSettings } from './VoiceSettingsModal'

const fallbackIceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

function getRtcConfig() {
  const raw = import.meta.env.VITE_ICE_SERVERS
  if (!raw) return { iceServers: fallbackIceServers }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { iceServers: parsed }
    }
  } catch {
    /* fallback to default STUN */
  }
  return { iceServers: fallbackIceServers }
}

const rtcConfig = getRtcConfig()

function RemoteParticipantVideo({ stream, volume, onMediaRef }) {
  const videoRef = useRef(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    if (!stream) return undefined
    const sync = () => {
      setHasVideo(stream.getVideoTracks().some((t) => t.readyState === 'live'))
    }
    sync()
    stream.addEventListener('addtrack', sync)
    stream.addEventListener('removetrack', sync)
    return () => {
      stream.removeEventListener('addtrack', sync)
      stream.removeEventListener('removetrack', sync)
    }
  }, [stream])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !stream) return
    el.srcObject = stream
    el.volume = volume / 100
  }, [stream, volume])

  if (!stream) return null

  return (
    <video
      ref={(el) => {
        videoRef.current = el
        onMediaRef?.(el)
      }}
      autoPlay
      playsInline
      className={`voice-remote-media ${hasVideo ? 'has-video' : 'audio-only'}`}
    />
  )
}

export default function VoiceRoom({ channelId, user }) {
  const [joined, setJoined] = useState(false)
  const [testingMic, setTestingMic] = useState(false)
  const [participants, setParticipants] = useState([])
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [speakingMap, setSpeakingMap] = useState({})
  const [remoteVolumes, setRemoteVolumes] = useState({})
  const [remoteStreams, setRemoteStreams] = useState({})
  const [cameraOn, setCameraOn] = useState(false)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const micTestStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const remoteMediaRef = useRef(new Map())
  const audioContextRef = useRef(null)
  const localAnalyserRef = useRef(null)
  const localDataRef = useRef(null)
  const remoteAnalysersRef = useRef(new Map())
  const meterIntervalRef = useRef(null)
  const micGainRef = useRef(100)
  const volumeStorageKey = `akoe:voice:volumes:${user?.id || 'anon'}:${channelId || 'none'}`

  useEffect(() => {
    const s = getSavedVoiceSettings(user?.id)
    micGainRef.current = s.micGain
  }, [user?.id])

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
    setRemoteStreams((prev) => {
      const next = { ...prev }
      delete next[socketId]
      return next
    })
    remoteAnalysersRef.current.delete(socketId)
    setSpeakingMap((prev) => {
      const next = { ...prev }
      delete next[socketId]
      return next
    })
  }

  function attachRemoteStream(socketId, stream) {
    setRemoteStreams((prev) => ({ ...prev, [socketId]: stream }))
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
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.5
    source.connect(analyser)
    localAnalyserRef.current = analyser
    localDataRef.current = new Uint8Array(analyser.fftSize)
    startMeterLoop()
  }

  function clearLocalMeter() {
    localAnalyserRef.current = null
    localDataRef.current = null
    setMicLevel(0)
    if (!remoteAnalysersRef.current.size) {
      stopMeterLoop()
    }
  }

  function setupRemoteAnalyser(socketId, stream) {
    if (remoteAnalysersRef.current.has(socketId)) return
    const ctx = ensureAudioContext()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.5
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

  async function renegotiateAllPeers() {
    const socket = getSocket()
    if (!socket || !channelId) return
    const tasks = []
    peersRef.current.forEach((pc, targetSocketId) => {
      tasks.push(
        (async () => {
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            socket.emit('voice:signal', {
              channelId,
              targetSocketId,
              description: pc.localDescription,
            })
          } catch {
            /* ignore */
          }
        })(),
      )
    })
    await Promise.all(tasks)
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
    if (testingMic) {
      stopMicTest()
    }
    setError('')
    try {
      const settings = getSavedVoiceSettings(user?.id)
      micGainRef.current = settings.micGain
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getVoiceAudioConstraints(),
          video: settings.cameraEnabled ? getVoiceVideoConstraints() : false,
        })
      } catch (firstErr) {
        if (settings.cameraEnabled) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: getVoiceAudioConstraints(),
            video: false,
          })
          setCameraOn(false)
        } else {
          throw firstErr
        }
      }
      const hasVideo = stream.getVideoTracks().length > 0
      setCameraOn(hasVideo)
      localStreamRef.current = stream
      setupLocalAnalyser(stream)
      socket.emit('voice:join', { channelId, username: user?.username }, (ack) => {
        if (!ack?.ok) {
          setError('Could not join voice channel')
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
      setError('No microphone access')
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
    clearLocalMeter()
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    audioContextRef.current = null
    setSpeakingMap({})
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setRemoteStreams({})
    setCameraOn(false)
    setParticipants([])
    setJoined(false)
    setMuted(false)
    stopMicTest()
  }

  function toggleMute() {
    if (!localStreamRef.current) return
    const next = !muted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  async function startMicTest() {
    if (joined || testingMic) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getVoiceAudioConstraints(),
        video: false,
      })
      micTestStreamRef.current = stream
      setTestingMic(true)
      setupLocalAnalyser(stream)
    } catch {
      setError('No microphone access for test')
    }
  }

  function stopMicTest() {
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((t) => t.stop())
      micTestStreamRef.current = null
    }
    setTestingMic(false)
    if (!joined) {
      clearLocalMeter()
    }
  }

  function updateParticipantVolume(socketId, value) {
    const normalized = Math.max(0, Math.min(100, Number(value) || 0))
    setRemoteVolumes((prev) => ({ ...prev, [socketId]: normalized }))
    const mediaEl = remoteMediaRef.current.get(socketId)
    if (mediaEl) {
      mediaEl.volume = normalized / 100
    }
  }

  async function toggleCamera() {
    if (!joined || !localStreamRef.current) return
    setError('')
    const stream = localStreamRef.current
    const hasVideo = stream.getVideoTracks().length > 0
    try {
      if (hasVideo) {
        stream.getVideoTracks().forEach((t) => {
          t.stop()
          stream.removeTrack(t)
        })
        peersRef.current.forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === 'video') {
              pc.removeTrack(sender)
            }
          })
        })
        setCameraOn(false)
        await renegotiateAllPeers()
      } else {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: getVoiceVideoConstraints(),
          audio: false,
        })
        const vt = vStream.getVideoTracks()[0]
        stream.addTrack(vt)
        peersRef.current.forEach((pc) => {
          pc.addTrack(vt, stream)
        })
        setCameraOn(true)
        await renegotiateAllPeers()
      }
    } catch {
      setError('Camera could not be toggled')
    }
  }

  useEffect(() => {
    const el = localVideoRef.current
    const s = localStreamRef.current
    if (!el || !s) return
    el.srcObject = s
  }, [joined, cameraOn, testingMic])

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

  useEffect(() => {
    setRemoteVolumes((prev) => {
      const next = { ...prev }
      let changed = false
      participants.forEach((p) => {
        if (next[p.socketId] === undefined) {
          next[p.socketId] = 100
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [participants])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(volumeStorageKey)
      const parsed = raw ? JSON.parse(raw) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setRemoteVolumes(parsed)
      } else {
        setRemoteVolumes({})
      }
    } catch {
      setRemoteVolumes({})
    }
  }, [volumeStorageKey])

  useEffect(() => {
    try {
      localStorage.setItem(volumeStorageKey, JSON.stringify(remoteVolumes))
    } catch {
      /* ignore storage errors */
    }
  }, [remoteVolumes, volumeStorageKey])

  useEffect(() => {
    remoteMediaRef.current.forEach((el, socketId) => {
      const v = remoteVolumes[socketId]
      if (typeof v === 'number') el.volume = v / 100
    })
  }, [remoteVolumes])

  function getInitial(name) {
    return (name || '?').slice(0, 1).toUpperCase()
  }

  return (
    <section className="channel-mode-box voice-room-discord">
      <header className="voice-room-top">
        <div>
          <h3>Voice Channel</h3>
          <p>
            {joined
              ? `${participants.length} connected • camera ${cameraOn ? 'on' : 'off'}`
              : 'Join to start voice and optional camera'}
          </p>
        </div>
        <div className="voice-room-chip">{joined ? 'LIVE' : 'IDLE'}</div>
      </header>

      <div className="voice-stage-grid">
        {joined && (
          <article className="voice-stage-tile self">
            {cameraOn ? (
              <video ref={localVideoRef} className="voice-stage-video" muted playsInline autoPlay />
            ) : (
              <div className="voice-stage-fallback">
                {user?.avatar_url ? (
                  <img className="voice-stage-avatar" src={user.avatar_url} alt={`${user?.username || 'You'} avatar`} />
                ) : (
                  <span className="voice-stage-initial">{getInitial(user?.username || 'You')}</span>
                )}
              </div>
            )}
            <footer className="voice-stage-meta">
              <span>You</span>
              {muted && <span className="voice-badge muted">Muted</span>}
            </footer>
          </article>
        )}

        {participants
          .filter((p) => p.socketId !== getSocket()?.id)
          .map((p) => (
            <article key={p.socketId} className={`voice-stage-tile ${speakingMap[p.socketId] ? 'speaking' : ''}`}>
              <RemoteParticipantVideo
                stream={remoteStreams[p.socketId]}
                volume={remoteVolumes[p.socketId] ?? 100}
                onMediaRef={(el) => {
                  if (el) remoteMediaRef.current.set(p.socketId, el)
                  else remoteMediaRef.current.delete(p.socketId)
                }}
              />
              {!remoteStreams[p.socketId]?.getVideoTracks()?.length && (
                <div className="voice-stage-fallback">
                  <span className="voice-stage-initial">{getInitial(p.username)}</span>
                </div>
              )}
              <footer className="voice-stage-meta">
                <span>{p.username}</span>
                <span className={`voice-indicator ${speakingMap[p.socketId] ? 'active' : ''}`}>
                  {speakingMap[p.socketId] ? 'speaking' : 'listening'}
                </span>
              </footer>
              <label className="voice-volume">
                <span>Vol</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={remoteVolumes[p.socketId] ?? 100}
                  onChange={(e) => updateParticipantVolume(p.socketId, e.target.value)}
                />
                <span>{remoteVolumes[p.socketId] ?? 100}%</span>
              </label>
            </article>
          ))}
      </div>

      {(joined || testingMic) && (
        <div className="mic-status">
          <span className="muted small">
            {testingMic && !joined ? 'Microphone test active' : muted ? 'Microphone muted' : 'Microphone level'}
          </span>
          <div className="mic-meter">
            <span
              className={`mic-meter-fill ${muted && joined ? 'muted' : ''}`}
              style={{ width: `${Math.max(6, Math.round(micLevel * 100))}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}

      <div className="voice-controls discord">
        {!joined && (
          <button type="button" className="btn secondary" onClick={testingMic ? stopMicTest : startMicTest}>
            {testingMic ? 'Stop microphone test' : 'Test microphone'}
          </button>
        )}
        {!joined ? (
          <button type="button" className="btn primary" onClick={joinVoice}>
            Join voice
          </button>
        ) : (
          <>
            <button type="button" className="btn secondary" onClick={toggleMute}>
              {muted ? 'Unmute microphone' : 'Mute microphone'}
            </button>
            <button type="button" className="btn secondary" onClick={toggleCamera}>
              {cameraOn ? 'Stop camera' : 'Start camera'}
            </button>
            <button type="button" className="btn ghost" onClick={leaveVoice}>
              Disconnect
            </button>
          </>
        )}
      </div>
    </section>
  )
}
