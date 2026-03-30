import { useState } from 'react'
import api from '../services/api'

import { getApiBaseUrl } from '../lib/apiBase'
import { resolveImageUrl } from '../lib/resolveImageUrl'

const baseURL = getApiBaseUrl()

export default function ServerEmojiManager({ serverId, emojis, onReload }) {
  const [name, setName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function createEmoji(e) {
    e.preventDefault()
    const file = e.target.elements.file?.files?.[0]
    if (!name.trim() || !file || !serverId) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const token = localStorage.getItem('token')
      const uploadRes = await fetch(`${baseURL}/upload/server/${serverId}/emoji`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || 'upload')
      await api.post(`/servers/${serverId}/emojis`, {
        name: name.trim().toLowerCase(),
        image_url: uploadData.url,
      })
      setName('')
      e.target.reset()
      await onReload()
    } catch (err) {
      setError(err.message || 'Could not create emoji')
    } finally {
      setUploading(false)
    }
  }

  async function removeEmoji(emojiId) {
    try {
      await api.delete(`/servers/${serverId}/emojis/${emojiId}`)
      await onReload()
    } catch {
      setError('Could not delete emoji')
    }
  }

  return (
    <section className="perm-panel">
      <header>Server emojis</header>
      {error && <div className="error-banner inline">{error}</div>}
      <form className="form-stack" onSubmit={createEmoji}>
        <label>
          Name (you will use <code>:name:</code>)
          <input
            id="server-emoji-name"
            name="emoji_name"
            placeholder="e.g. akoenet_hype"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, '_'))}
          />
        </label>
        <label>
          Image
          <input name="file" type="file" accept="image/*" />
        </label>
        <button type="submit" className="btn secondary" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Create emoji'}
        </button>
      </form>
      <div className="emoji-list">
        {emojis.length === 0 ? (
          <p className="muted small">No emojis yet.</p>
        ) : (
          emojis.map((emoji) => (
            <div key={emoji.id} className="emoji-row">
              <img src={resolveImageUrl(emoji.image_url)} alt={emoji.name} />
              <code>:{emoji.name}:</code>
              <button type="button" className="btn small ghost" onClick={() => removeEmoji(emoji.id)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
