import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDue, isProblem, knownCard, STATUS_LABEL, statusOf } from '../srs'
import { byOrder } from '../session'
import { actions, useExtra, useStore } from '../store'
import type { Breakdown, Distinction, Example, Word } from '../types'
import { FuriText, Icon, Ja, Modal, POS_LABEL, SpeakButton, WordCard } from './bits'
import { addToWishlist, wishCount, Wishlist } from './Wishlist'

type Filter = 'all' | 'chosen' | 'new' | 'learning' | 'known' | 'problem' | 'suspended'
const FILTERS: [Filter, string][] = [
  ['all', 'Alla'],
  ['chosen', 'Valda härnäst'],
  ['new', 'Nya'],
  ['learning', 'Lärs in'],
  ['known', 'Kan'],
  ['problem', 'Problemord'],
  ['suspended', 'Pausade'],
]

/** All text ett ord går att hitta på: japanska, läsning, betydelse, synonymer, ämnen,
 *  sökord och ordklass. Sparas per ord så att den bara byggs om när ordet ändras. */
const searchCache = new WeakMap<Word, string>()
function searchText(w: Word): string {
  let t = searchCache.get(w)
  if (t === undefined) {
    t = [w.word, w.reading, w.meaning, ...(w.synonyms ?? []), ...(w.categories ?? []), ...(w.tags ?? []), ...(w.pos ?? []).map((p) => POS_LABEL[p] ?? p)]
      .join('\n')
      .toLowerCase()
    searchCache.set(w, t)
  }
  return t
}

/** Alla sökord måste finnas med ("juridik titel" hittar ord som har båda). */
const matches = (w: Word, terms: string[]) => terms.every((term) => searchText(w).includes(term))

const PAGE = 80

export function WordList({ onImport }: { onImport: () => void }) {
  const snap = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [list, setList] = useState('')
  const [category, setCategory] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [wishOpen, setWishOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  /** Utför en åtgärd på de markerade orden och lämnar sedan markeringsläget. */
  const bulk = (action: () => Promise<void>) => {
    void action()
    stopSelecting()
  }
  // Långa listor ritas en bit i taget; nästa bit läggs till när man scrollar ner.
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLLIElement>(null)
  useEffect(() => setLimit(PAGE), [query, filter, list, category, posFilter])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((n) => n + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  })
  // Svepmarkering: dra fingret längs rutorna till vänster för att markera eller avmarkera flera.
  const swipe = useRef<{ on: boolean; seen: Set<string> } | null>(null)
  const [swiping, setSwiping] = useState(false)
  const swipeTo = (id: string | undefined) => {
    const s = swipe.current
    if (!s || !id || s.seen.has(id)) return
    s.seen.add(id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (s.on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const [examplesFor, setExamplesFor] = useState<Word | null>(null)
  const [wished, setWished] = useState('')
  const wishes = wishCount(snap.settings.wishlist)
  const now = Date.now()

  // Ämnen och ordklasser som finns bland orden, med antal – bara de visas i filtren.
  const { categories, poses } = useMemo(() => {
    const c = new Map<string, number>()
    const p = new Map<string, number>()
    for (const w of snap.words.values()) {
      for (const x of w.categories ?? []) c.set(x, (c.get(x) ?? 0) + 1)
      for (const x of w.pos ?? []) p.set(x, (p.get(x) ?? 0) + 1)
    }
    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))
    return { categories: sort(c), poses: sort(p) }
  }, [snap])
  const lists = useMemo(() => [...new Set([...snap.words.values()].map((w) => w.list))].sort(), [snap])
  const words = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return [...snap.words.values()]
      .filter((w) => {
        if (list && w.list !== list) return false
        if (category && !w.categories?.includes(category)) return false
        if (posFilter && !w.pos?.includes(posFilter)) return false
        if (terms.length && !matches(w, terms)) return false
        const c = snap.cards.get(w.id)
        const s = statusOf(c)
        if (filter === 'chosen') return !c && !!w.priority
        if (filter === 'new') return s === 'new'
        if (filter === 'learning') return s === 'learning'
        if (filter === 'known') return s === 'young' || s === 'mature'
        if (filter === 'problem') return isProblem(c)
        if (filter === 'suspended') return !!w.suspended
        return true
      })
      .sort(filter === 'chosen' ? byOrder : (a, b) => a.createdAt - b.createdAt || a.order - b.order)
  }, [snap, query, filter, list, category, posFilter])

  // Bara ord som fortfarande visas räknas som markerade; varje åtgärd gäller de ord den passar för.
  const picked = words.filter((w) => selected.has(w.id))
  const canQueue = picked.filter((w) => !snap.cards.has(w.id) && !w.suspended && !w.priority)
  const canKnow = picked.filter((w) => !w.suspended && ['new', 'learning'].includes(statusOf(snap.cards.get(w.id))))
  const allPaused = picked.length > 0 && picked.every((w) => w.suspended)
  const open = openId ? snap.words.get(openId) : undefined
  const openCard = openId ? snap.cards.get(openId) : undefined
  const inList = list ? [...snap.words.values()].filter((w) => w.list === list) : []
  const listPaused = inList.length > 0 && inList.every((w) => w.suspended)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Ordlista <span className="muted count">{snap.words.size}</span></h1>
        <div className="row">
          <button className="btn" onClick={() => setWishOpen(true)}>Önskelista{wishes > 0 ? ` (${wishes})` : ''}</button>
          <button className="btn primary" onClick={onImport}><Icon name="plus" size={18} /> Importera</button>
        </div>
      </header>
      <input className="search" type="search" placeholder="Sök på japanska eller svenska" value={query} onChange={(e) => setQuery(e.target.value)} />
      {filter === 'chosen' && <p className="muted small">Valda ord introduceras före alla andra nya ord, i den ordning du valde dem. Är de fler än passet rymmer kommer resten i nästa pass.</p>}
      <div className="chips">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={'pill' + (filter === id ? ' active' : '')} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {lists.length > 1 && (
        <select className="select" value={list} onChange={(e) => setList(e.target.value)} aria-label="Lista">
          <option value="">Alla listor</option>
          {lists.map((l) => <option key={l}>{l}</option>)}
        </select>
      )}
      {(categories.length > 0 || poses.length > 0) && (
        <div className="filters">
          {categories.length > 0 && (
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Ämne">
              <option value="">Alla ämnen</option>
              {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
            </select>
          )}
          {poses.length > 0 && (
            <select className="select" value={posFilter} onChange={(e) => setPosFilter(e.target.value)} aria-label="Ordklass">
              <option value="">Alla ordklasser</option>
              {poses.map(([p, n]) => <option key={p} value={p}>{POS_LABEL[p] ?? p} ({n})</option>)}
            </select>
          )}
        </div>
      )}
      {list && (
        <div className="row wrap">
          <button className="btn small" onClick={() => void actions.saveWords(inList.map((w) => ({ ...w, suspended: !listPaused })))}>
            {listPaused ? 'Återuppta listan' : 'Pausa listan'}
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`Ta bort listan "${list}" med ${inList.length} ord och all framgång för dem?`)) {
                void actions.deleteWords(inList.map((w) => w.id))
                setList('')
              }
            }}
          >
            Ta bort listan
          </button>
        </div>
      )}
      {words.length > 0 && (
        <div className="row between">
          <span className="muted small">{words.length} ord visas</span>
          {selecting ? (
            <div className="row">
              <button className="btn small" onClick={() => setSelected(new Set(selected.size === words.length ? [] : words.map((w) => w.id)))}>
                {selected.size === words.length ? 'Avmarkera alla' : 'Markera alla'}
              </button>
              <button className="btn small ghost" onClick={stopSelecting}>Klar</button>
            </div>
          ) : (
            <button className="btn small" onClick={() => setSelecting(true)}>Välj flera</button>
          )}
        </div>
      )}
      {words.length === 0 ? (
        <div className="center pad">
          <p className="muted">{snap.words.size ? 'Inga ord matchar.' : 'Inga ord än – importera en lista för att börja.'}</p>
          {query.trim() && (
            wished === query.trim() ? (
              <p className="added">”{wished}” ligger nu i önskelistan.</p>
            ) : (
              <button
                className="btn primary add-wish"
                onClick={() => {
                  addToWishlist(query)
                  setWished(query.trim())
                }}
              >
                <Icon name="plus" size={18} /> Lägg ”{query.trim()}” i önskelistan
              </button>
            )
          )}
        </div>
      ) : (
        <ul
          className={'wordlist' + (selecting ? ' selecting' : '')}
          onPointerMove={(e) => swipe.current && swipeTo((document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]') as HTMLElement | null)?.dataset.id)}
          onPointerUp={() => { swipe.current = null; setSwiping(false) }}
          onPointerCancel={() => { swipe.current = null; setSwiping(false) }}
        >
          {words.slice(0, limit).map((w) => {
            const c = snap.cards.get(w.id)
            const s = statusOf(c)
            return (
              <li key={w.id} className="wordrow-wrap" data-id={w.id}>
                {selecting ? (
                  <button
                    className={'pick box' + (selected.has(w.id) ? ' on' : '')}
                    role="checkbox"
                    aria-checked={selected.has(w.id)}
                    aria-label={`Markera ${w.word}`}
                    onPointerDown={(e) => {
                      // Första rutan avgör om svepet markerar eller avmarkerar.
                      e.currentTarget.releasePointerCapture?.(e.pointerId)
                      swipe.current = { on: !selected.has(w.id), seen: new Set() }
                      setSwiping(true)
                      swipeTo(w.id)
                    }}
                    onClick={(e) => e.detail === 0 && toggle(w.id)}
                  >
                    {selected.has(w.id) && <Icon name="check" size={18} />}
                  </button>
                ) : !c && !w.suspended && (
                  <button
                    className={'pick' + (w.priority ? ' on' : '')}
                    aria-pressed={!!w.priority}
                    aria-label={w.priority ? `Ta bort ${w.word} från nästa pass` : `Lär mig ${w.word} härnäst`}
                    title={w.priority ? 'Vald till nästa pass' : 'Lär mig härnäst'}
                    onClick={() => void actions.saveWords([{ ...w, priority: w.priority ? undefined : Date.now() }])}
                  >
                    <Icon name={w.priority ? 'check' : 'plus'} size={18} />
                  </button>
                )}
                <button className={'wordrow' + (w.suspended ? ' paused' : '')} onClick={() => (selecting ? toggle(w.id) : setOpenId(w.id))}>
                  <div className="wordrow-main">
                    <div><Ja className="strong">{w.word}</Ja> <Ja className="muted">{w.reading}</Ja></div>
                    <div className="clamp1 muted">{w.meaning}</div>
                  </div>
                  <div className="wordrow-side">
                    {w.suspended ? <span className="badge">Pausat</span> : !c && w.priority ? <span className="badge s-learning">Härnäst</span> : isProblem(c) ? <span className="badge warn">Problemord</span> : <span className={'badge s-' + s}>{STATUS_LABEL[s]}</span>}
                    {c && !w.suspended && s !== 'new' && <span className="muted small">{formatDue(c.due, now)}</span>}
                  </div>
                </button>
              </li>
            )
          })}
          {words.length > limit && <li ref={sentinel} className="more">Visar {limit} av {words.length} …</li>}
        </ul>
      )}

      {open && !editing && (
        <Modal title="Ord" onClose={() => setOpenId(null)}>
          <WordCard word={open} />
          {!!open.synonyms?.length && <p className="synonyms"><span>Godkänns också:</span> {open.synonyms.join(', ')}</p>}
          {!!(open.categories?.length || open.tags?.length) && (
            <div className="topics">
              {(open.categories ?? []).map((c) => (
                <button key={c} className="topic" onClick={() => { setQuery(c); setOpenId(null) }}><Icon name="tag" size={14} /> {c}</button>
              ))}
              {(open.tags ?? []).map((t) => (
                <button key={t} className="topic soft" onClick={() => { setQuery(t); setOpenId(null) }}>{t}</button>
              ))}
            </div>
          )}
          {!!open.extraCount && (
            <button className="btn examples-btn" onClick={() => setExamplesFor(open)}>
              <Icon name="book" size={18} /> Alla exempelmeningar ({open.extraCount}){open.formCount ? ` och böjningar (${open.formCount})` : ''}
            </button>
          )}
          <dl className="meta">
            <div><dt>Status</dt><dd>{open.suspended ? 'Pausat' : STATUS_LABEL[statusOf(openCard)]}{isProblem(openCard) ? ' · problemord' : ''}</dd></div>
            <div><dt>Nästa repetition</dt><dd>{open.suspended ? '–' : openCard && statusOf(openCard) !== 'new' ? formatDue(openCard.due, now) : 'inte påbörjat'}</dd></div>
            <div><dt>Lista</dt><dd>{open.list}</dd></div>
            {openCard && <div><dt>Antal svar / missar</dt><dd>{openCard.reps} / {openCard.lapses}</dd></div>}
          </dl>
          <div className="row wrap">
            {!openCard && !open.suspended && (
              <button className={'btn' + (open.priority ? '' : ' primary')} onClick={() => void actions.saveWords([{ ...open, priority: open.priority ? undefined : Date.now() }])}>
                {open.priority ? 'Ta bort från nästa pass' : 'Lär mig härnäst'}
              </button>
            )}
            {!open.suspended && (statusOf(openCard) === 'new' || statusOf(openCard) === 'learning') && (
              <button className="btn" onClick={() => void actions.saveCard(open.id, knownCard(Date.now()))}>Jag kan redan det här ordet</button>
            )}
            <button className="btn" onClick={() => setEditing(true)}>Redigera</button>
            <button className="btn" onClick={() => void actions.saveWords([{ ...open, suspended: !open.suspended }])}>{open.suspended ? 'Återuppta' : 'Pausa'}</button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Ta bort ${open.word} och all framgång för ordet?`)) {
                  void actions.deleteWords([open.id])
                  setOpenId(null)
                }
              }}
            >
              Ta bort
            </button>
          </div>
        </Modal>
      )}
      {selecting && picked.length > 0 && (
        <div className={'bulk-bar' + (swiping ? ' faded' : '')} role="toolbar" aria-label="Åtgärder för markerade ord">
          <strong>{picked.length} markerade</strong>
          <div className="row wrap">
            {canQueue.length > 0 && <button className="btn small primary" onClick={() => bulk(() => actions.saveWords(canQueue.map((w, i) => ({ ...w, priority: Date.now() + i }))))}>Lär mig härnäst ({canQueue.length})</button>}
            {canKnow.length > 0 && <button className="btn small" onClick={() => bulk(() => actions.apply({ cards: canKnow.map((w) => [w.id, knownCard(Date.now())]) }))}>Kan redan ({canKnow.length})</button>}
            <button className="btn small" onClick={() => bulk(() => actions.saveWords(picked.map((w) => ({ ...w, suspended: !allPaused }))))}>{allPaused ? 'Återuppta' : 'Pausa'}</button>
          </div>
        </div>
      )}
      {examplesFor && <ExamplesModal word={examplesFor} onClose={() => setExamplesFor(null)} />}
      {wishOpen && (
        <Modal title="Önskelista" onClose={() => setWishOpen(false)}>
          <Wishlist />
        </Modal>
      )}
      {open && editing && (
        <WordEditor
          word={open}
          onClose={() => setEditing(false)}
          onSave={(w) => {
            void actions.saveWords([w])
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

function Rows<T extends Record<string, string>>({ title, rows, fields, onChange }: { title: string; rows: T[]; fields: [keyof T & string, string][]; onChange: (rows: T[]) => void }) {
  return (
    <fieldset className="rows">
      <legend>{title}</legend>
      {rows.map((r, i) => (
        <div className="rows-item" key={i}>
          {fields.map(([f, label]) => (
            <input key={f} aria-label={label} placeholder={label} value={r[f]} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))} />
          ))}
          <button type="button" className="icon-btn" aria-label="Ta bort rad" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...rows, Object.fromEntries(fields.map(([f]) => [f, ''])) as T])}>
        <Icon name="plus" size={16} /> Lägg till
      </button>
    </fieldset>
  )
}

function WordEditor({ word, onSave, onClose }: { word: Word; onSave: (w: Word) => void; onClose: () => void }) {
  const [w, setW] = useState(word)
  const [synonyms, setSynonyms] = useState((word.synonyms ?? []).join(', '))
  const [altJa, setAltJa] = useState((word.altJa ?? []).join('、'))
  const valid = w.word.trim() && w.reading.trim() && w.meaning.trim()
  return (
    <Modal title="Redigera ord" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onSave({
            ...w,
            word: w.word.trim(),
            reading: w.reading.trim(),
            meaning: w.meaning.trim(),
            synonyms: [...new Set(synonyms.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))],
            altJa: [...new Set(altJa.split(/[,、\n]/).map((x) => x.trim()).filter(Boolean))],
            breakdown: w.breakdown.filter((b) => b.kanji.trim() && b.meaning.trim()),
            examples: w.examples.filter((x) => x.ja.trim() && x.sv.trim()),
            distinctions: w.distinctions.filter((d) => d.word.trim() && d.meaning.trim()),
          })
        }}
      >
        <label className="field"><span>Ord</span><input lang="ja" value={w.word} onChange={(e) => setW({ ...w, word: e.target.value })} /></label>
        <label className="field"><span>Läsning</span><input lang="ja" value={w.reading} onChange={(e) => setW({ ...w, reading: e.target.value })} /></label>
        <label className="field"><span>Betydelse</span><textarea rows={2} value={w.meaning} onChange={(e) => setW({ ...w, meaning: e.target.value })} /></label>
        <label className="field">
          <span>Synonymer (godkända svar, åtskilda med komma)</span>
          <textarea rows={2} value={synonyms} onChange={(e) => setSynonyms(e.target.value)} />
        </label>
        <label className="field">
          <span>Japanska alternativ (godkänns när du skriver på japanska)</span>
          <input lang="ja" value={altJa} onChange={(e) => setAltJa(e.target.value)} placeholder="Åtskilda med komma" />
        </label>
        <label className="field"><span>Lista</span><input value={w.list} onChange={(e) => setW({ ...w, list: e.target.value })} /></label>
        <Rows<Breakdown & Record<string, string>> title="Nedbrytning" rows={w.breakdown as never} fields={[['kanji', 'Kanji'], ['reading', 'Läsning'], ['meaning', 'Betydelse']]} onChange={(breakdown) => setW({ ...w, breakdown })} />
        <Rows<Example & Record<string, string>> title="Exempel" rows={w.examples as never} fields={[['ja', 'Japanska'], ['reading', 'Läsning'], ['sv', 'Svenska']]} onChange={(examples) => setW({ ...w, examples })} />
        <Rows<Distinction & Record<string, string>> title="Vanlig skillnad" rows={w.distinctions as never} fields={[['word', 'Ord'], ['reading', 'Läsning'], ['meaning', 'Förklaring']]} onChange={(distinctions) => setW({ ...w, distinctions })} />
        <div className="row">
          <button type="button" className="btn ghost" onClick={onClose}>Avbryt</button>
          <button type="submit" className="btn primary grow" disabled={!valid}>Spara</button>
        </div>
      </form>
    </Modal>
  )
}

const LEVEL_LABEL = { 1: 'Enkla', 2: 'Mellannivå', 3: 'Svårare' } as const

/** Ordets alla exempelmeningar, sorterade efter svårighet, och dess böjningar. */
function ExamplesModal({ word, onClose }: { word: Word; onClose: () => void }) {
  const extra = useExtra(word.id)
  const showReading = useStore().settings.showExampleReading
  const groups = ([1, 2, 3] as const).map((level) => ({ level, items: (extra?.examples ?? []).filter((e) => (e.level ?? 1) === level) }))
  return (
    <Modal title={`Exempel: ${word.word}`} onClose={onClose}>
      {!extra ? (
        <p className="muted">Läser in …</p>
      ) : (
        <div className="examples-list">
          {groups.map(({ level, items }) =>
            items.length ? (
              <section key={level}>
                <h4>{LEVEL_LABEL[level]} ({items.length})</h4>
                {items.map((ex, i) => (
                  <div className="wc-example" key={i}>
                    <div className="wc-ex-ja">
                      <FuriText ja={ex.ja} reading={ex.reading} show={showReading} word={word} />
                      <SpeakButton text={ex.ja} small />
                    </div>
                    <div>{ex.sv}</div>
                  </div>
                ))}
              </section>
            ) : null,
          )}
          {extra.forms.length > 0 && (
            <section>
              <h4>Böjningar ({extra.forms.length})</h4>
              {extra.forms.map((f, i) => (
                <div className="wc-example" key={i}>
                  <div className="form-head"><span className="pos">{f.label}</span> <Ja className="strong">{f.ja}</Ja> <Ja className="muted">{f.reading}</Ja></div>
                  <div className="wc-ex-ja">
                    <FuriText ja={f.ex.ja} reading={f.ex.reading} show={showReading} />
                    <SpeakButton text={f.ex.ja} small />
                  </div>
                  <div>{f.ex.sv}</div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
