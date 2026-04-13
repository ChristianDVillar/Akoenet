import { isTauri } from './isTauri.js'

async function logDesktopUpdateFailure(err) {
  const msg = `[AkoeNet desktop] update check failed: ${err?.message ?? String(err)}`
  try {
    const { warn } = await import('@tauri-apps/plugin-log')
    await warn(msg)
  } catch {
    console.warn(msg, err)
  }
}

/**
 * Checks for a newer signed build (production desktop only). On success, downloads, installs, and relaunches.
 * Configure `plugins.updater` in `src-tauri/tauri.conf.json` and host `latest.json` (+ artifacts) at the endpoint.
 */
export async function runDesktopUpdateCheck() {
  if (!isTauri() || import.meta.env.DEV) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const { relaunch } = await import('@tauri-apps/plugin-process')
    const update = await check()
    if (!update) return
    await update.downloadAndInstall()
    await relaunch()
  } catch (err) {
    void logDesktopUpdateFailure(err)
  }
}
