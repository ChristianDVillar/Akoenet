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

/** Optional camera for voice channels (P2P video track). */
export function getVoiceVideoConstraints() {
  return {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',
  }
}

/** Screen / window share (getDisplayMedia). Browser may still offer window or tab. */
export function getScreenShareConstraints() {
  return {
    video: { cursor: 'motion' },
    audio: false,
  }
}
