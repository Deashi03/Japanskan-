import { useSyncExternalStore } from 'react'

// Tillfälliga lägen som bara gäller tills appen stängs (sparas inte och synkas inte).

const KEY = 'japanskan:noListen'
let noListen = (() => {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()

/** "Kan inte lyssna nu": lyssningsövningar byts mot skrivövningar tills appen stängs. */
export const getNoListen = () => noListen

export function setNoListen(value: boolean) {
  noListen = value
  try {
    sessionStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    /* privat läge */
  }
  listeners.forEach((l) => l())
}

export function useNoListen(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => noListen,
  )
}
