import { useEffect, useMemo, useRef, useState } from 'react'
import { confetti, fx } from '../fx'
import { afterIntro, buildExercise, buildQueue, extraQueue, requeue, shuffle, type Exercise, type QItem } from '../session'
import { autoRating, exercisesFor, formatDue, newCard, pickExercise, schedule, State } from '../srs'
import { computeStats } from '../stats'
import { actions, getSnap, uid } from '../store'
import { syncNow } from '../sync'
import type { CardData, LogData, Word } from '../types'
import { Icon, Ja, SpeakButton, WordCard } from './bits'
import { Matching, MultipleChoice, Typing, type Result } from './Exercises'

const PRAISE = ['Rätt!', 'Snyggt!', 'Precis!', 'Bra jobbat!', 'いいね！', 'Perfekt!', 'すごい！']

interface Tally { answered: number; correct: number; newWords: number; combo: number; bestCombo: number }
interface Feedback { correct: boolean; title: string; words: Word[]; nextDue?: number }
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
            && arr.findIndex((o) => o.wordId === q.wordId) === i && (item.extra || (c && c.state !== State.Review && c.state !== State.New))
        }).slice(0, 3)
      : []
  const all = [...snap.words.values()]
  const exercise = buildExercise(type, word, all, partnerItems.map((q) => snap.words.get(q.wordId)!))
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
  const undo = useRef<Undo | null>(null)
  const elapsedRef = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const turn = useMemo(() => makeTurn(queue), [turnNo])

  // Klockan går bara när appen syns.
  useEffect(() => {
    if (phase === 'summary') return
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now()
      if (document.visibilityState === 'visible') {
        elapsedRef.current += Math.min(now - last, 1000)
        setElapsed(elapsedRef.current)
      }
      last = now
    }, 250)
    return () => clearInterval(t)
  }, [phase])

  const finish = () => {
    if (tally.answered === 0 && tally.newWords === 0) return onExit()
    setPhase('summary')
    fx.complete()
    confetti()
    void syncNow()
  }

  const advance = (nextQueue: QItem[]) => {
    if (elapsedRef.current >= total) return finish()
    setQueue(nextQueue)
    setFeedback(null)
    setPhase('question')
    setTurnNo((n) => n + 1)
  }

  // Tom kö: fyll på med extra övning, eller avsluta om det inte finns något att öva på.
  useEffect(() => {
    if (phase !== 'question') return
    if (turn?.kind === 'skip') return advance(queue.filter((q) => q !== turn.item))
    if (turn === null) {
      const extra = extraQueue(getSnap())
      if (!extra.length) return finish()
      setExtraMode(true)
      advance(extra)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase])

  async function introDone() {
    if (turn?.kind !== 'intro') return
    const now = Date.now()
    if (!getSnap().cards.has(turn.word.id)) {
      await actions.saveCard(turn.word.id, newCard(now))
      setTally((t) => ({ ...t, newWords: t.newWords + 1 }))
    }
    fx.tap()
    advance(afterIntro(queue, turn.item))
  }

  function onResult(results: Result[], ms: number) {
    if (turn?.kind !== 'quiz') return
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
      const rating = autoRating(card, r.correct, ms, type)
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
    setTally({
      ...tally,
      answered: tally.answered + results.length,
      correct: tally.correct + results.length - wrong.length,
      combo,
      bestCombo: Math.max(tally.bestCombo, combo),
    })
    const words = (allCorrect ? results : wrong).map((r) => snap.words.get(r.wordId)!).filter(Boolean)
    setFeedback({
      correct: allCorrect,
      title: allCorrect ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : type === 'match' ? 'Öva lite mer på' : 'Inte riktigt',
      words: type === 'match' && allCorrect ? [] : words,
      nextDue: allCorrect ? nextDue : undefined,
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

  // Enter = fortsätt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (phase === 'feedback') {
        e.preventDefault()
        advance(queue)
      } else if (phase === 'question' && turn?.kind === 'intro') void introDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'summary') return <Summary tally={tally} elapsed={elapsed} onExit={onExit} />

  const left = Math.max(0, total - elapsed)
  const clock = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}`

  return (
    <div className="session">
      <header className="session-top">
        <button className="icon-btn" onClick={finish} aria-label="Avsluta passet">
          <Icon name="close" />
        </button>
        <div className="progress" role="progressbar" aria-label="Tid" aria-valuenow={Math.round((elapsed / total) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
        </div>
        <span className="clock">{clock}</span>
        {tally.combo >= 2 && <span className="combo" key={tally.combo}>{tally.combo} i rad</span>}
      </header>

      <div className="session-body">
        {extraMode && <div className="notice slim">Extra övning – påverkar inte schemat</div>}
        {turn?.kind === 'intro' && (
          <div className="intro pop-in" key={'i' + turnNo}>
            <span className="tag">Nytt ord</span>
            <WordCard word={turn.word} />
          </div>
        )}
        {turn?.kind === 'quiz' && (
          <div className="pop-in" key={turnNo + ':' + attempt}>
            {'options' in turn.exercise ? (
              <MultipleChoice ex={turn.exercise} onDone={onResult} />
            ) : turn.exercise.type === 'match' ? (
              <Matching ex={turn.exercise} onDone={onResult} />
            ) : (
              <Typing ex={turn.exercise} onDone={onResult} />
            )}
          </div>
        )}
      </div>

      {turn?.kind === 'intro' && phase === 'question' && (
        <footer className="session-foot">
          <button className="btn primary big" onClick={() => void introDone()}>Fortsätt</button>
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
          <div className="row">
            <button className="btn ghost" onClick={undoLast} title="Ångra svaret och försök igen">
              <Icon name="undo" size={18} /> Ångra
            </button>
            <button className="btn primary grow" onClick={() => advance(queue)}>Fortsätt</button>
          </div>
        </footer>
      )}
    </div>
  )
}

function Summary({ tally, elapsed, onExit }: { tally: Tally; elapsed: number; onExit: () => void }) {
  const stats = useMemo(() => computeStats(getSnap(), Date.now()), [])
  const acc = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : 100
  return (
    <div className="session summary">
      <div className="session-body center">
        <p className="big-emoji pop-in">🎉</p>
        <h1>Passet är klart!</h1>
        <div className="streak lit big"><Icon name="flame" size={30} /><strong>{stats.current}</strong><span>{stats.current === 1 ? 'dag i rad' : 'dagar i rad'}</span></div>
        <div className="tiles two">
          <div className="tile"><strong>{tally.answered}</strong><span>svar</span></div>
          <div className="tile"><strong>{acc}%</strong><span>rätt</span></div>
          <div className="tile"><strong>{tally.newWords}</strong><span>nya ord</span></div>
          <div className="tile"><strong>{Math.max(1, Math.round(elapsed / 60_000))}</strong><span>minuter</span></div>
        </div>
        {tally.bestCombo >= 3 && <p className="muted">Längsta svit: {tally.bestCombo} rätt i rad</p>}
      </div>
      <footer className="session-foot">
        <button className="btn primary big" autoFocus onClick={onExit}>Klar</button>
      </footer>
    </div>
  )
}
