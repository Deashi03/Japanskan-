import { useMemo, useState } from 'react'
import { formatDue, isProblem, STATUS_LABEL, statusOf } from '../srs'
import { byOrder } from '../session'
import { actions, useStore } from '../store'
import type { Breakdown, Distinction, Example, Word } from '../types'
import { Icon, Ja, Modal, WordCard } from './bits'

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

export function WordList({ onImport }: { onImport: () => void }) {
  const snap = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [list, setList] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const now = Date.now()

  const lists = useMemo(() => [...new Set([...snap.words.values()].map((w) => w.list))].sort(), [snap.words])
  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...snap.words.values()]
      .filter((w) => {
        if (list && w.list !== list) return false
        if (q && !(w.word.includes(q) || w.reading.includes(q) || w.meaning.toLowerCase().includes(q) || w.synonyms?.some((x) => x.toLowerCase().includes(q)))) return false
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
  }, [snap, query, filter, list])

  const open = openId ? snap.words.get(openId) : undefined
  const openCard = openId ? snap.cards.get(openId) : undefined
  const inList = list ? [...snap.words.values()].filter((w) => w.list === list) : []
  const listPaused = inList.length > 0 && inList.every((w) => w.suspended)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Ordlista <span className="muted count">{snap.words.size}</span></h1>
        <button className="btn primary" onClick={onImport}><Icon name="plus" size={18} /> Importera</button>
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
      {words.length === 0 ? (
        <p className="muted center pad">{snap.words.size ? 'Inga ord matchar.' : 'Inga ord än – importera en lista för att börja.'}</p>
      ) : (
        <ul className="wordlist">
          {words.map((w) => {
            const c = snap.cards.get(w.id)
            const s = statusOf(c)
            return (
              <li key={w.id} className="wordrow-wrap">
                {!c && !w.suspended && (
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
                <button className={'wordrow' + (w.suspended ? ' paused' : '')} onClick={() => setOpenId(w.id)}>
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
        </ul>
      )}

      {open && !editing && (
        <Modal title="Ord" onClose={() => setOpenId(null)}>
          <WordCard word={open} />
          {!!open.synonyms?.length && <p className="synonyms"><span>Godkänns också:</span> {open.synonyms.join(', ')}</p>}
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
