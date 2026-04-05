/** Lowercase executable name → display name + store/platform label (heuristic). */
export const GAME_PROCESS_MAP = {
  'eldenring.exe': { name: 'Elden Ring', platform: 'Steam' },
  'cs2.exe': { name: 'Counter-Strike 2', platform: 'Steam' },
  'fortniteclient-win64-shipping.exe': { name: 'Fortnite', platform: 'Epic' },
  'valorant-win64-shipping.exe': { name: 'Valorant', platform: 'Riot' },
  'leagueclient.exe': { name: 'League of Legends', platform: 'Riot' },
  'rocketleague.exe': { name: 'Rocket League', platform: 'Epic' },
  'destiny2.exe': { name: 'Destiny 2', platform: 'Steam' },
}

/**
 * @param {string[]} processNames from Tauri (often mixed case)
 * @returns {{ name: string, platform: string } | null}
 */
export function matchGameFromProcessList(processNames) {
  if (!Array.isArray(processNames)) return null
  const lowered = new Set(processNames.map((p) => String(p).toLowerCase().trim()))
  for (const [exe, meta] of Object.entries(GAME_PROCESS_MAP)) {
    if (lowered.has(exe)) return meta
  }
  return null
}
