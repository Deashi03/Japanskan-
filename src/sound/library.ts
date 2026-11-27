import { SOUND_KEYS, type SoundKey } from './plan'
import { renderSound } from './render'

interface Raw { L: Float32Array<ArrayBuffer>; R: Float32Array<ArrayBuffer>; sr: number }

const ready = new Map<SoundKey, Raw>()
let started = false

/** Börjar räkna ut alla ljud i bakgrunden, ett i taget i den ordning de behövs. Det går i en
 *  worker så att appen inte hackar; finns ingen worker görs det i små steg på huvudtråden. */
export function prepareSounds() {
  if (started || typeof window === 'undefined') return
  started = true
  try {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Raw & { key: SoundKey }>) => ready.set(e.data.key, e.data)
    worker.onerror = () => {
      worker.terminate()
      inSteps()
    }
    SOUND_KEYS.forEach((k) => worker.postMessage(k))
  } catch {
    inSteps()
  }
}

function inSteps() {
  SOUND_KEYS.filter((k) => !ready.has(k)).forEach((k, i) =>
    setTimeout(() => {
      if (!ready.has(k)) ready.set(k, renderSound(k))
    }, 300 + i * 150),
  )
}

/** Ljudspåret för en nyckel, om det hunnit bli klart. */
export const getRaw = (key: SoundKey): Raw | undefined => ready.get(key)
