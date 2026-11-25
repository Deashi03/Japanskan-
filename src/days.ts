/** Ett "dygn" i appen börjar klockan 04:00, så att ett pass strax efter midnatt räknas till
 *  samma dag som kvällen innan. Allt som har med dagar att göra – vad som ska repeteras i
 *  dag, streak och statistik – räknar med samma gräns. */
export const DAY_START_HOUR = 4
const DAY = 86_400_000
const SHIFT = DAY_START_HOUR * 3_600_000

/** Dagnummer (dagar sedan 1970) för ett klockslag, med dygnsgränsen 04:00 lokal tid. */
export function dayIndex(ts: number): number {
  const d = new Date(ts - SHIFT)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
}

/** Klockslaget då dag nummer `day` börjar (04:00 lokal tid). */
export function dayStart(day: number): number {
  const d = new Date(day * DAY)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DAY_START_HOUR).getTime()
}

/** När dagen som `ts` hör till tar slut, dvs. nästa 04:00. */
export function endOfDay(ts: number): number {
  return dayStart(dayIndex(ts) + 1)
}

/** Datum som text (ÅÅÅÅ-MM-DD) för dagen som `ts` hör till. */
export function dayKey(ts: number): string {
  const d = new Date(ts - SHIFT)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
