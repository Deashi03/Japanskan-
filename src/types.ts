export interface Breakdown { kanji: string; reading: string; meaning: string }
export interface Example { ja: string; reading: string; sv: string; level?: 1 | 2 | 3 }

/** En böjningsform av ordet, med en mening där formen används. */
export interface Form { label: string; ja: string; reading: string; ex: Example }

/** Grammatisk förklaring för ord som är grammatik snarare än vokabulär. */
export interface Grammar { formula: string; function: string; explanation: string; pitfalls?: string }

/** Ordets stora innehåll – alla exempelmeningar och böjningar. Sparas för sig och läses
 *  in först när det behövs, så att ordlistan förblir snabb hur mycket innehåll som än finns. */
export interface WordExtra { examples: Example[]; forms: Form[] }
export interface Distinction { word: string; reading: string; meaning: string }

export interface Word {
  id: string
  word: string
  reading: string
  meaning: string
  breakdown: Breakdown[]
  examples: Example[]
  distinctions: Distinction[]
  /** Andra svenska översättningar som godkänns som svar och går att söka på. */
  synonyms?: string[]
  /** Andra japanska ord som godkänns när man ska skriva ordet på japanska. */
  altJa?: string[]
  list: string
  createdAt: number
  order: number
  suspended?: boolean
  /** Tidpunkt då ordet valdes att läras härnäst. Valda ord introduceras före alla andra nya ord. */
  priority?: number
  /** Ordklass, t.ex. ["u"] eller ["noun", "suru"]. */
  pos?: string[]
  /** Ämnen ur en fast lista, t.ex. ["juridik", "titlar och roller"]. */
  categories?: string[]
  /** Fria sökord, t.ex. ["åklagare", "domstol"]. */
  tags?: string[]
  grammar?: Grammar
  /** Antal extra exempelmeningar och böjningar som finns sparade för ordet. */
  extraCount?: number
  formCount?: number
  /** Andra ord (id) som man har blandat ihop det här ordet med i skrivövningar. */
  confusable?: string[]
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
  /** Ordet markerades som "kan redan" och räknas inte som ett nytt ord i dagens kvot. */
  known?: boolean
  /** Antal klarade repetitioner per färdighet. Ordet räknas som inlärt först när alla tre är klarade. */
  skills?: Partial<Record<Skill, number>>
  /** Övningar som ska göras om efter ett fel: vilken övning och vilken dag (dagnummer). */
  retry?: Retry[]
}

export type Skill = 'listen' | 'read' | 'write'
export interface Retry { type: ExerciseType; day: number }

export type ExerciseType =
  | 'mc_ja_sv'
  | 'mc_sv_ja'
  | 'match'
  | 'listen'
  | 'sentence'
  | 'cloze'
  | 'type_sv'
  | 'type_from_sv'
  | 'type_reading'
  | 'form'

export interface LogData {
  wordId: string
  ts: number
  rating: number
  correct: boolean
  exercise: ExerciseType
  ms: number
  extra?: boolean
  isNew?: boolean
  retry?: boolean
  /** Svaret gällde en repetition av ett redan inlärt ord (inte inlärning av ett nytt). */
  review?: boolean
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
  autoSpeak: boolean
  /** Ord användaren vill lära sig och ska skicka till en AI. */
  wishlist: string
  /** Varifrån nya ord hämtas: '' = importordning, '*' = växla mellan listorna, annars en listas namn. */
  newFrom: string
  /** Extra fördröjning av animationer i millisekunder, om ljudet hörs efter animationen. */
  audioLag: number
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
  autoSpeak: true,
  wishlist: '',
  newFrom: '',
  audioLag: 0,
}

export type Kind = 'word' | 'card' | 'log' | 'settings' | 'extra'

export interface Row {
  id: string
  kind: Kind
  data: unknown
  updatedAt: number
  deleted: boolean
  dirty: 0 | 1
}
