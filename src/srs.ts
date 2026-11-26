import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Grade } from 'ts-fsrs'
import { dayIndex, endOfDay } from './days'
import type { CardData, ExerciseType, Retry, Skill, Word } from './types'

export { Rating, State }

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_fuzz: true,
    enable_short_term: true,
    // Ett nytt ord måste klaras fem gånger i rad – en gång per övningstyp –
    // innan det går över till långa intervall.
    learning_steps: ['1m', '2m', '4m', '7m', '10m'],
    relearning_steps: ['10m'],
  }),
)

const DAY = 86_400_000

export function newCard(now: number): CardData {
  const c = createEmptyCard(new Date(now))
  return {
    due: now,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    introducedAt: now,
    recent: [],
  }
}

/** Ett ord räknas som problemord om minst två av de fem senaste svaren var fel
 *  och det ännu inte klarats tre gånger i rad sedan dess. */
export function isProblem(card: CardData | undefined): boolean {
  if (!card) return false
  const r = card.recent.slice(-5)
  if (r.filter((x) => !x).length < 2) return false
  return !(r.length >= 3 && r.slice(-3).every(Boolean))
}

/** Tidsgränser per övningstyp: [snabbt, långsamt] i millisekunder. Skrivövningar har ingen
 *  gräns för "långsamt" – hur fort man skriver på mobilen säger inget om hur väl man kan ordet. */
const PACE: Record<ExerciseType, [number, number]> = {
  mc_ja_sv: [3000, 12000],
  mc_sv_ja: [3000, 12000],
  cloze: [5000, 20000],
  listen: [5000, 15000],
  sentence: [7000, 25000],
  match: [0, Infinity],
  type_sv: [8000, Infinity],
  type_from_sv: [8000, Infinity],
  type_reading: [8000, Infinity],
  form: [7000, 25000],
}

/** Räknar ut FSRS-betyget automatiskt från om svaret var rätt och hur snabbt det gick. */
export function autoRating(card: CardData, correct: boolean, ms: number, exercise: ExerciseType, hinted = false): Grade {
  if (!correct) return Rating.Again
  const [fast, slow] = PACE[exercise]
  // Rätt svar med ledtråd räknas som "Svårt": ordet satt inte helt av sig självt.
  if (hinted || ms > slow) return Rating.Hard
  // "Lätt" hoppar över inlärningssteg, så det ges bara till ord som redan är inlärda.
  if (ms < fast && card.state === State.Review && !isProblem(card)) return Rating.Easy
  return Rating.Good
}

/** "Jag kan det här ordet": hoppa över inlärningen och ge ordet ett första intervall direkt.
 *  Ordet räknas ändå inte som "Kan" förrän de tre färdigheterna har klarats vid repetition. */
export function knownCard(now: number): CardData {
  return { ...schedule(newCard(now), Rating.Easy, now, 'mc_ja_sv', false), recent: [], lastExercise: undefined, known: true }
}

/** Vilken färdighet en övning tränar. Bara de tre färdigheterna räknas när appen avgör om
 *  ett ord sitter: att förstå det i tal, att översätta det till svenska och att skriva det på
 *  japanska. Flerval och dra-övningar hjälper inlärningen men räknas inte som bevis. */
export function skillOf(exercise: ExerciseType): Skill | undefined {
  if (exercise === 'listen' || exercise === 'sentence' || exercise === 'form') return 'listen'
  if (exercise === 'type_sv') return 'read'
  if (exercise === 'type_from_sv') return 'write'
  return undefined
}

export const SKILLS: Skill[] = ['write', 'listen', 'read']

/** Färdigheter som ordet ännu inte har klarat vid en repetition. */
export function missingSkills(card: CardData | undefined, skip: Skill[] = []): Skill[] {
  return SKILLS.filter((s) => !skip.includes(s) && !((card?.skills?.[s] ?? 0) > 0))
}

export function schedule(card: CardData, rating: Grade, now: number, exercise: ExerciseType, cap = true): CardData {
  const { card: n } = scheduler.next(
    { ...card, due: card.due, last_review: card.last_review },
    new Date(now),
    rating,
  )
  // En färdighet räknas som klarad när den klaras vid en riktig repetition, dvs. när ordet
  // redan var inlärt innan svaret.
  const skill = skillOf(exercise)
  const skills = { ...card.skills }
  if (skill && rating !== Rating.Again && card.state === State.Review) skills[skill] = (skills[skill] ?? 0) + 1
  const next: CardData = {
    due: n.due.getTime(),
    stability: n.stability,
    difficulty: n.difficulty,
    elapsed_days: n.elapsed_days,
    scheduled_days: n.scheduled_days,
    learning_steps: n.learning_steps,
    reps: n.reps,
    lapses: n.lapses,
    state: n.state,
    last_review: now,
    introducedAt: card.introducedAt,
    recent: [...card.recent, rating !== Rating.Again].slice(-5),
    lastExercise: exercise,
    known: card.known,
    skills,
    retry: card.retry,
  }
  // Problemord, och ord som ännu inte klarat alla tre färdigheterna, kommer tillbaka redan
  // nästa dag – så att varje färdighet hinner prövas innan intervallen blir långa.
  const tomorrow = endOfDay(now)
  if (cap && (isProblem(next) || (next.state === State.Review && missingSkills(next).length > 0)) && next.due > tomorrow) {
    next.due = tomorrow
    next.scheduled_days = 1
  }
  return next
}

/** Om ordet ska repeteras i dag. Det räknas per dag (med dygnsgräns 04:00), inte per
 *  timme: ett ord som förfaller i eftermiddag går att repetera redan på morgonen. */
export function isDue(card: CardData, now: number): boolean {
  return card.state !== State.New && card.due < endOfDay(now)
}

/** Omprov efter ett fel: samma övning dagen efter och en gång till inom de tre följande dagarna. */
export function withRetry(card: CardData, type: ExerciseType, now: number, rnd: () => number = Math.random, single = false): CardData {
  const today = dayIndex(now)
  const keep = (card.retry ?? []).filter((r) => r.type !== type)
  // `single`: bara ett omprov i morgon – används när man blandat ihop två ord, vilket oftast
  // är en felklickning eller en tankeställare snarare än att man faktiskt inte kan ordet.
  const retries = single ? [{ type, day: today + 1 }] : [{ type, day: today + 1 }, { type, day: today + 2 + Math.floor(rnd() * 3) }]
  return { ...card, retry: [...keep, ...retries] }
}

/** Ett klarat omprov stryks (det tidigaste som har förfallit för den övningen). */
export function clearRetry(card: CardData, type: ExerciseType, now: number): CardData {
  const today = dayIndex(now)
  const list = card.retry ?? []
  const i = list.findIndex((r) => r.type === type && r.day <= today)
  if (i < 0) return card
  return { ...card, retry: list.filter((_, j) => j !== i) }
}

/** Omprov som ska göras i dag. */
export function dueRetries(card: CardData | undefined, now: number): Retry[] {
  const today = dayIndex(now)
  return (card?.retry ?? []).filter((r) => r.day <= today)
}

export type Status = 'new' | 'learning' | 'young' | 'mature'

/** Ett ord räknas som "Kan" först när det är inlärt och har klarat alla tre färdigheterna. */
export function statusOf(card: CardData | undefined): Status {
  if (!card || card.state === State.New) return 'new'
  if (card.state !== State.Review || missingSkills(card).length > 0) return 'learning'
  return card.stability >= 21 ? 'mature' : 'young'
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Nytt',
  learning: 'Lärs in',
  young: 'Kan',
  mature: 'Moget',
}

/** Ordningen ett nytt ord går igenom: flerval, dra till betydelse, lyssna, svenska → japanska
 *  och skriv på svenska. */
export const LEARNING_ORDER: ExerciseType[] = ['mc_ja_sv', 'match', 'listen', 'mc_sv_ja', 'type_sv']
/** Repetitioner turas om mellan de tre färdigheterna: skriva på japanska, förstå en uppläst
 *  mening och skriva betydelsen på svenska. */
export const REVIEW_ORDER: ExerciseType[] = ['type_from_sv', 'sentence', 'type_sv']
const SKILL_EXERCISE: Record<Skill, ExerciseType> = { write: 'type_from_sv', listen: 'sentence', read: 'type_sv' }

export interface PickOptions {
  /** Lyssningsövningar är avstängda just nu ("kan inte lyssna nu"). */
  noListen?: boolean
  /** Ordet har böjningsformer att öva på. */
  hasForms?: boolean
  rnd?: () => number
}

/** Vilka övningstyper som passar ordet just nu. Nya ord går igenom de enklare typerna
 *  en gång var; allt därefter är skriv- och lyssningsövningar. */
export function exercisesFor(_word: Word, card: CardData, opts: PickOptions = {}): ExerciseType[] {
  if (card.state === State.New) return ['mc_ja_sv']
  if (card.state === State.Learning) return [LEARNING_ORDER[Math.min(card.learning_steps, LEARNING_ORDER.length - 1)]]
  return opts.noListen ? REVIEW_ORDER.filter((e) => skillOf(e) !== 'listen') : REVIEW_ORDER
}

/** Väljer övning. Repetitioner tar först en färdighet som ordet ännu inte klarat; annars
 *  turas de om. Ibland – när grundformen sitter ordentligt – blir det en lucktext eller en
 *  mening med en böjd form av ordet, så att man känner igen det även när det låter annorlunda. */
export function pickExercise(word: Word, card: CardData, opts: PickOptions = {}): ExerciseType {
  const list = exercisesFor(word, card, opts)
  if (card.state === State.New || card.state === State.Learning) return list[0]
  const missing = missingSkills(card, opts.noListen ? ['listen'] : [])
  if (missing.length) {
    const first = SKILL_EXERCISE[missing[0]]
    // Undvik samma övning två gånger i rad om en annan färdighet också saknas.
    return first === card.lastExercise && missing.length > 1 ? SKILL_EXERCISE[missing[1]] : first
  }
  const rnd = opts.rnd ?? Math.random
  if (card.state === State.Review && card.stability >= 10) {
    const roll = rnd()
    if (opts.hasForms && !opts.noListen && roll < 0.25) return 'form'
    if (roll > 0.85) return 'cloze'
  }
  const next = list[card.reps % list.length]
  return next === card.lastExercise && list.length > 1 ? list[(card.reps + 1) % list.length] : next
}

export function formatDue(due: number, now: number): string {
  const d = due - now
  if (d <= 0) return 'nu'
  if (d < 3_600_000) return `om ${Math.max(1, Math.round(d / 60_000))} min`
  if (d < DAY) return `om ${Math.round(d / 3_600_000)} h`
  const days = Math.round(d / DAY)
  if (days < 60) return `om ${days} ${days === 1 ? 'dag' : 'dagar'}`
  return `om ${Math.round(days / 30)} mån`
}
