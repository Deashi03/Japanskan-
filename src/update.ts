import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// En ny version laddas ner i bakgrunden men tas i bruk först när man trycker på
// "Uppdatera" – annars kunde appen laddas om mitt i ett pass.
let ready = false
const listeners = new Set<() => void>()
let apply: ((reload?: boolean) => Promise<void>) | undefined

export function initUpdates() {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true
      listeners.forEach((l) => l())
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Leta efter en ny version när appen öppnas igen, och en gång i timmen.
      const check = () => void registration.update().catch(() => {})
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      setInterval(check, 60 * 60_000)
    },
  })
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => ready,
  )
}

export function applyUpdate() {
  void apply?.(true)
}
