import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseWordFile, splitDuplicates } from './importer'
import { autoRating, clearRetry, dueRetries, exercisesFor, isDue, isProblem, knownCard, LEARNING_ORDER, missingSkills, REVIEW_ORDER, newCard, pickExercise, Rating, schedule, State, statusOf, withRetry } from './srs'
import { dayIndex, dayStart, endOfDay } from './days'
import { afterIntro, buildExercise, buildQueue, buildReviewQueue, studiedCount, checkReading, checkSwedish, extraQueue, findConfusion, freshWords, hintFor, meaningPrompt, nextFresh, overtimeQueue, pickExample, remainingReviews, shortMeaning, newQuota, requeue, type QItem } from './session'
import { dayKey, streaks } from './stats'
import { isDark } from './fx'
import { furigana } from './furigana'
import type { Snapshot } from './store'
import { DEFAULT_SETTINGS, type CardData, type Word } from './types'

const word = (i: number, extra: Partial<Word> = {}): Word => ({
  id: 'w' + i, word: '語' + i, reading: 'ご' + i, meaning: 'betydelse ' + i,
  breakdown: [], examples: [], distinctions: [], list: 'L', createdAt: 1, order: i, ...extra,
})
const snapOf = (words: Word[], cards: [string, CardData][] = [], settings = DEFAULT_SETTINGS): Snapshot => ({
  version: 1, words: new Map(words.map((w) => [w.id, w])), cards: new Map(cards), logs: new Map(), days: new Map(), settings,
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
    expect(updates).toEqual([{ word: { ...old, synonyms: ['b', 'egen', 'a'] } }])
    // Har ordet redan alla synonymer händer ingenting.
    expect(splitDuplicates(parsed, [updates[0].word]).updates).toEqual([])
    expect(parseWordFile(JSON.stringify(sample)).words[0].synonyms).toEqual([])
  })
})

describe('schemaläggning', () => {
  it('ett nytt ord går igenom fem övningstyper innan det blir inlärt', () => {
    let c = newCard(NOW)
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      const type = pickExercise(word(1), c)
      seen.push(type)
      c = schedule(c, Rating.Good, NOW + i * 60_000, type)
      expect(c.state).toBe(i < 4 ? State.Learning : State.Review)
    }
    expect(seen).toEqual(['mc_ja_sv', 'match', 'listen', 'mc_sv_ja', 'type_sv'])
    // Skriv på japanska hör till repetitionerna, inte till inlärningen.
    expect(seen).not.toContain('type_from_sv')
    expect(c.due).toBeGreaterThan(NOW + DAY / 2)
  })
  it('fel svar under inlärningen börjar om från första övningstypen', () => {
    let c = schedule(newCard(NOW), Rating.Good, NOW, 'mc_ja_sv')
    c = schedule(c, Rating.Good, NOW, 'match')
    c = schedule(c, Rating.Again, NOW, 'listen')
    expect(pickExercise(word(1), c)).toBe('mc_ja_sv')
  })
  it('repetitioner tar först de färdigheter som saknas, och turas sedan om', () => {
    expect(REVIEW_ORDER).toEqual(['type_from_sv', 'sentence', 'type_sv'])
    const fresh = { ...newCard(NOW), state: State.Review, stability: 3, reps: 4 }
    expect(pickExercise(word(1), fresh)).toBe('type_from_sv')
    expect(pickExercise(word(1), { ...fresh, skills: { write: 1 } })).toBe('sentence')
    expect(pickExercise(word(1), { ...fresh, skills: { write: 1, listen: 1 } })).toBe('type_sv')
    // "Kan inte lyssna nu": lyssningen hoppas över.
    expect(pickExercise(word(1), { ...fresh, skills: { write: 1 } }, { noListen: true })).toBe('type_sv')
    const done = { ...fresh, skills: { write: 1, listen: 1, read: 1 } }
    const picked = [0, 1, 2, 3, 4, 5].map((reps) => pickExercise(word(1), { ...done, reps }))
    expect(picked).toEqual([...REVIEW_ORDER, ...REVIEW_ORDER])
    expect(exercisesFor(word(1), done, { noListen: true })).not.toContain('sentence')
  })
  it('ett ord räknas som "Kan" först när alla tre färdigheterna klarats vid repetition', () => {
    let c: CardData = { ...newCard(NOW - 10 * DAY), state: State.Review, stability: 5, difficulty: 5, reps: 5, last_review: NOW - 5 * DAY, due: NOW }
    expect(statusOf(c)).toBe('learning')
    expect(missingSkills(c)).toEqual(['write', 'listen', 'read'])
    c = schedule(c, Rating.Good, NOW, 'type_from_sv')
    expect(missingSkills(c)).toEqual(['listen', 'read'])
    // Så länge en färdighet saknas kommer ordet tillbaka redan i morgon.
    expect(c.due).toBe(endOfDay(NOW))
    // Dra-övningar och flerval räknas inte som bevis.
    expect(missingSkills(schedule(c, Rating.Good, NOW, 'match'))).toEqual(['listen', 'read'])
    c = schedule(c, Rating.Good, NOW + DAY, 'sentence')
    c = schedule(c, Rating.Good, NOW + 2 * DAY, 'type_sv')
    expect(missingSkills(c)).toEqual([])
    expect(['young', 'mature']).toContain(statusOf(c))
    expect(c.due).toBeGreaterThan(endOfDay(NOW + 2 * DAY))
    // Fel svar räknas inte som klarad färdighet.
    expect(schedule({ ...c, skills: {} }, Rating.Again, NOW + 9 * DAY, 'type_sv').skills).toEqual({})
  })
  it('repetitioner räknas per dag med dygnsgräns 04:00, inte per timme', () => {
    const at = (h: number, d = 22) => new Date(2026, 10, d, h).getTime()
    const card = (due: number): CardData => ({ ...newCard(at(0)), state: State.Review, due })
    // Förfaller i kväll: går att repetera redan i morse.
    expect(isDue(card(at(21)), at(8))).toBe(true)
    // Förfaller i morgon förmiddag: inte i dag.
    expect(isDue(card(at(10, 23)), at(8))).toBe(false)
    // Kl. 02 på natten räknas fortfarande till gårdagen.
    expect(dayIndex(at(2, 23))).toBe(dayIndex(at(20, 22)))
    expect(dayIndex(at(5, 23))).toBe(dayIndex(at(20, 22)) + 1)
    expect(endOfDay(at(20, 22))).toBe(at(4, 23))
    expect(dayStart(dayIndex(at(9, 23)))).toBe(at(4, 23))
  })
  it('fel svar ger omprov med samma övning dagen efter och inom tre dagar till', () => {
    const today = dayIndex(NOW)
    const c = withRetry({ ...newCard(NOW), state: State.Review }, 'type_sv', NOW, () => 0.99)
    expect(c.retry).toEqual([{ type: 'type_sv', day: today + 1 }, { type: 'type_sv', day: today + 4 }])
    expect(withRetry(c, 'type_sv', NOW, () => 0).retry).toEqual([{ type: 'type_sv', day: today + 1 }, { type: 'type_sv', day: today + 2 }])
    // Inget omprov i dag; i morgon finns ett.
    expect(dueRetries(c, NOW)).toEqual([])
    expect(dueRetries(c, NOW + DAY)).toEqual([{ type: 'type_sv', day: today + 1 }])
    // Ett klarat omprov stryks, bara det som förfallit.
    expect(clearRetry(c, 'type_sv', NOW + DAY).retry).toEqual([{ type: 'type_sv', day: today + 4 }])
    expect(clearRetry(c, 'type_sv', NOW).retry).toEqual(c.retry)
    // Omprov gör att ordet kommer med i dagens kö med rätt övning, även om det inte förfallit.
    const words = [word(0), word(1)]
    const snap = snapOf(words, [['w0', { ...c, due: NOW + 30 * DAY }]])
    expect(buildQueue(snap, NOW + DAY).filter((q) => q.wordId === 'w0')).toEqual([{ wordId: 'w0', kind: 'quiz', force: 'type_sv', retry: true }])
    expect(buildQueue(snap, NOW).some((q) => q.wordId === 'w0')).toBe(false)
  })
  it('ett fel i passet ger ett omprov med samma övning i slutet, och tiden ute gör klart det', () => {
    const r1: QItem = { wordId: 'r1', kind: 'quiz' }
    const q: QItem[] = [r1, { wordId: 'r2', kind: 'quiz' }, { wordId: 'r3', kind: 'quiz' }]
    const after = requeue(q, [{ item: r1, correct: false, stillLearning: false, type: 'sentence' }])
    expect(after.map((i) => i.wordId)).toEqual(['r2', 'r3', 'r1'])
    expect(after[2]).toMatchObject({ force: 'sentence', again: true, retry: true })
    // Två fel på samma övning ger fortfarande bara ett omprov.
    expect(requeue(after, [{ item: after[0], correct: true, stillLearning: false }, { item: r1, correct: false, stillLearning: false, type: 'sentence' }]).filter((i) => i.again)).toHaveLength(1)
    // Fel på själva omprovet ger inget nytt omprov i samma pass.
    const again = after[2]
    expect(requeue(after, [{ item: again, correct: false, stillLearning: false, type: 'sentence' }]).some((i) => i.again)).toBe(false)
    // När tiden är ute: omprov och påbörjade nya ord görs klart, vanliga repetitioner väntar.
    expect(overtimeQueue(after).map((i) => i.wordId)).toEqual(['r1'])
    expect(remainingReviews(after).map((i) => i.wordId)).toEqual(['r2', 'r3'])
  })
  it('extra övning är ett slumpat urval där svaga ord har större chans', () => {
    const many = Array.from({ length: 40 }, (_, i) => word(i))
    const cards = many.map((w, i): [string, CardData] => [w.id, { ...newCard(NOW), state: State.Review, stability: i < 5 ? 1 : 30, recent: i === 39 ? [false, false] : [true] }])
    const snap = snapOf(many, cards)
    let seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const picks = Array.from({ length: 200 }, () => extraQueue(snap, rnd).map((q) => q.wordId))
    expect(picks.every((p) => p.length === 10 && new Set(p).size === 10)).toBe(true)
    // Olika ord varje gång, inte samma tio.
    expect(new Set(picks.map((p) => p.sort().join())).size).toBeGreaterThan(150)
    const count = (id: string) => picks.filter((p) => p.includes(id)).length
    expect(count('w39')).toBeGreaterThan(count('w20'))
    expect(count('w0')).toBeGreaterThan(count('w20'))
  })
  it('”kan redan” hoppar över inlärningen, ger ett intervall på flera dagar och räknas inte i dagens kvot', () => {
    const c = knownCard(NOW)
    expect(c.state).toBe(State.Review)
    expect(c.due).toBeGreaterThan(NOW + 2 * DAY)
    expect(c.known).toBe(true)
    // Men det räknas inte som "Kan" förrän färdigheterna har prövats.
    expect(statusOf(c)).toBe('learning')
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
    // Rätt svar med ledtråd räknas som "Svårt", aldrig "Lätt"; fel svar är fortfarande fel.
    expect(autoRating(review, true, 2000, 'type_from_sv', true)).toBe(Rating.Hard)
    expect(autoRating(review, false, 2000, 'type_from_sv', true)).toBe(Rating.Again)
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
  it('ett repetitionspass har bara repetitioner: inga nya ord och inga introduktionskort', () => {
    const review = (due: number): CardData => ({ ...newCard(NOW - 10 * DAY), state: State.Review, due })
    const snap = snapOf(words, [['w10', review(NOW - DAY)], ['w11', review(NOW - 3 * DAY)], ['w9', review(NOW + DAY)]])
    expect(buildReviewQueue(snap, NOW)).toEqual([{ wordId: 'w11', kind: 'quiz', learning: undefined }, { wordId: 'w10', kind: 'quiz', learning: undefined }])
    expect(buildReviewQueue(snap, NOW).some((q) => q.kind === 'intro')).toBe(false)
    // Utan förfallna ord är kön tom (passet blir då extra övning).
    expect(buildReviewQueue(snapOf(words), NOW)).toEqual([])
    // Ett påbörjat ord som inte hunnit bli klart kommer före vanliga repetitioner.
    const learning: CardData = { ...newCard(NOW - DAY), state: State.Learning, due: NOW - 1000 }
    const mixed = buildReviewQueue(snapOf(words, [['w10', review(NOW - DAY)], ['w5', learning]]), NOW)
    expect(mixed.map((q) => q.wordId)).toEqual(['w5', 'w10'])
  })
  it('studiedCount räknar påbörjade ord som inte är pausade', () => {
    const snap = snapOf([word(0), word(1, { suspended: true }), word(2), word(3)], [
      ['w0', { ...newCard(NOW), state: State.Review, due: NOW + DAY }],
      ['w1', { ...newCard(NOW), state: State.Review, due: NOW + DAY }],
      ['w2', newCard(NOW)],
    ])
    expect(studiedCount(snap)).toBe(1)
  })
  it('ord man valt själv introduceras före alla andra, i den ordning de valdes', () => {
    const list = words.map((w) => (w.id === 'w9' ? { ...w, priority: 200 } : w.id === 'w7' ? { ...w, priority: 100 } : w))
    const q = buildQueue(snapOf(list), NOW)
    expect(q.map((i) => i.wordId)).toEqual(['w7', 'w9', 'w0', 'w1', 'w2'])
    // Fler valda än passet rymmer: resten står kvar först i kön till nästa pass.
    const many = words.map((w, i) => (i >= 4 ? { ...w, priority: i } : w))
    const first = buildQueue(snapOf(many), NOW).map((i) => i.wordId)
    expect(first).toEqual(['w4', 'w5', 'w6', 'w7', 'w8'])
    const cards = first.map((id): [string, CardData] => [id, { ...newCard(NOW), state: State.Review, due: NOW + DAY }])
    expect(buildQueue(snapOf(many, cards), NOW).map((i) => i.wordId)).toEqual(['w9', 'w10', 'w11', 'w0', 'w1'])
    expect(nextFresh(snapOf(list), [])?.id).toBe('w7')
  })
  it('nya ord kan hämtas i importordning, från en vald lista eller växelvis', () => {
    const two = [...[0, 1, 2].map((i) => word(i, { list: 'A' })), ...[3, 4, 5].map((i) => word(i, { list: 'B', createdAt: 2 }))]
    const ids = (newFrom: string, list = two) => freshWords(snapOf(list, [], { ...DEFAULT_SETTINGS, newFrom })).map((w) => w.id)
    expect(ids('')).toEqual(['w0', 'w1', 'w2', 'w3', 'w4', 'w5'])
    expect(ids('B')).toEqual(['w3', 'w4', 'w5', 'w0', 'w1', 'w2'])
    expect(ids('*')).toEqual(['w0', 'w3', 'w1', 'w4', 'w2', 'w5'])
    // En lista som inte längre finns ger vanlig importordning.
    expect(ids('Borttagen')).toEqual(ids(''))
    // Ord man själv valt går alltid först, oavsett inställning.
    const chosen = two.map((w) => (w.id === 'w2' ? { ...w, priority: 5 } : w))
    expect(ids('B', chosen).slice(0, 2)).toEqual(['w2', 'w3'])
    expect(ids('*', chosen)).toEqual(['w2', 'w0', 'w3', 'w1', 'w4', 'w5'])
  })
  it('när tiden är ute återstår bara frågorna för ord som håller på att läras in', () => {
    const q: QItem[] = [
      { wordId: 'a', kind: 'quiz', learning: true },
      { wordId: 'b', kind: 'intro' },
      { wordId: 'c', kind: 'quiz' },
      { wordId: 'd', kind: 'quiz', extra: true },
      { wordId: 'e', kind: 'quiz', learning: true },
    ]
    expect(overtimeQueue(q).map((i) => i.wordId)).toEqual(['a', 'e'])
    expect(overtimeQueue([q[1], q[2]])).toEqual([])
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
    expect(buildExercise('sentence', pool[0], pool, { canListen: false }).type).toBe('type_sv')
    expect(buildExercise('form', pool[0], pool, { canListen: false }).type).toBe('type_sv')

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
    // Med meningsbanken används den i stället för de två enkla meningarna.
    const bank = { examples: [ex('難しい文の中で' + pool[0].word + 'を使う。', 'Svår mening.')], forms: [] }
    const fromBank = buildExercise('sentence', pool[0], pool, { extra: bank })
    expect(fromBank.type === 'sentence' && fromBank.example.sv).toBe('Svår mening.')
    // Böjningsövningen använder en böjd form och dess mening.
    const form = { label: 'passiv', ja: '語0れた', reading: 'ごれた', ex: ex('彼に語0れた。', 'Det gjordes av honom.') }
    const f = buildExercise('form', pool[0], pool, { extra: { examples: [], forms: [form] } })
    expect(f.type === 'form' && f.form.label).toBe('passiv')
    expect(f.type === 'form' && f.choices).toContain('Det gjordes av honom.')
    expect(buildExercise('form', pool[0], pool).type).toBe('sentence')
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
  it('skriv på japanska: kanji, hiragana, romaji och synonymer godkänns', () => {
    const w = word(1, { word: '休日', reading: 'きゅうじつ', meaning: 'Ledig dag / helgdag.' })
    for (const ok of ['休日', 'きゅうじつ', 'kyuujitsu', 'キュウジツ', ' きゅう じつ ']) expect(checkReading(ok, w), ok).toBe(true)
    expect(checkReading('きゅうじ', w)).toBe(false)
    // Ett annat ord i ordlistan med samma svenska betydelse är en godkänd synonym …
    const syn = word(2, { word: '休み', reading: 'やすみ', meaning: 'Ledighet / ledig dag.' })
    const other = word(3, { word: '平日', reading: 'へいじつ', meaning: 'Vardag.' })
    expect(checkReading('やすみ', w, [w, syn, other])).toBe(true)
    expect(checkReading('休み', w, [w, syn, other])).toBe(true)
    // … men inte ett ord som betyder något annat, och inte utan att ordlistan skickas med.
    expect(checkReading('へいじつ', w, [w, syn, other])).toBe(false)
    expect(checkReading('やすみ', w)).toBe(false)
    // Egna japanska alternativ (sparade via "Jag hade rätt") godkänns också.
    expect(checkReading('おやすみ', { ...w, altJa: ['お休み'] })).toBe(false)
    expect(checkReading('お休み', { ...w, altJa: ['お休み'] })).toBe(true)
    expect(checkReading('オフ', { ...w, altJa: ['オフ'] })).toBe(true)
    // Ord med mellanslag eller vågstreck i läsningen.
    expect(checkReading('nantokanaranainokana', word(4, { word: 'なんとかならないのかな', reading: 'なんとか ならない の かな' }))).toBe(true)
  })
  it('ledtråden visar första tecknet och svarets längd', () => {
    expect(hintFor(word(1, { reading: 'きゅうじつ' }), true)).toBe('きゅ・・・')
    expect(hintFor(word(1, { reading: 'えんざい' }), true)).toBe('え・・・')
    expect(hintFor(word(1, { reading: 'なんとか ならない' }), true)).toBe('な・・・・・・・')
    expect(hintFor(word(1, { meaning: 'Ledig dag / helgdag.' }), false)).toBe('L···· ···')
    expect(hintFor(word(1, { meaning: '気に病むな' }), false)).toBe('')
  })
  it('den svenska frågan avslöjar inte det japanska svaret', () => {
    expect(meaningPrompt('Grubbla över, oroa sig för, ta åt sig. 気に病むな = Grubbla inte över det / oroa dig inte.')).toBe('Grubbla över, oroa sig för, ta åt sig.')
    expect(meaningPrompt('Ta hål för piercing (だいぶ開けてる = har tagit ganska många hål).')).toBe('Ta hål för piercing.')
    expect(meaningPrompt('Polis (myndigheten).')).toBe('Polis (myndigheten).')
    expect(meaningPrompt('思ったほど〜ない = inte så … som jag trodde.')).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/)
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

describe('furigana i meningar', () => {
  const show = (ja: string, reading: string, fixed?: Parameters<typeof furigana>[2]) =>
    furigana(ja, reading, fixed)?.map((s) => (s.r ? `${s.t}[${s.r}]` : s.t)).join('')
  it('lägger läsningen på rätt kanji', () => {
    expect(show('店で割引券をもらった。', 'みせで わりびきけんを もらった')).toBe('店[みせ]で割引券[わりびきけん]をもらった。')
    expect(show('彼は冤罪を訴えている。', 'かれは えんざいを うったえている')).toBe('彼[かれ]は冤罪[えんざい]を訴[うった]えている。')
    expect(show('ラーメンを食べた。', 'ラーメンを たべた')).toBe('ラーメンを食[た]べた。')
    expect(show('テストは5時からです。', 'テストは ごじからです')).toBe('テストは5時[ごじ]からです。')
    expect(show('これはペンです。', 'これは ペンです')).toBe('これはペンです。')
  })
  it('ett känt målord får exakt sin läsning även intill andra kanji', () => {
    expect(show('冤罪事件として報道された。', 'えんざいじけんとして ほうどうされた', { at: 0, len: 2, reading: 'えんざい' })).toBe(
      '冤罪[えんざい]事件[じけん]として報道[ほうどう]された。',
    )
    // Stämmer inte den kända läsningen (ordet står böjt) används den vanliga uppdelningen.
    expect(show('道に迷った。', 'みちに まよった', { at: 2, len: 2, reading: 'まよう' })).toBe('道[みち]に迷[まよ]った。')
  })
  it('ger upp i stället för att gissa när meningen och läsningen inte hör ihop', () => {
    expect(furigana('店で買った。', 'ぜんぜん ちがう')).toBeNull()
    expect(furigana('店で買った。', '')).toBeNull()
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

describe('exempelval och förväxlingar', () => {
  it('exempelmeningens svårighet följer hur väl ordet sitter', () => {
    const bank = [1, 2, 3].flatMap((level) => [1, 2, 3, 4].map((i) => ({ level: level as 1 | 2 | 3, id: `${level}${i}` })))
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const share = (stability: number, level: number) => Array.from({ length: 600 }, () => pickExample(bank, stability, rnd)!).filter((e) => e.level === level).length / 600
    expect(share(1, 1)).toBeGreaterThan(0.6)
    expect(share(10, 2)).toBeGreaterThan(0.6)
    expect(share(60, 3)).toBeGreaterThan(0.6)
    // Alla nivåer kan fortfarande komma, men de som inte passar är sällsynta.
    expect(share(60, 1)).toBeGreaterThan(0)
    expect(share(60, 1)).toBeLessThan(0.1)
    expect(pickExample([], 5)).toBeUndefined()
    // Meningar utan nivå räknas som enkla.
    const plain: { level?: 1 | 2 | 3 } = {}
    expect(pickExample([plain], 50)).toBe(plain)
  })

  const A = word(1, { word: '休日', reading: 'きゅうじつ', meaning: 'Ledig dag / helgdag.', synonyms: ['helg'] })
  const B = word(2, { word: '平日', reading: 'へいじつ', meaning: 'Vardag.' })
  const C = word(3, { word: '祝日', reading: 'しゅくじつ', meaning: 'Helgdag (nationell).' })
  const all = [A, B, C]

  it('hittar förväxlingar i japanska svar (kanji, hiragana och romaji)', () => {
    expect(findConfusion('平日', A, all, true)?.id).toBe(B.id)
    expect(findConfusion('へいじつ', A, all, true)?.id).toBe(B.id)
    expect(findConfusion('heijitsu', A, all, true)?.id).toBe(B.id)
    expect(findConfusion('しゅくじつ', A, all, true)?.id).toBe(C.id)
    // Ett svar som inte är något ord i listan, eller är ordet självt, är ingen förväxling.
    expect(findConfusion('ふつか', A, all, true)).toBeUndefined()
    expect(findConfusion('休日', A, all, true)).toBeUndefined()
    expect(findConfusion('', A, all, true)).toBeUndefined()
  })
  it('hittar förväxlingar i svenska svar, men bara när svaret verkligen hör till ett annat ord', () => {
    expect(findConfusion('vardag', A, all, false)?.id).toBe(B.id)
    expect(findConfusion('Vardagen', A, all, false)?.id).toBeUndefined() // böjning räknas inte som exakt träff
    expect(findConfusion('vardag', B, all, false)).toBeUndefined()
    expect(findConfusion('nationell helgdag', C, all, false)).toBeUndefined()
    expect(findConfusion('katt', A, all, false)).toBeUndefined()
    // Ett svar med ett tecken fel i längre ord räknas (stavfel), kortare ord kräver exakt träff.
    expect(findConfusion('vardga', A, all, false)).toBeUndefined()
    expect(findConfusion('helgdagg', A, all, false)?.id).toBe(C.id)
  })
  it('föredrar ord man redan börjat lära sig', () => {
    const D = word(4, { word: '平日', reading: 'へいじつ', meaning: 'Vardag.' })
    expect(findConfusion('へいじつ', A, [A, B, D], true, (id) => id === D.id)?.id).toBe(D.id)
  })

  it('kort betydelse: högst två alternativ, utan japanska och parenteser', () => {
    expect(shortMeaning('Ledig dag / helgdag.')).toBe('Ledig dag / helgdag')
    expect(shortMeaning('Hot / fara / risk')).toBe('Hot / fara')
    expect(shortMeaning('Ta hål för piercing (だいぶ開けてる = har tagit ganska många hål).')).toBe('Ta hål för piercing')
    expect(shortMeaning('Grubbla över, oroa sig för, ta åt sig. 気に病むな = Grubbla inte över det.')).toBe('Grubbla över, oroa sig för, ta åt sig')
    expect(shortMeaning('x'.repeat(100)).length).toBeLessThanOrEqual(56)
  })

  it('ett enkelt omprov läggs bara i morgon', () => {
    const c = withRetry({ ...newCard(NOW), state: State.Review }, 'type_sv', NOW, () => 0.5, true)
    expect(c.retry).toEqual([{ type: 'type_sv', day: dayIndex(NOW) + 1 }])
  })

  it('lucktext kan använda en böjd form och ber då om grundformen', () => {
    const w = word(1, { word: '食べる', reading: 'たべる', examples: [] })
    const others = [2, 3, 4, 5].map((i) => word(i))
    const form = { label: 'て-form', ja: '食べて', reading: 'たべて', ex: { ja: '朝ごはんを食べて、学校へ行く。', reading: 'あさごはんを たべて がっこうへ いく', sv: 'Jag äter frukost och går till skolan.', level: 1 as const } }
    const extra = { examples: [], forms: [form] }
    const ex = buildExercise('cloze', w, [w, ...others], { extra, stability: 3 })
    if (ex.type !== 'cloze') throw new Error('fel typ ' + ex.type)
    expect(ex.form?.label).toBe('て-form')
    expect(ex.gap).toBe('食べて')
    expect(ex.before + ex.gap + ex.after).toBe(form.ex.ja)
    expect(ex.options.map((o) => o.word)).toContain('食べる')
    // Utan former och utan meningar som innehåller ordet blir det en enklare övning.
    expect(buildExercise('cloze', w, [w, ...others], { extra: { examples: [], forms: [] } }).type).toBe('mc_sv_ja')
    // Med både vanliga meningar och former förekommer båda.
    const both = { examples: [{ ja: '食べるのが好きだ。', reading: 'たべるのが すきだ', sv: 'Jag gillar att äta.', level: 1 as const }], forms: [form] }
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const kinds = new Set(Array.from({ length: 40 }, () => { const e = buildExercise('cloze', w, [w, ...others], { extra: both, stability: 3, rnd }); return e.type === 'cloze' && e.form ? 'form' : 'plain' }))
    expect(kinds).toEqual(new Set(['form', 'plain']))
  })
})
