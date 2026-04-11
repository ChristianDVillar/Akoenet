/**
 * Extract embeddable video URLs from chat message text (YouTube, Twitch, Vimeo, Streamable, etc.).
 * Stream Scheduler events often expose the same public URLs — they embed once pasted in chat.
 */

const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]{}]+/gi

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractHttpUrlsFromText(text) {
  const s = String(text || '')
  const out = []
  let m
  const re = new RegExp(URL_IN_TEXT.source, 'gi')
  while ((m = re.exec(s)) !== null) {
    let u = m[0].replace(/[.,;:!?)\]]+$/u, '')
    out.push(u)
  }
  return out
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function urlHasVideoEmbed(url) {
  return toVideoEmbedSpec(url) != null
}

/**
 * @param {string} url
 * @returns {{ kind: string, originalUrl: string, embedUrl: string, clipSlug?: string, videoId?: string } | null}
 */
export function toVideoEmbedSpec(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  let u = raw
  try {
    u = new URL(raw).href
  } catch {
    return null
  }

  const yt = u.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/i
  )
  if (yt) {
    const id = yt[1]
    return {
      kind: 'youtube',
      originalUrl: raw,
      embedUrl: `https://www.youtube.com/embed/${id}?rel=0`,
    }
  }

  let clip = u.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)\/?/i)
  if (!clip) clip = u.match(/twitch\.tv\/clip\/([A-Za-z0-9_-]+)/i)
  if (clip) {
    return {
      kind: 'twitch_clip',
      originalUrl: raw,
      embedUrl: '',
      clipSlug: clip[1],
    }
  }

  const vod = u.match(/twitch\.tv\/videos\/(\d+)/i)
  if (vod) {
    return {
      kind: 'twitch_vod',
      originalUrl: raw,
      embedUrl: '',
      videoId: vod[1],
    }
  }

  const vim = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  if (vim) {
    return {
      kind: 'vimeo',
      originalUrl: raw,
      embedUrl: `https://player.vimeo.com/video/${vim[1]}`,
    }
  }

  const st = u.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i)
  if (st) {
    return {
      kind: 'streamable',
      originalUrl: raw,
      embedUrl: `https://streamable.com/e/${st[1]}`,
    }
  }

  return null
}

/**
 * @param {string} text
 */
export function getVideoEmbedSpecsFromContent(text) {
  const urls = extractHttpUrlsFromText(text)
  const seen = new Set()
  const out = []
  for (const u of urls) {
    const spec = toVideoEmbedSpec(u)
    if (!spec) continue
    const key = spec.originalUrl
    if (seen.has(key)) continue
    seen.add(key)
    out.push(spec)
  }
  return out
}

/**
 * @param {{ kind: string, embedUrl?: string, clipSlug?: string, videoId?: string }} spec
 * @param {string} parentHost
 */
export function resolveTwitchEmbedUrl(spec, parentHost) {
  const host = String(parentHost || (typeof window !== 'undefined' ? window.location.hostname : '') || '').replace(
    /^www\./i,
    ''
  ) || 'localhost'
  if (spec.kind === 'twitch_clip' && spec.clipSlug) {
    return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(spec.clipSlug)}&parent=${encodeURIComponent(host)}`
  }
  if (spec.kind === 'twitch_vod' && spec.videoId) {
    return `https://player.twitch.tv/?video=v${encodeURIComponent(spec.videoId)}&parent=${encodeURIComponent(host)}&autoplay=false`
  }
  return spec.embedUrl || ''
}
