/**
 * Re-export hub: keeps old `/src/context/LandingLocaleContext.jsx` URL valid after the split
 * into `landingLocaleContext.js`, `LandingLocaleProvider.jsx`, and `hooks/useLandingLocale.js`
 * (avoids 404 on stale HMR / cached module graphs).
 */
export { LandingLocaleProvider } from './LandingLocaleProvider.jsx'
export { useLandingLocale } from '../hooks/useLandingLocale.js'
