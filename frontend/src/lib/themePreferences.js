/** Dark palette (default app look). */
export const DARK_THEME = {
  bg: '#0f172a',
  panel: '#111827',
  rail: '#0f172a',
  borderColor: '#ffffff',
  borderOpacity: 6,
  text: '#d1d5db',
  muted: '#9ca3af',
  echonet: '#3b82f6',
  danger: '#f87171',
}

/** Light palette. */
export const LIGHT_THEME = {
  bg: '#f8fafc',
  panel: '#ffffff',
  rail: '#f1f5f9',
  borderColor: '#0f172a',
  borderOpacity: 10,
  text: '#0f172a',
  muted: '#64748b',
  echonet: '#2563eb',
  danger: '#dc2626',
}

/** @deprecated use DARK_THEME */
export const DEFAULT_THEME = DARK_THEME

export const COLOR_MODES = /** @type {const} */ (['dark', 'light', 'system'])

export function getThemeStorageKey(userId) {
  return `akoenet_ui_theme_${userId || 'anon'}`
}

function normalizeHex6(value) {
  if (value == null || typeof value !== 'string') return null
  const m = /^#?([0-9a-fA-F]{6})$/.exec(value.trim())
  return m ? `#${m[1].toLowerCase()}` : null
}

function clampOpacity(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return DARK_THEME.borderOpacity
  return Math.max(0, Math.min(100, Math.round(x)))
}

/** Validates color fields; merges onto dark base. */
export function sanitizeColors(partial) {
  const t = { ...DARK_THEME }
  if (!partial || typeof partial !== 'object') return t
  for (const key of ['bg', 'panel', 'rail', 'text', 'muted', 'echonet', 'danger']) {
    const hex = normalizeHex6(partial[key])
    if (hex) t[key] = hex
  }
  const bc = normalizeHex6(partial.borderColor)
  if (bc) t.borderColor = bc
  t.borderOpacity = clampOpacity(partial.borderOpacity)
  return t
}

/**
 * Full theme blob: color mode + palette (for dark/light customizations).
 * @param {Record<string, unknown>} partial
 */
export function sanitizeFull(partial) {
  const mode =
    partial?.colorMode && COLOR_MODES.includes(partial.colorMode) ? partial.colorMode : 'dark'
  const { colorMode: _c, ...rest } = partial || {}
  const colors = sanitizeColors(rest)
  return { colorMode: mode, ...colors }
}

export function loadTheme(userId) {
  try {
    const raw = localStorage.getItem(getThemeStorageKey(userId))
    if (!raw) return sanitizeFull({})
    return sanitizeFull(JSON.parse(raw))
  } catch {
    return sanitizeFull({})
  }
}

export function saveTheme(userId, theme) {
  const t = sanitizeFull(theme)
  localStorage.setItem(getThemeStorageKey(userId), JSON.stringify(t))
  return t
}

function hexToRgb(hex) {
  const h = normalizeHex6(hex)
  if (!h) return null
  const n = parseInt(h.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function prefersDarkScheme() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * @param {Record<string, unknown>} theme
 * @param {{ accentColor?: string | null }} [opts]
 */
export function applyTheme(theme, opts = {}) {
  const full = sanitizeFull(theme)
  let colors
  let resolvedAppearance

  if (full.colorMode === 'system') {
    const isDark = prefersDarkScheme()
    colors = sanitizeColors(isDark ? DARK_THEME : LIGHT_THEME)
    resolvedAppearance = isDark ? 'dark' : 'light'
  } else {
    colors = sanitizeColors(full)
    resolvedAppearance = full.colorMode
  }

  const root = document.documentElement
  root.dataset.theme = resolvedAppearance

  const rgbBorder = hexToRgb(colors.borderColor) || { r: 255, g: 255, b: 255 }
  const borderAlpha = Math.max(0, Math.min(1, colors.borderOpacity / 100))

  root.style.setProperty('--nexora-bg', colors.bg)
  root.style.setProperty('--nexora-panel', colors.panel)
  root.style.setProperty('--nexora-rail', colors.rail)
  root.style.setProperty(
    '--nexora-border',
    `rgba(${rgbBorder.r},${rgbBorder.g},${rgbBorder.b},${borderAlpha})`
  )
  root.style.setProperty('--nexora-text', colors.text)
  root.style.setProperty('--nexora-muted', colors.muted)
  root.style.setProperty('--echonet', colors.echonet)

  const accent = normalizeHex6(opts.accentColor) || '#7c3aed'
  root.style.setProperty('--nexora-accent', accent)

  const eg = hexToRgb(colors.echonet)
  if (eg) {
    root.style.setProperty('--echonet-glow', `rgba(${eg.r},${eg.g},${eg.b},0.35)`)
  }

  root.style.setProperty('--danger', colors.danger)

  const isLight = resolvedAppearance === 'light'
  root.style.colorScheme = isLight ? 'light' : 'dark'

  root.style.setProperty('--nexora-strong', isLight ? '#0f172a' : '#e5e7eb')
  root.style.setProperty('--nexora-input-bg', isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(0, 0, 0, 0.25)')
  root.style.setProperty('--nexora-card-tint', isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(0, 0, 0, 0.2)')
  root.style.setProperty('--nexora-code-bg', isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(0, 0, 0, 0.25)')
  root.style.setProperty(
    '--nexora-shadow-card',
    isLight ? '0 24px 80px rgba(15, 23, 42, 0.12)' : '0 24px 80px rgba(0, 0, 0, 0.45)'
  )
  root.style.setProperty('--nexora-surface-a', isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(15, 23, 42, 0.45)')
  root.style.setProperty('--nexora-surface-b', isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(15, 23, 42, 0.55)')
  root.style.setProperty('--nexora-surface-c', isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(15, 23, 42, 0.35)')
  root.style.setProperty('--nexora-surface-d', isLight ? 'rgba(248, 250, 252, 0.92)' : 'rgba(15, 23, 42, 0.85)')
  root.style.setProperty('--nexora-surface-e', isLight ? 'rgba(241, 245, 249, 0.98)' : 'rgba(15, 23, 42, 0.9)')
  root.style.setProperty('--nexora-overlay-scrim', isLight ? 'rgba(15, 23, 42, 0.35)' : 'rgba(2, 6, 23, 0.65)')
  root.style.setProperty(
    '--nexora-info-banner-fg',
    isLight ? '#1e40af' : '#bfdbfe'
  )
  root.style.setProperty(
    '--nexora-error-banner-fg',
    isLight ? '#991b1b' : '#fecaca'
  )
  root.style.setProperty(
    '--nexora-danger-btn-fg',
    isLight ? '#991b1b' : '#fecaca'
  )
  root.style.setProperty('--nexora-rail-icon-bg', isLight ? '#e2e8f0' : '#2a313a')
  root.style.setProperty('--nexora-rail-icon-bg-hover', isLight ? '#cbd5e1' : '#34404c')
  root.style.setProperty('--nexora-rail-icon-fg', isLight ? '#0f172a' : '#ffffff')
  root.style.setProperty('--nexora-row-hover', isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.04)')
  root.style.setProperty('--nexora-row-active', isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--nexora-chat-grad-end', isLight ? 'rgba(148, 163, 184, 0.22)' : 'rgba(31, 41, 55, 0.35)')
  root.style.setProperty('--nexora-glass-52', isLight ? 'rgba(248, 250, 252, 0.95)' : 'rgba(15, 23, 42, 0.52)')
  root.style.setProperty('--nexora-glass-60', isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(15, 23, 42, 0.6)')
  root.style.setProperty('--nexora-glass-65', isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.65)')
  root.style.setProperty('--nexora-glass-70', isLight ? 'rgba(255, 255, 255, 0.86)' : 'rgba(15, 23, 42, 0.7)')
  root.style.setProperty('--nexora-glass-75', isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(15, 23, 42, 0.75)')
  root.style.setProperty('--nexora-glass-85', isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)')
  root.style.setProperty('--nexora-glass-88', isLight ? 'rgba(255, 255, 255, 0.93)' : 'rgba(15, 23, 42, 0.88)')
  root.style.setProperty('--nexora-glass-90', isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.9)')
  root.style.setProperty('--nexora-glass-92', isLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(15, 23, 42, 0.92)')
  root.style.setProperty('--nexora-glass-96', isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.96)')
  root.style.setProperty('--nexora-glass-98', isLight ? 'rgba(255, 255, 255, 0.99)' : 'rgba(15, 23, 42, 0.98)')
  root.style.setProperty('--nexora-btn-secondary-bg', isLight ? 'rgba(124, 58, 237, 0.12)' : 'rgba(192, 132, 252, 0.15)')
  root.style.setProperty(
    '--nexora-btn-secondary-border',
    isLight ? 'rgba(124, 58, 237, 0.35)' : 'rgba(192, 132, 252, 0.35)'
  )

  root.style.setProperty('--dc-sidebar', isLight ? '#f1f5f9' : '#20262e')
  root.style.setProperty('--dc-sidebar-hover', isLight ? '#e2e8f0' : '#2a313a')
  root.style.setProperty('--dc-channel-active', isLight ? '#cbd5e1' : '#34404c')
  root.style.setProperty('--dc-category', isLight ? '#64748b' : '#9aa7b7')
  root.style.setProperty('--dc-text-muted', isLight ? '#64748b' : '#b8c3cf')
  root.style.setProperty('--dc-border', isLight ? 'rgba(15, 23, 42, 0.14)' : '#14191f')
  root.style.setProperty('--dc-popover-bg', isLight ? '#ffffff' : '#111214')
  root.style.setProperty('--dc-embed-bg', isLight ? '#f8fafc' : '#14191f')
}

export function resetStoredTheme(userId) {
  try {
    localStorage.removeItem(getThemeStorageKey(userId))
  } catch {
    /* ignore */
  }
}
