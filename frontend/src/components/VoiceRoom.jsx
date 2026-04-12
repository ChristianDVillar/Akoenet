import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '../services/socket'
import {
  buildRemoteVoicePlaybackGraph,
  buildVoiceOutgoingGraph,
  getVoiceChannelAudioConstraints,
  getVoiceVideoConstraints,
  getMicTestAudioConstraints,
  getScreenShareConstraints,
  partitionVoiceAndScreenAudio,
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

function splitScreenCameraStreams(stream) {
  if (!stream) return { screen: null, camera: null }
  const tracks = stream.getVideoTracks().filter((t) => t.readyState === 'live')
  const screenT = tracks.find((t) => isScreenVideoTrack(t))
  const cameraT = tracks.find((t) => t !== screenT) || (!screenT && tracks[0] ? tracks[0] : null)
  return {
    screen: screenT ? new MediaStream([screenT]) : null,
    camera: cameraT ? new MediaStream([cameraT]) : null,
  }
}

function streamHasScreenShare(stream) {
  if (!stream) return false
  return stream
    .getVideoTracks()
    .some((t) => t.readyState === 'live' && t.enabled && isScreenVideoTrack(t))
}

/** Mic + separate screen-audio track (typical when peer shares a tab with audio). */
function remoteStreamHasSplittableScreenAudio(stream) {
  if (!stream || !streamHasScreenShare(stream)) return false
  return stream.getAudioTracks().filter((t) => t.readyState === 'live').length >= 2
}

function streamHasCameraPip(stream) {
  const { camera } = splitScreenCameraStreams(stream)
  if (!camera) return false
  return camera.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
}

/** True if WebRTC stream is sending a visible video track (not audio-only / black). */
function streamHasLiveVideo(stream) {
  if (!stream) return false
  return stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
}

/** True if the tile should show a video element (respects omitScreen for focus layout). */
function streamShowsVideoInTile(stream, omitScreen) {
  if (!stream) return false
  const { screen, camera } = splitScreenCameraStreams(stream)
  if (omitScreen) {
    return (
      camera &&
      camera.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
    )
  }
  return streamHasLiveVideo(stream)
}

function connectProcessedPlayback(ctx, mediaStream, cleanupRef) {
  if (cleanupRef.current) {
    try {
      cleanupRef.current()
    } catch (_) {
      /* ignore */
    }
    cleanupRef.current = null
  }
  if (!mediaStream || mediaStream.getAudioTracks().length === 0) {
    return null
  }
  const { playbackStream, disconnect } = buildRemoteVoicePlaybackGraph(ctx, mediaStream)
  cleanupRef.current = disconnect
  return playbackStream
}

/** Remote voice: voice + optional screen-share audio (separate mute); video split screen + camera pip. */
function RemoteParticipantMedia({
  stream,
  volume,
  mutedByDeafen,
  screenAudioMutedByUser = false,
  onAudioRef,
  omitScreen,
  getAudioContext,
}) {
  const voiceAudioRef = useRef(null)
  const screenAudioRef = useRef(null)
  const screenVideoRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const [videoLayout, setVideoLayout] = useState({ screen: null, camera: null })
  const voicePlaybackCleanupRef = useRef(null)
  const screenPlaybackCleanupRef = useRef(null)
  const [audioTrackEpoch, setAudioTrackEpoch] = useState(0)

  useEffect(() => {
    if (!stream) return undefined
    const bump = () => setAudioTrackEpoch((e) => e + 1)
    stream.addEventListener('addtrack', bump)
    stream.addEventListener('removetrack', bump)
    return () => {
      stream.removeEventListener('addtrack', bump)
      stream.removeEventListener('removetrack', bump)
    }
  }, [stream])

  useLayoutEffect(() => {
    const voiceEl = voiceAudioRef.current
    const screenEl = screenAudioRef.current
    if (!stream) {
      if (voicePlaybackCleanupRef.current) {
        voicePlaybackCleanupRef.current()
        voicePlaybackCleanupRef.current = null
      }
      if (screenPlaybackCleanupRef.current) {
        screenPlaybackCleanupRef.current()
        screenPlaybackCleanupRef.current = null
      }
      if (voiceEl) voiceEl.srcObject = null
      if (screenEl) screenEl.srcObject = null
      return undefined
    }
    if (!voiceEl) return undefined

    if (voicePlaybackCleanupRef.current) {
      voicePlaybackCleanupRef.current()
      voicePlaybackCleanupRef.current = null
    }
    if (screenPlaybackCleanupRef.current) {
      screenPlaybackCleanupRef.current()
      screenPlaybackCleanupRef.current = null
    }
    if (voiceEl) voiceEl.srcObject = null
    if (screenEl) screenEl.srcObject = null

    const { voiceStream, screenStream } = partitionVoiceAndScreenAudio(stream)
    const ctx = getAudioContext?.()

    if (!ctx) {
      if (voiceStream.getAudioTracks().length > 0) {
        voiceEl.srcObject = voiceStream
        void voiceEl.play()?.catch(() => {})
      }
      if (screenEl && screenStream && screenStream.getAudioTracks().length > 0) {
        screenEl.srcObject = screenStream
        void screenEl.play()?.catch(() => {})
      }
      return undefined
    }

    const vPlay = connectProcessedPlayback(ctx, voiceStream, voicePlaybackCleanupRef)
    if (voiceEl) {
      if (vPlay && vPlay.getAudioTracks().length > 0) {
        voiceEl.srcObject = vPlay
      } else if (voiceStream.getAudioTracks().length > 0) {
        voiceEl.srcObject = voiceStream
      }
      void voiceEl.play()?.catch(() => {})
    }

    if (screenEl && screenStream && screenStream.getAudioTracks().length > 0) {
      const sPlay = connectProcessedPlayback(ctx, screenStream, screenPlaybackCleanupRef)
      screenEl.srcObject =
        sPlay && sPlay.getAudioTracks().length > 0 ? sPlay : screenStream
      void screenEl.play()?.catch(() => {})
    }

    return () => {
      if (voicePlaybackCleanupRef.current) {
        voicePlaybackCleanupRef.current()
        voicePlaybackCleanupRef.current = null
      }
      if (screenPlaybackCleanupRef.current) {
        screenPlaybackCleanupRef.current()
        screenPlaybackCleanupRef.current = null
      }
    }
  }, [stream, audioTrackEpoch, getAudioContext])

  useEffect(() => {
    const v = voiceAudioRef.current
    const s = screenAudioRef.current
    const vol = volume / 100
    if (v) {
      v.volume = vol
      v.muted = Boolean(mutedByDeafen)
    }
    if (s) {
      s.volume = vol
      s.muted = Boolean(mutedByDeafen) || Boolean(screenAudioMutedByUser)
    }
  }, [volume, mutedByDeafen, screenAudioMutedByUser])

  useEffect(() => {
    if (!stream) {
      setVideoLayout({ screen: null, camera: null })
      return undefined
    }
    const sync = () => {
      const { screen, camera } = splitScreenCameraStreams(stream)
      setVideoLayout({
        screen: omitScreen ? null : screen,
        camera,
      })
    }
    sync()
    stream.addEventListener('addtrack', sync)
    stream.addEventListener('removetrack', sync)
    return () => {
      stream.removeEventListener('addtrack', sync)
      stream.removeEventListener('removetrack', sync)
    }
  }, [stream, omitScreen])

  useEffect(() => {
    const sv = screenVideoRef.current
    const cv = cameraVideoRef.current
    if (sv) {
      sv.srcObject = videoLayout.screen
      if (videoLayout.screen) {
        const p = sv.play()
        if (p !== undefined) p.catch(() => {})
      }
    }
    if (cv) {
      cv.srcObject = videoLayout.camera
      if (videoLayout.camera) {
        const p = cv.play()
        if (p !== undefined) p.catch(() => {})
      }
    }
  }, [videoLayout])

  if (!stream) return null

  return (
    <>
      <audio
        ref={(el) => {
          voiceAudioRef.current = el
          onAudioRef?.(el)
        }}
        autoPlay
        className="voice-remote-audio-el"
      />
      <audio ref={screenAudioRef} autoPlay className="voice-remote-audio-el voice-remote-screen-audio-el" />
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

function IconMic({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-4.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  )
}

function IconMicMuted({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M19 11h-1.7c0-.74-.16-1.44-.43-2.09l1.23-1.23c.56.98.9 2.09.9 3.32zM12 14c-1.66 0-3-1.34-3-3V6c0-.36.07-.7.18-1.02L7.1 8.06A2.98 2.98 0 0 0 7 9v5a5 5 0 0 0 5 5c1.43 0 2.74-.61 3.68-1.57L13 14.83A2.98 2.98 0 0 1 12 14zm9.71-9.71L4.29 20.29 3 19l3.59-3.59A6.96 6.96 0 0 1 5 11H3a8 8 0 0 0 4.34 7.11L8.55 21H11v2h2v-2h2.45l1.79-2.89A8 8 0 0 0 21 11h-2a6.96 6.96 0 0 1-1.31 3.41l2.39-2.39 1.63 1.63z"
      />
    </svg>
  )
}

function IconHeadphones({ className = '' }) {
  return (
    <svg
      className={`voice-toolbar-svg ${className}`}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 13a10 10 0 0 1 20 0" />
      <rect x="2" y="13" width="6" height="8" rx="2" />
      <rect x="16" y="13" width="6" height="8" rx="2" />
    </svg>
  )
}

function IconHeadphonesDeafened({ className = '' }) {
  return (
    <svg
      className={`voice-toolbar-svg ${className}`}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 13a10 10 0 0 1 20 0" />
      <rect x="2" y="13" width="6" height="8" rx="2" />
      <rect x="16" y="13" width="6" height="8" rx="2" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

function IconVideo({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M18 10.48V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.48l4 3.52v-11l-4 3.48zM16 18H4V6h12v12z"
      />
    </svg>
  )
}

function IconVideoOff({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M21 6.5l-4 3.5v-4a2 2 0 0 0-2-2h-9.17L21 17.17V6.5zM3.27 2L2 3.27 4.73 6H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12.73l2 2L21 20.73 3.27 2zM6 10h4.73L6 5.27V10zm6 8H4v-8h2.73l8 8z"
      />
    </svg>
  )
}

function IconScreenShare({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 18c1.1 0 1.99-.9 1.99-2L22 6a2 2 0 0 0-2-2H4c-1.11 0-2 .89-2 2v10a2 2 0 0 0 2 2H0v2h24v-2h-4zm-7-3.12l3.17-3.17 1.41 1.41L12 19l-5.59-5.88 1.41-1.41L11 14.88V8h2v6.88zM4 16V6h16v10H4z"
      />
    </svg>
  )
}

function IconJoinCall({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1.02 1.02 0 0 0-1.02.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM12 3v10l3-3h6V3h-9z"
      />
    </svg>
  )
}

function IconTestMic({ className = '' }) {
  return (
    <svg className={`voice-toolbar-svg ${className}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path
        fill="currentColor"
        d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
      />
    </svg>
  )
}

function IconWaveSpeaking({ className = '' }) {
  return (
    <svg className={`voice-wave-speaking-icon ${className}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M3 10v4c0 .55.45 1 1 1h3l4 4V5L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 4.5 0 0 0 12 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c3.91-.91 7-4.49 7-8.77s-3.09-7.86-7-8.77z"
      />
    </svg>
  )
}

function IconVolume({ className = '' }) {
  return (
    <svg className={`voice-volume-icon ${className}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M3 10v4h4l5 5V5L7 10H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c3.91-.91 7-4.49 7-8.77s-3.09-7.86-7-8.77z"
      />
    </svg>
  )
}

function IconInviteOverlay() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  )
}

function IconActivityOverlay() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h18v8zM9 10.5c0 .83-.67 1.5-1.5 1.5S6 11.33 6 10.5 6.67 9 7.5 9s1.5.67 1.5 1.5zm6 0c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5S12.67 9 13.5 9s1.5.67 1.5 1.5zM12 17c-2.61 0-4.83-1.67-5.65-4h11.3c-.82 2.33-3.04 4-5.65 4z"
      />
    </svg>
  )
}

function VoiceToolbarBtn({ onClick, title, ariaLabel, pressed, active, danger, children }) {
  const cls = ['voice-icon-btn', active && 'is-active', danger && 'is-danger', pressed && 'is-pressed']
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} onClick={onClick} title={title} aria-label={ariaLabel} aria-pressed={pressed}>
      {children}
    </button>
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
  /** Which shared screen is shown large: 'local' or a remote socketId; null when none sharing. */
  const [screenFocusId, setScreenFocusId] = useState(null)
  const [localScreenAudioSendMuted, setLocalScreenAudioSendMuted] = useState(false)
  const [localScreenPreviewMuted, setLocalScreenPreviewMuted] = useState(false)
  /** Per remote socket: mute only their screen-capture audio (not their mic). */
  const [remoteScreenAudioMuted, setRemoteScreenAudioMuted] = useState({})
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const localScreenVideoRef = useRef(null)
  const localPipVideoRef = useRef(null)
  const screenFocusVideoRef = useRef(null)
  const screenFocusShellRef = useRef(null)
  const screenFocusPipVideoRef = useRef(null)
  const screenShareStreamRef = useRef(null)
  const screenTrackRef = useRef(null)
  /** Audio tracks from getDisplayMedia (tab/system); empty if browser shares video only. */
  const screenShareAudioTracksRef = useRef([])
  const localScreenShareAudioPreviewRef = useRef(null)
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
  const lastScreenShareIdsKeyRef = useRef('')
  const rawVoiceStreamRef = useRef(null)
  const outgoingGainNodeRef = useRef(null)
  const voiceOutgoingDisconnectRef = useRef(null)
  const pendingAudioCtxCloseRef = useRef(null)

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioContextRef.current = new Ctx()
    }
    return audioContextRef.current
  }, [])

  function teardownVoiceOutgoingProcessing() {
    try {
      voiceOutgoingDisconnectRef.current?.()
    } catch (_) {
      /* ignore */
    }
    voiceOutgoingDisconnectRef.current = null
    outgoingGainNodeRef.current = null
  }

  const volumeStorageKey = `akoenet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`
  const legacyVolumeStorageKeys = useMemo(
    () => [
      `Akonet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`,
      `akonet_voice_volumes_${user?.id || 'anon'}_${channelId || 'none'}`,
      `akoe:voice:volumes:${user?.id || 'anon'}:${channelId || 'none'}`,
    ],
    [user?.id, channelId]
  )

  const screenShareOptions = useMemo(() => {
    const opts = []
    if (joined && screenSharing && localScreenStream && streamHasScreenShare(localScreenStream)) {
      opts.push({ key: 'local', label: 'Tu pantalla' })
    }
    const socket = getSocket()
    const selfSid = socket?.id
    for (const p of participants) {
      if (p.socketId === selfSid) continue
      const rs = remoteStreams[p.socketId]
      if (streamHasScreenShare(rs)) {
        opts.push({ key: p.socketId, label: p.username })
      }
    }
    return opts
  }, [joined, screenSharing, localScreenStream, participants, remoteStreams])

  useEffect(() => {
    if (screenShareOptions.length === 0) {
      setScreenFocusId(null)
      return
    }
    setScreenFocusId((prev) => {
      if (prev && screenShareOptions.some((o) => o.key === prev)) return prev
      return screenShareOptions[0].key
    })
  }, [screenShareOptions])

  useEffect(() => {
    if (!joined || !onVoiceSessionChange) {
      if (!joined) lastScreenShareIdsKeyRef.current = ''
      return
    }
    const socket = getSocket()
    const selfSid = socket?.id
    const ids = []
    if (screenSharing && localScreenStream && streamHasScreenShare(localScreenStream) && user?.id != null) {
      ids.push(Number(user.id))
    }
    for (const p of participants) {
      if (p.socketId === selfSid) continue
      if (streamHasScreenShare(remoteStreams[p.socketId]) && p.userId != null) {
        ids.push(Number(p.userId))
      }
    }
    const key = ids.map(String).sort().join(',')
    if (key === lastScreenShareIdsKeyRef.current) return
    lastScreenShareIdsKeyRef.current = key
    onVoiceSessionChange({ screenSharingUserIds: ids })
  }, [
    joined,
    channelId,
    screenSharing,
    localScreenStream,
    user?.id,
    participants,
    remoteStreams,
    onVoiceSessionChange,
  ])

  useEffect(() => {
    const el = screenFocusVideoRef.current
    if (!el) return
    if (!screenFocusId || screenShareOptions.length === 0) {
      el.srcObject = null
      return
    }
    const screenStream =
      screenFocusId === 'local'
        ? splitScreenCameraStreams(localScreenStream).screen
        : splitScreenCameraStreams(remoteStreams[screenFocusId]).screen
    el.srcObject = screenStream
    if (screenStream) {
      const p = el.play()
      if (p !== undefined) p.catch(() => {})
    }
  }, [screenFocusId, screenShareOptions, localScreenStream, remoteStreams])

  /** Miniatura cámara encima de la pantalla destacada (tú o remoto con cam + pantalla). */
  useEffect(() => {
    const el = screenFocusPipVideoRef.current
    if (!el) return
    if (!screenFocusId || screenShareOptions.length === 0) {
      el.srcObject = null
      return
    }
    if (screenFocusId === 'local') {
      if (cameraOn && localStreamRef.current) {
        const vts = localStreamRef.current.getVideoTracks().filter((t) => t.readyState === 'live')
        el.srcObject = vts.length ? new MediaStream(vts) : null
      } else {
        el.srcObject = null
      }
      return
    }
    const { camera } = splitScreenCameraStreams(remoteStreams[screenFocusId])
    el.srcObject = camera
  }, [
    screenFocusId,
    screenShareOptions.length,
    cameraOn,
    joined,
    localScreenStream,
    remoteStreams,
  ])

  /**
   * Chrome suele recortar mal getDisplayMedia si solo usamos CSS (object-fit + %).
   * Dimensionamos el <video> en px con el aspecto real (videoWidth/videoHeight) para que quepa en el shell.
   */
  useEffect(() => {
    const video = screenFocusVideoRef.current
    const shell = screenFocusShellRef.current
    if (!video || !shell || !screenFocusId || screenShareOptions.length === 0) return undefined

    function fit() {
      const v = screenFocusVideoRef.current
      const s = screenFocusShellRef.current
      if (!v || !s) return
      const vw = v.videoWidth
      const vh = v.videoHeight
      if (!vw || !vh) {
        v.style.removeProperty('width')
        v.style.removeProperty('height')
        v.style.removeProperty('object-fit')
        return
      }
      const cr = s.getBoundingClientRect()
      const cw = cr.width
      const ch = cr.height
      if (cw < 2 || ch < 2) return
      const scale = Math.min(cw / vw, ch / vh)
      const w = Math.max(1, Math.round(vw * scale * 1000) / 1000)
      const h = Math.max(1, Math.round(vh * scale * 1000) / 1000)
      v.style.width = `${w}px`
      v.style.height = `${h}px`
      v.style.objectFit = 'fill'
    }

    const scheduleFit = () => {
      requestAnimationFrame(fit)
    }

    video.addEventListener('loadedmetadata', scheduleFit)
    video.addEventListener('loadeddata', scheduleFit)
    video.addEventListener('canplay', scheduleFit)
    window.addEventListener('resize', scheduleFit)

    const ro = new ResizeObserver(scheduleFit)
    ro.observe(shell)

    let track
    const { srcObject } = video
    if (srcObject && typeof MediaStream !== 'undefined' && srcObject instanceof MediaStream) {
      track = srcObject.getVideoTracks()[0]
      if (track) track.addEventListener('resize', scheduleFit)
    }

    scheduleFit()
    const t1 = setTimeout(scheduleFit, 80)
    const t2 = setTimeout(scheduleFit, 350)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      video.removeEventListener('loadedmetadata', scheduleFit)
      video.removeEventListener('loadeddata', scheduleFit)
      video.removeEventListener('canplay', scheduleFit)
      window.removeEventListener('resize', scheduleFit)
      ro.disconnect()
      if (track) track.removeEventListener('resize', scheduleFit)
      video.style.removeProperty('width')
      video.style.removeProperty('height')
      video.style.removeProperty('object-fit')
    }
  }, [screenFocusId, screenShareOptions.length, localScreenStream, remoteStreams])

  useEffect(() => {
    const s = getSavedVoiceSettings(user?.id)
    micGainRef.current = s.micGain
  }, [user?.id])

  useEffect(() => {
    if (!joined) return undefined
    const syncMicGain = () => {
      const g = getSavedVoiceSettings(user?.id).micGain
      micGainRef.current = g
      if (outgoingGainNodeRef.current) {
        outgoingGainNodeRef.current.gain.value = Math.max(0, Math.min(2, g / 100))
      }
    }
    syncMicGain()
    const id = window.setInterval(syncMicGain, 500)
    return () => window.clearInterval(id)
  }, [joined, user?.id])

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
    setScreenFocusId((prev) => (prev === socketId ? null : prev))
    setRemoteScreenAudioMuted((prev) => {
      if (prev[socketId] === undefined) return prev
      const next = { ...prev }
      delete next[socketId]
      return next
    })
  }

  function attachRemoteStream(socketId, stream) {
    setRemoteStreams((prev) => ({ ...prev, [socketId]: stream }))
    setupRemoteAnalyser(socketId, stream)
  }

  /** Short chime for other participants when someone joins the voice channel (not played to the joiner). */
  function playVoiceJoinChime() {
    const ctx = ensureAudioContext()
    if (!ctx) return
    const run = () => {
      const t0 = ctx.currentTime
      const dur = 0.22
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, t0)
      osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.07)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + dur)
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().then(run).catch(() => {})
    } else {
      run()
    }
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
    screenShareAudioTracksRef.current.forEach((at) => {
      const ss = screenShareStreamRef.current
      if (ss && at.readyState === 'live') {
        pc.addTrack(at, ss)
      }
    })

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
    screenShareAudioTracksRef.current = []
    setLocalScreenStream(null)
    setScreenSharing(false)
    setLocalScreenAudioSendMuted(false)
    setLocalScreenPreviewMuted(false)
    if (localScreenShareAudioPreviewRef.current) {
      localScreenShareAudioPreviewRef.current.srcObject = null
    }
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
      screenShareAudioTracksRef.current = []
      return
    }
    const screenAudios = screenShareAudioTracksRef.current
    peersRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        const tr = sender.track
        if (!tr) return
        if (tr === track || screenAudios.includes(tr)) {
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
    screenShareAudioTracksRef.current = []
    setLocalScreenAudioSendMuted(false)
    setLocalScreenPreviewMuted(false)
    if (localScreenShareAudioPreviewRef.current) {
      localScreenShareAudioPreviewRef.current.srcObject = null
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
      const audioTracks = screenStream.getAudioTracks()
      screenShareAudioTracksRef.current = audioTracks
      setLocalScreenAudioSendMuted(false)
      setLocalScreenStream(screenStream)
      setScreenSharing(true)
      vt.addEventListener('ended', () => {
        void stopScreenShare()
      })
      peersRef.current.forEach((pc) => {
        pc.addTrack(vt, screenStream)
        audioTracks.forEach((at) => {
          pc.addTrack(at, screenStream)
        })
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
          audio: getVoiceChannelAudioConstraints(),
          video: wantVideo ? getVoiceVideoConstraints() : false,
        })
      } catch (firstErr) {
        if (wantVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: getVoiceChannelAudioConstraints(),
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
      rawVoiceStreamRef.current = stream
      if (pendingAudioCtxCloseRef.current) {
        clearTimeout(pendingAudioCtxCloseRef.current)
        pendingAudioCtxCloseRef.current = null
      }
      const ctx = ensureAudioContext()
      if (!ctx) {
        joinInProgressRef.current = false
        stream.getTracks().forEach((t) => t.stop())
        rawVoiceStreamRef.current = null
        setError('Audio is not available in this browser')
        return
      }
      await ctx.resume()
      const mediaSource = ctx.createMediaStreamSource(stream)
      const graph = buildVoiceOutgoingGraph(ctx, mediaSource, {
        micGainPercent: micGainRef.current,
      })
      voiceOutgoingDisconnectRef.current = graph.disconnect
      outgoingGainNodeRef.current = graph.gain
      localAnalyserRef.current = graph.analyser
      localDataRef.current = new Uint8Array(graph.analyser.fftSize)
      startMeterLoop()

      const processedAudioTrack = graph.destination.stream.getAudioTracks()[0]
      if (!processedAudioTrack) {
        teardownVoiceOutgoingProcessing()
        stream.getTracks().forEach((t) => t.stop())
        rawVoiceStreamRef.current = null
        joinInProgressRef.current = false
        setError('Could not process microphone')
        return
      }
      const localStream = new MediaStream([processedAudioTrack, ...stream.getVideoTracks()])
      localStreamRef.current = localStream

      const hasVideo = stream.getVideoTracks().length > 0
      setCameraOn(hasVideo)
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = !startMuted
      })
      setMuted(startMuted)
      setDeafened(startDeafened)
      socket.emit('voice:join', { channelId, username: user?.username }, (ack) => {
        joinInProgressRef.current = false
        if (!ack?.ok) {
          const err = ack?.error
          setError(err === 'voice_full' ? 'This voice channel is full' : 'Could not join voice channel')
          teardownVoiceOutgoingProcessing()
          stream.getTracks().forEach((t) => t.stop())
          localStreamRef.current = null
          rawVoiceStreamRef.current = null
          voiceJoinedChannelRef.current = null
          clearLocalMeter()
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
      teardownVoiceOutgoingProcessing()
      if (rawVoiceStreamRef.current) {
        rawVoiceStreamRef.current.getTracks().forEach((t) => t.stop())
        rawVoiceStreamRef.current = null
      }
      localStreamRef.current = null
      clearLocalMeter()
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
    teardownVoiceOutgoingProcessing()
    clearLocalMeter()
    if (pendingAudioCtxCloseRef.current) {
      clearTimeout(pendingAudioCtxCloseRef.current)
      pendingAudioCtxCloseRef.current = null
    }
    const ctxToClose = audioContextRef.current
    setSpeakingMap({})
    if (rawVoiceStreamRef.current) {
      rawVoiceStreamRef.current.getTracks().forEach((t) => t.stop())
      rawVoiceStreamRef.current = null
    } else if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    localStreamRef.current = null
    setRemoteStreams({})
    setRemoteScreenAudioMuted({})
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
    pendingAudioCtxCloseRef.current = window.setTimeout(() => {
      pendingAudioCtxCloseRef.current = null
      if (ctxToClose && ctxToClose.state !== 'closed') {
        ctxToClose.close().catch(() => {})
      }
      if (audioContextRef.current === ctxToClose) {
        audioContextRef.current = null
      }
    }, 0)
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

  function toggleLocalScreenAudioSend() {
    const next = !localScreenAudioSendMuted
    setLocalScreenAudioSendMuted(next)
    screenShareAudioTracksRef.current.forEach((t) => {
      if (t.readyState === 'live') t.enabled = !next
    })
  }

  function toggleRemoteScreenAudioMute(socketId) {
    setRemoteScreenAudioMuted((prev) => ({
      ...prev,
      [socketId]: !prev[socketId],
    }))
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
        audio: getMicTestAudioConstraints(),
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
      if (screenFocusId === 'local' && cameraOn) {
        const vts = s.getVideoTracks().filter((t) => t.readyState === 'live')
        el.srcObject = vts.length ? new MediaStream(vts) : null
        return
      }
      el.srcObject = null
      return
    }
    el.srcObject = s
  }, [joined, cameraOn, testingMic, screenSharing, localScreenStream, screenFocusId])

  useEffect(() => {
    const el = localScreenVideoRef.current
    if (!el) return
    if (screenSharing && localScreenStream && screenFocusId !== 'local') {
      el.srcObject = localScreenStream
    } else {
      el.srcObject = null
    }
  }, [localScreenStream, screenSharing, screenFocusId])

  useEffect(() => {
    const pip = localPipVideoRef.current
    if (!pip || !localStreamRef.current) return
    if (screenSharing && cameraOn && screenFocusId !== 'local') {
      const vts = localStreamRef.current.getVideoTracks().filter((t) => t.readyState === 'live')
      pip.srcObject = vts.length ? new MediaStream(vts) : null
    } else {
      pip.srcObject = null
    }
  }, [screenSharing, cameraOn, joined, screenFocusId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !channelId) return
    const onJoined = (participant) => {
      if (participant.socketId !== socket.id && joined) {
        playVoiceJoinChime()
      }
      upsertParticipant(participant)
      // Only the joiner sends offers (see joinVoice ack). Existing members answer via voice:signal — avoids WebRTC offer glare.
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

  /** Sincronizar mic/sordina con el servidor para lista de canal y otros clientes. */
  useEffect(() => {
    if (!joined || !channelId) return undefined
    const socket = getSocket()
    if (!socket) return undefined
    socket.emit('voice:state', { channelId, mic_muted: muted, deafened })
    return undefined
  }, [joined, channelId, muted, deafened])

  /** Actualizar badges cuando voice:presence incluye mic_muted / deafened. */
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !channelId || !joined) return undefined
    function onPresence({ channelId: cid, participants: list }) {
      if (String(cid) !== String(channelId) || !Array.isArray(list)) return
      setParticipants((prev) => {
        const bySocket = new Map(list.map((p) => [p.socketId, p]))
        return prev.map((p) => {
          const u = bySocket.get(p.socketId)
          if (!u) return p
          return {
            ...p,
            mic_muted: u.mic_muted,
            deafened: u.deafened,
          }
        })
      })
    }
    socket.on('voice:presence', onPresence)
    return () => {
      socket.off('voice:presence', onPresence)
    }
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

  useEffect(() => {
    const el = localScreenShareAudioPreviewRef.current
    if (!el || !screenSharing || !localScreenStream) {
      if (el) el.srcObject = null
      return undefined
    }
    const tracks = localScreenStream.getAudioTracks().filter((t) => t.readyState === 'live')
    if (tracks.length === 0) {
      el.srcObject = null
      return undefined
    }
    el.srcObject = new MediaStream(tracks)
    el.muted = localScreenPreviewMuted
    const p = el.play()
    if (p !== undefined) p.catch(() => {})
    return undefined
  }, [screenSharing, localScreenStream, localScreenPreviewMuted])

  function getInitial(name) {
    return (name || '?').slice(0, 1).toUpperCase()
  }

  const voiceCap = voiceCapNumber(voiceUserLimit)
  const showVoiceCap = voiceCap != null && typeof voiceConnectedCount === 'number'
  const displayTitle = channelLabel || 'Voice Channel'

  const showScreenFocusPip =
    Boolean(screenFocusId) &&
    (screenFocusId === 'local'
      ? cameraOn && screenSharing
      : streamHasCameraPip(remoteStreams[screenFocusId]))

  const hasScreenShareStage = joined && screenShareOptions.length > 0

  const localHasScreenShareAudio =
    screenSharing &&
    localScreenStream &&
    localScreenStream.getAudioTracks().some((t) => t.readyState === 'live')

  return (
    <section
      className={`channel-mode-box voice-room-discord${compact ? ' voice-room-compact' : ''}${hasScreenShareStage ? ' voice-room-has-screen-share' : ''}`}
    >
      <header className="voice-room-top">
        <div>
          <h3 className="voice-room-title-row">
            <span className="voice-room-title-icon" aria-hidden>
              {joined ? <IconWaveSpeaking /> : <IconHeadphones />}
            </span>
            {compact ? `En voz: ${displayTitle}` : 'Voice Channel'}
          </h3>
          {showVoiceCap && (
            <p
              className={`voice-room-cap-line ${voiceConnectedCount >= voiceCap ? 'voice-room-cap-line--full' : ''}`}
              aria-live="polite"
            >
              <span className="voice-room-cap-icon" title="Usuarios en el canal" aria-hidden>
                👥
              </span>
              <strong>
                ({voiceConnectedCount}/{voiceCap})
              </strong>{' '}
              en el canal
            </p>
          )}
          <p className="voice-room-status-line">
            {joined ? (
              <>
                <span className="voice-status-chip" title="Personas conectadas">
                  <span aria-hidden>👤</span> {participants.length}
                </span>
                <span className="voice-status-chip" title={cameraOn ? 'Cámara encendida' : 'Cámara apagada'}>
                  {cameraOn ? <IconVideo /> : <IconVideoOff />}
                  <span className="voice-status-chip-label">{cameraOn ? 'Cam on' : 'Cam off'}</span>
                </span>
                <span className="voice-status-chip" title={screenSharing ? 'Compartiendo pantalla' : 'Sin pantalla'}>
                  <IconScreenShare />
                  <span className="voice-status-chip-label">{screenSharing ? 'Pantalla' : '—'}</span>
                </span>
              </>
            ) : autoJoin ? (
              <>
                <span className="voice-status-chip voice-status-chip--pulse" title="Conectando">
                  <IconMic /> Conectando…
                </span>
              </>
            ) : (
              <>
                <IconJoinCall /> <span>Únete para hablar por voz y opcionalmente usar cámara</span>
              </>
            )}
          </p>
        </div>
        <div
          className={`voice-room-chip ${joined ? 'voice-room-chip--live' : 'voice-room-chip--idle'}`}
          title={joined ? 'En llamada' : 'Sin conexión'}
        >
          <span className="voice-room-chip-dot" aria-hidden />
          {joined ? 'EN VIVO' : 'LISTO'}
        </div>
      </header>

      {hasScreenShareStage && (
        <div className="voice-screen-focus-block">
          <div className="voice-screen-focus-canvas">
            <span className="voice-screen-focus-live-badge" aria-hidden>
              EN VIVO
            </span>
            <div className="voice-screen-focus-toolbar voice-screen-focus-toolbar--overlay">
              <label htmlFor="voice-screen-focus-select" className="voice-screen-focus-label">
                Pantalla destacada
              </label>
              <select
                id="voice-screen-focus-select"
                className="voice-screen-focus-select"
                value={screenFocusId ?? screenShareOptions[0]?.key ?? ''}
                onChange={(e) => setScreenFocusId(e.target.value)}
              >
                {screenShareOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="voice-screen-focus-video-shell" ref={screenFocusShellRef}>
              <video
                ref={screenFocusVideoRef}
                className="voice-screen-focus-video"
                autoPlay
                playsInline
                muted
              />
            </div>
            {showScreenFocusPip ? (
              <video
                ref={screenFocusPipVideoRef}
                className="voice-screen-focus-pip"
                autoPlay
                playsInline
                muted
              />
            ) : null}
            <div className="voice-screen-focus-overlay-actions">
              <button
                type="button"
                className="voice-screen-overlay-btn"
                onClick={() => {
                  const url = window.location.href
                  void navigator.clipboard?.writeText(url)
                }}
                title="Copiar enlace de esta página"
              >
                <span className="voice-screen-overlay-btn-icon" aria-hidden>
                  <IconInviteOverlay />
                </span>
                Invitar al chat de voz
              </button>
              <button type="button" className="voice-screen-overlay-btn voice-screen-overlay-btn--muted" disabled title="Próximamente">
                <span className="voice-screen-overlay-btn-icon" aria-hidden>
                  <IconActivityOverlay />
                </span>
                Elegir actividad
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`voice-stage-grid${hasScreenShareStage ? ' voice-stage-grid--with-screen-focus' : ''}`}
      >
        {joined && (
          <article
            className={`voice-stage-tile self${hasScreenShareStage && screenFocusId === 'local' ? ' voice-stage-tile--focus' : ''}`}
          >
            {screenSharing && localScreenStream && streamHasScreenShare(localScreenStream) && (
              <span className="voice-tile-live-badge">EN VIVO</span>
            )}
            {screenSharing && localScreenStream ? (
              screenFocusId === 'local' ? (
                cameraOn ? (
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
                )
              ) : (
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
              )
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
              <span className="voice-stage-name">You</span>
              {screenSharing && (
                <span className="voice-badge screen" title="Compartiendo pantalla">
                  <IconScreenShare /> <span className="voice-badge-text">Pantalla</span>
                </span>
              )}
              {muted && (
                <span className="voice-badge muted" title="Micrófono silenciado">
                  <IconMicMuted /> <span className="voice-badge-text">Mute</span>
                </span>
              )}
            </footer>
          </article>
        )}

        {participants
          .filter((p) => p.socketId !== getSocket()?.id)
          .map((p) => (
            <article
              key={p.socketId}
              className={`voice-stage-tile ${speakingMap[p.socketId] ? 'speaking' : ''}${hasScreenShareStage && screenFocusId === p.socketId ? ' voice-stage-tile--focus' : ''}`}
            >
              {streamHasScreenShare(remoteStreams[p.socketId]) && (
                <span className="voice-tile-live-badge">EN VIVO</span>
              )}
              <RemoteParticipantMedia
                stream={remoteStreams[p.socketId]}
                volume={deafened ? 0 : remoteVolumes[p.socketId] ?? 100}
                mutedByDeafen={deafened}
                screenAudioMutedByUser={Boolean(remoteScreenAudioMuted[p.socketId])}
                omitScreen={screenFocusId === p.socketId}
                getAudioContext={ensureAudioContext}
                onAudioRef={(el) => {
                  if (el) remoteMediaRef.current.set(p.socketId, el)
                  else remoteMediaRef.current.delete(p.socketId)
                }}
              />
              {!streamShowsVideoInTile(remoteStreams[p.socketId], screenFocusId === p.socketId) && (
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
                <span className="voice-stage-name">{p.username}</span>
                <span className="voice-stage-meta-badges">
                  {streamHasScreenShare(remoteStreams[p.socketId]) && (
                    <span className="voice-badge screen" title="Compartiendo pantalla">
                      <IconScreenShare /> <span className="voice-badge-text">Pantalla</span>
                    </span>
                  )}
                  {p.mic_muted ? (
                    <span className="voice-badge muted" title="Micrófono silenciado">
                      <IconMicMuted /> <span className="voice-badge-text">Mute</span>
                    </span>
                  ) : null}
                  {p.deafened ? (
                    <span className="voice-badge voice-badge--deafened" title="Sordina (no oye el canal)">
                      <IconHeadphonesDeafened /> <span className="voice-badge-text">Sordina</span>
                    </span>
                  ) : null}
                  <span
                    className={`voice-indicator ${speakingMap[p.socketId] ? 'active' : ''}`}
                    title={speakingMap[p.socketId] ? 'Hablando' : 'Escuchando'}
                  >
                    <IconWaveSpeaking />
                    <span className="voice-indicator-label">{speakingMap[p.socketId] ? 'Habla' : 'Escucha'}</span>
                  </span>
                </span>
              </footer>
              <label className="voice-volume">
                <IconVolume />
                <span className="sr-only">Volumen de {p.username}</span>
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
              {remoteStreamHasSplittableScreenAudio(remoteStreams[p.socketId]) ? (
                <div className="voice-screen-audio-row">
                  <VoiceToolbarBtn
                    onClick={() => toggleRemoteScreenAudioMute(p.socketId)}
                    title={
                      remoteScreenAudioMuted[p.socketId]
                        ? 'Activar audio de la pantalla compartida'
                        : 'Silenciar solo el audio de la pantalla (voz sigue)'
                    }
                    ariaLabel={
                      remoteScreenAudioMuted[p.socketId]
                        ? 'Activar audio de pantalla'
                        : 'Silenciar audio de pantalla'
                    }
                    pressed={Boolean(remoteScreenAudioMuted[p.socketId])}
                  >
                    <span className="voice-screen-audio-icon" aria-hidden>
                      {remoteScreenAudioMuted[p.socketId] ? '🔇' : '🔊'}
                    </span>
                  </VoiceToolbarBtn>
                  <span className="muted small">Audio pantalla</span>
                </div>
              ) : null}
            </article>
          ))}
      </div>

      {(joined || testingMic) && (
        <div className="mic-status mic-status--with-icon">
          <div className="mic-status-label" title={testingMic && !joined ? 'Prueba de micrófono' : muted ? 'Micrófono silenciado' : 'Nivel del micrófono'}>
            <span className="mic-status-icon" aria-hidden>
              {muted && joined ? <IconMicMuted /> : <IconMic />}
            </span>
            <span className="muted small">
              {testingMic && !joined ? 'Prueba de micrófono' : muted ? 'Micrófono silenciado' : 'Nivel del micrófono'}
            </span>
          </div>
          <div className="mic-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)} aria-label="Nivel de entrada del micrófono">
            <span
              className={`mic-meter-fill ${muted && joined ? 'muted' : ''}`}
              style={{ width: `${Math.max(6, Math.round(micLevel * 100))}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}

      <div className="voice-controls discord voice-toolbar-wrap">
        {!joined && (
          <VoiceToolbarBtn
            onClick={testingMic ? stopMicTest : startMicTest}
            title={testingMic ? 'Detener prueba de micrófono' : 'Probar micrófono'}
            ariaLabel={testingMic ? 'Detener prueba de micrófono' : 'Probar micrófono'}
            active={testingMic}
          >
            <IconTestMic />
          </VoiceToolbarBtn>
        )}
        {!joined ? (
          <VoiceToolbarBtn
            onClick={() => joinVoice()}
            title="Unirse al canal de voz"
            ariaLabel="Unirse al canal de voz"
            active
          >
            <IconJoinCall />
          </VoiceToolbarBtn>
        ) : (
          <>
            <VoiceToolbarBtn
              onClick={toggleMute}
              title={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
              ariaLabel={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
              pressed={muted}
              active={!muted}
            >
              {muted ? <IconMicMuted /> : <IconMic />}
            </VoiceToolbarBtn>
            <VoiceToolbarBtn
              onClick={toggleDeafened}
              title={deafened ? 'Dejar de silenciar audio (oír a otros)' : 'Silenciar audio (no oír a nadie)'}
              ariaLabel={deafened ? 'Activar audio entrante' : 'Silenciar audio entrante'}
              pressed={deafened}
            >
              {deafened ? <IconHeadphonesDeafened /> : <IconHeadphones />}
            </VoiceToolbarBtn>
            <VoiceToolbarBtn
              onClick={toggleCamera}
              title={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
              ariaLabel={cameraOn ? 'Apagar cámara' : 'Encender cámara'}
              pressed={cameraOn}
              active={cameraOn}
            >
              {cameraOn ? <IconVideo /> : <IconVideoOff />}
            </VoiceToolbarBtn>
            <VoiceToolbarBtn
              onClick={() => void toggleScreenShare()}
              title={screenSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
              ariaLabel={screenSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
              pressed={screenSharing}
              active={screenSharing}
            >
              <IconScreenShare />
            </VoiceToolbarBtn>
            <VoiceToolbarBtn onClick={leaveVoice} title="Salir del canal de voz" ariaLabel="Salir del canal de voz" danger>
              <PhoneHangupIcon />
            </VoiceToolbarBtn>
          </>
        )}
      </div>

      {joined && localHasScreenShareAudio ? (
        <div className="voice-screen-audio-local-toolbar">
          <VoiceToolbarBtn
            onClick={toggleLocalScreenAudioSend}
            title={
              localScreenAudioSendMuted
                ? 'Enviar a los demás el audio de la pantalla (vídeo o pestaña)'
                : 'No enviar el audio de la pantalla (solo imagen)'
            }
            ariaLabel={localScreenAudioSendMuted ? 'Activar envío de audio de pantalla' : 'Silenciar envío de audio de pantalla'}
            pressed={localScreenAudioSendMuted}
          >
            <span aria-hidden>{localScreenAudioSendMuted ? '🔇' : '🔊'}</span>
          </VoiceToolbarBtn>
          <span className="muted small">Audio → otros</span>
          <VoiceToolbarBtn
            onClick={() => setLocalScreenPreviewMuted((v) => !v)}
            title={
              localScreenPreviewMuted
                ? 'Escuchar aquí el audio de la pestaña/pantalla'
                : 'No reproducir aquí el audio local (sigue enviándose si está activo)'
            }
            ariaLabel={localScreenPreviewMuted ? 'Activar escucha local del audio' : 'Silenciar escucha local'}
            pressed={localScreenPreviewMuted}
          >
            <span aria-hidden>{localScreenPreviewMuted ? '🔇' : '🔉'}</span>
          </VoiceToolbarBtn>
          <span className="muted small">Oír aquí</span>
        </div>
      ) : null}

      <audio
        ref={localScreenShareAudioPreviewRef}
        className="voice-local-screen-audio-preview"
        playsInline
        aria-hidden
      />
    </section>
  )
}
