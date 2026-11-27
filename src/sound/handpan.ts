// @ts-nocheck
// Vanligt rätt-ljud (Handpan) och femte-varianten, från ljudlabbet. Ren harmonisk klang,
// exakt stämd, med en mycket liten och mjuk efterklang.
import { Mix, additive, midi } from './synth'

const ROOT = 67 // G4; intervallen är C-dur-toner
const handpan = (mix, t, m, v) =>
  mix.add(additive({ f: midi(m), dur: 1.0, partials: [[1, 1, 0.5], [2, 0.45, 0.35], [3, 0.1, 0.18]], attack: 0.003 }), t, 20 * Math.log10(v), 0, 1)
const IR = (extra = 0) => ({ t60: 0.38 + extra, dark: 0.55, seed: 3 })

/** Vanligt rätt svar: två toner uppåt (kvint). */
export function renderOk() {
  const mix = new Mix(2)
  ;[[0, 0, 0.85], [7, 0.11, 1]].forEach(([s, t, v]) => handpan(mix, t, ROOT + s, v))
  return mix.finish({ wet: 0.16, target: -22, window: 0.5, hp: 150, lp: 11000, ir: IR() })
}

/** Femte, femtonde, tjugofemte … i rad: ett stigande C-durs-ackord med en ton som får ringa. */
export function renderFive() {
  const mix = new Mix(3)
  const notes = [0, 4, 7, 12]
  const step = 0.062
  notes.forEach((s, i) => handpan(mix, i * step, ROOT + s, 0.7 + (0.3 * i) / (notes.length - 1)))
  const top = notes.length * step
  handpan(mix, top, ROOT + 16, 1)
  handpan(mix, top, ROOT + 24, 0.35)
  return mix.finish({ wet: 0.21, target: -20, window: 0.9, hp: 150, lp: 11000, ir: IR(0.12) })
}
