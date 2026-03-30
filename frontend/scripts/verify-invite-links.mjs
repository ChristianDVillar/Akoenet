/**
 * Fails the build if shared invite URLs regress to path /invite/:token (CDN 404 on static hosts without SPA rewrite).
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const invitesPath = join(__dirname, '../src/lib/invites.js')
const s = readFileSync(invitesPath, 'utf8')

const expectedReturn =
  'return `${base}/?${INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`'
if (!s.includes(expectedReturn)) {
  console.error(
    '[verify-invite-links] invites.js: inviteFullUrl must use query on / (see expected one-liner in script).'
  )
  process.exit(1)
}

if (s.includes('${origin}/invite/') || s.includes('${base}/invite/')) {
  console.error('[verify-invite-links] invites.js must not build /invite/ path URLs for sharing.')
  process.exit(1)
}

console.log('[verify-invite-links] ok')
