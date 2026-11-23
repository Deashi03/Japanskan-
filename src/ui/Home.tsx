import { useEffect, useMemo, useRef, useState } from 'react'
import { AI_PROMPT } from '../importer'
import { countDue } from '../session'
import { computeStats } from '../stats'
import { actions, useStore } from '../store'
import { fx } from '../fx'
import { applyUpdate, useUpdateReady } from '../update'
import { Icon } from './bits'

export function Home({ onStart, onImport }: { onStart: (minutes: number) => void; onImport: () => void }) {
  const snap = useStore()
  const [minutes, setMinutes] = useState(() => Number(localStorage.getItem('minutes')) || 10)
  const now = Date.now()
  const counts = useMemo(() => countDue(snap, now), [snap])
  const stats = useMemo(() => computeStats(snap, now), [snap])
  const empty = snap.words.size === 0
  const updateReady = useUpdateReady()

  return (
    <div className="page home">
      {updateReady && (
        <div className="update-banner">
          <span>En ny version av appen finns.</span>
          <button className="btn small primary" onClick={applyUpdate}>Uppdatera</button>
        </div>
      )}
      <header className="home-head">
        <div>
          <h1>こんにちは</h1>
          <p className="muted">{empty ? 'Lägg till dina första ord för att börja.' : stats.doneToday ? 'Du har redan övat i dag. Snyggt!' : 'Dags för dagens pass?'}</p>
        </div>
        <div className={'streak' + (stats.doneToday ? ' lit' : '')} title={stats.doneToday ? 'Dagens pass är gjort' : 'Öva i dag för att hålla streaken vid liv'}>
          <Icon name="flame" size={26} />
          <strong>{stats.current}</strong>
          <span>{stats.current === 1 ? 'dag' : 'dagar'}</span>
        </div>
      </header>

      {empty ? (
        <div className="card center">
          <p>Du har inga ord än. Låt en AI skapa en ordlista åt dig och importera filen här.</p>
          <button className="btn primary" onClick={onImport}>Importera ord</button>
        </div>
      ) : (
        <>
          <div className="tiles two">
            <div className="tile"><strong>{counts.due}</strong><span>att repetera</span></div>
            <div className="tile"><strong>{counts.newNow}</strong><span>nya ord{counts.fresh > counts.newNow ? ` (av ${counts.fresh})` : ''}{counts.chosen > 0 ? ` · ${counts.chosen} valda väntar` : ''}</span></div>
          </div>
          <div className="card">
            <h2>Hur länge vill du öva?</h2>
            <div className="seg" role="radiogroup" aria-label="Sessionens längd">
              {[5, 10, 15, 20].map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={minutes === m}
                  className={'seg-item' + (minutes === m ? ' active' : '')}
                  onClick={() => {
                    setMinutes(m)
                    localStorage.setItem('minutes', String(m))
                    fx.tap()
                  }}
                >
                  <strong>{m}</strong>
                  <span>min</span>
                </button>
              ))}
            </div>
            <button className="btn primary big" onClick={() => onStart(minutes)}>Starta</button>
            {counts.due + counts.newNow === 0 && (
              <p className="muted small center">Inget är schemalagt just nu – passet blir extra övning som inte påverkar schemat.</p>
            )}
          </div>
        </>
      )}
      <Wishlist />
    </div>
  )
}

/** Anteckningslista för ord man stöter på och vill lära sig. "Kopiera och radera" lägger
 *  listan i urklipp – med AI-instruktionen först om man vill – och tömmer den. */
function Wishlist() {
  const saved = useStore().settings.wishlist
  const [text, setText] = useState(saved)
  const [withPrompt, setWithPrompt] = useState(() => localStorage.getItem('wishPrompt') !== '0')
  const [undo, setUndo] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const dirty = useRef(false)

  // Ändringar från en annan enhet visas här, men bara när man inte själv håller på att skriva.
  useEffect(() => {
    if (!dirty.current) setText(saved)
  }, [saved])
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      void actions.saveSettings({ wishlist: text })
    }, 700)
    return () => clearTimeout(t)
  }, [text])

  const count = text.split(/[\n,、]/).filter((x) => x.trim()).length

  async function copyAndClear() {
    const words = text.trim()
    if (!words) return
    try {
      await navigator.clipboard.writeText(withPrompt ? AI_PROMPT + words + '\n' : words)
    } catch {
      return setError(true)
    }
    setError(false)
    setUndo(words)
    setText('')
    dirty.current = false
    void actions.saveSettings({ wishlist: '' })
    fx.pop(1)
  }

  return (
    <div className="card">
      <div className="row between">
        <h2>Ord jag vill lära mig</h2>
        {count > 0 && <span className="badge">{count} ord</span>}
      </div>
      <textarea
        rows={4}
        lang="ja"
        placeholder="Skriv ett ord per rad, när du stöter på dem."
        value={text}
        onChange={(e) => {
          dirty.current = true
          setUndo(null)
          setText(e.target.value)
        }}
        spellCheck={false}
        autoCapitalize="none"
      />
      <label className="check">
        <input
          type="checkbox"
          checked={withPrompt}
          onChange={(e) => {
            setWithPrompt(e.target.checked)
            localStorage.setItem('wishPrompt', e.target.checked ? '1' : '0')
          }}
        />
        <span>Ta med AI-instruktionen, så att listan kan klistras in direkt hos en AI</span>
      </label>
      <button className="btn primary" disabled={!text.trim()} onClick={() => void copyAndClear()}>Kopiera och radera</button>
      {error && <div className="notice bad">Det gick inte att kopiera. Listan är kvar – markera texten och kopiera den manuellt.</div>}
      {undo !== null && (
        <div className="notice row between">
          <span>Kopierat. Listan är tömd.</span>
          <button
            className="btn small"
            onClick={() => {
              setText(undo)
              setUndo(null)
              void actions.saveSettings({ wishlist: undo })
            }}
          >
            Ångra
          </button>
        </div>
      )}
    </div>
  )
}
