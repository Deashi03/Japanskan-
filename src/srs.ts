import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Grade } from 'ts-fsrs'
import type { CardData, ExerciseType, Word } from './types'

export { Rating, State }

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_fuzz: true,
    enable_short_term: true,
    // Ett nytt ord måste klaras fyra gånger i rad – en gång per övningstyp –
    // innan det går över till långa intervall.
    learning_steps: ['1m', '3m', '6m', '10m'],
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

/** Räknar ut FSRS-betyget automatiskt från om svaret var rätt och hur snabbt det gick. */
export function autoRating(card: CardData, correct: boolean, ms: number, exercise: ExerciseType): Grade {
  if (!correct) return Rating.Again
  const typing = exercise === 'type_sv' || exercise === 'type_from_sv'
  if (exercise === 'match') return Rating.Good
  const fast = typing ? 8000 : 3000
  const slow = typing ? 30000 : 12000
  if (ms > slow) return Rating.Hard
  // "Lätt" hoppar över inlärningssteg, så det ges bara till ord som redan är inlärda.
  if (ms < fast && card.state === State.Review && !isProblem(card)) return Rating.Easy
  return Rating.Good
}

export function schedule(card: CardData, rating: Grade, now: number, exercise: ExerciseType): CardData {
  const { card: n } = scheduler.next(
    { ...card, due: card.due, last_review: card.last_review },
    new Date(now),
    rating,
  )
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
  }
  // Problemord kommer tillbaka senast nästa dag tills de sitter.
  if (isProblem(next) && next.due > now + DAY) {
    next.due = now + DAY
    next.scheduled_days = 1
  }
  return next
}

export type Status = 'new' | 'learning' | 'young' | 'mature'

export function statusOf(card: CardData | undefined): Status {
  if (!card || card.state === State.New) return 'new'
  if (card.state !== State.Review) return 'learning'
  return card.stability >= 21 ? 'mature' : 'young'
}

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Nytt',
  learning: 'Lärs in',
  young: 'Kan',
  mature: 'Moget',
}

/** Ordningen ett nytt ord går igenom: flerval, dra till betydelse, svenska → japanska, skriv på svenska. */
export const LEARNING_ORDER: ExerciseType[] = ['mc_ja_sv', 'match', 'mc_sv_ja', 'type_sv']

/** Vilka övningstyper som passar ordet just nu – svårare ju bättre man kan det. */
export function exercisesFor(_word: Word, card: CardData): ExerciseType[] {
  if (card.state === State.New) return ['mc_ja_sv']
  if (card.state === State.Learning) return [LEARNING_ORDER[Math.min(card.learning_steps, LEARNING_ORDER.length - 1)]]
  if (card.state === State.Relearning) return ['type_sv', 'mc_sv_ja']
  if (card.stability < 7) return ['type_sv', 'mc_sv_ja', 'match']
  return ['type_from_sv', 'type_sv', 'mc_sv_ja']
}

export function pickExercise(word: Word, card: CardData): ExerciseType {
  const list = exercisesFor(word, card)
  const fresh = list.filter((e) => e !== card.lastExercise)
  return (fresh.length ? fresh : list)[0]
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
