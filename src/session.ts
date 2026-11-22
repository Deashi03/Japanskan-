import { toHiragana, toKana } from 'wanakana'
import type { Snapshot } from './store'
import { isProblem, State } from './srs'
import type { ExerciseType, Word } from './types'
import { dayKey } from './stats'

export interface QItem {
  wordId: string
  kind: 'intro' | 'quiz'
  extra?: boolean
  /** Ordet håller på att läras in och ska bli klart före vanliga repetitioner. */
  learning?: boolean
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
    ...due.map((w): QItem => ({ wordId: w.id, kind: 'quiz', learning: snap.cards.get(w.id)!.state !== State.Review || undefined })),
  ].sort((a, b) => Number(isNewPhase(b)) - Number(isNewPhase(a)))
}

const isNewPhase = (q: QItem) => q.kind === 'intro' || !!q.learning

/** Efter ett introduktionskort kommer ordets första fråga ett steg senare. */
export function afterIntro(queue: QItem[], item: QItem): QItem[] {
  const rest = queue.filter((q) => q !== item)
  rest.splice(Math.min(1, rest.length), 0, { wordId: item.wordId, kind: 'quiz', learning: true })
  return rest
}

/** Fel svar kommer tillbaka snart. Ord som fortfarande lärs in kommer tillbaka efter några
 *  frågor, men före de vanliga repetitionerna, så att nya ord hinner få alla övningstyper.
 *  Övriga ord lämnar sessionen. */
export function requeue(queue: QItem[], items: { item: QItem; correct: boolean; stillLearning: boolean }[]): QItem[] {
  const gone = new Set(items.map((i) => i.item))
  const rest = queue.filter((q) => !gone.has(q))
  for (const { item, correct, stillLearning } of items) {
    if (item.extra) {
      if (!correct) rest.splice(Math.min(3, rest.length), 0, { ...item })
      continue
    }
    if (!stillLearning) continue
    let lead = 0
    while (lead < rest.length && isNewPhase(rest[lead])) lead++
    const pos = correct ? Math.max(lead, 2) : Math.max(Math.min(lead, 3), 2)
    rest.splice(Math.min(4, pos, rest.length), 0, { ...item, learning: true })
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
  | { type: 'type_sv' | 'type_from_sv'; word: Word }
  | { type: 'match'; word: Word; words: Word[]; graded: string[] }

/** Bygger en övning. Faller tillbaka på en enklare typ om det finns för få ord för svarsalternativ. */
export function buildExercise(
  type: ExerciseType,
  word: Word,
  all: Word[],
  partners: Word[] = [],
  rnd: () => number = Math.random,
  known?: Set<string>,
): Exercise {
  const others = all.filter((w) => w.id !== word.id && w.word !== word.word && w.meaning !== word.meaning)
  if (type === 'match') {
    const graded = [word, ...partners.filter((p) => p.id !== word.id)].slice(0, 4)
    const ids = new Set(graded.map((w) => w.id))
    const spare = shuffle(others.filter((w) => !ids.has(w.id)), rnd)
    // Fyll helst ut med ord man redan har sett, så att man inte ska para ihop okända ord.
    const fill = [...spare.filter((w) => known?.has(w.id)), ...spare.filter((w) => !known?.has(w.id))].slice(0, 4 - graded.length)
    const words = [...graded, ...fill]
    if (words.length >= 3) return { type, word, words: shuffle(words, rnd), graded: graded.map((w) => w.id) }
    type = 'mc_sv_ja'
  }
  if (type === 'mc_ja_sv' || type === 'mc_sv_ja') {
    const distractors = shuffle(others, rnd).slice(0, 3)
    if (distractors.length) return { type, word, options: shuffle([word, ...distractors], rnd) }
    type = 'type_sv'
  }
  return { type: type === 'type_from_sv' ? 'type_from_sv' : 'type_sv', word }
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

const JA = /[\u3040-\u30ff\u3400-\u9fff]/
const cleanSv = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.!?"'”“’…]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(att|en|ett|den|det|de) /, '')

/** De godkända svaren för en betydelse: varje alternativ åtskilt med / , ; eller punkt, utan parenteser. */
export function swedishAnswers(meaning: string): string[] {
  const out = new Set<string>()
  const noParens = meaning.replace(/\([^)]*\)|（[^）]*）/g, ' ')
  for (const part of noParens.split(/[\/;,.]| = | eller /)) {
    if (JA.test(part)) continue
    const c = cleanSv(part)
    if (c.length >= 2) out.add(c)
  }
  return [...out]
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

const FUNCTION_WORDS = new Set('över inte eller från till under efter utan något någon några vara bara göra blir bliv hade har hans hennes sina sitt deras detta denna dessa även också mycket lite andra annat annan inom utom genom mellan först sedan redan alltid aldrig'.split(' '))

/** Rättar ett svenskt svar generöst: små stavfel godkänns, och det räcker med ett av alternativen. */
export function checkSwedish(input: string, word: Word): boolean {
  const answer = cleanSv(input)
  if (answer.length < 2) return false
  const words = (s: string) => s.split(/[ \-]/)
  for (const alt of swedishAnswers(word.meaning)) {
    if (editDistance(answer, alt) <= Math.floor(Math.max(answer.length, alt.length) / 5)) return true
    // Böjningsformer: "polisen" för "polis", "grubblar" för "grubbla".
    const [short, long] = answer.length <= alt.length ? [answer, alt] : [alt, answer]
    if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2) return true
    // Svaret är ett helt innehållsord (minst fyra bokstäver) ur alternativet, eller tvärtom.
    if (answer.length >= 4 && !FUNCTION_WORDS.has(answer) && words(alt).includes(answer)) return true
    if (alt.length >= 4 && !FUNCTION_WORDS.has(alt) && words(answer).includes(alt)) return true
  }
  return false
}
