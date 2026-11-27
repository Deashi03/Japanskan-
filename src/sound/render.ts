import { renderFive, renderOk } from './handpan'
import { renderFilm } from './voices'
import type { SoundKey } from './plan'

export interface Rendered { L: Float32Array<ArrayBuffer>; R: Float32Array<ArrayBuffer>; sr: number; dur: number }

/** Räknar ut ett ljud. Tungt (upp till någon sekund på en mobil), så appen kör det i en worker. */
export function renderSound(key: SoundKey): Rendered {
  if (key === 'ok') return renderOk()
  if (key === 'five') return renderFive()
  return renderFilm(Number(key.slice(1)))
}
