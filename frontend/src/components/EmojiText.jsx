import { useState } from 'react'

function EmojiToken({ token, url }) {
  const [failed, setFailed] = useState(false)
  if (failed || !url) return token
  return (
    <img
      src={url}
      alt={token}
      title={token}
      className="inline-emoji"
      onError={() => setFailed(true)}
    />
  )
}

export default function EmojiText({ text, emojis = {} }) {
  if (!text) return null
  const regex = /:([a-z0-9_]{2,32}):/g
  const chunks = []
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    const [token, name] = match
    const start = match.index
    if (start > lastIndex) {
      chunks.push(text.slice(lastIndex, start))
    }
    const url = emojis[name]
    if (url) {
      chunks.push(
        <EmojiToken
          key={`${name}-${start}`}
          token={token}
          url={url}
        />
      )
    } else {
      chunks.push(token)
    }
    lastIndex = start + token.length
  }
  if (lastIndex < text.length) {
    chunks.push(text.slice(lastIndex))
  }
  return <>{chunks}</>
}
