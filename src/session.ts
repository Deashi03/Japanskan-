import { toHiragana, toKana } from 'wanakana'
import type { Snapshot } from './store'
import { isProblem, State } from './srs'
import type { ExerciseType, Word } from './types'
import { dayKey } from './stats'

export interface QItem {
  wordId: string
  kind: 'intro' | 'quiz'
  extra?: boolean
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const byOrder = (a: Word, b: Word) => a.createdAt - b.createdAt || a.order - b.order

/** Hur många nya ord som får introduceras i en session som startar nu. */
export function newQuota(snap: Snapshot, now: number): number {
  const { newPerSession, dailyNewCap } = snap.settings
  if (dailyNewCap <= 0) return newPerSession
  const today = dayKey(now)
  let introducedToday = 0
  for (const c of snap.cards.values()) if (dayKey(c.introducedAt) === today) introducedToday++
  return Math.max(0, Math.min(newPerSession, dailyNewCap - introducedToday))
}

export function countDue(snap: Snapshot, now: number) {
  let due = 0
  let fresh = 0
  for (const w of snap.words.values()) {
    if (w.suspended) continue
    const c = snap.cards.get(w.id)
    if (!c) fresh++
    else if (c.due <= now) due++
  }
  return { due, fresh, newNow: Math.min(fresh, newQuota(snap, now)) }
}

/** Sessionens kö: först nya ord (introduktionskort), sedan repetitioner med mest försenade först. */
export function buildQueue(snap: Snapshot, now: number): QItem[] {
  const active = [...snap.words.values()].filter((w) => !w.suspended)
  const unfinishedIntros: Word[] = []
  const due: Word[] = []
  const fresh: Word[] = []
  for (const w of active) {
    const c = snap.cards.get(w.id)
    if (!c) fresh.push(w)
    else if (c.state === State.New) unfinishedIntros.push(w)
    else if (c.due <= now) due.push(w)
  }
  fresh.sort(byOrder)
  due.sort((a, b) => snap.cards.get(a.id)!.due - snap.cards.get(b.id)!.due)
  const intros = [...unfinishedIntros, ...fresh.slice(0, newQuota(snap, now))]
  return [
    ...intros.map((w): QItem => ({ wordId: w.id, kind: 'intro' })),
    ...due.map((w): QItem => ({ wordId: w.id, kind: 'quiz' })),
  ]
}

/** Efter ett introduktionskort kommer ordets första fråga ett steg senare. */
export function afterIntro(queue: QItem[], item: QItem): QItem[] {
  const rest = queue.filter((q) => q !== item)
  rest.splice(Math.min(1, rest.length), 0, { wordId: item.wordId, kind: 'quiz' })
  return rest
}

/** Fel svar kommer tillbaka snart, ord som fortfarande lärs in lite senare, resten lämnar sessionen. */
export function requeue(queue: QItem[], items: { item: QItem; correct: boolean; stillLearning: boolean }[]): QItem[] {
  const gone = new Set(items.map((i) => i.item))
  const rest = queue.filter((q) => !gone.has(q))
  for (const { item, correct, stillLearning } of items) {
    if (!correct) rest.splice(Math.min(3, rest.length), 0, { ...item })
    else if (stillLearning && !item.extra) rest.splice(Math.min(6, rest.length), 0, { ...item })
  }
  return rest
}

/** Extra övning när inget är schemalagt: problemord först, sedan de svagaste orden. */
export function extraQueue(snap: Snapshot, rnd: () => number = Math.random): QItem[] {
  const pool = [...snap.words.values()].filter((w) => {
    const c = snap.cards.get(w.id)
    return !w.suspended && c && c.state !== State.New
  })
  pool.sort((a, b) => {
    const ca = snap.cards.get(a.id)!
    const cb = snap.cards.get(b.id)!
    return Number(isProblem(cb)) - Number(isProblem(ca)) || ca.stability - cb.stability
  })
  return shuffle(pool.slice(0, 10), rnd).map((w) => ({ wordId: w.id, kind: 'quiz', extra: true }))
}

export type Exercise =
  | { type: 'mc_ja_sv' | 'mc_sv_ja'; word: Word; options: Word[] }
  | { type: 'type_reading' | 'type_from_sv'; word: Word }
  | { type: 'match'; word: Word; words: Word[]; graded: string[] }

/** Bygger en övning. Faller tillbaka på en enklare typ om det finns för få ord för svarsalternativ. */
export function buildExercise(
  type: ExerciseType,
  word: Word,
  all: Word[],
  partners: Word[] = [],
  rnd: () => number = Math.random,
): Exercise {
  const others = all.filter((w) => w.id !== word.id && w.word !== word.word && w.meaning !== word.meaning)
  if (type === 'match') {
    const graded = [word, ...partners.filter((p) => p.id !== word.id)].slice(0, 4)
    const ids = new Set(graded.map((w) => w.id))
    const fill = shuffle(others.filter((w) => !ids.has(w.id)), rnd).slice(0, 4 - graded.length)
    const words = [...graded, ...fill]
    if (words.length >= 3) return { type, word, words: shuffle(words, rnd), graded: graded.map((w) => w.id) }
    type = 'mc_sv_ja'
  }
  if (type === 'mc_ja_sv' || type === 'mc_sv_ja') {
    const distractors = shuffle(others, rnd).slice(0, 3)
    if (distractors.length) return { type, word, options: shuffle([word, ...distractors], rnd) }
    type = 'type_from_sv'
  }
  return { type: type as 'type_reading' | 'type_from_sv', word }
}

const norm = (s: string) => toHiragana(s, { convertLongVowelMark: false }).replace(/[\s　・.。、,]/g, '')

export function checkReading(input: string, word: Word): boolean {
  const target = norm(word.reading)
  // Romaji tolkas både direkt ("hannin") och på tangentbordsvis ("hannnin").
  const candidates = [norm(input), norm(toKana(input.trim().toLowerCase(), { IMEMode: true }))]
  return input.trim().length > 0 && (candidates.includes(target) || input.trim() === word.word)
}

/** Det som visas medan man skriver: romaji omvandlat till hiragana. */
export const kanaPreview = (input: string) => toHiragana(input.trim().toLowerCase(), { convertLongVowelMark: false })
