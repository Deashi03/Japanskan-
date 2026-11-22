import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseWordFile, splitDuplicates } from './importer'
import { autoRating, exercisesFor, isProblem, newCard, Rating, schedule, State } from './srs'
import { afterIntro, buildExercise, buildQueue, checkReading, extraQueue, newQuota, requeue, type QItem } from './session'
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
})

describe('schemaläggning', () => {
  it('ett nytt ord kräver tre rätt innan det blir inlärt', () => {
    let c = newCard(NOW)
    c = schedule(c, Rating.Good, NOW, 'mc_ja_sv')
    expect(c.state).toBe(State.Learning)
    c = schedule(c, Rating.Good, NOW + 60_000, 'match')
    expect(c.state).toBe(State.Learning)
    c = schedule(c, Rating.Good, NOW + 120_000, 'type_reading')
    expect(c.state).toBe(State.Review)
    expect(c.due).toBeGreaterThan(NOW + DAY / 2)
  })
  it('svårare övningar ju bättre man kan ordet', () => {
    let c = newCard(NOW)
    expect(exercisesFor(word(1), c)).toEqual(['mc_ja_sv'])
    c = schedule(c, Rating.Good, NOW, 'mc_ja_sv')
    expect(exercisesFor(word(1), c)[0]).toBe('match')
    c = schedule(c, Rating.Good, NOW, 'match')
    expect(exercisesFor(word(1), c)[0]).toBe('type_reading')
    expect(exercisesFor(word(1, { word: 'ラーメン' }), c)).not.toContain('type_reading')
  })
  it('betyg räknas ut från rätt/fel och tid', () => {
    const fresh = newCard(NOW)
    const review = { ...fresh, state: State.Review }
    expect(autoRating(fresh, false, 1000, 'mc_ja_sv')).toBe(Rating.Again)
    expect(autoRating(fresh, true, 1000, 'mc_ja_sv')).toBe(Rating.Good)
    expect(autoRating(review, true, 1000, 'mc_ja_sv')).toBe(Rating.Easy)
    expect(autoRating(review, true, 20000, 'mc_ja_sv')).toBe(Rating.Hard)
    expect(autoRating(review, true, 5000, 'type_reading')).toBe(Rating.Easy)
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
    expect(q.slice(5)).toEqual([{ wordId: 'w11', kind: 'quiz' }, { wordId: 'w10', kind: 'quiz' }])
  })
  it('pausade ord hoppas över och dagstaket respekteras', () => {
    const snap = snapOf([word(0, { suspended: true }), word(1), word(2)], [['w1', { ...newCard(NOW), state: State.Review, due: NOW + DAY }]], { ...DEFAULT_SETTINGS, dailyNewCap: 1 })
    expect(newQuota(snap, NOW)).toBe(0)
    expect(buildQueue(snap, NOW)).toEqual([])
  })
  it('frågan kommer strax efter introduktionen, fel svar kommer tillbaka', () => {
    const q: QItem[] = [0, 1, 2, 3, 4].map((i) => ({ wordId: 'w' + i, kind: 'intro' }))
    const q2 = afterIntro(q, q[0])
    expect(q2[1]).toEqual({ wordId: 'w0', kind: 'quiz' })
    const q3 = requeue(q2, [{ item: q2[1], correct: false, stillLearning: true }])
    expect(q3[3].wordId).toBe('w0')
    expect(requeue(q3, [{ item: q3[3], correct: true, stillLearning: false }]).some((i) => i.kind === 'quiz')).toBe(false)
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
    expect(buildExercise('mc_ja_sv', words[0], [words[0]]).type).toBe('type_from_sv')
    expect(buildExercise('match', words[0], words.slice(0, 2)).type).toBe('mc_sv_ja')
    const m = buildExercise('match', words[0], words, [words[1]])
    expect(m.type === 'match' && m.words.length === 4 && m.graded).toEqual(['w0', 'w1'])
    const mc = buildExercise('mc_sv_ja', words[0], words)
    expect(mc.type === 'mc_sv_ja' && mc.options.length === 4 && mc.options.includes(words[0])).toBe(true)
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
