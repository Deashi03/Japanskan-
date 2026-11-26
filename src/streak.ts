// Ljuddesign för rätt svar i rad. Det här är bara en plan – vilka toner, vilket instrument och
// när – och den innehåller ingen ljudkod. Planen kan därför testas: att tonläget inte
// klättrar för varje rätt, att två svar i rad aldrig låter likadant och att milstolparna
// (10, 20, 30 …) växer. fx.ts spelar upp planen.

export type Voice = 'mallet' | 'kalimba' | 'bell' | 'harp' | 'pad' | 'bass' | 'horn' | 'timpani' | 'cymbal' | 'sparkle'

export interface Note {
  voice: Voice
  /** Halvtoner från C5. */
  semi: number
  /** Sekunder efter att ljudet startar. */
  at: number
  dur: number
  gain: number
}

// Allt för vanliga rätt svar hålls medvetet enkelt och ljust. Melodierna går bara uppåt, bara på
// durpentatonisk skala (C D E G A, som aldrig skaver) och slutar alltid på en stabil ton
// (C, E eller G), så att ingen variant kan låta som ett fel svar. Det som varierar är
// melodins form, tempo, instrument och ibland en liten klocka eller löpning.

/** Durpentatonisk skala över två oktaver, i halvtoner från C5: C D E G A C D E G. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19]

/** Melodiformer som index i SCALE. Alla stiger och slutar på C, E eller G. */
const MOTIFS = [
  [0, 2],
  [2, 3],
  [3, 5],
  [0, 2, 3],
  [1, 3, 5],
  [2, 3, 5],
  [0, 3, 5],
  [3, 5, 7],
  [0, 2, 3, 5],
  [2, 3, 5, 7],
  [0, 1, 2, 3],
  [1, 2, 3, 5],
]

/** Melodins instrument turas om mellan tre mjuka, släktskapade klanger. */
const MELODY_VOICES: Voice[] = ['mallet', 'kalimba', 'harp']

/** Den högsta ton ett vanligt rätt svar får använda (G6). */
export const MAX_SEMI = 19

/** 10, 20, 30 … är milstolpar. Returnerar nivån (1 för 10, 2 för 20 …), annars 0. */
export const milestoneLevel = (n: number) => (n >= 10 && n % 10 === 0 ? n / 10 : 0)

/** Ljudet för det n:te rätta svaret i rad (n ≥ 1). */
export function planCorrect(n: number): Note[] {
  const k = Math.max(1, Math.floor(n))
  const level = milestoneLevel(k)
  if (level) return planMilestone(level)

  // 5 är ensamprimtal med 12, så två svar i rad får aldrig samma form.
  const motif = MOTIFS[(k * 5 + Math.floor(k / 12)) % MOTIFS.length]
  const voice = MELODY_VOICES[k % MELODY_VOICES.length]
  const step = k % 2 ? 0.085 : 0.105
  const notes: Note[] = motif.map((idx, i) => ({
    voice,
    semi: SCALE[idx],
    at: i * step,
    dur: i === motif.length - 1 ? 0.7 : 0.4,
    gain: 0.3,
  }))
  const last = SCALE[motif[motif.length - 1]]

  // En liten klocka på sluttonen var fjärde svar.
  if (k % 4 === 0) notes.push({ voice: 'bell', semi: last, at: motif.length * step, dur: 1.1, gain: 0.09 })

  // Var femte svar (utom milstolparna) avslutas med en löpning uppför skalan.
  if (k % 5 === 0) {
    SCALE.slice(0, 6).forEach((s, i) => notes.push({ voice: 'mallet', semi: s, at: 0.22 + i * 0.06, dur: 0.45, gain: 0.2 }))
    const top = 0.22 + 6 * 0.06
    notes.push({ voice: 'bell', semi: 12, at: top, dur: 1.2, gain: 0.1 })
    notes.push({ voice: 'sparkle', semi: MAX_SEMI - 7, at: top + 0.04, dur: 0.3, gain: 0.05 })
  }
  return notes
}

/** Tonartsstegen för milstolparna: varje nivå låter en bit högre än den förra. */
const KEYS = [0, 2, 4, 5, 7, 4, 2, 5]

/** Fanfar för det 10:e, 20:e, 30:e … svaret i rad. Varje nivå lägger till lager: hornen
 *  kommer först, sedan harpa och klockor, pukor, kör och till sist en andra fras. */
export function planMilestone(level: number): Note[] {
  const L = Math.max(1, Math.floor(level))
  const key = KEYS[(L - 1) % KEYS.length]
  const n = (voice: Voice, semi: number, at: number, dur: number, gain: number): Note => ({ voice, semi: semi + key, at, dur, gain })
  const notes: Note[] = []

  // "Da-daaa": ett kort stöt och ett långt ackord.
  ;[0, 4, 7].forEach((s) => notes.push(n('horn', s, 0, 0.16, 0.17)))
  ;[4, 7, 12].forEach((s) => notes.push(n('horn', s, 0.18, 0.9, 0.2)))
  ;[0, 4, 7, 12].forEach((s, i) => notes.push(n('mallet', s, i * 0.04, 0.5, 0.2)))
  notes.push(n('mallet', 12, 0.18, 1, 0.24))
  notes.push(n('sparkle', 12, 0.3, 0.3, 0.05))

  if (L >= 2) {
    ;[-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12].forEach((s, i) => notes.push(n('harp', s, 0.02 + i * 0.03, 1, 0.12)))
    ;[12, 16, 19].forEach((s) => notes.push(n('bell', s, 0.18, 1.3, 0.09)))
  }
  if (L >= 3) {
    notes.push({ voice: 'timpani', semi: -26, at: 0, dur: 0.6, gain: 0.32 })
    notes.push({ voice: 'timpani', semi: -31, at: 0.18, dur: 0.9, gain: 0.34 })
    notes.push({ voice: 'cymbal', semi: 0, at: 0.04, dur: 0.9, gain: 0.05 })
  }
  if (L >= 4) {
    ;[-12, -5, 0, 4].forEach((s) => notes.push(n('pad', s, 0.1, 1.6, 0.12)))
    ;[-12, -8, -5, 0, 4, 7, 12, 16].forEach((s, i) => notes.push(n('mallet', s, 0.5 + i * 0.07, 0.5, 0.14)))
  }
  if (L >= 5) {
    // Andra frasen en kvart upp: "da-da-da-DAA" med en pukpuls under.
    ;[0, 0.12, 0.24].forEach((at) => [7, 12].forEach((s) => notes.push(n('horn', s + 5, 1.1 + at, 0.1, 0.15))))
    ;[0, 4, 7, 12, 16].forEach((s) => notes.push(n('horn', s + 5, 1.5, 1, 0.17)))
    for (let i = 0; i < 7; i++) notes.push({ voice: 'timpani', semi: -26, at: 1.05 + i * 0.07, dur: 0.25, gain: 0.12 + i * 0.03 })
    ;[12, 16, 19, 24, 28, 31].forEach((s, i) => notes.push(n('sparkle', s, 1.55 + i * 0.05, 0.3, 0.04)))
  }
  if (L >= 10) {
    // Var tionde milstolpe (100 i rad och uppåt) får en sista klockkaskad.
    for (let i = 0; i < 12; i++) notes.push(n('bell', [0, 4, 7, 12][i % 4] + 12 * Math.floor(i / 4), 1.6 + i * 0.08, 1, 0.07))
  }
  return notes
}

/** Fingeravtryck av en plan, för att jämföra två ljud (används av testerna). */
export const signature = (plan: Note[]) =>
  plan
    .map((p) => `${p.voice}:${p.semi}@${p.at.toFixed(2)}`)
    .sort()
    .join(' ')

/** Planens längd i sekunder. */
export const planLength = (plan: Note[]) => Math.max(0, ...plan.map((p) => p.at + p.dur))
