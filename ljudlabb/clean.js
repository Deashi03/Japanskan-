// 20 rena "rätt"-ljud med femte-variant. Utgångspunkten är att ett gränssnittsljud ska hålla
// samma kvalitet som i en stor app: exakt stämda toner, bara övertoner som hör ihop med
// grundtonen (heltalsförhållanden), inget brus, inga avstämda dubbelstämmor och en mycket
// liten, mjuk efterklang. Allt står i C-dur och intervallen är rena (kvart, kvint, oktav, ters).
import { Mix, additive, fm, midi, stack, sweep } from './synth.js'

const putc = (mix, buf, t, v = 1) => mix.add(buf, t, 20 * Math.log10(Math.max(v, 1e-4)), 0, 1)
/** Övertoner 1…n med fallande styrka och avklingning som går fortare för höga toner. */
const series = (n, rolloff, decay, tilt) => Array.from({ length: n }, (_, i) => [i + 1, Math.pow(i + 1, -rolloff), decay * Math.pow(i + 1, -tilt)])
const lst = (ratios, amps, decays) => ratios.map((r, i) => [r, amps[i], decays[i]])

/** Instrumenten: (mixer, tid, midinot, volym). */
export const PATCH = {
  ping: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 2, 3], [1, 0.16, 0.04], [0.26, 0.14, 0.08]), attack: 0.004 }), t, v),
  octave: (mix, t, m, v) => {
    putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 2], [1, 0.1], [0.24, 0.12]), attack: 0.004 }), t, v)
    putc(mix, additive({ f: midi(m + 12), dur: 0.6, partials: lst([1, 2], [1, 0.08], [0.18, 0.1]), attack: 0.004 }), t, v * 0.5)
  },
  marimba: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.9, partials: lst([1, 4, 10], [1, 0.32, 0.08], [0.3, 0.07, 0.03]), attack: 0.0025 }), t, v),
  vibes: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.9, partials: lst([1, 4, 10], [1, 0.2, 0.05], [0.6, 0.22, 0.08]), attack: 0.003 }), t, v),
  xylo: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.6, partials: lst([1, 3, 6], [1, 0.45, 0.14], [0.2, 0.09, 0.04]), attack: 0.002 }), t, v),
  celesta: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.9, partials: lst([1, 2, 3, 4, 5], [1, 0.45, 0.2, 0.1, 0.05], [0.55, 0.3, 0.18, 0.1, 0.07]), attack: 0.003 }), t, v),
  musicbox: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.9, partials: lst([1, 2, 3, 4, 6], [1, 0.3, 0.15, 0.2, 0.05], [0.5, 0.3, 0.2, 0.12, 0.08]), attack: 0.002 }), t, v),
  glass: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.7, partials: lst([1, 2, 3], [1, 0.35, 0.12], [0.34, 0.2, 0.1]), attack: 0.002 }), t, v),
  kalimba: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 2, 3, 4], [1, 0.35, 0.12, 0.05], [0.4, 0.2, 0.1, 0.05]), attack: 0.002 }), t, v),
  harp: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 1.0, partials: series(8, 1.1, 0.55, 0.6), attack: 0.002 }), t, v),
  nylon: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 2, 3, 4, 5, 6], [1, 0.7, 0.35, 0.2, 0.1, 0.05], [0.5, 0.32, 0.22, 0.15, 0.1, 0.07]), attack: 0.002 }), t, v),
  epiano: (mix, t, m, v) => putc(mix, fm({ f: midi(m), dur: 0.9, ratio: 1, index: 1.1, idxDecay: 0.35, decay: 0.55, attack: 0.003 }), t, v),
  fmglass: (mix, t, m, v) => putc(mix, fm({ f: midi(m), dur: 1.0, ratio: 2, index: 2.2, idxDecay: 0.2, decay: 0.45, attack: 0.002 }), t, v),
  fmbell: (mix, t, m, v) => putc(mix, fm({ f: midi(m), dur: 0.9, ratio: 3, index: 1.6, idxDecay: 0.12, decay: 0.4, attack: 0.002 }), t, v),
  pluck: (mix, t, m, v) => putc(mix, stack({ f: midi(m), dur: 0.7, harmonics: 18, hStart: 14, hEnd: 2.5, hTime: 0.07, attack: 0.003, decay: 0.2, sustain: 0, rel: 0.05 }), t, v),
  sine: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 2], [1, 0.07], [0.32, 0.18]), attack: 0.008 }), t, v),
  triangle: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.8, partials: lst([1, 3, 5, 7], [1, 0.111, 0.04, 0.02], [0.34, 0.3, 0.26, 0.22]), attack: 0.003 }), t, v),
  flute: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 0.5, partials: lst([1, 2, 3], [1, 0.22, 0.06], [100, 100, 100]), attack: 0.025, rel: 0.1, vib: 0.0025, vibRate: 5.2, vibDelay: 0.15 }), t, v),
  bubble: (mix, t, m, v) => putc(mix, sweep({ f0: midi(m) * 0.72, f1: midi(m), dur: 0.4, glide: 0.035, decay: 0.12, h2: 0.05, attack: 0.004 }), t, v),
  handpan: (mix, t, m, v) => putc(mix, additive({ f: midi(m), dur: 1.0, partials: lst([1, 2, 3], [1, 0.45, 0.1], [0.5, 0.35, 0.18]), attack: 0.003 }), t, v),
}

// root = en C-ton; ok = [halvtoner från root, tid, volym]; five = stigande halvtoner (C-dur).
export const CLEAN = [
  { name: 'Ping', desc: 'Ren, kort sinusklang uppåt, i stil med en modern notis.', patch: 'ping', root: 84, ok: [[0, 0, 0.85], [7, 0.09, 1]], wet: 0.12 },
  { name: 'Oktavping', desc: 'Två rena toner med en oktav emellan, ljus och glad.', patch: 'octave', root: 79, ok: [[0, 0, 1]], wet: 0.12 },
  { name: 'Marimba', desc: 'Mjuk träklang, tydlig men inte gäll.', patch: 'marimba', root: 72, ok: [[0, 0, 0.85], [7, 0.085, 1]], wet: 0.1 },
  { name: 'Vibrafon', desc: 'Rund metallklang som klingar ut lugnt.', patch: 'vibes', root: 72, ok: [[0, 0, 0.85], [4, 0.1, 1]], wet: 0.14 },
  { name: 'Xylofon', desc: 'Torr, glad träklang, kort och tydlig.', patch: 'xylo', root: 84, ok: [[0, 0, 0.85], [4, 0.075, 1]], wet: 0.1 },
  { name: 'Celesta', desc: 'Sagolik klockspelston, mild och ljus.', patch: 'celesta', root: 72, ok: [[7, 0, 0.85], [12, 0.1, 1]], wet: 0.16 },
  { name: 'Speldosa', desc: 'Liten och söt, högt men mjukt.', patch: 'musicbox', root: 79, ok: [[0, 0, 0.85], [9, 0.09, 1]], wet: 0.14 },
  { name: 'Glastapp', desc: 'Kort, klar glasknackning mycket högt upp.', patch: 'glass', root: 91, ok: [[0, 0, 0.85], [5, 0.08, 1]], wet: 0.12 },
  { name: 'Kalimba', desc: 'Varm tumpiano, lekfull.', patch: 'kalimba', root: 72, ok: [[0, 0, 0.85], [4, 0.08, 1]], wet: 0.12 },
  { name: 'Harpa', desc: 'Plockad harpa i tre toner uppåt, lätt och elegant.', patch: 'harp', root: 72, ok: [[0, 0, 0.7], [7, 0.06, 0.85], [12, 0.12, 1]], wet: 0.14 },
  { name: 'Nylon', desc: 'Mjuk nylonsträng, varm och nära.', patch: 'nylon', root: 67, ok: [[0, 0, 0.85], [5, 0.085, 1]], wet: 0.1 },
  { name: 'Elpiano', desc: 'Rund Rhodes-ton, mjuk och modern.', patch: 'epiano', root: 72, ok: [[0, 0, 0.85], [7, 0.09, 1]], wet: 0.12 },
  { name: 'FM-glas', desc: 'Klar syntetisk glasklang, tydligt digital.', patch: 'fmglass', root: 72, ok: [[7, 0, 0.85], [12, 0.085, 1]], wet: 0.1 },
  { name: 'FM-klocka', desc: 'Ljus syntklocka med rent anslag.', patch: 'fmbell', root: 84, ok: [[0, 0, 0.85], [4, 0.08, 1]], wet: 0.1 },
  { name: 'Synthpluck', desc: 'Ett stämt synthplock, ett enda filter som stängs.', patch: 'pluck', root: 72, ok: [[0, 0, 0.85], [7, 0.085, 1]], wet: 0.1 },
  { name: 'Mjuk sinus', desc: 'Avrundade rena toner, lugn och diskret.', patch: 'sine', root: 72, ok: [[0, 0, 0.85], [7, 0.1, 1]], wet: 0.12 },
  { name: 'Triangelvåg', desc: 'Mjuk retro-ton, som en enkel digital orgel som plockas.', patch: 'triangle', root: 72, ok: [[0, 0, 0.85], [4, 0.085, 1]], wet: 0.1 },
  { name: 'Flöjt', desc: 'Ren blåston utan andning, mild och vänlig.', patch: 'flute', root: 72, ok: [[0, 0, 0.8], [4, 0.13, 1]], wet: 0.14 },
  { name: 'Bubbla', desc: 'Rund bubbla som stiger, lekfull.', patch: 'bubble', root: 72, ok: [[4, 0, 0.85], [9, 0.11, 1]], wet: 0.1 },
  { name: 'Handpan', desc: 'Varm metalltrumma, lugn och rund.', patch: 'handpan', root: 67, ok: [[0, 0, 0.85], [7, 0.11, 1]], wet: 0.16 },
]

const IR = (f, extra = 0) => ({ t60: 0.38 + extra, dark: 0.55, seed: 3 })

/** Vanligt rätt svar. */
export function renderClean(f) {
  const mix = new Mix(2)
  f.ok.forEach(([s, t, v]) => PATCH[f.patch](mix, t, f.root + s, v))
  return mix.finish({ wet: f.wet, target: -22, window: 0.5, hp: 150, lp: 11000, ir: IR(f) })
}

/** Femte, femtonde, tjugofemte … i rad: samma klang, ett stigande C-durs-ackord med en
 *  avslutande ton som får ringa, och lite mer luft. */
export function renderCleanFive(f) {
  const mix = new Mix(3)
  const notes = [0, 4, 7, 12]
  const step = 0.062
  notes.forEach((s, i) => PATCH[f.patch](mix, i * step, f.root + s, 0.7 + (0.3 * i) / (notes.length - 1)))
  const top = notes.length * step
  PATCH[f.patch](mix, top, f.root + 16, 1)
  PATCH[f.patch](mix, top, f.root > 84 ? f.root + 12 : f.root + 24, 0.35)
  return mix.finish({ wet: f.wet + 0.05, target: -20, window: 0.9, hp: 150, lp: 11000, ir: IR(f, 0.12) })
}
