import type { Snapshot } from './store'
import { dueWords } from './session'
import { isProblem, statusOf, type Status } from './srs'
import { dayIndex, dayKey, dayStart } from './days'
export { dayKey }

function addDays(ts: number, n: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** En dag räknas i streaken om minst ett ord övats den dagen. */
export function streaks(days: Set<string>, now: number) {
  let current = 0
  let t = days.has(dayKey(now)) ? now : addDays(now, -1)
  while (days.has(dayKey(t))) {
    current++
    t = addDays(t, -1)
  }
  let longest = 0
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number)
    const start = new Date(y, m - 1, d, 12).getTime()
    if (days.has(dayKey(addDays(start, -1)))) continue
    let len = 1
    while (days.has(dayKey(addDays(start, len)))) len++
    longest = Math.max(longest, len)
  }
  return { current, longest, doneToday: days.has(dayKey(now)) }
}

export function computeStats(snap: Snapshot, now: number) {
  // Bygger på dagssummeringarna i store – aldrig på de enskilda svaren.
  const days = new Set(snap.days.keys())
  const perDay = snap.days
  let total = 0
  let correct = 0
  let ms = 0
  for (const d of perDay.values()) {
    total += d.total
    correct += d.correct
    ms += d.ms
  }
  const status: Record<Status, number> = { new: 0, learning: 0, young: 0, mature: 0 }
  let problems = 0
  let suspended = 0
  for (const w of snap.words.values()) {
    const c = snap.cards.get(w.id)
    status[statusOf(c)]++
    if (isProblem(c)) problems++
    if (w.suspended) suspended++
  }
  const history = Array.from({ length: 14 }, (_, i) => {
    const t = addDays(now, i - 13)
    const d = perDay.get(dayKey(t))
    return { ts: t, total: d?.total ?? 0, correct: d?.correct ?? 0 }
  })
  // Prognos per dag (dygnsgräns 04:00). Allt som redan är försenat räknas till i dag.
  const today = dayIndex(now)
  const forecast = Array.from({ length: 7 }, (_, i) => ({ ts: dayStart(today + i) + 12 * 3_600_000, count: 0 }))
  for (const w of snap.words.values()) {
    const c = snap.cards.get(w.id)
    if (!c || w.suspended || c.state === 0) continue
    const idx = Math.max(0, dayIndex(c.due) - today)
    if (idx < 7) forecast[idx].count++
  }
  // Dagens repetitioner: hur många som återstår och hur många som redan är gjorda.
  const todayLeft = dueWords(snap, now).length
  const reviewedToday = perDay.get(dayKey(now))?.reviewed.size ?? 0
  const week = history.slice(-7).reduce((a, d) => ({ total: a.total + d.total, correct: a.correct + d.correct }), { total: 0, correct: 0 })
  return {
    words: snap.words.size,
    learned: status.young + status.mature,
    status,
    problems,
    suspended,
    total,
    accuracy: total ? correct / total : 0,
    weekAccuracy: week.total ? week.correct / week.total : 0,
    weekTotal: week.total,
    minutes: Math.round(ms / 60_000),
    history,
    forecast,
    todayLeft,
    reviewedToday,
    ...streaks(days, now),
  }
}
