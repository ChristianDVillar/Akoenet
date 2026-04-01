import { useEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '../services/socket'
import {
  getVoiceAudioConstraints,
  getVoiceVideoConstraints,
  getScreenShareConstraints,
} from '../lib/voiceConstraints'
import { resolveImageUrl } from '../lib/resolveImageUrl'
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

function isScreenVideoTrack(track) {
  if (!track || track.kind !== 'video') return false
  const l = (track.label || '').toLowerCase()
  if (l.includes('screen') || l.includes('display') || l.includes('monitor') || l.includes('window'))
    return true
  try {
    const s = track.getSettings()
    if (s.displaySurface) return true
  } catch (_) {
    /* ignore */
  }
  return false
}

/** Remote voice: play audio from full stream; split video into screen (large) + camera (pip). */
function RemoteParticipantMedia({ stream, volume, mutedByDeafen, onAudioRef }) {
  const audioRef = useRef(null)
  const screenVideoRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const [videoLayout, setVideoLayout] = useState({ screen: null, camera: null })

  useEffect(() => {
    const a = audioRef.current
    if (!a || !stream) return
    a.srcObject = stream
    a.muted = Boolean(mutedByDeafen)
    a.volume = volume / 100
  }, [stream, volume, mutedByDeafen])

  useEffect(() => {
    if (!stream) {
      setVideoLayout({ screen: null, camera: null })
      return undefined
    }
    const sync = () => {
      const tracks = stream.getVideoTracks().filter((t) => t.readyState === 'live')
      const screenT = tracks.find((t) => isScreenVideoTrack(t))
      const cameraT = tracks.find((t) => t !== screenT) || (!screenT && tracks[0] ? tracks[0] : null)
      setVideoLayout({
        screen: screenT ? new MediaStream([screenT]) : null,
        camera: cameraT ? new MediaStream([cameraT]) : null,
      })
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
    if (screenVideoRef.current) screenVideoRef.current.srcObject = videoLayout.screen
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = videoLayout.camera
  }, [videoLayout])

  if (!stream) return null

  return (
    <>
      <audio
        ref={(el) => {
          audioRef.current = el
          onAudioRef?.(el)
        }}
        autoPlay
        className="voice-remote-audio-el"
      />
      {(videoLayout.screen || videoLayout.camera) && (
        <div className="voice-remote-video-stack">
          {videoLayout.screen && (
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="voice-remote-media voice-remote-screen"
            />
          )}
          {videoLayout.camera && (
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted
              className={`voice-remote-media ${videoLayout.screen ? 'voice-remote-camera-pip' : 'has-video'}`}
            />
          )}
        </div>
      )}
    </>
  )
}

function voiceCapNumber(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(99, Math.floor(n))
}

/** True if WebRTC stream is sending a visible video track (not audio-only / black). */
function streamHasLiveVideo(stream) {
  if (!stream) return false
  return stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
}

function PhoneHangupIcon() {
  return (
    <svg
      className="voice-hangup-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function VoiceRoom({
  channelId,
  user,
  autoJoin = false,
  compact = false,
  channelLabel,
  voiceUserLimit,
  voiceConnectedCount,
  onVoiceSessionChange,
}) {
  const [joined, setJoined] = useState(false)
  const [testingMic, setTestingMic] = useState(false)
  const [participants, setParticipants] = useState([])
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [speakingMap, setSpeakingMap] = useState({})
  const [remoteVolumes, setRemoteVolumes] = useState({})
  const [remoteStreams, setRemoteStreams] = useState({})
  const [remoteAvatarFailed, setRemoteAvatarFailed] = useState(() => new Set())
  const [cameraOn, setCameraOn] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [localScreenStream, setLocalScreenStream] = useState(null)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const localScreenVideoRef = useRef(null)
  const localPipVideoRef = useRef(null)
  const screenShareStreamRef = useRef(null)
  const screenTrackRef = useRef(null)
  const micTestStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const remoteMediaRef = useRef(new Map())
  const audioContextRef = useRef(null)
  const localAnalyserRef = useRef(null)
  const localDataRef = useRef(null)
  const remoteAnalysersRef = useRef(new Map())
  const meterIntervalRef = useRef(null)
  const micGainRef = useRef(100)
  const voiceJoinedChannelRef = useRef(null)
  const joinInProgressRef = useRef(false)
  const volumeStorageKey = `akoenet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`
  const legacyVolumeStorageKeys = useMemo(
    () => [
      `Akonet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`,
      `akonet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`,
      `akoe:voice:volumes:${user?.id || 'anon'}:${channelId || 'none'}`,
    ],
    [user?.id, channelId]
  )

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
    if (screenShareStreamRef.current && screenTrackRef.current) {
      const tr = screenTrackRef.current
      const ss = screenShareStreamRef.current
      if (tr.readyState === 'live') {
        pc.addTrack(tr, ss)
      }
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

  function cleanupScreenShareOnLeave() {
    const track = screenTrackRef.current
    const ss = screenShareStreamRef.current
    screenTrackRef.current = null
    screenShareStreamRef.current = null
    setLocalScreenStream(null)
    setScreenSharing(false)
    if (track) {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
    if (ss) {
      ss.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          /* ignore */
        }
      })
    }
  }

  async function stopScreenShare() {
    const track = screenTrackRef.current
    if (!track) {
      setLocalScreenStream(null)
      setScreenSharing(false)
      return
    }
    peersRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track === track) {
          pc.removeTrack(sender)
        }
      })
    })
    try {
      track.stop()
    } catch {
      /* ignore */
    }
    const ss = screenShareStreamRef.current
    screenTrackRef.current = null
    screenShareStreamRef.current = null
    if (ss) {
      ss.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          /* ignore */
        }
      })
    }
    setLocalScreenStream(null)
    setScreenSharing(false)
    await renegotiateAllPeers()
  }

  async function toggleScreenShare() {
    if (!joined) return
    if (screenTrackRef.current) {
      await stopScreenShare()
      return
    }
    setError('')
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia(getScreenShareConstraints())
      const vt = screenStream.getVideoTracks()[0]
      if (!vt) {
        screenStream.getTracks().forEach((t) => t.stop())
        return
      }
      screenShareStreamRef.current = screenStream
      screenTrackRef.current = vt
      setLocalScreenStream(screenStream)
      setScreenSharing(true)
      vt.addEventListener('ended', () => {
        void stopScreenShare()
      })
      peersRef.current.forEach((pc) => {
        pc.addTrack(vt, screenStream)
      })
      await renegotiateAllPeers()
    } catch {
      setError('Screen share was cancelled or not allowed')
    }
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

  async function joinVoice(opts = {}) {
    const discordStyle = Boolean(opts.discordStyle)
    const socket = getSocket()
    if (!socket || !channelId) return
    if (voiceJoinedChannelRef.current === channelId && localStreamRef.current) return
    if (joinInProgressRef.current) return
    if (testingMic) {
      stopMicTest()
    }
    setError('')
    joinInProgressRef.current = true
    try {
      const settings = getSavedVoiceSettings(user?.id)
      micGainRef.current = settings.micGain
      const wantVideo = Boolean(settings.startWithCamera)
      const startDeafened = Boolean(settings.startDeafened)
      const startMuted = startDeafened || Boolean(settings.startMuted)
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getVoiceAudioConstraints(),
          video: wantVideo ? getVoiceVideoConstraints() : false,
        })
      } catch (firstErr) {
        if (wantVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: getVoiceAudioConstraints(),
              video: false,
            })
            setCameraOn(false)
          } catch {
            throw firstErr
          }
        } else {
          throw firstErr
        }
      }
      const hasVideo = stream.getVideoTracks().length > 0
      setCameraOn(hasVideo)
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !startMuted
      })
      setMuted(startMuted)
      setDeafened(startDeafened)
      localStreamRef.current = stream
      setupLocalAnalyser(stream)
      socket.emit('voice:join', { channelId, username: user?.username }, (ack) => {
        joinInProgressRef.current = false
        if (!ack?.ok) {
          const err = ack?.error
          setError(err === 'voice_full' ? 'This voice channel is full' : 'Could not join voice channel')
          stream.getTracks().forEach((t) => t.stop())
          localStreamRef.current = null
          voiceJoinedChannelRef.current = null
          return
        }
        voiceJoinedChannelRef.current = channelId
        setJoined(true)
        onVoiceSessionChange?.({ joined: true, channelId })
        setParticipants(ack.participants || [])
        ;(ack.participants || [])
          .filter((p) => p.socketId !== socket.id)
          .forEach((p) => {
            createPeer(p.socketId, true)
          })
      })
    } catch {
      joinInProgressRef.current = false
      setError(discordStyle ? 'No microphone or camera access' : 'No microphone access')
    }
  }

  useEffect(() => {
    if (!autoJoin || !channelId) return undefined
    let cancelled = false
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return
        joinVoice({ discordStyle: true })
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, autoJoin])

  function leaveVoice() {
    const hadServerSession = voiceJoinedChannelRef.current != null
    joinInProgressRef.current = false
    cleanupScreenShareOnLeave()
    voiceJoinedChannelRef.current = null
    const socket = getSocket()
    if (socket && channelId && hadServerSession) {
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
    setScreenSharing(false)
    setLocalScreenStream(null)
    setParticipants([])
    setJoined(false)
    setMuted(false)
    setDeafened(false)
    stopMicTest()
    if (hadServerSession) {
      onVoiceSessionChange?.({ joined: false, channelId })
    }
  }

  function toggleMute() {
    if (!localStreamRef.current) return
    const next = !muted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
    if (!next && deafened) {
      setDeafened(false)
    }
  }

  function toggleDeafened() {
    if (!joined) return
    const next = !deafened
    setDeafened(next)
    if (next) {
      if (!muted) {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = false
        })
        setMuted(true)
      }
      return
    }
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
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
        const cameraTracks = stream.getVideoTracks()
        const cameraTrackIds = new Set(cameraTracks.map((t) => t.id))
        cameraTracks.forEach((t) => {
          t.stop()
          stream.removeTrack(t)
        })
        peersRef.current.forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            if (
              sender.track &&
              sender.track.kind === 'video' &&
              cameraTrackIds.has(sender.track.id)
            ) {
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
    if (screenSharing && localScreenStream) {
      el.srcObject = null
      return
    }
    el.srcObject = s
  }, [joined, cameraOn, testingMic, screenSharing, localScreenStream])

  useEffect(() => {
    if (localScreenVideoRef.current) {
      localScreenVideoRef.current.srcObject = localScreenStream
    }
  }, [localScreenStream])

  useEffect(() => {
    const pip = localPipVideoRef.current
    if (!pip || !localStreamRef.current) return
    if (screenSharing && cameraOn) {
      const vts = localStreamRef.current.getVideoTracks().filter((t) => t.readyState === 'live')
      pip.srcObject = vts.length ? new MediaStream(vts) : null
    } else {
      pip.srcObject = null
    }
  }, [screenSharing, cameraOn, joined])

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
      let raw = localStorage.getItem(volumeStorageKey)
      if (!raw) {
        for (const lk of legacyVolumeStorageKeys) {
          raw = localStorage.getItem(lk)
          if (raw) break
        }
      }
      const parsed = raw ? JSON.parse(raw) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setRemoteVolumes(parsed)
      } else {
        setRemoteVolumes({})
      }
    } catch {
      setRemoteVolumes({})
    }
  }, [volumeStorageKey, legacyVolumeStorageKeys])

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

  const voiceCap = voiceCapNumber(voiceUserLimit)
  const showVoiceCap = voiceCap != null && typeof voiceConnectedCount === 'number'
  const displayTitle = channelLabel || 'Voice Channel'

  return (
    <section
      className={`channel-mode-box voice-room-discord${compact ? ' voice-room-compact' : ''}`}
    >
      <header className="voice-room-top">
        <div>
          <h3>{compact ? `En voz: ${displayTitle}` : 'Voice Channel'}</h3>
          {showVoiceCap && (
            <p
              className={`voice-room-cap-line ${voiceConnectedCount >= voiceCap ? 'voice-room-cap-line--full' : ''}`}
              aria-live="polite"
            >
              <strong>
                ({voiceConnectedCount}/{voiceCap})
              </strong>{' '}
              usuarios en el canal
            </p>
          )}
          <p>
            {joined
              ? `${participants.length} connected • camera ${cameraOn ? 'on' : 'off'} • screen ${screenSharing ? 'on' : 'off'}`
              : autoJoin
                ? 'Connecting with microphone and camera (like Discord)…'
                : 'Join to start voice and optional camera'}
          </p>
        </div>
        <div className="voice-room-chip">{joined ? 'LIVE' : 'IDLE'}</div>
      </header>

      <div className="voice-stage-grid">
        {joined && (
          <article className="voice-stage-tile self">
            {screenSharing && localScreenStream ? (
              <div className="voice-local-video-stack">
                <video
                  ref={localScreenVideoRef}
                  className="voice-stage-video voice-local-screen"
                  muted
                  playsInline
                  autoPlay
                />
                {cameraOn ? (
                  <video
                    ref={localPipVideoRef}
                    className="voice-stage-video voice-local-camera-pip"
                    muted
                    playsInline
                    autoPlay
                  />
                ) : null}
              </div>
            ) : cameraOn ? (
              <video ref={localVideoRef} className="voice-stage-video" muted playsInline autoPlay />
            ) : (
              <div className="voice-stage-fallback">
                {user?.avatar_url ? (
                  <img
                    className="voice-stage-avatar"
                    src={resolveImageUrl(user.avatar_url)}
                    alt={`${user?.username || 'You'} avatar`}
                  />
                ) : (
                  <span className="voice-stage-initial">{getInitial(user?.username || 'You')}</span>
                )}
              </div>
            )}
            <footer className="voice-stage-meta">
              <span>You</span>
              {screenSharing && <span className="voice-badge screen">Sharing</span>}
              {muted && <span className="voice-badge muted">Muted</span>}
            </footer>
          </article>
        )}

        {participants
          .filter((p) => p.socketId !== getSocket()?.id)
          .map((p) => (
            <article key={p.socketId} className={`voice-stage-tile ${speakingMap[p.socketId] ? 'speaking' : ''}`}>
              <RemoteParticipantMedia
                stream={remoteStreams[p.socketId]}
                volume={deafened ? 0 : remoteVolumes[p.socketId] ?? 100}
                mutedByDeafen={deafened}
                onAudioRef={(el) => {
                  if (el) remoteMediaRef.current.set(p.socketId, el)
                  else remoteMediaRef.current.delete(p.socketId)
                }}
              />
              {!streamHasLiveVideo(remoteStreams[p.socketId]) && (
                <div className="voice-stage-fallback">
                  {p.avatar_url && !remoteAvatarFailed.has(String(p.userId)) ? (
                    <img
                      className="voice-stage-avatar"
                      src={resolveImageUrl(p.avatar_url)}
                      alt=""
                      onError={() => {
                        setRemoteAvatarFailed((prev) => new Set(prev).add(String(p.userId)))
                      }}
                    />
                  ) : (
                    <span className="voice-stage-initial">{getInitial(p.username)}</span>
                  )}
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
                  id={`voice-remote-vol-${p.userId}`}
                  name={`voice_remote_volume_${p.userId}`}
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
          <button type="button" className="btn primary" onClick={() => joinVoice()}>
            Join voice
          </button>
        ) : (
          <>
            <button type="button" className="btn secondary" onClick={toggleMute}>
              {muted ? 'Unmute microphone' : 'Mute microphone'}
            </button>
            <button type="button" className="btn secondary" onClick={toggleDeafened}>
              {deafened ? 'Undeafen (hear users)' : 'Deafen (hear nobody)'}
            </button>
            <button type="button" className="btn secondary" onClick={toggleCamera}>
              {cameraOn ? 'Stop camera' : 'Start camera'}
            </button>
            <button type="button" className="btn secondary" onClick={() => void toggleScreenShare()}>
              {screenSharing ? 'Stop sharing' : 'Share screen'}
            </button>
            <button
              type="button"
              className="btn ghost voice-hangup-btn"
              onClick={leaveVoice}
              title="Salir del canal de voz"
              aria-label="Salir del canal de voz"
            >
              <PhoneHangupIcon />
              {!compact && <span className="voice-hangup-label">Colgar</span>}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
