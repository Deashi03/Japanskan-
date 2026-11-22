import { useMemo } from 'react'
import { STATUS_LABEL, type Status } from '../srs'
import { computeStats } from '../stats'
import { useStore } from '../store'
import { Icon } from './bits'

const WEEKDAY = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
const dateLabel = (ts: number) => new Date(ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

function Bars({ data, unit, labelEvery = 1 }: { data: { ts: number; value: number; today?: boolean }[]; unit: string; labelEvery?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bars" role="img" aria-label={data.map((d) => `${dateLabel(d.ts)}: ${d.value} ${unit}`).join(', ')}>
      {data.map((d, i) => (
        <div className="bar-col" key={i} tabIndex={0}>
          <div className="bar-tip">{d.value} {unit}<br /><span>{d.today ? 'i dag' : dateLabel(d.ts)}</span></div>
          <div className="bar-track">
            {(d.value === max && d.value > 0) && <span className="bar-value">{d.value}</span>}
            <div className={'bar' + (d.value === 0 ? ' zero' : '')} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className={'bar-label' + (d.today ? ' today' : '')}>{(data.length - 1 - i) % labelEvery === 0 ? (d.today ? 'i dag' : WEEKDAY[new Date(d.ts).getDay()]) : ''}</span>
        </div>
      ))}
    </div>
  )
}

export function StatsView() {
  const snap = useStore()
  const s = useMemo(() => computeStats(snap, Date.now()), [snap])
  const order: Status[] = ['new', 'learning', 'young', 'mature']
  return (
    <div className="page">
      <header className="page-head"><h1>Statistik</h1></header>
      <div className="tiles">
        <div className="tile hero"><strong>{s.learned}</strong><span>lärda ord av {s.words}</span></div>
        <div className="tile"><strong className="with-icon"><Icon name="flame" size={22} />{s.current}</strong><span>dagar i rad</span></div>
        <div className="tile"><strong>{s.longest}</strong><span>längsta streak</span></div>
        <div className="tile"><strong>{s.weekTotal ? Math.round(s.weekAccuracy * 100) + '%' : '–'}</strong><span>rätt senaste 7 dagarna</span></div>
        <div className="tile"><strong>{s.minutes}</strong><span>minuter övat totalt</span></div>
        <div className="tile"><strong>{s.problems}</strong><span>problemord</span></div>
      </div>

      <section className="card">
        <h2>Dina ord</h2>
        <div className="statusrows">
          {order.map((k) => (
            <div className="statusrow" key={k}>
              <span>{STATUS_LABEL[k]}</span>
              <div className="meter"><div style={{ width: `${s.words ? (s.status[k] / s.words) * 100 : 0}%` }} /></div>
              <strong>{s.status[k]}</strong>
            </div>
          ))}
        </div>
        <p className="muted small">”Kan” = ordet har klarat inlärningen. ”Moget” = nästa repetition ligger minst tre veckor bort.{s.suspended ? ` ${s.suspended} ord är pausade.` : ''}</p>
      </section>

      <section className="card">
        <h2>Svar per dag</h2>
        <p className="muted small">Senaste 14 dagarna</p>
        <Bars unit="svar" labelEvery={2} data={s.history.map((d, i) => ({ ts: d.ts, value: d.total, today: i === 13 }))} />
      </section>

      <section className="card">
        <h2>Kommande repetitioner</h2>
        <p className="muted small">Ord som ska repeteras de närmaste 7 dagarna</p>
        <Bars unit="ord" data={s.forecast.map((d, i) => ({ ts: d.ts, value: d.count, today: i === 0 }))} />
      </section>
    </div>
  )
}
