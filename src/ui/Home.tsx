import { useMemo, useState } from 'react'
import { countDue, studiedCount } from '../session'
import { computeStats } from '../stats'
import { useStore } from '../store'
import { fx } from '../fx'
import { applyUpdate, useUpdateReady } from '../update'
import { setNoListen, useNoListen } from '../prefs'
import { QuickSettings } from './QuickSettings'
import { Icon } from './bits'

export function Home({ onStart, onImport }: { onStart: (minutes: number | null, review?: boolean) => void; onImport: () => void }) {
  const snap = useStore()
  const [minutes, setMinutes] = useState(() => Number(localStorage.getItem('minutes')) || 10)
  // 0 betyder obegränsat.
  const [repMinutes, setRepMinutes] = useState(() => {
    const v = localStorage.getItem('repMinutes')
    return v === null ? 10 : Number(v)
  })
  const now = Date.now()
  const counts = useMemo(() => countDue(snap, now), [snap])
  const studied = useMemo(() => studiedCount(snap), [snap])
  const stats = useMemo(() => computeStats(snap, now), [snap])
  const empty = snap.words.size === 0
  const updateReady = useUpdateReady()
  const noListen = useNoListen()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="page home">
      {settingsOpen && <QuickSettings onClose={() => setSettingsOpen(false)} />}
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
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Inställningar"><Icon name="gear" /></button>
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
            <label className="setting compact">
              <span>Kan inte lyssna nu<small>Lyssningsövningar byts mot skrivövningar tills du stänger appen.</small></span>
              <input type="checkbox" className="switch" checked={noListen} onChange={(e) => setNoListen(e.target.checked)} />
            </label>
            {counts.due + counts.newNow === 0 && (
              <p className="muted small center">Inget är schemalagt just nu – passet blir extra övning som inte påverkar schemat.</p>
            )}
          </div>
          <div className="card" id="repeat">
            <h2>Bara repetera</h2>
            <p className="muted small">Repetera ord du redan har börjat med. Inga nya ord.</p>
            <div className="seg five" role="radiogroup" aria-label="Repetitionspassets längd">
              {[5, 10, 15, 20, 0].map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={repMinutes === m}
                  className={'seg-item' + (repMinutes === m ? ' active' : '')}
                  onClick={() => {
                    setRepMinutes(m)
                    localStorage.setItem('repMinutes', String(m))
                    fx.tap()
                  }}
                >
                  <strong>{m === 0 ? '∞' : m}</strong>
                  <span>{m === 0 ? 'obegr.' : 'min'}</span>
                </button>
              ))}
            </div>
            <button className="btn primary big" disabled={studied === 0} onClick={() => onStart(repMinutes === 0 ? null : repMinutes, true)}>Repetera</button>
            {studied === 0 ? (
              <p className="muted small center">Du har inga påbörjade ord än. Kör ett vanligt pass först.</p>
            ) : counts.due === 0 ? (
              <p className="muted small center">Inget ord ska repeteras just nu – passet blir extra övning som inte påverkar schemat.</p>
            ) : (
              <p className="muted small center">{counts.due} ord att repetera i dag{repMinutes === 0 ? '. Passet pågår tills du avslutar det.' : '.'}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
