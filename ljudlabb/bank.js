// Ljudbibliotek: instrument, 25 "rätt"-ljud (med varsin femte-variant) och 10 grupper
// firanden (fem nivåer vardera) för 10, 20, 30, 40 och 50+ rätt i rad. Allt i C-dur.
import { Mix, additive, bend, biquad, burst, cymbal, fm, midi, noise, pluck, rng, stack, sweep, swish, thump } from './synth.js'

const put = (mix, buf, t, v = 1, pan = 0, send = 0.2) => mix.add(buf, t, 20 * Math.log10(Math.max(v, 1e-4)), pan, send)
const pent = (n) => Math.floor(n / 5) * 12 + [0, 2, 4, 7, 9][((n % 5) + 5) % 5]
const spread = (i, w = 0.12) => ((i % 5) - 2) * w

// --- instrument ----------------------------------------------------------------------
// Alla har samma form: (mixer, tid, midinot, volym 0–1, panorering, efterklangsandel, extra).

export const INST = {
  glass: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.3, partials: [[1, 1, 0.5], [2.32, 0.45, 0.3], [4.25, 0.25, 0.18], [6.63, 0.12, 0.1]] }), t, v, pan, send),
  marimba: (mix, t, m, v = 1, pan = 0, send = 0.2, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 0.8, partials: [[1, 1, 0.22], [4, 0.4, 0.07], [9.9, 0.15, 0.03]], attack: 0.001 }), t, v, pan, send),
  vibes: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.5, partials: [[1, 1, 1], [4, 0.25, 0.4], [10, 0.08, 0.15]], trem: 0.3, tremRate: 5.5 }), t, v, pan, send),
  kalimba: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) => {
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.0, partials: [[1, 1, 0.5], [5.4, 0.3, 0.07], [9.2, 0.1, 0.03]], attack: 0.001 }), t, v, pan, send)
    put(mix, burst({ dur: 0.03, decay: 0.006, lo: 2500, hi: 7000, seed: 21 + m }), t, v * 0.12, pan, 0.1)
  },
  musicbox: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.1, partials: [[1, 1, 0.5], [2.9, 0.22, 0.16], [6.1, 0.1, 0.07]], attack: 0.001 }), t, v, pan, send),
  celesta: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.4, partials: [[1, 1, 0.7], [2, 0.35, 0.35], [3, 0.15, 0.22], [4.01, 0.12, 0.15]], attack: 0.003 }), t, v, pan, send),
  epiano: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) => {
    const f = midi(m)
    const a = fm({ f, dur: o.dur ?? 1.3, ratio: 1, index: 1.3, idxDecay: 0.5, decay: 0.9 })
    const b = fm({ f, dur: 0.4, ratio: 14, index: 0.7, idxDecay: 0.03, decay: 0.15 })
    put(mix, a, t, v, pan, send)
    put(mix, b, t, v * 0.22, pan, send)
  },
  harp: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) => put(mix, pluck({ f: midi(m), dur: o.dur ?? 1.6, t60: 1.6, bright: 0.25, lp: 3200, seed: 3 + m }), t, v, pan, send),
  steeldrum: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.0, partials: [[1, 1, 0.5], [2, 0.75, 0.38], [3, 0.3, 0.22], [4.2, 0.2, 0.13]], attack: 0.002 }), t, v, pan, send),
  drop: (mix, t, m, v = 1, pan = 0, send = 0.2) => put(mix, sweep({ f0: midi(m) * 0.55, f1: midi(m), dur: 0.5, glide: 0.045, decay: 0.16, h2: 0.15 }), t, v, pan, send),
  pizz: (mix, t, m, v = 1, pan = 0, send = 0.15, o = {}) => put(mix, pluck({ f: midi(m), dur: o.dur ?? 0.5, t60: 0.35, bright: 0.45, lp: 3800, seed: 5 + m }), t, v, pan, send),
  block: (mix, t, m, v = 1, pan = 0, send = 0.1) => {
    put(mix, additive({ f: midi(m + 12), dur: 0.15, partials: [[1, 1, 0.025], [2.4, 0.5, 0.018], [3.9, 0.25, 0.012]], attack: 0.0005 }), t, v, pan, send)
    put(mix, burst({ dur: 0.02, decay: 0.004, lo: 1500, hi: 8000, seed: 33 }), t, v * 0.25, pan, 0.05)
  },
  synthpluck: (mix, t, m, v = 1, pan = 0, send = 0.2, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 0.7, voices: 2, detune: 8, harmonics: 16, hStart: 14, hEnd: 2, hTime: 0.09, attack: 0.003, decay: 0.22, sustain: 0, rel: 0.05 }), t, v, pan, send),
  softsine: (mix, t, m, v = 1, pan = 0, send = 0.2, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 0.8, partials: [[1, 1, 0.4], [2, 0.1, 0.25]], attack: 0.01 }), t, v, pan, send),
  crystal: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, fm({ f: midi(m), dur: o.dur ?? 1.4, ratio: 3.5, index: 2.5, idxDecay: 0.15, decay: 0.9 }), t, v, pan, send),
  koto: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) =>
    put(mix, bend(pluck({ f: midi(m), dur: o.dur ?? 1.4, t60: 1.1, bright: 0.4, pos: 0.12, lp: 3600, seed: 9 + m }), 1.035, 0.05), t, v, pan, send),
  bamboo: (mix, t, m, v = 1, pan = 0, send = 0.25) => {
    const f = midi(m)
    put(mix, additive({ f, dur: 0.55, partials: [[1, 1, 0.3], [3, 0.15, 0.1]], attack: 0.012 }), t, v, pan, send)
    const br = biquad(noise(0.3, 41 + m), 'bp', f, 6)
    for (let i = 0; i < br.length; i++) br[i] *= Math.exp(-i / 44100 / 0.1)
    put(mix, br, t, v * 1.2, pan, send)
  },
  triangle: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.3, partials: [[1, 1, 0.9], [2.76, 0.6, 0.7], [5.4, 0.4, 0.5], [8.93, 0.25, 0.35], [13.3, 0.12, 0.2]], attack: 0.001 }), t, v, pan, send),
  glock: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.2, partials: [[1, 1, 0.55], [2.76, 0.45, 0.28], [5.4, 0.2, 0.14], [8.9, 0.08, 0.07]], attack: 0.001 }), t, v, pan, send),
  dpling: (mix, t, m, v = 1, pan = 0, send = 0.2) =>
    put(mix, additive({ f: midi(m), dur: 0.7, partials: [[1, 1, 0.22], [2, 0.35, 0.16], [3, 0.1, 0.1]], attack: 0.002 }), t, v, pan, send),
  gnistra: (mix, t, m, v = 1, pan = 0, send = 0.3) => {
    put(mix, swish({ dur: 0.2, f0: 1200, f1: 4500, q: 5, seed: 8 }), t, v * 0.35, pan, 0.1)
    INST.glass(mix, t + 0.15, m, v, pan, send)
  },
  nylon: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) => put(mix, pluck({ f: midi(m), dur: o.dur ?? 1.1, t60: 0.9, bright: 0.2, pos: 0.25, lp: 2600, seed: 13 + m }), t, v, pan, send),
  ocarina: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) => {
    const f = midi(m)
    put(mix, additive({ f, dur: o.dur ?? 0.5, partials: [[1, 1, 100], [2, 0.12, 100], [3, 0.04, 100]], attack: 0.03, rel: 0.12, vib: 0.004, vibRate: 5.3 }), t, v, pan, send)
    const br = biquad(noise(o.dur ?? 0.5, 51 + m), 'bp', f * 2, 3)
    for (let i = 0; i < br.length; i++) br[i] *= Math.min(1, i / 2000) * Math.exp(-i / 44100 / 0.15)
    put(mix, br, t, v * 0.25, pan, send)
  },
  handpan: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.6, partials: [[0.5, 0.25, 0.15], [1, 1, 0.9], [2, 0.5, 0.7], [3, 0.12, 0.35]], attack: 0.002 }), t, v, pan, send),
  digital: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) => put(mix, fm({ f: midi(m), dur: o.dur ?? 1.0, ratio: 2.5, index: 3, idxDecay: 0.12, decay: 0.5 }), t, v, pan, send),

  // Orkester och scen
  brass: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 1, voices: 2, detune: 6, harmonics: 14, hStart: 2, hEnd: 8, hTime: 0.06, attack: 0.03, decay: 0.4, sustain: 0.75, rel: 0.12, vib: 0.003 }), t, v, pan, send),
  trumpet: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 0.2, voices: 2, detune: 5, harmonics: 16, hStart: 3, hEnd: 11, hTime: 0.04, attack: 0.015, decay: 0.15, sustain: 0.8, rel: 0.05 }), t, v, pan, send),
  strings: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 1.5, voices: 4, detune: 10, harmonics: 10, hStart: 3, hEnd: 6, hTime: 0.4, attack: o.attack ?? 0.3, decay: 1, sustain: 1, rel: 0.5, vib: 0.004 }), t, v, pan, send),
  choir: (mix, t, m, v = 1, pan = 0, send = 0.35, o = {}) => {
    const f = midi(m)
    const parts = []
    for (let h = 1; h <= 24; h++) {
      const hz = f * h
      const form = Math.exp(-(((hz - 800) / 260) ** 2)) + 0.7 * Math.exp(-(((hz - 1150) / 300) ** 2)) + 0.2 * Math.exp(-(((hz - 2800) / 500) ** 2))
      parts.push([h, form / Math.sqrt(h), 100])
    }
    put(mix, additive({ f, dur: o.dur ?? 1.5, partials: parts, attack: 0.25, rel: 0.4, vib: 0.005, vibRate: 5.1 }), t, v, pan, send)
  },
  glassharm: (mix, t, m, v = 1, pan = 0, send = 0.4, o = {}) => {
    put(mix, additive({ f: midi(m), dur: o.dur ?? 1.6, partials: [[1, 1, 100], [2, 0.35, 100], [3, 0.15, 100]], attack: 0.35, rel: 0.5, vib: 0.002 }), t, v, pan - 0.2, send)
    put(mix, additive({ f: midi(m) * 1.004, dur: o.dur ?? 1.6, partials: [[1, 1, 100], [2, 0.35, 100], [3, 0.15, 100]], attack: 0.35, rel: 0.5, vib: 0.002, vibRate: 4.6 }), t, v, pan + 0.2, send)
  },
  timp: (mix, t, m, v = 1, pan = 0, send = 0.2, o = {}) => put(mix, thump({ f0: midi(m) * 1.5, f1: midi(m), dur: o.dur ?? 1, decay: 0.6, pitchTime: 0.05, click: 0.15, h2: 0.2 }), t, v, pan, send),
  taiko: (mix, t, m, v = 1, pan = 0, send = 0.25) => put(mix, thump({ f0: midi(m) * 2.2, f1: midi(m), dur: 0.9, decay: 0.35, pitchTime: 0.04, click: 0.35, h2: 0.1 }), t, v, pan, send),
  kick: (mix, t, m, v = 1, pan = 0, send = 0.05) => put(mix, thump({ f0: 160, f1: 48, dur: 0.4, decay: 0.22, pitchTime: 0.03, click: 0.2 }), t, v, pan, send),
  sub: (mix, t, m, v = 1, pan = 0, send = 0.05, o = {}) => put(mix, sweep({ f0: midi(m) * 1.5, f1: midi(m), dur: o.dur ?? 1.2, glide: 0.05, decay: 0.9, h2: 0.1, rel: 0.2 }), t, v, pan, send),
  crash: (mix, t, m, v = 1, pan = 0, send = 0.3, o = {}) => put(mix, cymbal({ dur: o.dur ?? 1.6, swell: o.swell ?? 0.12, decay: o.decay ?? 1.1 }), t, v, pan, send),
  tubular: (mix, t, m, v = 1, pan = 0, send = 0.35, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 3, partials: [[1, 1, 1.5], [2, 0.55, 1.2], [2.76, 0.5, 1], [4.07, 0.35, 0.75], [5.4, 0.25, 0.55], [6.8, 0.15, 0.4]], attack: 0.002 }), t, v, pan, send),
  gong: (mix, t, m, v = 1, pan = 0, send = 0.4, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 3.5, partials: [[1, 1, 3], [1.47, 0.7, 2.8], [2.09, 0.6, 2.4], [2.56, 0.5, 2], [3.35, 0.35, 1.6], [4.11, 0.25, 1.2]], attack: 0.01 }), t, v, pan, send),
  rin: (mix, t, m, v = 1, pan = 0, send = 0.4, o = {}) =>
    put(mix, additive({ f: midi(m), dur: o.dur ?? 3, partials: [[1, 1, 2.5], [2.71, 0.5, 1.6], [5.4, 0.2, 0.8]], attack: 0.002 }), t, v, pan, send),
  supersaw: (mix, t, m, v = 1, pan = 0, send = 0.25, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 0.8, voices: 7, detune: 22, harmonics: 14, hStart: 14, hEnd: 5, hTime: 0.5, attack: 0.005, decay: 0.5, sustain: 0.5, rel: 0.1 }), t, v, pan, send),
  chip: (mix, t, m, v = 1, pan = 0, send = 0.08, o = {}) =>
    put(mix, stack({ f: midi(m), dur: o.dur ?? 0.3, kind: o.kind ?? 'square', duty: o.duty ?? 0.5, harmonics: 19, attack: 0.001, decay: 0.12, sustain: 0.5, rel: 0.02 }), t, v, pan, send),
  whistle: (mix, t, f0, v = 1, pan = 0, send = 0.2, o = {}) => {
    put(mix, sweep({ f0, f1: o.f1 ?? f0 * 4, dur: o.dur ?? 0.45, glide: (o.dur ?? 0.45) / 2.2, decay: 100, attack: 0.02, rel: 0.05 }), t, v, pan, send)
  },
  boom: (mix, t, v = 1, pan = 0, send = 0.4) => {
    put(mix, thump({ f0: 90, f1: 35, dur: 1, decay: 0.5, pitchTime: 0.05, click: 0.5 }), t, v, pan, send)
    const b = burst({ dur: 0.6, decay: 0.2, lo: 40, hi: 700, seed: 61 })
    put(mix, b, t, v * 0.6, pan, send)
  },
  pop: (mix, t, v = 1, pan = 0, send = 0.2, seed = 71) => {
    put(mix, burst({ dur: 0.14, decay: 0.025, lo: 800, hi: 6000, seed }), t, v, pan, send)
    put(mix, thump({ f0: 320, f1: 130, dur: 0.12, decay: 0.03, pitchTime: 0.015, click: 0 }), t, v * 0.5, pan, send)
  },
  blower: (mix, t, v = 1, pan = 0, send = 0.2) => {
    put(mix, sweep({ f0: 520, f1: 980, dur: 0.6, glide: 0.12, decay: 100, h2: 0.9, attack: 0.02, rel: 0.1 }), t, v, pan, send)
    put(mix, biquad(noise(0.6, 81), 'bp', 1500, 1.5), t, v * 0.25, pan, send)
  },
  shaku: (mix, t, m, v = 1, pan = 0, send = 0.35, o = {}) => {
    const f = midi(m)
    const x = bend(additive({ f, dur: o.dur ?? 1.2, partials: [[1, 1, 100], [2, 0.3, 100], [3, 0.2, 100]], attack: 0.06, rel: 0.3, vib: 0.006, vibRate: 5, vibDelay: 0.3 }), 0.94, 0.08)
    put(mix, x, t, v, pan, send)
    const br = biquad(noise(o.dur ?? 1.2, 91), 'bp', f * 2, 2.5)
    for (let i = 0; i < br.length; i++) br[i] *= Math.min(1, i / 3000) * Math.exp(-i / 44100 / 0.7)
    put(mix, br, t, v * 0.3, pan, send)
  },
  clapper: (mix, t, v = 1, pan = 0, send = 0.2) => {
    put(mix, additive({ f: 1400, dur: 0.12, partials: [[1, 1, 0.02], [2.7, 0.6, 0.015]], attack: 0.0005 }), t, v, pan, send)
    put(mix, burst({ dur: 0.03, decay: 0.006, lo: 1500, hi: 6000, seed: 99 }), t, v * 0.4, pan, send)
  },
}

/** Spelar noter efter varandra: offsets (halvtoner), start, steg, volym från–till. */
function run(mix, inst, base, offsets, t0, step, v0 = 0.8, v1 = 1, pan = 0.1, send, o) {
  offsets.forEach((s, i) => INST[inst](mix, t0 + i * step, base + s, v0 + ((v1 - v0) * i) / Math.max(1, offsets.length - 1), spread(i, pan), send, o))
}
const chord = (mix, inst, notes, t, v = 1, pan = 0.12, send, o) => notes.forEach((m, i) => INST[inst](mix, t, m, v, spread(i, pan), send, o))
/** Slumpade ljusa toner ur durpentatonisk skala – glittrande strössel. */
function sprinkle(mix, inst, t0, dur, count, lo, hi, v, seed) {
  const r = rng(seed)
  for (let i = 0; i < count; i++) INST[inst](mix, t0 + r() * dur, 60 + pent(lo + Math.floor(r() * (hi - lo))), v * (0.5 + r() * 0.5), r() * 1.6 - 0.8, 0.4)
}
function crackle(mix, t0, dur, count, v, seed) {
  const r = rng(seed)
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.pow(r(), 1.4) * dur
    put(mix, burst({ dur: 0.05, decay: 0.008, lo: 2500 + r() * 2000, hi: 9000, seed: seed + i }), t, v * (0.3 + r() * 0.7), r() * 1.6 - 0.8, 0.3)
  }
}

const CH = { I: [60, 64, 67, 72], IV: [65, 69, 72, 77], V: [67, 71, 74, 79] }
const lo = (c) => c.map((m) => m - 12)

// --- 25 "rätt"-ljud -----------------------------------------------------------------------
// ok: [halvton från base, tid, volym]. five: [stegvis stigande halvtoner, steg i sekunder].

const A = [0, 4, 7, 12, 16]
const B = [0, 2, 4, 7, 9, 12]
const C = [0, 7, 12, 19]
const D = [0, 4, 7, 12]

export const OK = [
  { name: 'Glasklocka', desc: 'Klar glasping i två toner, som en modern notis.', inst: 'glass', base: 79, ok: [[0, 0, 0.9], [7, 0.085, 1]], five: A, step: 0.06, wet: 0.25, room: 0.75 },
  { name: 'Marimba', desc: 'Varm träklang med mjukt anslag.', inst: 'marimba', base: 72, ok: [[0, 0, 0.9], [4, 0.08, 0.9], [7, 0.16, 1]], five: B, step: 0.065, wet: 0.2, room: 0.7 },
  { name: 'Vibrafon', desc: 'Mjuk metallklang med svag vibrato.', inst: 'vibes', base: 76, ok: [[0, 0, 0.9], [5, 0.1, 1]], five: D, step: 0.07, wet: 0.25, room: 0.78 },
  { name: 'Kalimba', desc: 'Plinkig tumpiano, lekfull och varm.', inst: 'kalimba', base: 72, ok: [[0, 0, 0.9], [7, 0.07, 0.9], [12, 0.14, 1]], five: A, step: 0.055, wet: 0.22, room: 0.7 },
  { name: 'Speldosa', desc: 'Liten och söt, högt och glasigt.', inst: 'musicbox', base: 84, ok: [[0, 0, 0.9], [4, 0.09, 1]], five: A, step: 0.06, wet: 0.28, room: 0.78 },
  { name: 'Celesta', desc: 'Sagolik klockspelston, som i filmmusik.', inst: 'celesta', base: 79, ok: [[0, 0, 1]], five: D, step: 0.075, wet: 0.3, room: 0.8 },
  { name: 'Elpiano', desc: 'Rund Rhodes-ton med liten klockklang.', inst: 'epiano', base: 67, ok: [[0, 0, 0.9], [7, 0.09, 1]], five: A, step: 0.07, wet: 0.2, room: 0.7 },
  { name: 'Harpa', desc: 'Plockad sträng, elegant och lätt.', inst: 'harp', base: 72, ok: [[0, 0, 0.8], [7, 0.06, 0.9], [12, 0.12, 1]], five: B, step: 0.055, wet: 0.28, room: 0.78 },
  { name: 'Steeldrum', desc: 'Solig karibisk klang.', inst: 'steeldrum', base: 74, ok: [[0, 0, 0.9], [7, 0.1, 1]], five: B, step: 0.07, wet: 0.2, room: 0.7 },
  { name: 'Droppe', desc: 'Rund vattendroppe som studsar uppåt.', inst: 'drop', base: 76, ok: [[0, 0, 0.9], [5, 0.11, 1]], five: D, step: 0.085, wet: 0.2, room: 0.7 },
  { name: 'Pizzicato', desc: 'Kort, torr stråkplock – snabb och snygg.', inst: 'pizz', base: 72, ok: [[0, 0, 0.9], [4, 0.07, 0.9], [7, 0.14, 1]], five: A, step: 0.055, wet: 0.15, room: 0.6 },
  { name: 'Tick & ting', desc: 'Ett träklick följt av en liten klocka.', inst: 'glock', base: 83, ok: [[0, 0.045, 1]], five: D, step: 0.07, wet: 0.22, room: 0.7, pre: 'block' },
  { name: 'Synthpluck', desc: 'Modern synthton med filter som stängs.', inst: 'synthpluck', base: 72, ok: [[0, 0, 0.9], [7, 0.09, 1]], five: A, step: 0.06, wet: 0.2, room: 0.7 },
  { name: 'Mjuk sinus', desc: 'Avrundade rena toner, lugn och diskret.', inst: 'softsine', base: 76, ok: [[0, 0, 0.9], [7, 0.1, 1]], five: D, step: 0.08, wet: 0.2, room: 0.7 },
  { name: 'Kristall', desc: 'Skimrande FM-klang, kall och vacker.', inst: 'crystal', base: 79, ok: [[0, 0, 1]], five: D, step: 0.075, wet: 0.28, room: 0.8 },
  { name: 'Koto', desc: 'Japansk plockad sträng med liten glidning.', inst: 'koto', base: 72, ok: [[0, 0, 0.9], [7, 0.08, 1]], five: [0, 2, 7, 9, 12, 14], step: 0.06, wet: 0.25, room: 0.75 },
  { name: 'Bambu', desc: 'Luftig bambuton med lite andning.', inst: 'bamboo', base: 76, ok: [[0, 0, 0.9], [4, 0.1, 1]], five: D, step: 0.085, wet: 0.25, room: 0.75 },
  { name: 'Triangel', desc: 'Ljus metallisk ringning.', inst: 'triangle', base: 84, ok: [[0, 0, 1]], five: [0, 0, 0, 0], step: 0.07, wet: 0.25, room: 0.75, five2: [0, 4, 7, 12] },
  { name: 'Klockspel', desc: 'Tre snabba toner uppåt, glatt och festligt.', inst: 'glock', base: 79, ok: [[0, 0, 0.8], [4, 0.06, 0.9], [7, 0.12, 1]], five: A, step: 0.05, wet: 0.25, room: 0.75 },
  { name: 'Dubbelpling', desc: 'Två klara pling med oktav emellan.', inst: 'dpling', base: 79, ok: [[0, 0, 0.9], [12, 0.09, 1]], five: C, step: 0.07, wet: 0.2, room: 0.7 },
  { name: 'Gnistra', desc: 'En liten svisch som landar i ett glasping.', inst: 'gnistra', base: 83, ok: [[0, 0, 1]], five: [0], step: 0.1, wet: 0.25, room: 0.75, special: 'gnistra' },
  { name: 'Nylon', desc: 'Mjuk nylonsträng, nästan som ukulele.', inst: 'nylon', base: 67, ok: [[0, 0, 0.9], [4, 0.07, 0.9], [7, 0.14, 1]], five: A, step: 0.055, wet: 0.2, room: 0.7 },
  { name: 'Ocarina', desc: 'Mjuk blåston, rund och vänlig.', inst: 'ocarina', base: 79, ok: [[0, 0, 0.8], [4, 0.12, 1]], five: [0, 4, 7, 12], step: 0.1, wet: 0.3, room: 0.78 },
  { name: 'Handpan', desc: 'Varm metalltrumma med oktav i klangen.', inst: 'handpan', base: 67, ok: [[0, 0, 0.9], [7, 0.12, 1]], five: [0, 4, 7, 12], step: 0.085, wet: 0.28, room: 0.78 },
  { name: 'Digital klocka', desc: 'Ren FM-klocka, tydligt "tech".', inst: 'digital', base: 76, ok: [[0, 0, 0.9], [7, 0.085, 1]], five: A, step: 0.06, wet: 0.22, room: 0.72 },
]

/** Ljudet för ett vanligt rätt svar. */
export function renderOk(f) {
  const mix = new Mix(2)
  if (f.pre) INST[f.pre](mix, 0, f.base - 12, 0.8, 0, 0.1)
  f.ok.forEach(([s, t, v], i) => INST[f.inst](mix, t, f.base + s, v, i % 2 ? 0.08 : -0.08, undefined, { dur: 0.9 }))
  return mix.finish({ wet: f.wet, room: f.room, target: -22, window: 0.5 })
}

/** Ljudet för 5, 15, 25 … i rad: samma klang men en stigande ackordsfigur och ett glitter på toppen. */
export function renderFive(f) {
  const mix = new Mix(3)
  const notes = f.five2 ?? f.five
  if (f.pre) INST[f.pre](mix, 0, f.base - 12, 0.8, 0, 0.1)
  const t0 = f.pre ? 0.045 : 0
  if (f.special === 'gnistra') {
    INST.gnistra(mix, 0, f.base, 0.9)
    INST.gnistra(mix, 0.12, f.base + 4, 0.9, 0.2)
    INST.gnistra(mix, 0.24, f.base + 7, 1, -0.2)
    INST.glass(mix, 0.5, f.base + 12, 0.7, 0, 0.45, { dur: 1.6 })
  } else {
    notes.forEach((s, i) => INST[f.inst](mix, t0 + i * f.step, f.base + s, 0.7 + (0.3 * i) / Math.max(1, notes.length - 1), spread(i, 0.1), undefined, { dur: 1.2 }))
    const t = t0 + notes.length * f.step
    // Avslutande ackord som får klinga, och ett litet glitter högst upp.
    ;[0, 4, 7].forEach((s, i) => INST[f.inst](mix, t, f.base + 12 + s - (f.base > 85 ? 12 : 0), 0.55, spread(i, 0.2), 0.4, { dur: 1.6 }))
    INST.glass(mix, t + 0.02, Math.min(f.base + 24, 103), 0.22, 0.2, 0.5, { dur: 1.6 })
  }
  return mix.finish({ wet: f.wet + 0.08, room: Math.min(0.88, f.room + 0.06), target: -20, window: 0.9 })
}

// --- 10 grupper firanden --------------------------------------------------------------------
// Varje grupp har fem nivåer: 10, 20, 30, 40 och 50+ rätt i rad. Nivåerna lägger till lager.

/** "Ta-daa" i tre delar: fanfar, sedan ett crescendo av lager som växer med nivån. */
function epic(mix, T, c) {
  const s = T >= 2 ? c.pickupLen : 0
  if (T >= 2) c.pickup(mix, 0, T)
  const seq = T <= 2 ? [[CH.I, 0, 0.14], [CH.I, 0.17, 1.3]] : T === 3 ? [[CH.V, 0, 0.14], [CH.I, 0.17, 1.4]] : T === 4 ? [[CH.IV, 0, 0.14], [CH.V, 0.17, 0.14], [CH.I, 0.36, 1.6]] : [[CH.IV, 0, 0.14], [CH.V, 0.17, 0.14], [CH.I, 0.36, 1.9]]
  seq.forEach(([ch, dt, dur], i) => c.hit(mix, s + dt, ch, dur, i === seq.length - 1 ? 1 : 0.85))
  const tf = s + seq[seq.length - 1][1]
  const dur = seq[seq.length - 1][2]
  if (T >= 3) c.perc(mix, s, T)
  if (T >= 3) c.bed(mix, tf, dur, T)
  c.spark(mix, tf, T)
  if (T >= 4) c.flourish(mix, tf + 0.08, T)
  return { end: tf + dur }
}

export const GROUPS = [
  {
    name: 'Fanfar', desc: 'Trumpeter och puka: klassiskt "ta-daa" som växer till ett helt blåsorkester-finale.', wet: 0.28, room: 0.82,
    build(mix, T) {
      epic(mix, T, {
        pickupLen: 0.32,
        pickup(m, t, T) {
          ;[0, 0.1, 0.2].forEach((a) => INST.trumpet(m, t + a, 67, 0.8, 0, 0.2, { dur: 0.08 }))
          if (T >= 4) for (let i = 0; i < 7; i++) INST.timp(m, t + 0.04 * i, 48, 0.3 + i * 0.07)
        },
        hit(m, t, ch, dur, v) {
          chord(m, 'brass', ch, t, 0.8 * v, 0.15, 0.25, { dur })
          INST.trumpet(m, t, ch[3] + 12, 0.55 * v, 0, 0.25, { dur })
        },
        perc(m, t, T) {
          INST.timp(m, t, 48, 1)
          if (T >= 5) INST.timp(m, t + 0.17, 43, 0.9)
        },
        bed(m, t, dur) { chord(m, 'strings', CH.I, t - 0.05, 0.4, 0.2, 0.3, { dur: dur + 0.3, attack: 0.1 }) },
        spark(m, t, T) {
          INST.crash(m, t - 0.02, 0, 0.35 + T * 0.04, 0, 0.3, { dur: 1.5 + T * 0.2 })
          run(m, 'glock', 72, [12, 16, 19, 24], t, 0.05, 0.5, 0.7)
        },
        flourish(m, t, T) {
          run(m, 'harp', 60, Array.from({ length: 10 + T * 2 }, (_, i) => pent(i)), t, 0.035, 0.5, 0.8, 0.3)
        },
      })
    },
  },
  {
    name: 'Trolleri', desc: 'Harpa, celesta och glittrande kör: sagolikt och drömskt.', wet: 0.35, room: 0.86,
    build(mix, T) {
      epic(mix, T, {
        pickupLen: 0.36,
        pickup(m, t, T) {
          run(m, 'harp', 60, Array.from({ length: 7 }, (_, i) => pent(i)), t, 0.05, 0.5, 0.9, 0.3)
          mix.add(swish({ dur: 0.45, f0: 800, f1: 6000, q: 3, seed: 3, peak: 0.8 }), t, -16, 0, 0.3)
        },
        hit(m, t, ch, dur, v) {
          chord(m, 'celesta', ch.map((x) => x + 12), t, 0.8 * v, 0.2, 0.4, { dur: dur + 0.2 })
          chord(m, 'harp', ch, t, 0.6 * v, 0.2, 0.35, { dur })
          chord(m, 'glassharm', [ch[0], ch[2]], t, 0.35 * v, 0.2, 0.4, { dur: dur + 0.2 })
        },
        perc(m, t, T) { mix.add(swish({ dur: 0.7, f0: 1500, f1: 7000, q: 2.5, seed: 9, peak: 0.9 }), t, -18, 0, 0.3) },
        bed(m, t, dur, T) { chord(m, 'choir', [60, 64, 67, 72], t - 0.1, 0.35, 0.25, 0.4, { dur: dur + 0.4 }) },
        spark(m, t, T) { sprinkle(m, 'celesta', t + 0.02, 0.5 + T * 0.1, 5 + T * 2, 7, 15, 0.4, 5) },
        flourish(m, t, T) { run(m, 'glass', 84, Array.from({ length: 6 + T }, (_, i) => pent(i)), t, 0.06, 0.4, 0.7, 0.4) },
      })
    },
  },
  {
    name: 'Arkad', desc: '8-bitars chip-ljud: mynt, power-up och fanfar. Retro och glad.', wet: 0.08, room: 0.4,
    build(mix, T) {
      epic(mix, T, {
        pickupLen: 0.36,
        pickup(m, t, T) { run(m, 'chip', 72, Array.from({ length: 8 }, (_, i) => pent(i)), t, 0.045, 0.7, 0.9, 0.2, 0.08, { dur: 0.1 }) },
        hit(m, t, ch, dur, v) {
          ch.forEach((x, i) => INST.chip(m, t + i * 0.035, x + 12, 0.55 * v, spread(i, 0.15), 0.08, { dur: Math.min(dur, 0.5), duty: 0.25 }))
          INST.chip(m, t, ch[0] - 12, 0.5 * v, 0, 0.05, { dur: Math.min(dur, 0.6), kind: 'square' })
        },
        perc(m, t, T) {
          INST.kick(m, t, 0, 0.9)
          INST.pop(m, t + 0.12, 0.3, 0, 0.05, 5)
          if (T >= 4) for (let i = 1; i < 5; i++) INST.kick(m, t + i * 0.18, 0, 0.7)
        },
        bed(m, t, dur) { INST.chip(m, t, 48, 0.4, 0, 0.05, { dur: Math.min(dur, 1.2), duty: 0.25 }) },
        spark(m, t, T) { run(m, 'chip', 84, Array.from({ length: 6 + T }, (_, i) => pent(i)), t + 0.05, 0.035, 0.5, 0.6, 0.3, 0.1, { dur: 0.12, duty: 0.125, kind: 'pulse' }) },
        flourish(m, t, T) { run(m, 'chip', 60, Array.from({ length: 10 }, (_, i) => pent(i)), t + 0.2, 0.05, 0.4, 0.6, 0.3, 0.08, { dur: 0.12 }) },
      })
    },
  },
  {
    name: 'Fyrverkeri', desc: 'Raketer som visslar upp, smäller och spricker i glitter.', wet: 0.3, room: 0.85,
    build(mix, T) {
      const n = [1, 2, 3, 4, 6][T - 1]
      const r = rng(40 + T)
      const gap = T >= 4 ? 0.22 : 0.3
      for (let i = 0; i < n; i++) {
        const t = i * gap
        const f0 = 500 + r() * 300
        INST.whistle(mix, t, f0, 0.35, r() * 1.2 - 0.6, 0.2, { f1: 2000 + r() * 1000, dur: 0.4 })
        const tb = t + 0.4
        INST.boom(mix, tb, 0.7 + 0.1 * T / 5, spread(i, 0.3))
        crackle(mix, tb + 0.03, 0.5 + 0.1 * T, 18 + T * 6, 0.4, 100 + i * 7)
        sprinkle(mix, 'glass', tb + 0.02, 0.45, 3 + (T >= 3 ? 2 : 0), 5, 12, 0.5, 200 + i)
      }
      const tend = (n - 1) * gap + 0.4
      if (T >= 2) run(mix, 'glock', 72, [0, 4, 7, 12], tend + 0.1, 0.07, 0.5, 0.8)
      if (T >= 4) chord(mix, 'tubular', [72, 76, 79], tend + 0.15, 0.5, 0.2, 0.35, { dur: 2.4 })
      if (T >= 5) INST.crash(mix, tend + 0.1, 0, 0.5, 0, 0.3, { dur: 2.2, decay: 1.4 })
    },
  },
  {
    name: 'Klockringning', desc: 'Kyrkklockor och klockspel: festligt, högtidligt och varmt.', wet: 0.35, room: 0.88,
    build(mix, T) {
      const peal = [0, 7, 4, 12, 7, 16, 12, 19]
      const count = [3, 5, 8, 8, 8][T - 1]
      const step = T >= 3 ? 0.11 : 0.13
      for (let i = 0; i < count; i++) INST.tubular(mix, i * step, 72 + peal[i], 0.55 + 0.04 * i, spread(i, 0.2), 0.35, { dur: 2.2 })
      const tf = count * step + 0.04
      chord(mix, 'tubular', [60, 72, 76, 79], tf, 0.7, 0.2, 0.4, { dur: 3 })
      INST.glock(mix, tf + 0.02, 91, 0.5, 0.2, 0.4, { dur: 1.6 })
      if (T >= 2) INST.tubular(mix, 0, 48, 0.8, 0, 0.4, { dur: 3 })
      if (T >= 3) INST.gong(mix, tf, 48, 0.55, 0, 0.45, { dur: 3.5 })
      if (T >= 3) run(mix, 'glock', 84, Array.from({ length: 8 }, (_, i) => pent(i)), 0.05, step, 0.4, 0.6, 0.4)
      if (T >= 4) run(mix, 'glass', 84, Array.from({ length: 10 }, (_, i) => pent(i)), tf + 0.15, 0.06, 0.4, 0.6, 0.4)
      if (T >= 5) {
        INST.crash(mix, tf, 0, 0.35, 0, 0.3, { dur: 2.4 })
        chord(mix, 'strings', CH.I, tf - 0.1, 0.35, 0.2, 0.3, { dur: 2.2, attack: 0.15 })
        sprinkle(mix, 'celesta', tf + 0.1, 1.2, 14, 7, 16, 0.4, 77)
      }
    },
  },
  {
    name: 'Filmmusik', desc: 'Stråkar som sväller, mäktigt blås och en kraftig cymbal. Som en filmtrailer.', wet: 0.32, room: 0.86,
    build(mix, T) {
      const r = 0.45 + T * 0.08
      chord(mix, 'strings', [48, 55, 60, 64], 0, 0.5, 0.2, 0.3, { dur: r + 0.4, attack: r * 0.9 })
      chord(mix, 'strings', [72, 76, 79], 0.05, 0.35, 0.3, 0.3, { dur: r + 0.4, attack: r * 0.9 })
      mix.add(swish({ dur: r, f0: 600, f1: 5000, q: 2, seed: 4, peak: 0.9 }), 0, -18, 0, 0.3)
      const hits = T >= 4 ? [[CH.IV, 0], [CH.I, 0.3]] : [[CH.I, 0]]
      hits.forEach(([ch, dt], i) => {
        const t = r + dt
        const last = i === hits.length - 1
        chord(mix, 'brass', lo(ch), t, 0.8, 0.2, 0.3, { dur: last ? 1.6 : 0.3 })
        chord(mix, 'strings', ch.map((x) => x + 12), t, 0.5, 0.25, 0.3, { dur: last ? 1.8 : 0.3, attack: 0.04 })
        INST.timp(mix, t, 36, 1)
        INST.crash(mix, t - 0.02, 0, 0.45, 0, 0.3, { dur: last ? 2.2 : 0.8, decay: last ? 1.3 : 0.4 })
      })
      const tf = r + hits[hits.length - 1][1]
      if (T >= 2) run(mix, 'glock', 84, [0, 4, 7, 12], tf, 0.06, 0.4, 0.6, 0.3)
      if (T >= 3) run(mix, 'harp', 48, Array.from({ length: 14 }, (_, i) => pent(i)), tf + 0.05, 0.04, 0.4, 0.75, 0.3)
      if (T >= 4) chord(mix, 'choir', [60, 64, 67, 72], tf, 0.4, 0.25, 0.4, { dur: 2 })
      if (T >= 5) {
        INST.timp(mix, tf + 0.12, 43, 0.8)
        sprinkle(mix, 'celesta', tf + 0.1, 1.3, 14, 8, 17, 0.4, 31)
        chord(mix, 'tubular', [72, 79], tf + 0.05, 0.4, 0.2, 0.4, { dur: 2.6 })
      }
    },
  },
  {
    name: 'Synthdrop', desc: 'Stigande riser och ett kraftigt drop med bas och synth-ackord.', wet: 0.22, room: 0.7,
    build(mix, T) {
      const r = 0.4 + T * 0.1
      mix.add(swish({ dur: r, f0: 300, f1: 6000, q: 2, seed: 6, peak: 0.9, curve: 1.5 }), 0, -14, 0, 0.1)
      mix.add(sweep({ f0: 200, f1: 1400, dur: r, glide: r / 2, decay: 100, attack: 0.05, rel: 0.02 }), 0, -26, 0, 0.1)
      INST.kick(mix, r, 0, 1)
      INST.sub(mix, r, 36, 0.9, 0, 0.05, { dur: 0.9 + T * 0.15 })
      INST.pop(mix, r, 0.35, 0, 0.1, 9)
      chord(mix, 'supersaw', [60, 64, 67, 72], r, 0.55, 0.3, 0.2, { dur: 0.5 + T * 0.2 })
      if (T >= 2) run(mix, 'synthpluck', 72, [0, 4, 7, 12, 16, 12, 7, 12], r + 0.25, 0.09, 0.5, 0.8, 0.3, 0.2)
      if (T >= 3) for (let i = 0; i < 6; i++) put(mix, burst({ dur: 0.05, decay: 0.012, lo: 6000, hi: 14000, seed: 30 + i }), r + 0.12 + i * 0.12, 0.25, 0, 0.05)
      if (T >= 4) {
        chord(mix, 'supersaw', CH.IV, r + 0.45, 0.45, 0.3, 0.2, { dur: 0.45 })
        chord(mix, 'supersaw', CH.I, r + 0.9, 0.5, 0.3, 0.25, { dur: 1.1 })
        INST.kick(mix, r + 0.45, 0, 0.8)
        INST.kick(mix, r + 0.9, 0, 0.9)
      }
      if (T >= 5) {
        run(mix, 'glass', 84, Array.from({ length: 10 }, (_, i) => pent(i)), r + 0.95, 0.05, 0.4, 0.6, 0.4)
        INST.crash(mix, r + 0.9, 0, 0.4, 0, 0.3, { dur: 1.8 })
      }
    },
  },
  {
    name: 'Matsuri', desc: 'Japansk festival: koto, taiko-trummor, träklappor och bambuflöjt.', wet: 0.3, room: 0.8,
    build(mix, T) {
      const yo = [0, 2, 5, 7, 9]
      const deg = (i) => Math.floor(i / 5) * 12 + yo[i % 5]
      const n = 5 + T * 2
      run(mix, 'koto', 60, Array.from({ length: n }, (_, i) => deg(i)), 0, 0.045, 0.6, 0.95, 0.4)
      const tf = n * 0.045 + 0.05
      if (T >= 2) { INST.clapper(mix, 0, 0.8); INST.clapper(mix, 0.14, 0.9) }
      const don = [[0, 1]]
      if (T >= 3) don.push([0.2, 0.8], [0.3, 0.9])
      if (T >= 4) for (let i = 0; i < 6; i++) don.push([0.05 + i * 0.05, 0.4 + i * 0.1])
      don.forEach(([dt, v]) => INST.taiko(mix, tf - 0.3 + dt, 43, v))
      INST.taiko(mix, tf, 38, 1)
      chord(mix, 'koto', [72, 79, 84], tf, 0.8, 0.25, 0.3, { dur: 1.6 })
      if (T >= 3) INST.shaku(mix, tf - 0.1, 76 + 3, 0.7, 0, 0.35, { dur: 1.5 })
      if (T >= 5) {
        run(mix, 'koto', 72, Array.from({ length: 10 }, (_, i) => deg(i)), tf + 0.1, 0.05, 0.5, 0.8, 0.4)
        INST.rin(mix, tf, 91, 0.5, 0, 0.4, { dur: 3 })
        INST.taiko(mix, tf + 0.25, 38, 1)
        INST.taiko(mix, tf + 0.5, 43, 1)
      }
    },
  },
  {
    name: 'Kristall', desc: 'Glasklara klockor och kaskader av glitter som stiger mot taket.', wet: 0.35, room: 0.88,
    build(mix, T) {
      const count = [4, 7, 9, 11, 13][T - 1]
      run(mix, 'glass', 76, Array.from({ length: count }, (_, i) => pent(i)), 0, 0.07, 0.5, 1, 0.5)
      const tf = count * 0.07
      chord(mix, 'glass', [84, 88, 91, 96], tf, 0.6, 0.3, 0.45, { dur: 2 })
      if (T >= 2) chord(mix, 'glassharm', [72, 79], 0, 0.45, 0.3, 0.4, { dur: tf + 1.4 })
      if (T >= 3) run(mix, 'crystal', 88, Array.from({ length: 8 }, (_, i) => pent(i)), 0.1, 0.09, 0.3, 0.5, 0.5, 0.4)
      if (T >= 4) run(mix, 'celesta', 84, Array.from({ length: 9 }, (_, i) => pent(i)), tf, 0.05, 0.4, 0.6, 0.5, 0.4)
      if (T >= 4) mix.add(swish({ dur: tf, f0: 1500, f1: 7000, q: 3, seed: 14, peak: 0.8 }), 0, -18, 0, 0.3)
      if (T >= 5) {
        chord(mix, 'tubular', [72, 79, 84], tf, 0.4, 0.2, 0.45, { dur: 3 })
        sprinkle(mix, 'glock', tf, 1.4, 16, 9, 18, 0.35, 12)
        INST.crash(mix, tf, 0, 0.25, 0, 0.3, { dur: 2, swell: 0.2 })
      }
    },
  },
  {
    name: 'Konfetti', desc: 'Partytut, konfettismällar och steeldrum. Glad födelsedagskänsla.', wet: 0.25, room: 0.75,
    build(mix, T) {
      INST.blower(mix, 0, 0.55)
      INST.pop(mix, 0.5, 0.9, -0.3, 0.2, 71)
      run(mix, 'marimba', 72, [0, 2, 4, 7, 9, 12], 0.1, 0.06, 0.6, 1, 0.3)
      if (T >= 2) for (let i = 0; i < 4; i++) INST.pop(mix, 0.55 + i * 0.07, 0.6, ((i % 3) - 1) * 0.5, 0.2, 90 + i)
      if (T >= 3) run(mix, 'steeldrum', 79, [0, 0, 0, 5], 0.55, 0.11, 0.7, 1, 0.2)
      if (T >= 4) {
        ;[0.45, 0.52, 0.59, 0.66].forEach((t, i) => INST.taiko(mix, t, 55 - i * 3, 0.5 + i * 0.1))
        INST.crash(mix, 1.0, 0, 0.35, 0, 0.3, { dur: 1.8 })
      }
      if (T >= 5) {
        crackle(mix, 1.0, 1.2, 40, 0.4, 500)
        chord(mix, 'steeldrum', [72, 76, 79, 84], 1.0, 0.6, 0.3, 0.3, { dur: 1.6 })
        run(mix, 'glock', 84, Array.from({ length: 8 }, (_, i) => pent(i)), 1.05, 0.05, 0.4, 0.6, 0.4)
      }
    },
  },
]

/** Fira ett tiotal: grupp (0–9) och nivå 1–5. */
export function renderGroup(g, T) {
  const mix = new Mix(4)
  g.build(mix, T)
  return mix.finish({ wet: g.wet, room: g.room, target: -21 + T * 1.0, window: 1.2 })
}
