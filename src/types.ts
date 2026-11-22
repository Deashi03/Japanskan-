export interface Breakdown { kanji: string; reading: string; meaning: string }
export interface Example { ja: string; reading: string; sv: string }
export interface Distinction { word: string; reading: string; meaning: string }

export interface Word {
  id: string
  word: string
  reading: string
  meaning: string
  breakdown: Breakdown[]
  examples: Example[]
  distinctions: Distinction[]
  list: string
  createdAt: number
  order: number
  suspended?: boolean
}

/** FSRS-kortets tillstånd, med datum som millisekunder så det går att spara som JSON. */
export interface CardData {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: number
  introducedAt: number
  /** De senaste svaren (true = rätt), nyast sist. Används för problemord. */
  recent: boolean[]
  lastExercise?: ExerciseType
}

export type ExerciseType = 'mc_ja_sv' | 'mc_sv_ja' | 'match' | 'type_reading' | 'type_from_sv'

export interface LogData {
  wordId: string
  ts: number
  rating: number
  correct: boolean
  exercise: ExerciseType
  ms: number
  extra?: boolean
  isNew?: boolean
}

export type ThemeMode = 'light' | 'dark' | 'system' | 'schedule'

export interface Settings {
  newPerSession: number
  dailyNewCap: number
  sound: boolean
  haptics: boolean
  theme: ThemeMode
  darkFrom: string
  darkTo: string
  showExampleReading: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  newPerSession: 5,
  dailyNewCap: 0,
  sound: true,
  haptics: true,
  theme: 'system',
  darkFrom: '20:00',
  darkTo: '07:00',
  showExampleReading: true,
}

export type Kind = 'word' | 'card' | 'log' | 'settings'

export interface Row {
  id: string
  kind: Kind
  data: unknown
  updatedAt: number
  deleted: boolean
  dirty: 0 | 1
}
