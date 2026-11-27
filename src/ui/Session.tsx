import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { audioSessionEnd, audioSessionStart, canSpeak, celebrate, FINALE_AT, fx, HIT_TIMES, prepareHarp, speak, speakAll, stopSpeaking, streakFireworks } from '../fx'
import { getNoListen, useNoListen } from '../prefs'
import {
  afterIntro,
  buildExercise,
  buildQueue,
  buildReviewQueue,
  extraQueue,
  findConfusion,
  nextFresh,
  overtimeQueue,
  pickExample,
  remainingReviews,
  requeue,
  shortMeaning,
  shuffle,
  type Answered,
  type Exercise,
  type QItem,
} from '../session'
import { autoRating, clearRetry, exercisesFor, formatDue, isDue, knownCard, newCard, pickExercise, schedule, State, withRetry } from '../srs'
import { computeStats } from '../stats'
import { actions, getExtra, getSnap, loadExtras, uid } from '../store'
import { syncNow } from '../sync'
import type { CardData, Example, LogData, Word } from '../types'
import { Furi, FuriText, Icon, Ja, SpeakButton, WordBreakdown, WordDistinctions, WordExamples, WordGrammar, WordHead } from './bits'
import { Cloze, Matching, MultipleChoice, Sentence, Typing, type Result } from './Exercises'
import { QuickSettings } from './QuickSettings'

const PRAISE = ['Rätt!', 'Snyggt!', 'Precis!', 'Bra jobbat!', 'いいね！', 'Perfekt!', 'すごい！']

interface Tally { answered: number; correct: number; newWords: number; combo: number; bestCombo: number }
interface Feedback {
  correct: boolean
  title: string
  words: Word[]
  nextDue?: number
  canOverride?: boolean
  /** Exempelmening som visas efter ett rätt svar. */
  example?: { word: Word; ex: Example }
  /** Svar som just sparats som godkänd synonym via "Jag hade rätt". */
  learned?: string
  /** Ett fel ger ett omprov i slutet av passet och de närmaste dagarna. */
  retryNote?: boolean
  /** Ett annat ord som det felaktiga svaret faktiskt hörde till – en förväxling. */
  confusion?: { word: Word; marked: boolean }
}
type IntroPart = 'grammar' | 'breakdown' | 'examples' | 'distinctions'
const introParts = (w: Word): IntroPart[] => [
  ...(w.grammar ? ['grammar' as const] : []),
  ...(w.breakdown.length ? ['breakdown' as const] : []),
  ...(w.examples.length ? ['examples' as const] : []),
  ...(w.distinctions.length ? ['distinctions' as const] : []),
]
interface Undo { queue: QItem[]; cards: [string, CardData][]; logIds: string[]; tally: Tally; words: Word[] }

/** normal = vanligt pass · extra = extra övning · overtime = tiden är ute, nya ord görs klart ·
 *  asking = frågar om man vill fortsätta repetera · bonus = fortsätter med dagens repetitioner */
type Mode = 'normal' | 'extra' | 'overtime' | 'asking' | 'bonus'

type Turn =
  | { kind: 'intro'; item: QItem; word: Word }
  | { kind: 'quiz'; item: QItem; exercise: Exercise; items: QItem[] }
  | { kind: 'skip'; item: QItem }
  | null

function makeTurn(queue: QItem[]): Turn {
  const item = queue[0]
  if (!item) return null
  const snap = getSnap()
  const word = snap.words.get(item.wordId)
  if (!word || word.suspended) return { kind: 'skip', item }
  if (item.kind === 'intro') return { kind: 'intro', item, word }
  const card = snap.cards.get(word.id) ?? newCard(Date.now())
  const extra = getExtra(word.id)
  const noListen = getNoListen() || !canSpeak
  const type =
    item.force ?? (item.extra ? shuffle(exercisesFor(word, card, { noListen }))[0] : pickExercise(word, card, { noListen, hasForms: !!extra?.forms.length }))
  // Para ihop-övningen tar med fler ord ur kön som också håller på att läras in.
  const partnerItems =
    type === 'match'
      ? queue
          .slice(1)
          .filter((q, i, arr) => {
            const c = snap.cards.get(q.wordId)
            const w = snap.words.get(q.wordId)
            return (
              q.kind === 'quiz' && !q.force && !!q.extra === !!item.extra && w && !w.suspended && q.wordId !== item.wordId &&
              arr.findIndex((o) => o.wordId === q.wordId) === i && (item.extra || (c && c.state === State.Learning && pickExercise(w, c) === 'match'))
            )
          })
          .slice(0, 3)
      : []
  const exercise = buildExercise(type, word, [...snap.words.values()], {
    partners: partnerItems.map((q) => snap.words.get(q.wordId)!),
    known: new Set(snap.cards.keys()),
    canListen: !noListen,
    extra,
    stability: card.stability,
  })
  const items = exercise.type === 'match' ? [item, ...partnerItems.filter((q) => exercise.graded.includes(q.wordId))] : [item]
  return { kind: 'quiz', item, exercise, items }
}

/** Håller passet inom den synliga delen av skärmen när tangentbordet är uppe. iPhone
 *  krymper inte sidan för tangentbordet utan skjuter upp den – då försvinner frågan. */
function useViewportFit(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport
    const el = ref.current
    if (!vv || !el) return
    const fit = () => {
      el.style.height = `${vv.height}px`
      el.style.transform = `translateY(${vv.offsetTop}px)`
      el.classList.toggle('kb', vv.height < window.innerHeight - 120)
    }
    const keepTop = () => window.scrollTo(0, 0)
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    window.addEventListener('scroll', keepTop)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
      window.removeEventListener('scroll', keepTop)
      el.style.height = ''
      el.style.transform = ''
    }
  }, [ref])
}

/** Klocka och tidslinje. Ritar om sig själv fyra gånger i sekunden utan att resten av
 *  passet behöver ritas om (det var en källa till lagg). */
function SessionClock({ elapsedRef, total, overtime, combo, answered, done }: { elapsedRef: RefObject<number>; total: number; overtime: boolean; combo: number; answered: number; done: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [])
  const elapsed = elapsedRef.current ?? 0
  const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`
  // Obegränsat pass: klockan räknar uppåt och fältet visar hur stor del av de ord som från början
  // skulle repeteras som är gjorda.
  const unlimited = !Number.isFinite(total)
  const pct = unlimited ? Math.min(100, done * 100) : Math.min(100, (elapsed / total) * 100)
  return (
    <>
      <div className="progress" role="progressbar" aria-label={unlimited ? 'Framsteg' : 'Tid'} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ transform: `scaleX(${pct / 100})` }}>
          {combo > 0 && <i className="shine" key={answered} />}
        </div>
      </div>
      <span className="clock">{unlimited ? mmss(elapsed) : overtime ? '+' + mmss(Math.max(0, elapsed - total)) : mmss(Math.max(0, total - elapsed))}</span>
    </>
  )
}

/** `minutes` är passets längd, eller null för ett obegränsat pass. `review` är ett repetitionspass:
 *  bara ord som ska repeteras, inga nya ord. */
export function Session({ minutes, review = false, onExit }: { minutes: number | null; review?: boolean; onExit: () => void }) {
  const total = minutes === null ? Infinity : minutes * 60_000
  const [queue, setQueue] = useState<QItem[]>(() => (review ? buildReviewQueue : buildQueue)(getSnap(), Date.now()))
  const startCount = useRef(Math.max(1, queue.length))
  const [turnNo, setTurnNo] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'question' | 'feedback' | 'summary'>('question')
  const [tally, setTally] = useState<Tally>({ answered: 0, correct: 0, newWords: 0, combo: 0, bestCombo: 0 })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [mode, setMode] = useState<Mode>('normal')
  const [held, setHeld] = useState<QItem[]>([])
  const [introStep, setIntroStep] = useState(0)
  const [known, setKnown] = useState(0)
  const [paused, setPaused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string; level: number } | null>(null)
  const noListen = useNoListen()
  const pausedRef = useRef(false)
  pausedRef.current = paused || settingsOpen
  const undo = useRef<Undo | null>(null)
  const lastAnswer = useRef<{ results: Result[]; ms: number } | null>(null)
  const elapsedRef = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  useViewportFit(rootRef)

  // Exempelmeningar och böjningar läses in för orden i kön, några i taget i förväg.
  const [extrasReady, setExtrasReady] = useState(0)
  useEffect(() => {
    const ids = queue.slice(0, 12).map((q) => q.wordId)
    if (ids.some((id) => getSnap().words.get(id)?.extraCount && !getExtra(id))) void loadExtras(ids).then(() => setExtrasReady((n) => n + 1))
  }, [queue])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const turn = useMemo(() => makeTurn(queue), [turnNo, noListen])

  // Klockan går bara när appen syns och passet inte är pausat. Den uppdaterar bara ett
  // värde; själva visningen sköts av SessionClock.
  useEffect(() => {
    if (phase === 'summary') return
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now()
      if (document.visibilityState === 'visible' && !pausedRef.current) elapsedRef.current += Math.min(now - last, 1000)
      last = now
    }, 250)
    return () => clearInterval(t)
  }, [phase])

  // Ljudet hålls redo under passet och stängs av helt efteråt.
  useEffect(() => {
    audioSessionStart()
    const t = setTimeout(prepareHarp, 3000)
    return () => {
      clearTimeout(t)
      audioSessionEnd()
    }
  }, [])

  const finish = () => {
    stopSpeaking()
    if (tally.answered === 0 && tally.newWords === 0 && known === 0) return onExit()
    setPhase('summary')
    celebrate()
    audioSessionEnd(7000)
    void syncNow()
  }

  const goTo = (nextQueue: QItem[]) => {
    setQueue(nextQueue)
    stopSpeaking()
    setFeedback(null)
    setIntroStep(0)
    setPhase('question')
    setTurnNo((n) => n + 1)
    fx.whoosh()
  }

  const advance = (nextQueue: QItem[]) => {
    if (elapsedRef.current >= total && (mode === 'normal' || mode === 'extra')) {
      // Tiden är ute. Påbörjade nya ord och dagens omprov görs klart först; sedan får man
      // välja om man vill fortsätta med de repetitioner som är kvar för i dag.
      const rest = mode === 'extra' ? [] : remainingReviews(nextQueue)
      const finishUp = mode === 'extra' ? [] : overtimeQueue(nextQueue)
      setHeld(rest)
      if (finishUp.length) {
        setMode('overtime')
        return goTo(finishUp)
      }
      if (rest.length) return setMode('asking')
      return finish()
    }
    goTo(nextQueue)
  }

  // Tom kö: fyll på med extra övning, fråga om att fortsätta, eller avsluta.
  useEffect(() => {
    if (phase !== 'question' || mode === 'asking') return
    if (turn?.kind === 'skip') return advance(queue.filter((q) => q !== turn.item))
    if (turn === null) {
      if (mode === 'overtime') return held.length ? setMode('asking') : finish()
      if (mode === 'bonus') return finish()
      const extra = extraQueue(getSnap())
      if (!extra.length) return finish()
      setMode('extra')
      advance(extra)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase, mode])

  // Ett nytt ord presenteras: liten fanfar och uppläsning av ordet.
  useEffect(() => {
    if (turn?.kind !== 'intro') return
    fx.newWord()
    if (getSnap().settings.autoSpeak && !getNoListen()) speak(turn.word.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnNo])

  async function introDone() {
    if (turn?.kind !== 'intro') return
    // Visa ordkortet en del i taget; först efter sista delen börjar frågorna.
    const parts = introParts(turn.word)
    if (introStep < parts.length) {
      fx.reveal()
      // De två enkla exempelmeningarna läses upp när de visas. Det sker här, i själva
      // knapptryckningen, eftersom iPhone bara tillåter uppläsning som startas av en tryckning.
      if (parts[introStep] === 'examples' && getSnap().settings.autoSpeak && !getNoListen()) speakAll(turn.word.examples.slice(0, 2).map((e) => e.ja), 1500)
      else stopSpeaking()
      return setIntroStep(introStep + 1)
    }
    const now = Date.now()
    if (!getSnap().cards.has(turn.word.id)) {
      await actions.saveCard(turn.word.id, newCard(now))
      setTally((t) => ({ ...t, newWords: t.newWords + 1 }))
    }
    advance(afterIntro(queue, turn.item))
  }

  /** "Kan redan": ordet hoppar över inlärningen och läggs direkt bland orden som repeteras.
   *  I stället presenteras nästa nya ord, så passet får lika många nya ord som vanligt. */
  async function markKnown() {
    if (turn?.kind !== 'intro') return
    stopSpeaking()
    const rest = queue.filter((q) => q !== turn.item)
    const replacement = nextFresh(getSnap(), queue)
    await actions.saveCard(turn.word.id, knownCard(Date.now()))
    fx.pop(2)
    setKnown((k) => k + 1)
    advance(replacement ? [{ wordId: replacement.id, kind: 'intro' }, ...rest] : rest)
  }

  function onResult(results: Result[], ms: number, base: { queue: QItem[]; tally: Tally } = { queue, tally }, learned?: string) {
    if (turn?.kind !== 'quiz') return
    const { queue, tally } = base
    lastAnswer.current = { results, ms }
    const snap = getSnap()
    const now = Date.now()
    const type = turn.exercise.type
    const cardOps: [string, CardData][] = []
    const logOps: [string, LogData][] = []
    const prevCards: [string, CardData][] = []
    const answered: Answered[] = []
    let nextDue: number | undefined
    for (const r of results) {
      const item = turn.items.find((q) => q.wordId === r.wordId)
      if (!item) continue
      const card = snap.cards.get(r.wordId) ?? newCard(now)
      const rating = autoRating(card, r.correct, ms, type, r.hinted)
      const log: LogData = { wordId: r.wordId, ts: now, rating, correct: r.correct, exercise: type, ms: Math.round(ms) }
      if (item.extra) {
        log.extra = true
        log.review = false
        answered.push({ item, correct: r.correct, stillLearning: false, type })
        logOps.push([uid(), log])
        continue
      }
      // Svaret påverkar schemat om ordet håller på att läras in eller ska repeteras i dag.
      // Ett omprov för ett ord som inte ska repeteras i dag ändrar bara schemat vid fel.
      const graded = card.state !== State.Review || isDue(card, now) || !r.correct
      let next = graded ? schedule(card, rating, now, type) : card
      if (!r.correct) next = withRetry(next, type, now)
      else if (item.retry) next = clearRetry(next, type, now)
      if (item.retry) log.retry = true
      if (card.reps === 0) log.isNew = true
      log.review = card.state === State.Review || card.state === State.Relearning
      if (next !== card) {
        prevCards.push([r.wordId, card])
        cardOps.push([r.wordId, next])
      }
      answered.push({ item, correct: r.correct, stillLearning: !!item.learning && next.state !== State.Review, type })
      if (results.length === 1 && graded && r.correct) nextDue = next.due
      logOps.push([uid(), log])
    }
    // Förväxling: svarade man fel i en skrivövning med något som faktiskt är ett annat ord i
    // ordlistan? Då visas det ordet i svarsrutan, paret sparas, och ordet – om man redan
    // börjat lära sig det – får ett omprov i morgon. Intervallet nollställs inte: oftast var
    // det en felklickning eller en tanke som for iväg, inte att man inte kan ordet.
    const first = results[0]
    const prevWords: Word[] = []
    let confusion: Feedback['confusion']
    if (!first.correct && first.answer && (type === 'type_sv' || type === 'type_from_sv')) {
      const word = turn.exercise.word
      const other = findConfusion(first.answer, word, snap.words.values(), type === 'type_from_sv', (id) => snap.cards.has(id))
      if (other) {
        const oc = snap.cards.get(other.id)
        const mark = !turn.item.extra && !!oc && oc.state !== State.New && !other.suspended
        if (mark && oc) {
          prevCards.push([other.id, oc])
          cardOps.push([other.id, withRetry(oc, type, now, Math.random, true)])
        }
        confusion = { word: other, marked: mark }
        if (!word.confusable?.includes(other.id) || !other.confusable?.includes(word.id)) {
          prevWords.push(word, other)
          void actions.saveWords([
            { ...word, confusable: [...new Set([...(word.confusable ?? []), other.id])] },
            { ...other, confusable: [...new Set([...(other.confusable ?? []), word.id])] },
          ])
        }
      }
    }
    undo.current = { queue, cards: prevCards, logIds: logOps.map(([id]) => id), tally, words: prevWords }
    void actions.apply({ cards: cardOps, logs: logOps })
    setQueue(requeue(queue, answered))

    const wrong = results.filter((r) => !r.correct)
    const allCorrect = wrong.length === 0
    const combo = allCorrect ? tally.combo + 1 : 0
    if (allCorrect) {
      // `combo` är hur många rätt i rad det här var; ljudet och firandet växer med sviten.
      fx.correct(combo)
      streakFireworks(combo)
    } else if (type !== 'match') fx.wrong()
    if (allCorrect && combo >= 5 && combo % 5 === 0) setToast({ id: Date.now(), text: `${combo} i rad!`, level: combo % 10 === 0 ? combo / 10 : 0 })
    setTally({
      ...tally,
      answered: tally.answered + results.length,
      correct: tally.correct + results.length - wrong.length,
      combo,
      bestCombo: Math.max(tally.bestCombo, combo),
    })
    const words = (allCorrect ? results : wrong).map((r) => snap.words.get(r.wordId)!).filter(Boolean)
    // Efter ett svar – rätt eller fel – visas en exempelmening, så att ordet syns i sitt
    // sammanhang (den läses bara upp om man trycker på högtalaren). Meningens svårighet följer
    // hur väl ordet sitter. Inte i dra-övningen (flera ord) eller när meningen redan var frågan.
    const ex = turn.exercise
    let example: Feedback['example']
    if (results.length === 1 && ex.type !== 'match' && ex.type !== 'sentence' && ex.type !== 'form') {
      const bank = getExtra(ex.word.id)?.examples ?? []
      const stability = snap.cards.get(ex.word.id)?.stability ?? 0
      const pick = ex.type === 'cloze' ? ex.example : pickExample(bank.length ? bank : ex.word.examples, stability)
      if (pick) example = { word: ex.word, ex: pick }
    }
    setFeedback({
      learned,
      example,
      correct: allCorrect,
      title: allCorrect ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : type === 'match' ? 'Öva lite mer på' : 'Inte riktigt',
      words: type === 'match' && allCorrect ? [] : words,
      nextDue: allCorrect ? nextDue : undefined,
      canOverride: !allCorrect && (type === 'type_sv' || type === 'type_from_sv'),
      retryNote: !allCorrect && !turn.item.extra,
      confusion,
    })
    setPhase('feedback')
  }

  function undoLast() {
    const u = undo.current
    if (!u) return
    undo.current = null
    void actions.apply({ cards: u.cards, logs: u.logIds.map((id) => [id, null]) })
    if (u.words.length) void actions.saveWords(u.words)
    setQueue(u.queue)
    setTally(u.tally)
    setFeedback(null)
    setPhase('question')
    setAttempt((a) => a + 1)
  }

  /** "Jag hade rätt": svaret betydde samma sak fast med andra ord. */
  function overrideCorrect() {
    const u = undo.current
    const last = lastAnswer.current
    if (!u || !last) return
    undo.current = null
    void actions.apply({ cards: u.cards, logs: u.logIds.map((id) => [id, null]) })
    if (u.words.length) void actions.saveWords(u.words)
    // Svaret sparas så att det godkänns direkt nästa gång: ett svenskt svar bland
    // synonymerna, ett japanskt bland de japanska alternativen.
    const { wordId, answer } = last.results[0]
    const word = getSnap().words.get(wordId)
    const field = turn?.kind === 'quiz' && turn.exercise.type === 'type_from_sv' ? 'altJa' : 'synonyms'
    const have = word?.[field] ?? []
    const saved = answer && word && !have.some((x) => x.toLowerCase() === answer.toLowerCase()) ? answer : undefined
    if (saved && word) void actions.saveWords([{ ...word, [field]: [...have, saved] }])
    onResult(last.results.map((r) => ({ ...r, correct: true })), last.ms, { queue: u.queue, tally: u.tally }, saved)
  }

  // Enter = fortsätt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || paused || settingsOpen) return
      if (phase === 'feedback') {
        e.preventDefault()
        advance(queue)
      } else if (phase === 'question' && turn?.kind === 'intro') void introDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'summary') return <Summary tally={tally} known={known} elapsed={elapsedRef.current} onExit={onExit} />

  const overtime = mode === 'overtime' || mode === 'asking' || mode === 'bonus'
  void extrasReady

  return (
    <div className="session" ref={rootRef}>
      <header className="session-top">
        <button className="icon-btn" onClick={finish} aria-label="Avsluta passet">
          <Icon name="close" />
        </button>
        <SessionClock elapsedRef={elapsedRef} total={total} overtime={overtime} combo={tally.combo} answered={tally.answered} done={tally.answered / startCount.current} />
        <button className="icon-btn pause-btn" onClick={() => setSettingsOpen(true)} aria-label="Inställningar">
          <Icon name="gear" size={20} />
        </button>
        <button className="icon-btn pause-btn" onClick={() => { stopSpeaking(); setPaused(true) }} aria-label="Pausa passet">
          <Icon name="pause" />
        </button>
        <div className="combo-row">
          {noListen && <span className="no-listen-chip">Utan lyssning</span>}
          {tally.combo >= 2 && <span className="combo" key={tally.combo}><Icon name="flame" size={14} /> {tally.combo} i rad</span>}
        </div>
      </header>

      {settingsOpen && <QuickSettings onClose={() => setSettingsOpen(false)} />}
      {paused && (
        <div className="pause-screen" role="dialog" aria-modal="true" aria-label="Pausat">
          <div className="pause-card">
            <Icon name="pause" size={40} />
            <h2>Pausat</h2>
            <p className="muted">Klockan står still. Frågan är dold tills du fortsätter.</p>
            <button className="btn primary big" autoFocus onClick={() => setPaused(false)}>Fortsätt</button>
            <button className="btn ghost" onClick={() => { setPaused(false); finish() }}>Avsluta passet</button>
          </div>
        </div>
      )}
      {mode === 'asking' && (
        <div className="pause-screen" role="dialog" aria-modal="true" aria-label="Tiden är ute">
          <div className="pause-card">
            <Icon name="check" size={40} />
            <h2>Tiden är ute</h2>
            <p className="muted">
              Du har {held.length} {held.length === 1 ? 'ord' : 'ord'} kvar att repetera i dag. Vill du fortsätta? Du kan sluta när du vill – de ord du hinner med räknas som repeterade.
            </p>
            <button className="btn primary big" autoFocus onClick={() => { setMode('bonus'); goTo(held) }}>Fortsätt repetera</button>
            <button className="btn ghost" onClick={finish}>Avsluta passet</button>
          </div>
        </div>
      )}
      {toast && (
        <div className={'toast' + (toast.level ? ` milestone l${Math.min(toast.level, 6)}` : '')} key={toast.id} onAnimationEnd={() => setToast(null)}>
          <Icon name="flame" size={toast.level ? 36 : 28} /> {toast.text}
        </div>
      )}
      <div className={'session-body' + (phase === 'feedback' && feedback && !feedback.correct ? ' nudge' : '')}>
        {mode === 'extra' && <div className="notice slim">Extra övning – påverkar inte schemat</div>}
        {mode === 'overtime' && <div className="notice slim">Tiden är ute – vi gör klart de påbörjade orden ({queue.length} {queue.length === 1 ? 'fråga' : 'frågor'} kvar)</div>}
        {mode === 'bonus' && <div className="notice slim">Dagens repetitioner – {remainingReviews(queue).length} kvar</div>}
        {turn?.kind === 'quiz' && turn.item.retry && !turn.item.extra && <div className="notice slim retry">Omprov – den här övningen övas extra</div>}
        {turn?.kind === 'intro' && (() => {
          const parts = introParts(turn.word)
          const part = parts[introStep - 1]
          return (
            <div className="intro pop-in" key={'i' + turnNo}>
              <div className="intro-top">
                <span className="tag">Nytt ord</span>
                <span className="dots" aria-label={`Del ${introStep + 1} av ${parts.length + 1}`}>
                  {Array.from({ length: parts.length + 1 }, (_, i) => <i key={i} className={i <= introStep ? 'on' : ''} />)}
                </span>
              </div>
              <div className="wordcard">
                <WordHead word={turn.word} />
                <div className="pop-in" key={introStep}>
                  {part === 'grammar' && <WordGrammar word={turn.word} />}
                  {part === 'breakdown' && <WordBreakdown word={turn.word} />}
                  {part === 'examples' && <WordExamples word={turn.word} />}
                  {part === 'distinctions' && <WordDistinctions word={turn.word} />}
                </div>
              </div>
            </div>
          )
        })()}
        {turn?.kind === 'quiz' && (
          <div className="pop-in" key={turnNo + ':' + attempt}>
            {(() => {
              const ex = turn.exercise
              if (ex.type === 'match') return <Matching ex={ex} onDone={onResult} />
              if (ex.type === 'sentence' || ex.type === 'form') return <Sentence ex={ex} onDone={onResult} />
              if (ex.type === 'cloze') return <Cloze ex={ex} onDone={onResult} />
              if (ex.type === 'type_sv' || ex.type === 'type_from_sv') return <Typing ex={ex as Extract<Exercise, { type: 'type_sv' | 'type_from_sv' }>} onDone={onResult} />
              return <MultipleChoice ex={ex as Extract<Exercise, { type: 'mc_ja_sv' | 'mc_sv_ja' | 'listen' }>} onDone={onResult} />
            })()}
          </div>
        )}
      </div>

      {turn?.kind === 'intro' && phase === 'question' && (
        <footer className="session-foot">
          <button className="btn ghost known-btn" onClick={() => void markKnown()}>
            <Icon name="check" size={18} /> Jag kan redan det här ordet
          </button>
          <button className="btn primary big" onClick={() => void introDone()}>{introStep < introParts(turn.word).length ? 'Nästa' : 'Börja öva'}</button>
        </footer>
      )}

      {phase === 'feedback' && feedback && (
        <footer className={'sheet ' + (feedback.correct ? 'good' : 'bad')} aria-live="polite">
          <div className="sheet-title">
            <span className="sheet-icon"><Icon name={feedback.correct ? 'check' : 'close'} size={20} /></span>
            <strong>{feedback.title}</strong>
            {feedback.nextDue && <span className="sheet-due">Kommer igen {formatDue(feedback.nextDue, Date.now())}</span>}
          </div>
          {feedback.words.map((w) => (
            <div className="sheet-word" key={w.id}>
              <div>
                <Ja className="strong">{w.word}</Ja> <Ja>（{w.reading}）</Ja>
                <div className="clamp3">{w.meaning}</div>
              </div>
              <SpeakButton text={w.word} small />
            </div>
          ))}
          {feedback.confusion && (
            <div className="sheet-confusion">
              <span className="sheet-confusion-label">Du tänkte på</span>
              <div className="sheet-confusion-word">
                <Furi word={feedback.confusion.word.word} reading={feedback.confusion.word.reading} />
                <span>= {shortMeaning(feedback.confusion.word.meaning)}</span>
              </div>
              {feedback.confusion.marked && <span className="sheet-confusion-note">Det ordet övas igen i morgon.</span>}
            </div>
          )}
          {feedback.example && (
            <div className="sheet-example">
              <div>
                <FuriText ja={feedback.example.ex.ja} reading={feedback.example.ex.reading} word={feedback.example.word} />
                <div className="sheet-example-sv">{feedback.example.ex.sv}</div>
              </div>
              <SpeakButton text={feedback.example.ex.ja} small />
            </div>
          )}
          {feedback.learned && <div className="sheet-note">”{feedback.learned}” är sparat som godkänt svar.</div>}
          {feedback.retryNote && <div className="sheet-note">Övningen kommer igen i slutet av passet, i morgon och en gång till de närmaste dagarna.</div>}
          <div className={'row' + (feedback.canOverride ? ' sheet-actions' : '')}>
            <button className="btn ghost" onClick={undoLast} title="Ångra svaret och försök igen">
              <Icon name="undo" size={18} /> Ångra
            </button>
            {feedback.canOverride && <button className="btn ghost" onClick={overrideCorrect}>Jag hade rätt</button>}
            <button className="btn primary grow" onClick={() => advance(queue)}>Fortsätt</button>
          </div>
        </footer>
      )}
    </div>
  )
}

/** Räknar upp ett tal från noll – ger sammanfattningen lite liv. */
function CountUp({ to, suffix = '', delay = 0 }: { to: number; suffix?: string; delay?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 700))
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, delay])
  return <>{n}{suffix}</>
}

function Summary({ tally, known, elapsed, onExit }: { tally: Tally; known: number; elapsed: number; onExit: () => void }) {
  const stats = useMemo(() => computeStats(getSnap(), Date.now()), [])
  const acc = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 100
  const tiles: [number, string, string][] = [
    [tally.answered, '', 'svar'],
    [acc, '%', 'rätt'],
    [tally.newWords, '', 'nya ord'],
    [Math.max(1, Math.round(elapsed / 60_000)), '', 'minuter'],
  ]
  // Allt på skärmen är tajmat mot musiken: en ring slår ut på varje ackord, och sviten
  // och siffrorna landar på slutackordet.
  const ms = (seconds: number) => `calc(var(--lag, 0ms) + ${Math.round(seconds * 1000)}ms)`
  return (
    <div className="session summary">
      <div className="rays" aria-hidden="true" />
      <div className="session-body center">
        <div className="medal-wrap" aria-hidden="true">
          {HIT_TIMES.map((t, i) => <i className={'shock' + (t === FINALE_AT ? ' big' : '')} style={{ animationDelay: ms(t) }} key={i} />)}
          <div className="medal" style={{ '--finale': ms(FINALE_AT) } as React.CSSProperties}>
            <Icon name="check" size={56} />
          </div>
        </div>
        <h1 className="done-title" aria-label="Passet är klart!">
          {[...'Passet är klart!'].map((ch, i) => <span aria-hidden="true" style={{ animationDelay: ms(0.25 + i * 0.03) }} key={i}>{ch === ' ' ? '\u00a0' : ch}</span>)}
        </h1>
        <div className="streak lit big finale-pop" style={{ animationDelay: ms(FINALE_AT) }}>
          <Icon name="flame" size={30} /><strong><CountUp to={stats.current} delay={FINALE_AT * 1000} /></strong><span>{stats.current === 1 ? 'dag i rad' : 'dagar i rad'}</span>
        </div>
        <div className="tiles two">
          {tiles.map(([value, suffix, label], i) => (
            <div className="tile tile-in" style={{ animationDelay: ms(HIT_TIMES[Math.min(i, 2)] + (i === 3 ? 0.3 : 0)) }} key={label}>
              <strong><CountUp to={value} suffix={suffix} delay={(HIT_TIMES[Math.min(i, 2)] + (i === 3 ? 0.3 : 0)) * 1000} /></strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {known > 0 && <p className="muted rise-late">{known} ord markerade som ”kan redan”</p>}
        {tally.bestCombo >= 3 && <p className="muted rise-late">Längsta svit: {tally.bestCombo} rätt i rad</p>}
      </div>
      <footer className="session-foot">
        <button className="btn primary big" autoFocus onClick={onExit}>Klar</button>
      </footer>
    </div>
  )
}
