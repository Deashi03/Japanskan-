// @ts-nocheck
// Instrument och firandet "Filmmusik" (fem nivåer för 10, 20, 30, 40 och 50+ rätt i rad).
// Kommer från ljudlabbet (ljudlabb/), där alla förslag finns kvar.
import { Mix, additive, bend, biquad, burst, cymbal, fm, midi, noise, pluck, rng, stack, sweep, swish, thump } from './synth'

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


const FILM = {
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
  }

/** Firandet för det 10:e, 20:e … svaret i rad; nivå 1–5. */
export function renderFilm(T) {
  const mix = new Mix(4)
  FILM.build(mix, T)
  return mix.finish({ wet: FILM.wet, room: FILM.room, target: -21 + T * 1.0, window: 1.2 })
}
