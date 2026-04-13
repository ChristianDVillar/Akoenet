/** Deep-merge plain objects for i18n resource bundles (no arrays). */
export function deepMergeTranslations(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base
  const out = { ...base }
  for (const key of Object.keys(extra)) {
    const b = out[key]
    const e = extra[key]
    if (e && typeof e === 'object' && !Array.isArray(e) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[key] = deepMergeTranslations(b, e)
    } else {
      out[key] = e
    }
  }
  return out
}
