import { useEffect, useMemo, useRef, useState } from 'react'
import { fx } from '../fx'
import { checkReading, kanaPreview, shuffle, type Exercise } from '../session'
import type { Word } from '../types'
import { Ja, SpeakButton } from './bits'

export interface Result { wordId: string; correct: boolean }
type Done = (results: Result[], ms: number) => void

function useElapsed() {
  const start = useRef(performance.now())
  return () => performance.now() - start.current
}

export function MultipleChoice({ ex, onDone }: { ex: Extract<Exercise, { options: Word[] }>; onDone: Done }) {
  const [picked, setPicked] = useState<string | null>(null)
  const elapsed = useElapsed()
  const jaToSv = ex.type === 'mc_ja_sv'

  function pick(id: string) {
    if (picked) return
    setPicked(id)
    onDone([{ wordId: ex.word.id, correct: id === ex.word.id }], elapsed())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (i >= 0 && i < ex.options.length) pick(ex.options[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="exercise">
      <p className="ex-label">{jaToSv ? 'Vad betyder ordet?' : 'Vilket ord betyder detta?'}</p>
      {jaToSv ? (
        <div className="prompt-ja">
          <Ja>{ex.word.word}</Ja>
          <SpeakButton text={ex.word.word} />
        </div>
      ) : (
        <div className="prompt-sv">{ex.word.meaning}</div>
      )}
      <div className={'options' + (jaToSv ? '' : ' grid')}>
        {ex.options.map((o, i) => {
          const state = !picked ? '' : o.id === ex.word.id ? ' right' : o.id === picked ? ' wrong' : ' dim'
          return (
            <button key={o.id} className={'option' + state} disabled={!!picked} onClick={() => pick(o.id)}>
              <kbd>{i + 1}</kbd>
              {jaToSv ? <span>{o.meaning}</span> : <Ja className="option-ja">{o.word}</Ja>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Typing({ ex, onDone }: { ex: Extract<Exercise, { type: 'type_reading' | 'type_from_sv' }>; onDone: Done }) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<'' | 'right' | 'wrong'>('')
  const input = useRef<HTMLInputElement>(null)
  const elapsed = useElapsed()
  const fromSv = ex.type === 'type_from_sv'

  useEffect(() => {
    input.current?.focus()
  }, [])

  function submit(giveUp = false) {
    if (state) return
    if (!giveUp && !value.trim()) return
    const correct = !giveUp && checkReading(value, ex.word)
    setState(correct ? 'right' : 'wrong')
    input.current?.blur()
    onDone([{ wordId: ex.word.id, correct }], elapsed())
  }

  return (
    <form
      className="exercise"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="ex-label">{fromSv ? 'Skriv ordet på japanska (läsningen)' : 'Skriv läsningen'}</p>
      {fromSv ? (
        <div className="prompt-sv">{ex.word.meaning}</div>
      ) : (
        <div className="prompt-ja">
          <Ja>{ex.word.word}</Ja>
        </div>
      )}
      <input
        ref={input}
        className={'type-input ' + state}
        lang="ja"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={!!state}
        placeholder="ひらがな eller romaji"
        aria-label="Ditt svar"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      <div className="kana-preview" aria-live="polite">
        <Ja>{/[a-z]/i.test(value) ? kanaPreview(value) : '\u00a0'}</Ja>
      </div>
      {!state && (
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => submit(true)}>Vet inte</button>
          <button type="submit" className="btn primary grow" disabled={!value.trim()}>Kontrollera</button>
        </div>
      )}
    </form>
  )
}

export function Matching({ ex, onDone }: { ex: Extract<Exercise, { type: 'match' }>; onDone: Done }) {
  const meanings = useMemo(() => shuffle(ex.words), [ex])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const failed = useRef(new Set<string>())
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean; el: HTMLElement } | null>(null)
  const elapsed = useElapsed()

  function attempt(wordId: string, meaningId: string) {
    setSelected(null)
    if (matched.has(meaningId)) return
    if (wordId === meaningId) {
      const next = new Set(matched).add(wordId)
      setMatched(next)
      fx.pop(next.size - 1)
      if (next.size === ex.words.length) {
        const ms = elapsed() / ex.words.length
        setTimeout(() => onDone(ex.graded.map((id) => ({ wordId: id, correct: !failed.current.has(id) })), ms), 450)
      }
    } else {
      failed.current.add(wordId).add(meaningId)
      fx.wrong()
      setShake(wordId)
      setTimeout(() => setShake(null), 450)
    }
  }

  const targetAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-meaning]') as HTMLElement | null)?.dataset.meaning ?? null

  return (
    <div className="exercise">
      <p className="ex-label">Dra varje ord till rätt betydelse</p>
      <div className="match">
        <div className="match-col">
          {ex.words.map((w) => (
            <div
              key={w.id}
              className={'chip word' + (matched.has(w.id) ? ' done' : '') + (selected === w.id ? ' selected' : '') + (shake === w.id ? ' shake' : '')}
              role="button"
              tabIndex={matched.has(w.id) ? -1 : 0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !matched.has(w.id) && setSelected(w.id)}
              onPointerDown={(e) => {
                if (matched.has(w.id)) return
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { id: w.id, x: e.clientX, y: e.clientY, moved: false, el: e.currentTarget }
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (!d) return
                const dx = e.clientX - d.x
                const dy = e.clientY - d.y
                if (!d.moved && Math.hypot(dx, dy) < 8) return
                d.moved = true
                d.el.classList.add('dragging')
                d.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`
                setHover(targetAt(e.clientX, e.clientY))
              }}
              onPointerUp={(e) => {
                const d = drag.current
                drag.current = null
                if (!d) return
                d.el.classList.remove('dragging')
                d.el.style.transform = ''
                setHover(null)
                if (d.moved) {
                  const target = targetAt(e.clientX, e.clientY)
                  if (target) attempt(d.id, target)
                } else setSelected(selected === d.id ? null : d.id)
              }}
              onPointerCancel={() => {
                const d = drag.current
                drag.current = null
                if (d) {
                  d.el.classList.remove('dragging')
                  d.el.style.transform = ''
                }
                setHover(null)
              }}
            >
              <Ja>{w.word}</Ja>
            </div>
          ))}
        </div>
        <div className="match-col">
          {meanings.map((w) => (
            <button
              key={w.id}
              data-meaning={w.id}
              className={'chip meaning' + (matched.has(w.id) ? ' done' : '') + (hover === w.id && !matched.has(w.id) ? ' hover' : '')}
              disabled={matched.has(w.id)}
              onClick={() => selected && attempt(selected, w.id)}
            >
              <span className="clamp3">{w.meaning}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="muted small center">Du kan också trycka på ett ord och sedan på betydelsen.</p>
    </div>
  )
}
