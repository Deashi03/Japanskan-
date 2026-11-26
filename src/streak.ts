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

// Ackord (halvtoner från C5) i C-dur. Melodin hålls i mellanregistret (G4–G6); bara ackordet
// och instrumentet växlar, så att inget hamnar högre och högre ju längre sviten blir.
const CHORDS = {
  C: [0, 4, 7],
  Am: [-3, 0, 4],
  F: [-7, -3, 0],
  G: [-5, -1, 2],
  Em: [-8, -5, -1],
  Dm: [-10, -7, -3],
} as const
type ChordName = keyof typeof CHORDS

/** Ackordsföljder. Varje svar i rad tar nästa ackord, och efter fyra byts följd. */
const PROGRESSIONS: ChordName[][] = [
  ['C', 'G', 'Am', 'F'],
  ['C', 'Am', 'F', 'G'],
  ['Am', 'F', 'C', 'G'],
  ['C', 'Em', 'F', 'G'],
  ['Dm', 'G', 'C', 'Am'],
]

/** Melodiformer: index i ackordets toner [grundton, ters, kvint, grundton + oktav]. */
const SHAPES = [
  [1, 2],
  [0, 2, 3],
  [2, 1, 2],
  [0, 1, 2, 3],
  [3, 2],
  [1, 3, 2],
  [2, 3, 1],
  [0, 2],
  [1, 0, 2, 3],
  [3, 1],
]

/** Melodins instrument turas om, så att klangen inte blir densamma svar efter svar. */
const MELODY_VOICES: Voice[] = ['mallet', 'kalimba', 'bell', 'harp']

/** Den högsta ton ett vanligt rätt svar får använda (G6). */
export const MAX_SEMI = 19

/** 10, 20, 30 … är milstolpar. Returnerar nivån (1 för 10, 2 för 20 …), annars 0. */
export const milestoneLevel = (n: number) => (n >= 10 && n % 10 === 0 ? n / 10 : 0)

/** Ljudet för det n:te rätta svaret i rad (n ≥ 1). */
export function planCorrect(n: number): Note[] {
  const k = Math.max(1, Math.floor(n))
  const level = milestoneLevel(k)
  if (level) return planMilestone(level)

  const progIdx = Math.floor((k - 1) / 4) % PROGRESSIONS.length
  const chord = CHORDS[PROGRESSIONS[progIdx][(k - 1) % 4]]
  const ext = [chord[0], chord[1], chord[2], chord[0] + 12]
  let shape = SHAPES[(k * 7 + progIdx) % SHAPES.length]
  if (k % 3 === 0) shape = [...shape].reverse()
  const voice = MELODY_VOICES[(k * 3 + progIdx) % MELODY_VOICES.length]
  const step = k % 2 ? 0.085 : 0.105
  const notes: Note[] = shape.map((idx, i) => ({
    voice,
    semi: ext[idx],
    at: i * step,
    dur: i === shape.length - 1 ? 0.7 : 0.4,
    gain: 0.3,
  }))

  // Från tredje svaret ligger ackordet som ett mjukt komp under melodin, i ett annat
  // instrument än melodin.
  if (k >= 3) {
    const comp: Voice = voice === 'harp' || voice === 'kalimba' ? 'pad' : 'harp'
    chord.forEach((s, i) => notes.push({ voice: comp, semi: s - 12, at: i * 0.05, dur: 0.8, gain: comp === 'pad' ? 0.1 : 0.13 }))
  }
  if (k >= 6 && k % 2 === 0) notes.push({ voice: 'bass', semi: chord[0] - 24, at: 0, dur: 0.5, gain: 0.2 })
  if (k % 4 === 0) notes.push({ voice: 'bell', semi: chord[0] + 12, at: shape.length * step, dur: 1.1, gain: 0.08 })

  // Var femte svar (utom milstolparna) avslutas med en liten löpning genom ackordet.
  if (k % 5 === 0) {
    const run = [...ext, chord[1] + 12, chord[2] + 12]
    run.forEach((s, i) => notes.push({ voice: 'mallet', semi: s, at: 0.22 + i * 0.06, dur: 0.45, gain: 0.2 }))
    const top = 0.22 + run.length * 0.06
    notes.push({ voice: 'bell', semi: chord[2] + 12, at: top, dur: 1.2, gain: 0.09 })
    notes.push({ voice: 'bass', semi: chord[0] - 24, at: top, dur: 0.8, gain: 0.18 })
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
