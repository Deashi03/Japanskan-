import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseWordFile, splitDuplicates } from './importer'
import { autoRating, exercisesFor, isProblem, knownCard, LEARNING_ORDER, newCard, pickExercise, Rating, schedule, State } from './srs'
import { afterIntro, buildExercise, buildQueue, checkReading, checkSwedish, extraQueue, nextFresh, newQuota, requeue, type QItem } from './session'
import { dayKey, streaks } from './stats'
import { isDark } from './fx'
import type { Snapshot } from './store'
import { DEFAULT_SETTINGS, type CardData, type Word } from './types'

const word = (i: number, extra: Partial<Word> = {}): Word => ({
  id: 'w' + i, word: '語' + i, reading: 'ご' + i, meaning: 'betydelse ' + i,
  breakdown: [], examples: [], distinctions: [], list: 'L', createdAt: 1, order: i, ...extra,
})
const snapOf = (words: Word[], cards: [string, CardData][] = [], settings = DEFAULT_SETTINGS): Snapshot => ({
  version: 1, words: new Map(words.map((w) => [w.id, w])), cards: new Map(cards), logs: new Map(), settings,
})
const NOW = new Date(2026, 10, 22, 12).getTime()
const DAY = 86_400_000

describe('import', () => {
  const sample = { version: 1, words: [{ word: '冤罪', reading: 'えんざい', meaning: 'Felaktig dom', breakdown: [{ kanji: '冤', reading: 'えん', meaning: 'orättvisa' }], examples: [{ ja: '彼は冤罪を訴えている。', reading: 'かれは', sv: 'Han hävdar' }], distinctions: [] }] }
  it('läser en giltig fil', () => {
    const r = parseWordFile(JSON.stringify(sample))
    expect(r.errors).toEqual([])
    expect(r.words[0].breakdown[0].kanji).toBe('冤')
  })
  it('klarar kodblock och text runt omkring', () => {
    expect(parseWordFile('Här är filen:\n```json\n' + JSON.stringify(sample) + '\n```\nKlart!').words).toHaveLength(1)
    expect(parseWordFile('Här: ' + JSON.stringify(sample)).words).toHaveLength(1)
  })
  it('rapporterar fel per ord men importerar resten', () => {
    const r = parseWordFile(JSON.stringify({ words: [{ word: 'a', reading: 'a' }, sample.words[0]] }))
    expect(r.words).toHaveLength(1)
    expect(r.errors[0]).toContain('"meaning"')
  })
  it('ogiltig JSON ger fel', () => expect(parseWordFile('{oj').errors).toHaveLength(1))
  it('hittar dubbletter', () => {
    const p = parseWordFile(JSON.stringify({ words: [sample.words[0], sample.words[0], { word: '語1', reading: 'ご', meaning: 'x' }] })).words
    const { fresh, duplicates } = splitDuplicates(p, [word(1)])
    expect(fresh).toHaveLength(1)
    expect(duplicates).toHaveLength(2)
  })
  it('läser synonymer och ger dem till ord som redan finns, utan att ändra något annat', () => {
    const file = { words: [{ word: '語1', reading: 'ご', meaning: 'ANNAN TEXT', synonyms: ['a', 'b', 'a', ' '] }, { word: 'ny', reading: 'にゅう', meaning: 'ny', synonyms: ['färsk'] }] }
    const parsed = parseWordFile(JSON.stringify(file)).words
    expect(parsed[0].synonyms).toEqual(['a', 'b'])
    const old = word(1, { synonyms: ['b', 'egen'] })
    const { fresh, updates } = splitDuplicates(parsed, [old])
    expect(fresh.map((w) => w.word)).toEqual(['ny'])
    expect(updates).toEqual([{ ...old, synonyms: ['b', 'egen', 'a'] }])
    // Har ordet redan alla synonymer händer ingenting.
    expect(splitDuplicates(parsed, [updates[0]]).updates).toEqual([])
    expect(parseWordFile(JSON.stringify(sample)).words[0].synonyms).toEqual([])
  })
})

describe('schemaläggning', () => {
  it('ett nytt ord går igenom alla fem övningstyper innan det blir inlärt', () => {
    let c = newCard(NOW)
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      const type = pickExercise(word(1), c)
      seen.push(type)
      c = schedule(c, Rating.Good, NOW + i * 60_000, type)
      expect(c.state).toBe(i < 4 ? State.Learning : State.Review)
    }
    expect(seen).toEqual(['mc_ja_sv', 'match', 'listen', 'mc_sv_ja', 'type_sv'])
    expect(c.due).toBeGreaterThan(NOW + DAY / 2)
  })
  it('fel svar under inlärningen börjar om från första övningstypen', () => {
    let c = schedule(newCard(NOW), Rating.Good, NOW, 'mc_ja_sv')
    c = schedule(c, Rating.Good, NOW, 'match')
    c = schedule(c, Rating.Again, NOW, 'listen')
    expect(pickExercise(word(1), c)).toBe('mc_ja_sv')
  })
  it('inlärda ord växlar mellan sina övningstyper och får aldrig dra-övning eller kanjiläsning', () => {
    const young = { ...newCard(NOW), state: State.Review, stability: 3 }
    const mature = { ...young, stability: 30 }
    for (const base of [young, mature]) {
      const list = exercisesFor(word(1), base)
      expect(list).not.toContain('match')
      expect(list).not.toContain('type_reading')
      const picked = new Set(list.map((_, reps) => pickExercise(word(1), { ...base, reps })))
      expect(picked).toEqual(new Set(list))
    }
    expect(exercisesFor(word(1), mature)).toContain('sentence')
    expect(exercisesFor(word(1), young)).toContain('listen')
  })
  it('”kan redan” hoppar över inlärningen, ger ett intervall på flera dagar och räknas inte i dagens kvot', () => {
    const c = knownCard(NOW)
    expect(c.state).toBe(State.Review)
    expect(c.due).toBeGreaterThan(NOW + 2 * DAY)
    expect(c.known).toBe(true)
    const snap = snapOf([word(0), word(1), word(2)], [['w0', c]], { ...DEFAULT_SETTINGS, dailyNewCap: 5 })
    expect(newQuota(snap, NOW)).toBe(5)
    expect(nextFresh(snap, [{ wordId: 'w1', kind: 'intro' }])?.id).toBe('w2')
    expect(nextFresh(snap, [{ wordId: 'w1', kind: 'intro' }, { wordId: 'w2', kind: 'intro' }])).toBeUndefined()
    // Flaggan följer med när ordet repeteras.
    expect(schedule(c, Rating.Good, NOW + 5 * DAY, 'type_sv').known).toBe(true)
  })
  it('betyg räknas ut från rätt/fel och tid', () => {
    const fresh = newCard(NOW)
    const review = { ...fresh, state: State.Review }
    expect(autoRating(fresh, false, 1000, 'mc_ja_sv')).toBe(Rating.Again)
    expect(autoRating(fresh, true, 1000, 'mc_ja_sv')).toBe(Rating.Good)
    expect(autoRating(review, true, 1000, 'mc_ja_sv')).toBe(Rating.Easy)
    expect(autoRating(review, true, 20000, 'mc_ja_sv')).toBe(Rating.Hard)
    expect(autoRating(review, true, 5000, 'type_sv')).toBe(Rating.Easy)
    // Långsam skrivning straffas inte.
    expect(autoRating(review, true, 90_000, 'type_sv')).toBe(Rating.Good)
    expect(autoRating(review, true, 90_000, 'type_from_sv')).toBe(Rating.Good)
    expect(autoRating(review, true, 30_000, 'listen')).toBe(Rating.Hard)
  })
  it('problemord flaggas, återkommer inom ett dygn och friskförklaras efter tre rätt i rad', () => {
    let c: CardData = { ...newCard(NOW), state: State.Review, stability: 30, difficulty: 5, reps: 5, last_review: NOW - 30 * DAY, recent: [true, true, true] }
    c = schedule(c, Rating.Again, NOW, 'mc_sv_ja')
    expect(isProblem(c)).toBe(false)
    c = schedule(c, Rating.Good, NOW + 600_000, 'mc_sv_ja')
    c = schedule(c, Rating.Again, NOW + 2 * DAY, 'mc_sv_ja')
    expect(isProblem(c)).toBe(true)
    let t = NOW + 2 * DAY
    for (let i = 0; i < 2; i++) {
      t += 600_000
      c = schedule(c, Rating.Good, t, 'mc_sv_ja')
      expect(isProblem(c)).toBe(true)
      expect(c.due).toBeLessThanOrEqual(t + DAY)
    }
    c = schedule(c, Rating.Good, t + DAY, 'mc_sv_ja')
    expect(isProblem(c)).toBe(false)
  })
})

describe('session', () => {
  const words = Array.from({ length: 12 }, (_, i) => word(i))
  it('fem nya ord först, sedan repetitioner med mest försenade först', () => {
    const review = (due: number): CardData => ({ ...newCard(NOW - 10 * DAY), state: State.Review, due })
    const snap = snapOf(words, [['w10', review(NOW - DAY)], ['w11', review(NOW - 3 * DAY)], ['w9', review(NOW + DAY)]])
    const q = buildQueue(snap, NOW)
    expect(q.slice(0, 5)).toEqual([0, 1, 2, 3, 4].map((i) => ({ wordId: 'w' + i, kind: 'intro' })))
    expect(q.slice(5)).toEqual([{ wordId: 'w11', kind: 'quiz', learning: undefined }, { wordId: 'w10', kind: 'quiz', learning: undefined }])
  })
  it('pausade ord hoppas över och dagstaket respekteras', () => {
    const snap = snapOf([word(0, { suspended: true }), word(1), word(2)], [['w1', { ...newCard(NOW), state: State.Review, due: NOW + DAY }]], { ...DEFAULT_SETTINGS, dailyNewCap: 1 })
    expect(newQuota(snap, NOW)).toBe(0)
    expect(buildQueue(snap, NOW)).toEqual([])
  })
  it('frågan kommer strax efter introduktionen', () => {
    const q: QItem[] = [0, 1, 2, 3, 4].map((i) => ({ wordId: 'w' + i, kind: 'intro' }))
    expect(afterIntro(q, q[0])[1]).toEqual({ wordId: 'w0', kind: 'quiz', learning: true })
  })
  it('ord som lärs in kommer tillbaka före vanliga repetitioner', () => {
    const review = (i: number): QItem => ({ wordId: 'r' + i, kind: 'quiz' })
    const learn = (i: number): QItem => ({ wordId: 'n' + i, kind: 'quiz', learning: true })
    const q = [learn(0), learn(1), review(0), review(1), review(2), review(3), review(4)]
    // Rätt svar: tillbaka efter de andra nya orden men med högst ett par repetitioner emellan.
    const right = requeue(q, [{ item: q[0], correct: true, stillLearning: true }])
    expect(right.map((i) => i.wordId)).toEqual(['n1', 'r0', 'n0', 'r1', 'r2', 'r3', 'r4'])
    // Fel svar kommer också tillbaka snart.
    const wrong = requeue(q, [{ item: q[0], correct: false, stillLearning: true }])
    expect(wrong.findIndex((i) => i.wordId === 'n0')).toBeLessThanOrEqual(3)
    // Färdiga ord lämnar passet.
    expect(requeue(q, [{ item: q[0], correct: true, stillLearning: false }]).some((i) => i.wordId === 'n0')).toBe(false)
    // Många nya ord: det besvarade hamnar bakom de närmaste, aldrig bakom repetitionerna.
    const many = [learn(0), learn(1), learn(2), learn(3), learn(4), learn(5), review(0)]
    expect(requeue(many, [{ item: many[0], correct: true, stillLearning: true }]).map((i) => i.wordId).indexOf('n0')).toBe(4)
  })
  it('ett helt pass ger varje nytt ord alla övningstyper före första repetitionen', () => {
    const reviewCard = (): CardData => ({ ...newCard(NOW - 10 * DAY), state: State.Review, stability: 5, due: NOW - DAY })
    const cards = new Map<string, CardData>(words.slice(5).map((w) => [w.id, reviewCard()]))
    const snap = snapOf(words, [...cards])
    let q = buildQueue(snap, NOW)
    const types = new Map<string, string[]>()
    let firstReviewAt = -1
    for (let step = 0; q.length && step < 200; step++) {
      const item = q[0]
      if (item.kind === 'intro') {
        cards.set(item.wordId, newCard(NOW))
        q = afterIntro(q, item)
        continue
      }
      const c = cards.get(item.wordId)!
      if (!item.learning) {
        if (firstReviewAt < 0) firstReviewAt = step
        q = requeue(q, [{ item, correct: true, stillLearning: false }])
        continue
      }
      const type = pickExercise(words[0], c)
      types.set(item.wordId, [...(types.get(item.wordId) ?? []), type])
      const next = schedule(c, Rating.Good, NOW, type)
      cards.set(item.wordId, next)
      q = requeue(q, [{ item, correct: true, stillLearning: next.state !== State.Review }])
    }
    expect(types.size).toBe(5)
    for (const t of types.values()) expect(t).toEqual(LEARNING_ORDER)
    expect(q).toEqual([])
    // Högst ett par repetitioner hinner smita emellan innan alla nya ord är klara.
    const answered = [...types.values()].flat().length
    expect(firstReviewAt).toBeGreaterThan(answered - 8)
  })
  it('extra övning tar problemord först', () => {
    const c = (recent: boolean[], stability: number): CardData => ({ ...newCard(NOW), state: State.Review, recent, stability })
    const cards = words.map((w, i): [string, CardData] => [w.id, c(i === 11 ? [false, false] : [true], i + 1)])
    const ids = extraQueue(snapOf(words, cards)).map((q) => q.wordId)
    expect(ids).toHaveLength(10)
    expect(ids).toContain('w11')
    expect(ids).not.toContain('w10')
  })
  it('övningar faller tillbaka när det finns för få ord', () => {
    expect(buildExercise('mc_ja_sv', words[0], [words[0]]).type).toBe('type_sv')
    expect(buildExercise('match', words[0], words.slice(0, 2)).type).toBe('mc_sv_ja')
    const m = buildExercise('match', words[0], words, { partners: [words[1]] })
    expect(m.type === 'match' && m.words.length === 4 && m.graded).toEqual(['w0', 'w1'])
    const filled = buildExercise('match', words[0], words, { partners: [words[1]], known: new Set(['w7', 'w8']) })
    expect(filled.type === 'match' && filled.words.map((w) => w.id).sort()).toEqual(['w0', 'w1', 'w7', 'w8'])
    const mc = buildExercise('mc_sv_ja', words[0], words)
    expect(mc.type === 'mc_sv_ja' && mc.options.length === 4 && mc.options.includes(words[0])).toBe(true)
  })
  it('lyssna, meningsförståelse och lucktext byggs av ordets exempel', () => {
    const ex = (ja: string, sv: string) => ({ ja, reading: '', sv })
    const pool = words.map((w, i) => ({ ...w, examples: [ex(`これは${w.word}です。`, `Det här är ${i}.`), ex(`${w.word}がある。`, `Det finns ${i}.`)] }))
    const listen = buildExercise('listen', pool[0], pool)
    expect(listen.type === 'listen' && listen.options.length).toBe(4)
    // Utan uppläsning på enheten blir lyssningsövningar vanliga läsövningar.
    expect(buildExercise('listen', pool[0], pool, { canListen: false }).type).toBe('mc_ja_sv')
    expect(buildExercise('sentence', pool[0], pool, { canListen: false }).type).toBe('mc_ja_sv')

    const sentence = buildExercise('sentence', pool[0], pool)
    if (sentence.type !== 'sentence') throw new Error('fel typ')
    expect(sentence.choices).toHaveLength(4)
    expect(sentence.choices).toContain(sentence.example.sv)
    expect(new Set(sentence.choices).size).toBe(4)

    const cloze = buildExercise('cloze', pool[0], pool)
    if (cloze.type !== 'cloze') throw new Error('fel typ')
    expect(cloze.before + pool[0].word + cloze.after).toBe(cloze.example.ja)
    expect(cloze.options).toContain(pool[0])

    // Ord utan exempel, eller där ordet står böjt i meningen, får en enklare övning i stället.
    expect(buildExercise('sentence', words[0], pool).type).toBe('listen')
    expect(buildExercise('cloze', { ...pool[0], examples: [ex('ぜんぜん違う文。', 'x')] }, pool).type).toBe('mc_sv_ja')
  })
  it('rättar svenska svar generöst men inte fel svar', () => {
    const w = word(1, { meaning: 'Grubbla över, oroa sig för, ta åt sig. 気に病むな = Grubbla inte över det / oroa dig inte.' })
    for (const ok of ['grubbla över', 'Oroa sig för', 'att oroa sig för', 'grubla över', 'grubbla', 'ta åt sig'])
      expect(checkSwedish(ok, w), ok).toBe(true)
    for (const no of ['', 'x', 'springa', 'över', 'inte', 'sig'])
      expect(checkSwedish(no, w), no).toBe(false)
    const elev = word(2, { meaning: 'Elev i en högre årskurs / äldre elev.' })
    expect(checkSwedish('äldre elev', elev)).toBe(true)
    expect(checkSwedish('en äldre elev', elev)).toBe(true)
    expect(checkSwedish('lärare', elev)).toBe(false)
    const polis = word(3, { meaning: 'Polis (myndigheten).' })
    expect(checkSwedish('polis', polis)).toBe(true)
    expect(checkSwedish('polisen', polis)).toBe(true)
    expect(checkSwedish('myndigheten', polis)).toBe(false)
    // Synonymer godkänns också, men inte ord som saknas både i betydelsen och bland synonymerna.
    const yotte = word(4, { word: 'よって', meaning: 'Därför / följaktligen (formellt, skriftligt).', synonyms: ['således', 'alltså', 'av den anledningen'] })
    for (const ok of ['således', 'Alltså', 'därför', 'av den anledningen', 'sålédes'.normalize('NFC')]) expect(checkSwedish(ok, yotte), ok).toBe(true)
    expect(checkSwedish('kanske', yotte)).toBe(false)
    expect(checkSwedish('således', word(5, { word: 'よって', meaning: 'Därför / följaktligen.' }))).toBe(false)
  })
  it('rättar läsning oavsett romaji, katakana och mellanslag', () => {
    const w = word(1, { word: '冤罪', reading: 'えんざい' })
    expect(checkReading('えんざい', w)).toBe(true)
    expect(checkReading('enzai', w)).toBe(true)
    expect(checkReading('エンザイ ', w)).toBe(true)
    expect(checkReading('えんさい', w)).toBe(false)
    expect(checkReading('', w)).toBe(false)
    const h = word(3, { word: '犯人', reading: 'はんにん' })
    expect(checkReading('hannin', h)).toBe(true)
    expect(checkReading('hannnin', h)).toBe(true)
    expect(checkReading('Hannin', h)).toBe(true)
    expect(checkReading('hanin', h)).toBe(false)
    expect(checkReading('ra-men', word(2, { word: 'ラーメン', reading: 'ラーメン' }))).toBe(true)
    expect(checkReading('らーめん', word(2, { word: 'ラーメン', reading: 'ラーメン' }))).toBe(true)
  })
})

describe('streak och tema', () => {
  it('räknar dagar i rad och tål att dagens pass inte är gjort än', () => {
    const days = new Set([dayKey(NOW - DAY), dayKey(NOW - 2 * DAY), dayKey(NOW - 5 * DAY)])
    expect(streaks(days, NOW)).toMatchObject({ current: 2, longest: 2, doneToday: false })
    days.add(dayKey(NOW))
    expect(streaks(days, NOW).current).toBe(3)
    expect(streaks(new Set([dayKey(NOW - 3 * DAY)]), NOW).current).toBe(0)
  })
  it('schemalagt mörkt läge över midnatt', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 30)
    expect(isDark('schedule', '20:00', '07:00', at(22))).toBe(true)
    expect(isDark('schedule', '20:00', '07:00', at(3))).toBe(true)
    expect(isDark('schedule', '20:00', '07:00', at(12))).toBe(false)
    expect(isDark('dark', '', '')).toBe(true)
  })
})
