import { useEffect, useMemo, useRef, useState } from 'react'
import { burst, fx, speak } from '../fx'
import { checkReading, checkSwedish, hintFor, kanaPreview, meaningPrompt, shuffle, type Exercise } from '../session'
import { getSnap } from '../store'
import { furigana } from '../furigana'
import { Furi, FuriText, Icon, Ja, Segs, SpeakButton } from './bits'

export interface Result { wordId: string; correct: boolean; answer?: string; hinted?: boolean }
type Done = (results: Result[], ms: number) => void

function useElapsed() {
  const start = useRef(performance.now())
  return () => performance.now() - start.current
}

const optionStyle = (i: number) => ({ '--i': i }) as React.CSSProperties

/** Läser upp texten och släpper fram svarsalternativen först en sekund efter att
 *  uppläsningen är klar – så att man lyssnar i stället för att läsa svaren. */
function useListenGate(text: string, active: boolean): [boolean, () => void] {
  const [ready, setReady] = useState(!active)
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    speak(text, () => {
      timer = setTimeout(() => alive && setReady(true), 1000)
    })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [text, active])
  // "Spela upp igen" läser bara upp; alternativen som redan syns ligger kvar.
  const replay = () => speak(text, () => setTimeout(() => setReady(true), 1000))
  return [ready, replay]
}

function Waiting() {
  return (
    <div className="listen-wait" aria-live="polite">
      <span /><span /><span />
      <p className="muted small">Lyssna – svaren visas strax</p>
    </div>
  )
}

/** Flerval i tre varianter: se ordet, se betydelsen eller bara höra ordet. */
export function MultipleChoice({ ex, onDone }: { ex: Extract<Exercise, { type: 'mc_ja_sv' | 'mc_sv_ja' | 'listen' }>; onDone: Done }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const elapsed = useElapsed()
  const listen = ex.type === 'listen'
  const toSwedish = ex.type !== 'mc_sv_ja'
  const [ready, replay] = useListenGate(ex.word.word, listen)

  function pick(id: string, el: Element | null) {
    if (picked) return
    setPicked(id)
    const correct = id === ex.word.id
    if (correct) burst(el)
    setRevealed(true)
    onDone([{ wordId: ex.word.id, correct }], elapsed())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (ready && i >= 0 && i < ex.options.length) pick(ex.options[i].id, document.querySelectorAll('.option')[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="exercise">
      <p className="ex-label">{listen ? 'Lyssna – vad betyder ordet?' : toSwedish ? 'Vad betyder ordet?' : 'Vilket ord betyder detta?'}</p>
      {listen ? (
        <div className="prompt-listen">
          <button type="button" className="listen-btn" onClick={replay} aria-label="Spela upp igen">
            <Icon name="sound" size={44} />
          </button>
          <div className="listen-answer">{revealed && <span className="pop-in"><Furi word={ex.word.word} reading={ex.word.reading} /></span>}</div>
        </div>
      ) : toSwedish ? (
        <div className="prompt-ja">
          <Furi word={ex.word.word} reading={ex.word.reading} />
          <SpeakButton text={ex.word.word} />
        </div>
      ) : (
        <div className="prompt-sv">{meaningPrompt(ex.word.meaning)}</div>
      )}
      {!ready ? <Waiting /> : <div className={'options' + (toSwedish ? '' : ' grid')}>
        {ex.options.map((o, i) => {
          const state = !picked ? '' : o.id === ex.word.id ? ' right' : o.id === picked ? ' wrong' : ' dim'
          return (
            <button key={o.id} style={optionStyle(i)} className={'option' + state} disabled={!!picked} onClick={(e) => pick(o.id, e.currentTarget)}>
              <kbd>{i + 1}</kbd>
              {toSwedish ? <span>{o.meaning}</span> : <span className="option-ja"><Furi word={o.word} reading={o.reading} /></span>}
            </button>
          )
        })}
      </div>}
    </div>
  )
}

/** Meningsförståelse: hör en exempelmening och välj rätt översättning. */
/** Meningsförståelse: hör en mening och välj rätt översättning. Används både för
 *  exempelmeningar och för meningar med en böjd form av ordet. */
export function Sentence({ ex, onDone }: { ex: Extract<Exercise, { type: 'sentence' | 'form' }>; onDone: Done }) {
  const example = ex.type === 'form' ? ex.form.ex : ex.example
  const [picked, setPicked] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [ready, replay] = useListenGate(example.ja, true)
  const elapsed = useElapsed()

  function pick(choice: string, el: Element | null) {
    if (picked) return
    setPicked(choice)
    const correct = choice === example.sv
    if (correct) burst(el)
    setShowText(true)
    onDone([{ wordId: ex.word.id, correct }], elapsed())
  }

  return (
    <div className="exercise">
      <p className="ex-label">{ex.type === 'form' ? 'Lyssna – ordet är böjt. Vad betyder meningen?' : 'Lyssna – vad betyder meningen?'}</p>
      <div className="prompt-listen">
        <button type="button" className="listen-btn" onClick={replay} aria-label="Spela upp igen">
          <Icon name="sound" size={44} />
        </button>
        {showText ? (
          <div className="sentence-text pop-in">
            <FuriText ja={example.ja} reading={example.reading} word={ex.word} />
            {ex.type === 'form' && picked && (
              <div className="form-label">
                <Furi word={ex.form.ja} reading={ex.form.reading} /> = {ex.form.label} av <Furi word={ex.word.word} reading={ex.word.reading} />
              </div>
            )}
          </div>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setShowText(true)}>Visa texten</button>
        )}
      </div>
      {!ready ? <Waiting /> : (
        <div className="options">
          {ex.choices.map((c, i) => {
            const state = !picked ? '' : c === example.sv ? ' right' : c === picked ? ' wrong' : ' dim'
            return (
              <button key={c} style={optionStyle(i)} className={'option' + state} disabled={!!picked} onClick={(e) => pick(c, e.currentTarget)}>
                <kbd>{i + 1}</kbd>
                <span>{c}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Lucktext: exempelmeningen med ordet borttaget – välj ordet som passar. */
export function Cloze({ ex, onDone }: { ex: Extract<Exercise, { type: 'cloze' }>; onDone: Done }) {
  const [picked, setPicked] = useState<string | null>(null)
  const elapsed = useElapsed()
  // Furigana för resten av meningen. Gränser runt luckan gör att inget kanji på andra
  // sidan luckan råkar få målordets läsning.
  const [before, after] = useMemo(() => {
    const at = ex.before.length
    const end = at + ex.gap.length
    const segs = furigana(ex.example.ja, ex.example.reading, { at, len: ex.gap.length, reading: ex.gapReading })
    if (!segs) return [null, null]
    return [segs.filter((s) => s.start < at), segs.filter((s) => s.start >= end)]
  }, [ex])

  function pick(id: string, el: Element | null) {
    if (picked) return
    setPicked(id)
    const correct = id === ex.word.id
    if (correct) burst(el)
    onDone([{ wordId: ex.word.id, correct }], elapsed())
  }

  return (
    <div className="exercise">
      <p className="ex-label">{ex.form ? 'Vilket ord saknas? Det står böjt i meningen – välj grundformen.' : 'Vilket ord saknas?'}</p>
      <div className="cloze">
        <div className="cloze-ja">
          {before ? <Segs segs={before} /> : <Ja>{ex.before}</Ja>}
          <span className={'gap' + (picked ? ' filled' : '')}>{picked ? <Furi word={ex.gap} reading={ex.gapReading} /> : '？'}</span>
          {after ? <Segs segs={after} /> : <Ja>{ex.after}</Ja>}
          {picked && <SpeakButton text={ex.example.ja} small />}
        </div>
        <div className="cloze-sv">{ex.example.sv}</div>
        {picked && ex.form && (
          <div className="form-label pop-in">
            <Furi word={ex.gap} reading={ex.gapReading} /> är {ex.form.label} av <Furi word={ex.word.word} reading={ex.word.reading} />
          </div>
        )}
      </div>
      <div className="options grid">
        {ex.options.map((o, i) => {
          const state = !picked ? '' : o.id === ex.word.id ? ' right' : o.id === picked ? ' wrong' : ' dim'
          return (
            <button key={o.id} style={optionStyle(i)} className={'option' + state} disabled={!!picked} onClick={(e) => pick(o.id, e.currentTarget)}>
              <kbd>{i + 1}</kbd>
              <span className="option-ja"><Furi word={o.word} reading={o.reading} /></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Knapparna under ett textfält tar inte fokus från fältet. Annars fälls tangentbordet ner
 *  mitt i trycket, knappen flyttar sig och trycket hamnar fel. */
const keepFocus = (e: React.PointerEvent) => e.preventDefault()

/** Skriv svaret: antingen den svenska betydelsen, eller det japanska ordet (i hiragana/romaji). */
export function Typing({ ex, onDone }: { ex: Extract<Exercise, { type: 'type_sv' | 'type_from_sv' }>; onDone: Done }) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<'' | 'right' | 'wrong'>('')
  const [hint, setHint] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const elapsed = useElapsed()
  const toJapanese = ex.type === 'type_from_sv'

  useEffect(() => {
    input.current?.focus()
  }, [])

  function submit(giveUp = false) {
    if (state) return
    if (!giveUp && !value.trim()) return
    const correct = !giveUp && (toJapanese ? checkReading(value, ex.word, getSnap().words.values()) : checkSwedish(value, ex.word))
    setState(correct ? 'right' : 'wrong')
    if (correct) burst(input.current)
    input.current?.blur()
    onDone([{ wordId: ex.word.id, correct, answer: giveUp ? undefined : value.trim(), hinted: hint !== null }], elapsed())
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
        <div className="prompt-sv">{meaningPrompt(ex.word.meaning)}</div>
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
        placeholder={toJapanese ? 'Kanji, ひらがな eller romaji' : 'Svenska'}
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
      {hint !== null && <div className="hint pop-in"><span>Ledtråd</span> <span lang={toJapanese ? 'ja' : 'sv'} className={toJapanese ? 'ja' : ''}>{hint}</span></div>}
      {!state && (
        <div className="row">
          <button type="button" className="btn ghost" onPointerDown={keepFocus} onClick={() => submit(true)}>Vet inte</button>
          {hint === null && (
            <button
              type="button"
              onPointerDown={keepFocus}
              className="btn ghost"
              onClick={() => {
                setHint(hintFor(ex.word, toJapanese))
                input.current?.focus()
              }}
            >
              Ledtråd
            </button>
          )}
          <button type="submit" className="btn primary grow" onPointerDown={keepFocus} disabled={!value.trim()}>Kontrollera</button>
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
      requestAnimationFrame(() => burst(document.querySelector(`[data-meaning="${meaningId}"]`), 10))
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
