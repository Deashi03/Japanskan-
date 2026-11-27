import { toHiragana, toKana } from 'wanakana'
import type { Snapshot } from './store'
import { dueRetries, isDue, isProblem, State } from './srs'
import type { Example, ExerciseType, Form, Word, WordExtra } from './types'
import { dayKey } from './days'

export interface QItem {
  wordId: string
  kind: 'intro' | 'quiz'
  /** Extra övning: påverkar inte schemat. */
  extra?: boolean
  /** Ordet håller på att läras in och ska bli klart före vanliga repetitioner. */
  learning?: boolean
  /** En bestämd övning – används för omprov efter ett fel. */
  force?: ExerciseType
  /** Omprov (efter ett fel i dag eller en tidigare dag) snarare än en vanlig repetition. */
  retry?: boolean
  /** Omprov i slutet av passet efter ett fel i just det här passet. */
  again?: boolean
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

/** Ord som ska repeteras i dag (påbörjade ord som förfaller i dag, eller har ett omprov i dag). */
export function dueWords(snap: Snapshot, now: number): Word[] {
  const out: Word[] = []
  for (const w of snap.words.values()) {
    if (w.suspended) continue
    const c = snap.cards.get(w.id)
    if (c && c.state !== State.New && (isDue(c, now) || dueRetries(c, now).length > 0)) out.push(w)
  }
  return out
}

export function countDue(snap: Snapshot, now: number) {
  let fresh = 0
  let chosen = 0
  for (const w of snap.words.values()) {
    if (w.suspended || snap.cards.has(w.id)) continue
    fresh++
    if (w.priority) chosen++
  }
  return { due: dueWords(snap, now).length, fresh, chosen, newNow: Math.min(fresh, newQuota(snap, now)) }
}

/** Alla nya (ej påbörjade) ord i den ordning de ska introduceras.
 *  Ord man själv valt går alltid först. Därefter styr inställningen: importordning,
 *  en viss lista först, eller växelvis ett ord ur varje lista. */
export function freshWords(snap: Snapshot, exclude: Set<string> = new Set()): Word[] {
  const fresh = [...snap.words.values()].filter((w) => !w.suspended && !snap.cards.has(w.id) && !exclude.has(w.id)).sort(byOrder)
  const from = snap.settings.newFrom
  if (!from) return fresh
  const chosen = fresh.filter((w) => w.priority)
  const rest = fresh.filter((w) => !w.priority)
  if (from !== '*') return [...chosen, ...rest.filter((w) => w.list === from), ...rest.filter((w) => w.list !== from)]
  const lists = new Map<string, Word[]>()
  for (const w of rest) lists.set(w.list, [...(lists.get(w.list) ?? []), w])
  const mixed: Word[] = []
  for (let i = 0; mixed.length < rest.length; i++) for (const words of lists.values()) if (words[i]) mixed.push(words[i])
  return [...chosen, ...mixed]
}

/** Sessionens kö: först nya ord (introduktionskort), sedan dagens repetitioner med mest
 *  försenade först. Ord med ett omprov i dag får den övning de gjorde fel på. */
export function buildQueue(snap: Snapshot, now: number): QItem[] {
  const unfinishedIntros: Word[] = []
  for (const w of snap.words.values()) {
    const c = snap.cards.get(w.id)
    if (!w.suspended && c?.state === State.New) unfinishedIntros.push(w)
  }
  const intros = [...unfinishedIntros, ...freshWords(snap).slice(0, newQuota(snap, now))]
  return [...intros.map((w): QItem => ({ wordId: w.id, kind: 'intro' })), ...reviewItems(snap, now)].sort(
    (a, b) => Number(isNewPhase(b)) - Number(isNewPhase(a)),
  )
}

/** Dagens repetitioner, mest försenade först. Ord med ett omprov i dag får den övning de gjorde fel på. */
function reviewItems(snap: Snapshot, now: number): QItem[] {
  const due = dueWords(snap, now).sort((a, b) => snap.cards.get(a.id)!.due - snap.cards.get(b.id)!.due)
  const reviews: QItem[] = []
  for (const w of due) {
    const c = snap.cards.get(w.id)!
    const retries = dueRetries(c, now)
    const learning = c.state !== State.Review || undefined
    if (isDue(c, now)) reviews.push({ wordId: w.id, kind: 'quiz', learning, force: retries[0]?.type, retry: retries.length > 0 || undefined })
    // Övriga omprov för ordet (en annan övning än den som redan står i kön).
    const rest = isDue(c, now) ? retries.slice(1) : retries
    for (const r of rest) reviews.push({ wordId: w.id, kind: 'quiz', force: r.type, retry: true })
  }
  return reviews
}

/** Kön för ett repetitionspass: bara ord som ska repeteras, inga nya ord och inga introduktionskort.
 *  Påbörjade ord som ännu inte är klara kommer först, som i ett vanligt pass. */
export function buildReviewQueue(snap: Snapshot, now: number): QItem[] {
  return reviewItems(snap, now).sort((a, b) => Number(isNewPhase(b)) - Number(isNewPhase(a)))
}

/** Hur många ord som är påbörjade och inte pausade, alltså kan repeteras eller övas extra. */
export function studiedCount(snap: Snapshot): number {
  let n = 0
  for (const w of snap.words.values()) {
    const c = snap.cards.get(w.id)
    if (!w.suspended && c && c.state !== State.New) n++
  }
  return n
}

const isNewPhase = (q: QItem) => q.kind === 'intro' || !!q.learning

/** Nästa nya ord som inte redan ligger i kön – används när man markerar ett ord som "kan redan". */
export function nextFresh(snap: Snapshot, queue: QItem[]): Word | undefined {
  return freshWords(snap, new Set(queue.map((q) => q.wordId)))[0]
}

/** Efter ett introduktionskort kommer ordets första fråga ett steg senare. */
export function afterIntro(queue: QItem[], item: QItem): QItem[] {
  const rest = queue.filter((q) => q !== item)
  rest.splice(Math.min(1, rest.length), 0, { wordId: item.wordId, kind: 'quiz', learning: true })
  return rest
}

export interface Answered {
  item: QItem
  correct: boolean
  /** Ordet håller fortfarande på att läras in (nytt ord som inte klarat alla steg). */
  stillLearning: boolean
  /** Övningen som gjordes – ett fel ger ett omprov med samma övning i slutet av passet. */
  type?: ExerciseType
}

/** Ordnar kön efter ett svar:
 *  - Nya ord som fortfarande lärs in kommer tillbaka efter några frågor, men före de vanliga
 *    repetitionerna, så att de hinner få alla övningstyper.
 *  - Ett fel ger dessutom ett omprov med exakt samma övning i slutet av passet.
 *  - Övriga ord lämnar passet. */
export function requeue(queue: QItem[], items: Answered[]): QItem[] {
  const gone = new Set(items.map((i) => i.item))
  let rest = queue.filter((q) => !gone.has(q))
  for (const { item, correct, stillLearning, type } of items) {
    if (stillLearning && !item.extra) {
      let lead = 0
      while (lead < rest.length && isNewPhase(rest[lead])) lead++
      const pos = correct ? Math.max(lead, 2) : Math.max(Math.min(lead, 3), 2)
      rest.splice(Math.min(4, pos, rest.length), 0, { wordId: item.wordId, kind: 'quiz', learning: true })
    }
    // Ett fel ger ett omprov i slutet av passet – men ett fel på själva omprovet ger inget
    // nytt (då skulle passet aldrig ta slut); det tas i stället om i morgon.
    if (!correct && type && !item.again) {
      // Bara ett omprov per ord och övning i slutet av passet.
      rest = rest.filter((q) => !(q.wordId === item.wordId && q.force === type && q.again))
      rest.push({ wordId: item.wordId, kind: 'quiz', force: type, retry: true, again: true, extra: item.extra })
    }
  }
  return rest
}

/** När tiden är ute: frågorna som behövs för att göra klart nya ord som redan påbörjats,
 *  och omproven efter dagens fel. Ord som inte hunnit presenteras och vanliga repetitioner väntar. */
export function overtimeQueue(queue: QItem[]): QItem[] {
  return queue.filter((q) => q.kind === 'quiz' && !q.extra && (q.learning || q.again))
}

/** Dagens repetitioner som återstår i kön (används för att fråga om man vill fortsätta). */
export function remainingReviews(queue: QItem[]): QItem[] {
  return queue.filter((q) => q.kind === 'quiz' && !q.extra && !q.learning && !q.again)
}

/** Extra övning när inget är schemalagt: ett slumpat urval bland alla ord man studerat, där
 *  problemord och svaga ord har något större chans att komma med. */
export function extraQueue(snap: Snapshot, rnd: () => number = Math.random, count = 10): QItem[] {
  const pool = [...snap.words.values()].filter((w) => {
    const c = snap.cards.get(w.id)
    return !w.suspended && c && c.state !== State.New
  })
  // Viktad dragning utan återläggning (Efraimidis–Spirakis): nyckel = slumptal^(1/vikt).
  const weight = (w: Word) => {
    const c = snap.cards.get(w.id)!
    return (isProblem(c) ? 3 : 1) * (c.stability < 7 ? 1.5 : 1)
  }
  return pool
    .map((w) => ({ w, key: Math.pow(rnd(), 1 / weight(w)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(({ w }) => ({ wordId: w.id, kind: 'quiz', extra: true }))
}

export type Exercise =
  | { type: 'mc_ja_sv' | 'mc_sv_ja' | 'listen'; word: Word; options: Word[] }
  | { type: 'sentence'; word: Word; example: Example; choices: string[] }
  | { type: 'form'; word: Word; form: Form; choices: string[] }
  /** Lucktext. `gap` är det som saknas i meningen: ordet självt, eller en böjd form av det
   *  (då är `form` satt och alternativen är grundformer). */
  | { type: 'cloze'; word: Word; example: Example; before: string; after: string; gap: string; gapReading: string; form?: Form; options: Word[] }
  | { type: 'type_sv' | 'type_from_sv'; word: Word }
  | { type: 'match'; word: Word; words: Word[]; graded: string[] }

export interface BuildOptions {
  partners?: Word[]
  rnd?: () => number
  /** Ord som redan introducerats – används helst som utfyllnad och svarsalternativ. */
  known?: Set<string>
  /** Om lyssningsövningar går att göra just nu. Annars blir de läs- eller skrivövningar. */
  canListen?: boolean
  /** Ordets alla exempelmeningar och böjningar, om de finns inlästa. */
  extra?: WordExtra
  /** Hur väl ordet sitter (FSRS-stabilitet i dagar). Styr hur svåra exempelmeningar som väljs. */
  stability?: number
}

/** Väljer en exempelmening efter hur väl ordet sitter: nya ord får enkla meningar, ord som
 *  sitter bra får svårare. Meningar på rätt nivå har klart störst chans, men grannnivåerna
 *  kan också komma, så att det inte blir enformigt. */
export function pickExample<T extends { level?: 1 | 2 | 3 }>(bank: T[], stability: number, rnd: () => number = Math.random): T | undefined {
  if (!bank.length) return undefined
  const target = stability < 5 ? 1 : stability < 21 ? 2 : 3
  const weights = bank.map((e) => {
    const d = Math.abs((e.level ?? 1) - target)
    return d === 0 ? 6 : d === 1 ? 1.5 : 0.25
  })
  let roll = rnd() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < bank.length; i++) if ((roll -= weights[i]) <= 0) return bank[i]
  return bank[bank.length - 1]
}

/** Svenska översättningar från andra ords meningar – felaktiga svarsalternativ. */
function wrongTranslations(others: Word[], correct: string, rnd: () => number): string[] {
  return [...new Set(shuffle(others, rnd).flatMap((w) => w.examples.slice(0, 1).map((e) => e.sv)))].filter((sv) => sv && sv !== correct).slice(0, 3)
}

/** Bygger en övning. Faller tillbaka på en enklare typ om ordet eller ordlistan inte räcker till. */
export function buildExercise(type: ExerciseType, word: Word, all: Word[], opts: BuildOptions = {}): Exercise {
  const { partners = [], rnd = Math.random, known, canListen = true, extra, stability = 0 } = opts
  const others = all.filter((w) => w.id !== word.id && w.word !== word.word && w.meaning !== word.meaning)
  const knownFirst = (list: Word[]) => [...list.filter((w) => known?.has(w.id)), ...list.filter((w) => !known?.has(w.id))]
  // Repetitionerna använder hela meningsbanken; de två enkla meningarna från introduktionen
  // kommer bara med om det inte finns några andra.
  const bank = (extra?.examples.length ? extra.examples : word.examples).filter((e) => e.ja && e.sv)

  if (type === 'form') {
    const forms = (extra?.forms ?? []).filter((f) => f.ex?.ja && f.ex?.sv)
    const form = forms.length ? forms[Math.floor(rnd() * forms.length)] : undefined
    const wrong = form ? wrongTranslations(others, form.ex.sv, rnd) : []
    if (form && wrong.length && canListen) return { type, word, form, choices: shuffle([form.ex.sv, ...wrong], rnd) }
    type = 'sentence'
  }
  if (type === 'sentence') {
    const example = pickExample(bank, stability, rnd)
    const wrong = example ? wrongTranslations(others, example.sv, rnd) : []
    if (example && wrong.length && canListen) return { type, word, example, choices: shuffle([example.sv, ...wrong], rnd) }
    type = canListen ? 'listen' : 'type_sv'
  }
  if (type === 'cloze') {
    // Meningar där ordet står som det är, och – för böjbara ord – meningar med en böjd form.
    // Är ordet böjt får man välja grundformen, så att man måste känna igen formen.
    const plain = bank.filter((e) => e.ja.includes(word.word)).map((e) => ({ example: e, gap: word.word, gapReading: word.reading, form: undefined as Form | undefined }))
    const inflected = (extra?.forms ?? [])
      .filter((f) => f.ex?.ja && f.ja && f.ex.ja.includes(f.ja) && f.ja !== word.word)
      .map((f) => ({ example: f.ex, gap: f.ja, gapReading: f.reading, form: f as Form | undefined }))
    const useForm = inflected.length > 0 && (plain.length === 0 || rnd() < 0.5)
    const pool = useForm ? inflected : plain
    const pickLevel = pickExample(pool.map((p) => ({ ...p, level: p.example.level })), stability, rnd)
    const distractors = knownFirst(shuffle(others, rnd)).slice(0, 3)
    if (pickLevel && distractors.length) {
      const at = pickLevel.example.ja.indexOf(pickLevel.gap)
      return {
        type,
        word,
        example: pickLevel.example,
        before: pickLevel.example.ja.slice(0, at),
        after: pickLevel.example.ja.slice(at + pickLevel.gap.length),
        gap: pickLevel.gap,
        gapReading: pickLevel.gapReading,
        form: pickLevel.form,
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

/** Alla sätt att skriva ett japanskt svar som ska räknas som samma sak. */
function japaneseForms(input: string): string[] {
  const raw = input.trim()
  // Romaji tolkas både direkt ("hannin") och på tangentbordsvis ("hannnin").
  return [raw.replace(/[\s\u3000]/g, ''), norm(raw), norm(toKana(raw.toLowerCase(), { IMEMode: true }))]
}

const matchesWord = (forms: string[], w: Pick<Word, 'word' | 'reading'>) =>
  forms.includes(w.word.replace(/[\s\u3000〜～]/g, '')) || forms.includes(norm(w.word)) || forms.includes(norm(w.reading))

/** Rättar ett japanskt svar. Godkänt är ordets vanliga skrivsätt, bara hiragana (eller
 *  katakana/romaji), ordets egna japanska alternativ – och, om `all` ges, vilket annat ord
 *  i ordlistan som helst som betyder samma sak på svenska (en synonym). */
export function checkReading(input: string, word: Word, all: Iterable<Word> = []): boolean {
  if (!input.trim()) return false
  const forms = japaneseForms(input)
  if (matchesWord(forms, word)) return true
  if (word.altJa?.some((alt) => matchesWord(forms, { word: alt, reading: alt }))) return true
  const mine = new Set(swedishAnswers(word.meaning))
  for (const other of all) {
    if (other.id === word.id || !matchesWord(forms, other)) continue
    if (swedishAnswers(other.meaning).some((x) => mine.has(x))) return true
  }
  return false
}

/** Betydelsen utan japanska inslag – används när den svenska betydelsen är själva frågan,
 *  så att exempel som "気に病むな = …" inte avslöjar svaret. */
export function meaningPrompt(meaning: string): string {
  const JA_CHAR = /[\u3040-\u30ff\u3400-\u9fff]/
  if (!JA_CHAR.test(meaning)) return meaning
  const kept = meaning
    .replace(/\s*\([^)]*\)|\s*（[^）]*）/g, (m) => (JA_CHAR.test(m) ? '' : m))
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !JA_CHAR.test(sentence))
    .join(' ')
    .trim()
  return kept.length >= 3 ? kept : meaning.replace(/[\u3040-\u30ff\u3400-\u9fff〜～ー]+/g, '…')
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

/** Ledtråd i skrivövningarna: första tecknet i svaret och hur långt det är. */
export function hintFor(word: Word, toJapanese: boolean): string {
  if (toJapanese) {
    const reading = word.reading.replace(/[\s\u3000]/g, '')
    const chars = [...reading]
    // Små tecken (ゃゅょっ) hör ihop med tecknet före och visas tillsammans med det.
    const first = chars[0] + (/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/.test(chars[1] ?? '') ? chars[1] : '')
    return first + '・'.repeat(Math.max(0, chars.length - [...first].length))
  }
  const answer = swedishAnswers(word.meaning)[0] ?? ''
  return answer ? answer[0].toUpperCase() + answer.slice(1).replace(/[^\s-]/g, '·') : ''
}


// ---------------------------------------------------------------- Förväxlingar

/** Betydelsen i kort form för att visas i en liten ruta: högst två alternativ, utan
 *  japanska inslag, parenteser och slutpunkt. */
export function shortMeaning(meaning: string, max = 56): string {
  const clean = meaningPrompt(meaning)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = clean.split(/\s\/\s|[.;]\s/).map((p) => p.trim().replace(/[.]+$/, '')).filter(Boolean)
  const short = parts.slice(0, 2).join(' / ') || clean.replace(/[.]+$/, '')
  return short.length > max ? short.slice(0, max - 1).trimEnd() + '…' : short
}

/** Strikt jämförelse av ett svenskt svar med ett ords betydelser (exakt träff, eller ett enda
 *  tecken fel i längre svar). Den generösa rättningen används för att godkänna svar; här vill
 *  vi däremot vara säkra på att svaret verkligen hör till ett annat ord. */
function swedishMatchesStrict(input: string, word: Word): boolean {
  const answer = cleanSv(input)
  if (answer.length < 3) return false
  const alternatives = [...swedishAnswers(word.meaning), ...(word.synonyms ?? []).map(cleanSv)].filter((x) => x.length >= 3)
  return alternatives.some((alt) => alt === answer || (answer.length >= 5 && alt.length >= 5 && editDistance(answer, alt) <= 1))
}

/** Hittar ett annat ord som ett felaktigt skrivet svar faktiskt hör till – alltså en
 *  förväxling. `toJapanese`: svaret var japanskt (annars svenskt). Ord man redan börjat
 *  lära sig föredras, eftersom det är dem en förväxling säger något om. */
export function findConfusion(input: string, word: Word, all: Iterable<Word>, toJapanese: boolean, started: (id: string) => boolean = () => false): Word | undefined {
  if (!input.trim()) return undefined
  const forms = toJapanese ? japaneseForms(input) : []
  const hits: Word[] = []
  for (const other of all) {
    if (other.id === word.id || other.word === word.word) continue
    const hit = toJapanese ? matchesWord(forms, other) : swedishMatchesStrict(input, other)
    if (hit) hits.push(other)
  }
  return hits.find((w) => started(w.id)) ?? hits[0]
}
