import { useEffect, useMemo, useRef, useState } from 'react'
import { fx } from '../fx'
import { checkReading, checkSwedish, kanaPreview, shuffle, type Exercise } from '../session'
import type { Word } from '../types'
import { Furi, SpeakButton } from './bits'

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
          <Furi word={ex.word.word} reading={ex.word.reading} />
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
              {jaToSv ? <span>{o.meaning}</span> : <span className="option-ja"><Furi word={o.word} reading={o.reading} /></span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Skriv svaret: antingen den svenska betydelsen, eller det japanska ordet (i hiragana/romaji). */
export function Typing({ ex, onDone }: { ex: Extract<Exercise, { type: 'type_sv' | 'type_from_sv' }>; onDone: Done }) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<'' | 'right' | 'wrong'>('')
  const input = useRef<HTMLInputElement>(null)
  const elapsed = useElapsed()
  const toJapanese = ex.type === 'type_from_sv'

  useEffect(() => {
    input.current?.focus()
  }, [])

  function submit(giveUp = false) {
    if (state) return
    if (!giveUp && !value.trim()) return
    const correct = !giveUp && (toJapanese ? checkReading(value, ex.word) : checkSwedish(value, ex.word))
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
      <p className="ex-label">{toJapanese ? 'Skriv ordet på japanska' : 'Skriv betydelsen på svenska'}</p>
      {toJapanese ? (
        <div className="prompt-sv">{ex.word.meaning}</div>
      ) : (
        <div className="prompt-ja">
          <Furi word={ex.word.word} reading={ex.word.reading} />
          <SpeakButton text={ex.word.word} />
        </div>
      )}
      <input
        ref={input}
        className={'type-input ' + state + (toJapanese ? ' ja' : '')}
        lang={toJapanese ? 'ja' : 'sv'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={!!state}
        placeholder={toJapanese ? 'ひらがな eller romaji' : 'Svenska'}
        aria-label="Ditt svar"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      {toJapanese && (
        <div className="kana-preview" aria-live="polite">
          <span lang="ja" className="ja">{/[a-z]/i.test(value) ? kanaPreview(value) : ' '}</span>
        </div>
      )}
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
        setTimeout(() => onDone(ex.graded.map((id) => ({ wordId: id, correct: !failed.current.has(id) })), ms), 600)
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

  const release = () => {
    const d = drag.current
    drag.current = null
    if (d) {
      d.el.classList.remove('dragging')
      d.el.style.transform = ''
    }
    setHover(null)
    return d
  }

  return (
    <div className="exercise">
      <p className="ex-label">Dra varje ord till rätt betydelse</p>
      <div className="match">
        <div className="match-col">
          {ex.words.map((w) =>
            matched.has(w.id) ? (
              // Ordet har flyttat till sin betydelse; luckan behåller sin plats så att inget hoppar.
              <div key={w.id} className="chip word gone" aria-hidden="true" />
            ) : (
              <div
                key={w.id}
                className={'chip word' + (selected === w.id ? ' selected' : '') + (shake === w.id ? ' shake' : '')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(w.id)}
                onPointerDown={(e) => {
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
                  const d = release()
                  if (!d) return
                  if (d.moved) {
                    const target = targetAt(e.clientX, e.clientY)
                    if (target) attempt(d.id, target)
                  } else setSelected(selected === d.id ? null : d.id)
                }}
                onPointerCancel={release}
              >
                <Furi word={w.word} reading={w.reading} />
              </div>
            ),
          )}
        </div>
        <div className="match-col">
          {meanings.map((w) => {
            const done = matched.has(w.id)
            return (
              <button
                key={w.id}
                data-meaning={w.id}
                className={'chip meaning' + (done ? ' done' : '') + (hover === w.id && !done ? ' hover' : '')}
                disabled={done}
                onClick={() => selected && attempt(selected, w.id)}
              >
                {done && <span className="chip-word"><Furi word={w.word} reading={w.reading} /></span>}
                <span className={done ? 'clamp1' : 'clamp3'}>{w.meaning}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="muted small center">Du kan också trycka på ett ord och sedan på betydelsen.</p>
    </div>
  )
}
