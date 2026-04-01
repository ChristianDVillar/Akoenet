import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({
  gfm: true,
  breaks: false,
})

let hooksInstalled = false

function ensureLinkHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && typeof node.setAttribute === 'function') {
      node.setAttribute('rel', 'noopener noreferrer')
      node.setAttribute('target', '_blank')
    }
  })
}

/**
 * Inline-only Markdown (**bold**, *italic*, `code`, ~~strike~~, [text](url)) → sanitized HTML.
 */
export function inlineMarkdownToSafeHtml(text) {
  if (!text) return ''
  ensureLinkHooks()
  const raw = marked.parseInline(String(text), { async: false })
  const html = typeof raw === 'string' ? raw : String(raw)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'del', 's', 'strike', 'code', 'a', 'br'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  })
}
