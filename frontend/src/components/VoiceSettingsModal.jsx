import { useEffect, useMemo, useRef, useState } from 'react'
import { getVoiceAudioConstraints } from '../lib/voiceConstraints'

function getStorageKey(userId) {
  return `akoe:voice:settings:${userId || 'anon'}`
}

function readSettings(userId) {
  const fallback = { micGain: 100, monitorMic: true, cameraEnabled: false }
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const gain = Number(parsed?.micGain)
    if (!Number.isFinite(gain)) return fallback
    return {
      micGain: Math.max(0, Math.min(200, Math.round(gain))),
      monitorMic: typeof parsed?.monitorMic === 'boolean' ? parsed.monitorMic : true,
      cameraEnabled: typeof parsed?.cameraEnabled === 'boolean' ? parsed.cameraEnabled : false,
    }
  } catch {
    return fallback
  }
}

export function getSavedVoiceSettings(userId) {
  return readSettings(userId)
}

export default function VoiceSettingsModal({ open, onClose, user }) {
  const [testing, setTesting] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [micGain, setMicGain] = useState(100)
  const [error, setError] = useState('')
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const dataRef = useRef(null)
  const gainNodeRef = useRef(null)
  const monitorGainRef = useRef(null)
  const loopRef = useRef(null)
  const storageKey = useMemo(() => getStorageKey(user?.id), [user?.id])

  const [monitorMic, setMonitorMic] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)

  useEffect(() => {
    if (!open) return
    const saved = readSettings(user?.id)
    setMicGain(saved.micGain)
    setMonitorMic(saved.monitorMic)
    setCameraEnabled(saved.cameraEnabled)
  }, [open, user?.id])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ micGain, monitorMic, cameraEnabled }))
    } catch {
      /* ignore storage errors */
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = micGain / 100
    }
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = monitorMic ? 1 : 0
    }
  })

  useEffect(() => {
    if (!open) {
      stopTest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function computeLevel() {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (!analyser || !data) return 0
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128
      sum += centered * centered
    }
    return Math.sqrt(sum / data.length)
  }

  function startLoop() {
    if (loopRef.current) return
    loopRef.current = window.setInterval(() => {
      const level = computeLevel()
      setMicLevel(Math.min(1, level * 4))
    }, 120)
  }

  function stopLoop() {
    if (!loopRef.current) return
    window.clearInterval(loopRef.current)
    loopRef.current = null
  }

  async function startTest() {
    if (testing) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getVoiceAudioConstraints(),
      })
      streamRef.current = stream
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) {
        setError('AudioContext is not supported in this browser')
        stopTest()
        return
      }
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      await ctx.resume()
      const gain = ctx.createGain()
      gain.gain.value = micGain / 100
      const monitorGain = ctx.createGain()
      monitorGain.gain.value = monitorMic ? 1 : 0
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.5
      source.connect(gain)
      gain.connect(analyser)
      gain.connect(monitorGain)
      monitorGain.connect(ctx.destination)
      gainNodeRef.current = gain
      monitorGainRef.current = monitorGain
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.fftSize)
      startLoop()
      setTesting(true)
    } catch {
      setError('Microphone access is not available for the test')
    }
  }

  function stopTest() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    analyserRef.current = null
    dataRef.current = null
    gainNodeRef.current = null
    monitorGainRef.current = null
    stopLoop()
    setMicLevel(0)
    setTesting(false)
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Voice settings</h3>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="muted small">
          Test your microphone, hear it through your speakers or headphones, and adjust input volume for voice chat.
          Use headphones to avoid echo or feedback.
        </p>
        {error && <div className="error-banner inline">{error}</div>}
        <div className="voice-settings-row">
          <label>Microphone volume ({micGain}%)</label>
          <input
            type="range"
            min="0"
            max="200"
            value={micGain}
            onChange={(e) => setMicGain(Number(e.target.value))}
          />
        </div>
        <label className="invite-toggle" style={{ marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            checked={monitorMic}
            onChange={(e) => setMonitorMic(e.target.checked)}
          />
          <span>Hear microphone (monitor) while testing</span>
        </label>
        <label className="invite-toggle">
          <input
            type="checkbox"
            checked={cameraEnabled}
            onChange={(e) => setCameraEnabled(e.target.checked)}
          />
          <span>Enable camera in voice channels (optional video)</span>
        </label>
        <div className="mic-status">
          <span className="muted small">
            {testing
              ? monitorMic
                ? 'Listening to mic — adjust volume; meter shows input level'
                : 'Meter only — enable “Hear microphone” to listen'
              : 'Start test to hear the mic and see level'}
          </span>
          <div className="mic-meter">
            <span className="mic-meter-fill" style={{ width: `${Math.max(6, Math.round(micLevel * 100))}%` }} />
          </div>
        </div>
        <div className="voice-controls">
          {!testing ? (
            <button type="button" className="btn secondary" onClick={startTest}>
              Test microphone
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={stopTest}>
              Stop test
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
