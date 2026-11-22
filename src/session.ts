import { toHiragana, toKana } from 'wanakana'
import type { Snapshot } from './store'
import { isProblem, State } from './srs'
import type { Example, ExerciseType, Word } from './types'
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

/** Nya ord introduceras i den ordning de importerades – men ord man själv valt går före,
 *  i den ordning de valdes. */
export const byOrder = (a: Word, b: Word) =>
  Number(!a.priority) - Number(!b.priority) || (a.priority ?? 0) - (b.priority ?? 0) || a.createdAt - b.createdAt || a.order - b.order

/** Hur många nya ord som får introduceras i en session som startar nu. */
export function newQuota(snap: Snapshot, now: number): number {
  const { newPerSession, dailyNewCap } = snap.settings
  if (dailyNewCap <= 0) return newPerSession
  const today = dayKey(now)
  let introducedToday = 0
  for (const c of snap.cards.values()) if (!c.known && dayKey(c.introducedAt) === today) introducedToday++
  return Math.max(0, Math.min(newPerSession, dailyNewCap - introducedToday))
}

export function countDue(snap: Snapshot, now: number) {
  let due = 0
  let fresh = 0
  let chosen = 0
  for (const w of snap.words.values()) {
    if (w.suspended) continue
    const c = snap.cards.get(w.id)
    if (!c) {
      fresh++
      if (w.priority) chosen++
    } else if (c.due <= now) due++
  }
  return { due, fresh, chosen, newNow: Math.min(fresh, newQuota(snap, now)) }
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

/** Nästa nya ord som inte redan ligger i kön – används när man markerar ett ord som "kan redan". */
export function nextFresh(snap: Snapshot, queue: QItem[]): Word | undefined {
  const queued = new Set(queue.map((q) => q.wordId))
  return [...snap.words.values()]
    .filter((w) => !w.suspended && !snap.cards.has(w.id) && !queued.has(w.id))
    .sort(byOrder)[0]
}

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
  | { type: 'mc_ja_sv' | 'mc_sv_ja' | 'listen'; word: Word; options: Word[] }
  | { type: 'sentence'; word: Word; example: Example; choices: string[] }
  | { type: 'cloze'; word: Word; example: Example; before: string; after: string; options: Word[] }
  | { type: 'type_sv' | 'type_from_sv'; word: Word }
  | { type: 'match'; word: Word; words: Word[]; graded: string[] }

export interface BuildOptions {
  partners?: Word[]
  rnd?: () => number
  /** Ord som redan introducerats – används helst som utfyllnad och svarsalternativ. */
  known?: Set<string>
  /** Om enheten kan läsa upp japanska. Utan det byts lyssningsövningar mot läsövningar. */
  canListen?: boolean
}

/** Bygger en övning. Faller tillbaka på en enklare typ om ordet eller ordlistan inte räcker till. */
export function buildExercise(type: ExerciseType, word: Word, all: Word[], opts: BuildOptions = {}): Exercise {
  const { partners = [], rnd = Math.random, known, canListen = true } = opts
  const others = all.filter((w) => w.id !== word.id && w.word !== word.word && w.meaning !== word.meaning)
  const knownFirst = (list: Word[]) => [...list.filter((w) => known?.has(w.id)), ...list.filter((w) => !known?.has(w.id))]

  if (type === 'sentence') {
    const usable = word.examples.filter((e) => e.ja && e.sv)
    const example = usable.length ? usable[Math.floor(rnd() * usable.length)] : undefined
    const wrong = [...new Set(shuffle(others, rnd).flatMap((w) => w.examples.slice(0, 1).map((e) => e.sv)))]
      .filter((sv) => sv && sv !== example?.sv)
      .slice(0, 3)
    if (example && wrong.length && canListen) return { type, word, example, choices: shuffle([example.sv, ...wrong], rnd) }
    type = 'listen'
  }
  if (type === 'cloze') {
    const example = shuffle(word.examples, rnd).find((e) => e.ja.includes(word.word))
    const distractors = knownFirst(shuffle(others, rnd)).slice(0, 3)
    if (example && distractors.length) {
      const at = example.ja.indexOf(word.word)
      return {
        type,
        word,
        example,
        before: example.ja.slice(0, at),
        after: example.ja.slice(at + word.word.length),
        options: shuffle([word, ...distractors], rnd),
      }
    }
    type = 'mc_sv_ja'
  }
  if (type === 'listen' && !canListen) type = 'mc_ja_sv'
  if (type === 'match') {
    const graded = [word, ...partners.filter((p) => p.id !== word.id)].slice(0, 4)
    const ids = new Set(graded.map((w) => w.id))
    // Fyll helst ut med ord man redan har sett, så att man inte ska para ihop okända ord.
    const fill = knownFirst(shuffle(others.filter((w) => !ids.has(w.id)), rnd)).slice(0, 4 - graded.length)
    const words = [...graded, ...fill]
    if (words.length >= 3) return { type, word, words: shuffle(words, rnd), graded: graded.map((w) => w.id) }
    type = 'mc_sv_ja'
  }
  if (type === 'mc_ja_sv' || type === 'mc_sv_ja' || type === 'listen') {
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
  const alternatives = [...swedishAnswers(word.meaning), ...(word.synonyms ?? []).map(cleanSv).filter((x) => x.length >= 2)]
  for (const alt of alternatives) {
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
