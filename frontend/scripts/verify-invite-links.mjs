/**
 * Fails the build if shared invite URLs regress to path /invite/:token (CDN 404 on static hosts without SPA rewrite).
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const invitesPath = join(__dirname, '../src/lib/invites.js')
const s = readFileSync(invitesPath, 'utf8')

// BrowserRouter: `https://host/?invite=…` — query on `/` so static hosts serve index.html.
// HashRouter: `https://host/#/?invite=…` — invite lives in the hash (same query shape). Never share `/invite/:token`.
const okBrowserOnly =
  s.includes('return `${base}/?${INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`')
const okPathAndQuery =
  s.includes('const pathAndQuery = `/?${INVITE_QUERY_PARAM}=${enc}`') &&
  s.includes('return useHash ? `${base}/#${pathAndQuery}` : `${base}${pathAndQuery}`')
if (!okBrowserOnly && !okPathAndQuery) {
  console.error(
    '[verify-invite-links] invites.js: inviteFullUrl must use `/?invite=` (and optional `/#/?invite=` for HashRouter), not path /invite/. See script.'
  )
  process.exit(1)
}

if (s.includes('${origin}/invite/') || s.includes('${base}/invite/')) {
  console.error('[verify-invite-links] invites.js must not build /invite/ path URLs for sharing.')
  process.exit(1)
}

console.log('[verify-invite-links] ok')
