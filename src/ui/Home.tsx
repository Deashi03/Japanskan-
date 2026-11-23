import { useMemo, useState } from 'react'
import { countDue } from '../session'
import { computeStats } from '../stats'
import { useStore } from '../store'
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
    </div>
  )
}
