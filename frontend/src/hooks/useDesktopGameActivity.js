import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../lib/isTauri'
import { matchGameFromProcessList } from '../lib/gameProcessMap'
import { getSocket } from '../services/socket'

const TICK_MS = 20000

/**
 * When opted in on desktop, maps running processes to known games and emits `game_activity:auto` on the socket.
 */
export function useDesktopGameActivity(user) {
  const lastPayload = useRef('')

  useEffect(() => {
    if (!isTauri()) return undefined
    if (!user?.id) return undefined
    if (!user.desktop_game_detect_opt_in) return undefined
    if (user.share_game_activity === false) return undefined

    let cancelled = false
    let timer = null

    async function tick() {
      if (cancelled) return
      try {
        const processes = await invoke('get_running_processes')
        const hit = matchGameFromProcessList(processes)
        const payloadKey = hit ? `${hit.name}\0${hit.platform}` : ''
        if (payloadKey === lastPayload.current) return
        lastPayload.current = payloadKey
        const s = getSocket()
        if (!s?.connected) return
        if (!hit) s.emit('game_activity:auto', { game: '', platform: '' })
        else s.emit('game_activity:auto', { game: hit.name, platform: hit.platform })
      } catch {
        /* ignore — permission or non-desktop */
      }
    }

    tick()
    timer = window.setInterval(tick, TICK_MS)
    return () => {
      cancelled = true
      if (timer != null) window.clearInterval(timer)
    }
  }, [user?.id, user?.desktop_game_detect_opt_in, user?.share_game_activity])
}
