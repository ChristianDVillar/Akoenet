/**
 * Constraints tuned for voice chat: mono, wideband-friendly, browser DSP on.
 */
export function getVoiceAudioConstraints() {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: { ideal: 48000 },
  }
}

/**
 * Mic capture for the local mic test only: strong browser NR, no AGC pumping (less hiss in silence when monitoring).
 */
export function getMicTestAudioConstraints() {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: { ideal: 48000 },
  }
}

/** Same DSP profile as mic test: used for WebRTC voice channels (send path + consistency with settings). */
export function getVoiceChannelAudioConstraints() {
  return getMicTestAudioConstraints()
}

/**
 * Target loudness at 100% mic slider ≈ previous “200%” monitor level; 200% adds a little headroom.
 */
export const MIC_MONITOR_OUTPUT_GAIN = 2.2

/** Ceiling for mic test monitor (linear gain product to destination). */
const MIC_MONITOR_MAX_LINEAR = 2.65

/**
 * Second-stage gain for mic monitor during tests (after input gain = mic%/100).
 * Product (mic%/100) × this value = effective linear gain to destination (capped by {@link MIC_MONITOR_MAX_LINEAR}).
 */
export function getMicMonitorPlaybackGain(micGainPercent) {
  const m = Math.max(0.001, Math.min(2, Number(micGainPercent) / 100))
  const desiredTotal = Math.min(
    MIC_MONITOR_MAX_LINEAR,
    MIC_MONITOR_OUTPUT_GAIN * m * (micGainPercent > 100 ? m : 1),
  )
  return desiredTotal / m
}

/**
 * HPF/LPF + soft limiter for mic test playback: less rumble/hiss; tame peaks when gain is high.
 */
export function buildMicTestMonitorGraph(ctx, streamSource, { micGain, monitorMic }) {
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 95
  hp.Q.value = 0.707

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 14000
  lp.Q.value = 0.707

  const gain = ctx.createGain()
  gain.gain.value = micGain / 100

  const monitorGain = ctx.createGain()
  monitorGain.gain.value = monitorMic ? getMicMonitorPlaybackGain(micGain) : 0

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -4
  limiter.knee.value = 9
  limiter.ratio.value = 16
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.55

  streamSource.connect(hp)
  hp.connect(lp)
  lp.connect(gain)
  gain.connect(analyser)
  gain.connect(monitorGain)
  monitorGain.connect(limiter)
  limiter.connect(ctx.destination)

  return { hp, lp, gain, monitorGain, limiter, analyser }
}

/**
 * Outgoing voice (mic → WebRTC): band-limit + input gain + limiter. Analyser taps post-gain for the local meter.
 */
export function buildVoiceOutgoingGraph(ctx, mediaStreamSource, { micGainPercent }) {
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 95
  hp.Q.value = 0.707

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 14000
  lp.Q.value = 0.707

  const gain = ctx.createGain()
  gain.gain.value = Math.max(0, Math.min(2, Number(micGainPercent) / 100))

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -4
  limiter.knee.value = 9
  limiter.ratio.value = 16
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  const destination = ctx.createMediaStreamDestination()

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.55

  mediaStreamSource.connect(hp)
  hp.connect(lp)
  lp.connect(gain)
  gain.connect(analyser)
  gain.connect(limiter)
  limiter.connect(destination)

  const disconnect = () => {
    try {
      mediaStreamSource.disconnect()
    } catch (_) {
      /* ignore */
    }
    try {
      hp.disconnect()
      lp.disconnect()
      gain.disconnect()
      analyser.disconnect()
      limiter.disconnect()
    } catch (_) {
      /* ignore */
    }
  }

  return { hp, lp, gain, limiter, analyser, destination, disconnect }
}

/**
 * Incoming remote voice playback: same band shaping + limiter; output stream is audio-only for the audio element.
 */
export function buildRemoteVoicePlaybackGraph(ctx, stream) {
  const audioTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live')
  if (audioTracks.length === 0) {
    return { playbackStream: null, disconnect: () => {} }
  }
  const audioOnly = new MediaStream(audioTracks)
  const source = ctx.createMediaStreamSource(audioOnly)

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 95
  hp.Q.value = 0.707

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 14000
  lp.Q.value = 0.707

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -4
  limiter.knee.value = 9
  limiter.ratio.value = 16
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  const destination = ctx.createMediaStreamDestination()

  source.connect(hp)
  hp.connect(lp)
  lp.connect(limiter)
  limiter.connect(destination)

  const disconnect = () => {
    try {
      source.disconnect()
    } catch (_) {
      /* ignore */
    }
    try {
      hp.disconnect()
      lp.disconnect()
      limiter.disconnect()
    } catch (_) {
      /* ignore */
    }
  }

  return { playbackStream: destination.stream, disconnect }
}

/** Optional camera for voice channels (P2P video track). */
export function getVoiceVideoConstraints() {
  return {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',
  }
}

/** Screen / window share (getDisplayMedia). Requests system/tab audio when the browser supports it. */
export function getScreenShareConstraints() {
  return {
    video: { cursor: 'motion' },
    audio: true,
  }
}

/** Heuristic: audio track from display/tab capture (vs microphone). */
export function isScreenCaptureAudioTrack(track) {
  if (!track || track.kind !== 'audio') return false
  const l = (track.label || '').toLowerCase()
  if (
    l.includes('system audio') ||
    l.includes('display') ||
    (l.includes('tab') && l.includes('audio')) ||
    l.includes('loopback')
  ) {
    return true
  }
  return false
}

/**
 * Split a remote WebRTC stream into voice vs screen-share audio so they can be played/muted separately.
 * When labels are missing, assumes the last audio track is screen audio (typical order: mic, then share).
 */
export function partitionVoiceAndScreenAudio(stream) {
  const audios = stream.getAudioTracks().filter((t) => t.readyState === 'live')
  if (audios.length === 0) {
    return { voiceStream: new MediaStream(), screenStream: null }
  }
  if (audios.length === 1) {
    return { voiceStream: new MediaStream(audios), screenStream: null }
  }
  const screenTagged = audios.filter(isScreenCaptureAudioTrack)
  const voiceTagged = audios.filter((t) => !isScreenCaptureAudioTrack(t))
  if (screenTagged.length > 0) {
    const voice = voiceTagged.length ? voiceTagged : audios.filter((t) => !screenTagged.includes(t))
    return {
      voiceStream: new MediaStream(voice.length ? voice : audios.slice(0, 1)),
      screenStream: new MediaStream(screenTagged),
    }
  }
  const voice = audios.slice(0, -1)
  const screen = audios[audios.length - 1]
  return {
    voiceStream: new MediaStream(voice.length ? voice : [audios[0]]),
    screenStream: new MediaStream([screen]),
  }
}
