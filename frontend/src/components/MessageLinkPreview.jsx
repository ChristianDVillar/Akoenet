import { useEffect, useMemo, useState } from 'react'
import { getApiBaseUrl } from '../lib/apiBase'

/**
 * Fetches Open Graph data for the first http(s) URL in message text (server-side SSRF-safe fetch).
 */
export default function MessageLinkPreview({ content }) {
  const url = useMemo(() => {
    const m = String(content || '').match(/https?:\/\/[^\s<>"'()[\]{}]+/i)
    if (!m) return null
    return m[0].replace(/[.,;:!?)\]]+$/u, '')
  }, [content])

  const [data, setData] = useState(null)

  useEffect(() => {
    if (!url) return undefined
    let cancelled = false
    setData(null)
    fetch(`${getApiBaseUrl()}/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok) return
        if (j.title || j.description || j.image) setData(j)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url])

  if (!url || !data) return null

  return (
    <a
      href={data.url || url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-card"
    >
      {data.image ? (
        <img src={data.image} alt="" className="link-preview-thumb" loading="lazy" />
      ) : null}
      <div className="link-preview-body">
        {data.site_name ? <span className="link-preview-site">{data.site_name}</span> : null}
        {data.title ? <span className="link-preview-title">{data.title}</span> : null}
        {data.description ? (
          <span className="link-preview-desc">{data.description}</span>
        ) : null}
      </div>
    </a>
  )
}
