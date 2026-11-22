import type { Snapshot } from './store'
import { isProblem, statusOf, type Status } from './srs'

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const days = new Set<string>()
  const perDay = new Map<string, { total: number; correct: number }>()
  let total = 0
  let correct = 0
  let ms = 0
  for (const l of snap.logs.values()) {
    const k = dayKey(l.ts)
    days.add(k)
    const d = perDay.get(k) ?? { total: 0, correct: 0 }
    d.total++
    if (l.correct) d.correct++
    perDay.set(k, d)
    total++
    if (l.correct) correct++
    ms += Math.min(l.ms, 60_000)
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
  const forecast = Array.from({ length: 7 }, (_, i) => ({ ts: addDays(now, i), count: 0 }))
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)
  for (const w of snap.words.values()) {
    const c = snap.cards.get(w.id)
    if (!c || w.suspended) continue
    const idx = c.due <= todayEnd.getTime() ? 0 : Math.ceil((c.due - todayEnd.getTime()) / 86_400_000)
    if (idx < 7) forecast[idx].count++
  }
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
    ...streaks(days, now),
  }
}
