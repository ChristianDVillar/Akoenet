import EmojiText from './EmojiText'

const MENTION_RE = /@(here|everyone|[a-zA-Z0-9_]{2,32})/g

/**
 * Message text with server :emoji: shortcodes and @mention highlighting.
 */
export default function RichMessageText({ text, emojis = {} }) {
  if (!text) return null
  const parts = []
  let last = 0
  let m
  const re = new RegExp(MENTION_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: text.slice(last, m.index) })
    }
    parts.push({ type: 'mention', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  if (parts.length === 0) {
    return <EmojiText text={text} emojis={emojis} />
  }
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'mention' ? (
          <span key={`m-${i}`} className="message-mention">
            {p.value}
          </span>
        ) : (
          <EmojiText key={`t-${i}`} text={p.value} emojis={emojis} />
        )
      )}
    </>
  )
}
