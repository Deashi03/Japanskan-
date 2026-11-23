import { useEffect, useMemo, useRef, useState } from 'react'
import { canSpeak, confetti, fx, speak, speakAll, stopSpeaking } from '../fx'
import { afterIntro, buildExercise, buildQueue, extraQueue, nextFresh, overtimeQueue, requeue, shuffle, type Exercise, type QItem } from '../session'
import { autoRating, exercisesFor, formatDue, knownCard, newCard, pickExercise, schedule, State } from '../srs'
import { computeStats } from '../stats'
import { actions, getSnap, uid } from '../store'
import { syncNow } from '../sync'
import type { CardData, Example, LogData, Word } from '../types'
import { FuriText, Icon, Ja, SpeakButton, WordBreakdown, WordDistinctions, WordExamples, WordHead } from './bits'
import { Cloze, Matching, MultipleChoice, Sentence, Typing, type Result } from './Exercises'

const PRAISE = ['Rätt!', 'Snyggt!', 'Precis!', 'Bra jobbat!', 'いいね！', 'Perfekt!', 'すごい！']

interface Tally { answered: number; correct: number; newWords: number; combo: number; bestCombo: number }
interface Feedback {
  correct: boolean
  title: string
  words: Word[]
  nextDue?: number
  canOverride?: boolean
  /** Exempelmening som visas och läses upp efter ett rätt svar. */
  example?: { word: Word; ex: Example }
  /** Svar som just sparats som godkänd synonym via "Jag hade rätt". */
  learned?: string
}
type IntroPart = 'breakdown' | 'examples' | 'distinctions'
const introParts = (w: Word): IntroPart[] => [
  ...(w.breakdown.length ? ['breakdown' as const] : []),
  ...(w.examples.length ? ['examples' as const] : []),
  ...(w.distinctions.length ? ['distinctions' as const] : []),
]
interface Undo { queue: QItem[]; cards: [string, CardData][]; logIds: string[]; tally: Tally }

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
  const type = item.extra ? shuffle(exercisesFor(word, card))[0] : pickExercise(word, card)
  // Para ihop-övningen tar med fler ord ur kön som också håller på att läras in.
  const partnerItems =
    type === 'match'
      ? queue.slice(1).filter((q, i, arr) => {
          const c = snap.cards.get(q.wordId)
          const w = snap.words.get(q.wordId)
          return q.kind === 'quiz' && !!q.extra === !!item.extra && w && !w.suspended && q.wordId !== item.wordId
            && arr.findIndex((o) => o.wordId === q.wordId) === i && (item.extra || (c && c.state === State.Learning && pickExercise(w, c) === 'match'))
        }).slice(0, 3)
      : []
  const all = [...snap.words.values()]
  const exercise = buildExercise(type, word, all, {
    partners: partnerItems.map((q) => snap.words.get(q.wordId)!),
    known: new Set(snap.cards.keys()),
    canListen: canSpeak,
  })
  const items = exercise.type === 'match' ? [item, ...partnerItems.filter((q) => exercise.graded.includes(q.wordId))] : [item]
  return { kind: 'quiz', item, exercise, items }
}

export function Session({ minutes, onExit }: { minutes: number; onExit: () => void }) {
  const total = minutes * 60_000
  const [queue, setQueue] = useState<QItem[]>(() => buildQueue(getSnap(), Date.now()))
  const [turnNo, setTurnNo] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'question' | 'feedback' | 'summary'>('question')
  const [elapsed, setElapsed] = useState(0)
  const [tally, setTally] = useState<Tally>({ answered: 0, correct: 0, newWords: 0, combo: 0, bestCombo: 0 })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [extraMode, setExtraMode] = useState(false)
  const [introStep, setIntroStep] = useState(0)
  const [known, setKnown] = useState(0)
  const [overtime, setOvertime] = useState(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const undo = useRef<Undo | null>(null)
  const lastAnswer = useRef<{ results: Result[]; ms: number } | null>(null)
  const elapsedRef = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const turn = useMemo(() => makeTurn(queue), [turnNo])

  // Klockan går bara när appen syns.
  useEffect(() => {
    if (phase === 'summary') return
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now()
      if (document.visibilityState === 'visible' && !pausedRef.current) {
        elapsedRef.current += Math.min(now - last, 1000)
        setElapsed(elapsedRef.current)
      }
      last = now
    }, 250)
    return () => clearInterval(t)
  }, [phase])

  const finish = () => {
    stopSpeaking()
    if (tally.answered === 0 && tally.newWords === 0 && known === 0) return onExit()
    setPhase('summary')
    fx.complete()
    confetti()
    void syncNow()
  }

  const advance = (nextQueue: QItem[]) => {
    if (elapsedRef.current >= total) {
      // Tiden är ute. Ord som redan håller på att läras in får sina sista frågor,
      // så att inget nytt ord lämnas halvfärdigt; allt annat väntar till nästa pass.
      nextQueue = overtimeQueue(nextQueue)
      if (!nextQueue.length) return finish()
      setOvertime(true)
    }
    setQueue(nextQueue)
    stopSpeaking()
    setFeedback(null)
    setIntroStep(0)
    setPhase('question')
    setTurnNo((n) => n + 1)
    fx.whoosh()
  }

  // Ett nytt ord presenteras: liten fanfar och uppläsning av ordet.
  useEffect(() => {
    if (turn?.kind !== 'intro') return
    fx.newWord()
    if (getSnap().settings.autoSpeak) speak(turn.word.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnNo])

  // Tom kö: fyll på med extra övning, eller avsluta om det inte finns något att öva på.
  useEffect(() => {
    if (phase !== 'question') return
    if (turn?.kind === 'skip') return advance(queue.filter((q) => q !== turn.item))
    if (turn === null) {
      const extra = overtime ? [] : extraQueue(getSnap())
      if (!extra.length) return finish()
      setExtraMode(true)
      advance(extra)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase])

  async function introDone() {
    if (turn?.kind !== 'intro') return
    // Visa ordkortet en del i taget; först efter sista delen börjar frågorna.
    const parts = introParts(turn.word)
    if (introStep < parts.length) {
      fx.reveal()
      // Exempelmeningarna läses upp när de visas. Det sker här, i själva knapptryckningen,
      // eftersom iPhone bara tillåter uppläsning som startas av en tryckning.
      if (parts[introStep] === 'examples' && getSnap().settings.autoSpeak) speakAll(turn.word.examples.map((e) => e.ja), 1500)
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
    const re: { item: QItem; correct: boolean; stillLearning: boolean }[] = []
    let nextDue: number | undefined
    for (const r of results) {
      const item = turn.items.find((q) => q.wordId === r.wordId)
      if (!item) continue
      const card = snap.cards.get(r.wordId) ?? newCard(now)
      const rating = autoRating(card, r.correct, ms, type, r.hinted)
      const log: LogData = { wordId: r.wordId, ts: now, rating, correct: r.correct, exercise: type, ms: Math.round(ms) }
      if (item.extra) {
        log.extra = true
        re.push({ item, correct: r.correct, stillLearning: false })
      } else {
        const next = schedule(card, rating, now, type)
        if (card.reps === 0) log.isNew = true
        prevCards.push([r.wordId, card])
        cardOps.push([r.wordId, next])
        re.push({ item, correct: r.correct, stillLearning: next.state !== State.Review && next.due - now < 30 * 60_000 })
        if (results.length === 1) nextDue = next.due
      }
      logOps.push([uid(), log])
    }
    undo.current = { queue, cards: prevCards, logIds: logOps.map(([id]) => id), tally }
    void actions.apply({ cards: cardOps, logs: logOps })
    setQueue(requeue(queue, re))

    const wrong = results.filter((r) => !r.correct)
    const allCorrect = wrong.length === 0
    const combo = allCorrect ? tally.combo + 1 : 0
    if (allCorrect) fx.correct(tally.combo)
    else if (type !== 'match') fx.wrong()
    if (allCorrect && combo >= 5 && combo % 5 === 0) setToast({ id: Date.now(), text: `${combo} i rad!` })
    setTally({
      ...tally,
      answered: tally.answered + results.length,
      correct: tally.correct + results.length - wrong.length,
      combo,
      bestCombo: Math.max(tally.bestCombo, combo),
    })
    const words = (allCorrect ? results : wrong).map((r) => snap.words.get(r.wordId)!).filter(Boolean)
    // Efter ett rätt svar visas en exempelmening, så att ordet syns i sitt sammanhang
    // (den läses bara upp om man trycker på högtalaren). Inte i dra-övningen (flera ord) eller när meningen redan var frågan.
    const ex = turn.exercise
    let example: Feedback['example']
    if (allCorrect && results.length === 1 && ex.type !== 'match' && ex.type !== 'sentence' && ex.word.examples.length) {
      const pick = ex.type === 'cloze' ? ex.example : ex.word.examples[Math.floor(Math.random() * ex.word.examples.length)]
      example = { word: ex.word, ex: pick }
    }
    setFeedback({
      learned,
      example,
      correct: allCorrect,
      title: allCorrect ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : type === 'match' ? 'Öva lite mer på' : 'Inte riktigt',
      words: type === 'match' && allCorrect ? [] : words,
      nextDue: allCorrect ? nextDue : undefined,
      canOverride: !allCorrect && (type === 'type_sv' || type === 'type_from_sv'),
    })
    setPhase('feedback')
  }

  function undoLast() {
    const u = undo.current
    if (!u) return
    undo.current = null
    void actions.apply({ cards: u.cards, logs: u.logIds.map((id) => [id, null]) })
    setQueue(u.queue)
    setTally(u.tally)
    setFeedback(null)
    setPhase('question')
    setAttempt((a) => a + 1)
  }

  /** "Jag hade rätt": det svenska svaret betydde samma sak fast med andra ord. */
  function overrideCorrect() {
    const u = undo.current
    const last = lastAnswer.current
    if (!u || !last) return
    undo.current = null
    void actions.apply({ cards: u.cards, logs: u.logIds.map((id) => [id, null]) })
    // Svaret sparas som synonym, så att det godkänns direkt nästa gång.
    const { wordId, answer } = last.results[0]
    const word = getSnap().words.get(wordId)
    // Ett svenskt svar sparas bland synonymerna, ett japanskt bland de japanska alternativen.
    const field = turn?.kind === 'quiz' && turn.exercise.type === 'type_from_sv' ? 'altJa' : 'synonyms'
    const have = word?.[field] ?? []
    const learned = answer && word && !have.some((x) => x.toLowerCase() === answer.toLowerCase()) ? answer : undefined
    if (learned && word) void actions.saveWords([{ ...word, [field]: [...have, learned] }])
    onResult(last.results.map((r) => ({ ...r, correct: true })), last.ms, { queue: u.queue, tally: u.tally }, learned)
  }

  // Enter = fortsätt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || paused) return
      if (phase === 'feedback') {
        e.preventDefault()
        advance(queue)
      } else if (phase === 'question' && turn?.kind === 'intro') void introDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'summary') return <Summary tally={tally} known={known} elapsed={elapsed} onExit={onExit} />

  const left = Math.max(0, total - elapsed)
  const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`
  const clock = mmss(left)
  const overClock = mmss(Math.max(0, elapsed - total))

  return (
    <div className="session">
      <header className="session-top">
        <button className="icon-btn" onClick={finish} aria-label="Avsluta passet">
          <Icon name="close" />
        </button>
        <div className="progress" role="progressbar" aria-label="Tid" aria-valuenow={Math.round((elapsed / total) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }}>
            {tally.combo > 0 && <i className="shine" key={tally.answered} />}
          </div>
        </div>
        <span className="clock">{overtime ? '+' + overClock : clock}</span>
        <button className="icon-btn pause-btn" onClick={() => { stopSpeaking(); setPaused(true) }} aria-label="Pausa passet">
          <Icon name="pause" />
        </button>
        <div className="combo-row">
          {tally.combo >= 2 && <span className="combo" key={tally.combo}><Icon name="flame" size={14} /> {tally.combo} i rad</span>}
        </div>
      </header>

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
      {toast && <div className="toast" key={toast.id} onAnimationEnd={() => setToast(null)}><Icon name="flame" size={28} /> {toast.text}</div>}
      <div className={'session-body' + (phase === 'feedback' && feedback && !feedback.correct ? ' nudge' : '')}>
        {extraMode && !overtime && <div className="notice slim">Extra övning – påverkar inte schemat</div>}
        {overtime && <div className="notice slim">Tiden är ute – vi gör klart de nya orden ({queue.length} {queue.length === 1 ? 'fråga' : 'frågor'} kvar)</div>}
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
              if (ex.type === 'sentence') return <Sentence ex={ex} onDone={onResult} />
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
  return (
    <div className="session summary">
      <div className="session-body center">
        <div className="trophy"><span>🎉</span></div>
        <h1 className="rise-in">Passet är klart!</h1>
        <div className="streak lit big flame-in"><Icon name="flame" size={30} /><strong><CountUp to={stats.current} delay={500} /></strong><span>{stats.current === 1 ? 'dag i rad' : 'dagar i rad'}</span></div>
        <div className="tiles two">
          {tiles.map(([value, suffix, label], i) => (
            <div className="tile tile-in" style={{ '--i': i } as React.CSSProperties} key={label}>
              <strong><CountUp to={value} suffix={suffix} delay={300 + i * 120} /></strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {known > 0 && <p className="muted">{known} ord markerade som ”kan redan”</p>}
        {tally.bestCombo >= 3 && <p className="muted">Längsta svit: {tally.bestCombo} rätt i rad</p>}
      </div>
      <footer className="session-foot">
        <button className="btn primary big" autoFocus onClick={onExit}>Klar</button>
      </footer>
    </div>
  )
}
