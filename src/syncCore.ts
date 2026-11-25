import { db, mergeRemote } from './store'
import type { Kind, Row } from './types'

// Kärnan i synken, utan beroende av Supabase eller React så att den går att testa mot en
// låtsasserver. sync.ts kopplar den till det riktiga Supabase-projektet.

export interface PushRow { user_id: string; id: string; kind: Kind; data: unknown; updated_at: number; deleted: boolean }
export interface RemoteRow { id: string; kind: Kind; data: unknown; updated_at: number | string; deleted: boolean; seq: number | string }
export interface ApiError { message?: string }

/** Det synken behöver av servern. */
export interface RowsApi {
  upsert(rows: PushRow[]): Promise<{ error: ApiError | null }>
  fetchSince(cursor: number, limit: number): Promise<{ data: RemoteRow[] | null; error: ApiError | null }>
}

export interface SyncOptions {
  /** Största storlek (byte) för en uppladdning. Större mängder delas upp. */
  maxBytes?: number
  maxRows?: number
  /** Antal rader per hämtning. Rader med många exempelmeningar är stora, så sidorna är små. */
  pageSize?: number
  /** Försök per anrop innan synken ger upp. */
  attempts?: number
  /** Längsta tid (ms) ett anrop får ta. */
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  onProgress?: (done: number, total: number) => void
}

export const DEFAULTS = { maxBytes: 400_000, maxRows: 100, pageSize: 150, attempts: 3, timeoutMs: 45_000 }

const encoder = new TextEncoder()
export const byteSize = (value: unknown) => encoder.encode(JSON.stringify(value)).length

/** Delar upp i omgångar som inte överstiger `maxBytes` eller `maxRows`. En enskild rad som
 *  är större än gränsen skickas för sig. */
export function chunkBySize<T>(items: T[], maxBytes: number, maxRows: number, sizeOf: (item: T) => number = byteSize): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let bytes = 0
  for (const item of items) {
    const size = sizeOf(item)
    if (current.length && (bytes + size > maxBytes || current.length >= maxRows)) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(item)
    bytes += size
  }
  if (current.length) chunks.push(current)
  return chunks
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Kör ett anrop med tidsgräns, och försöker igen med växande väntetid när det misslyckas
 *  (instabilt nät, tillfälliga serverfel). Ger upp efter `attempts` försök. */
async function attempt<T extends { error: ApiError | null }>(call: () => Promise<T>, o: Required<Pick<SyncOptions, 'attempts' | 'timeoutMs' | 'sleep'>>): Promise<T> {
  let last: unknown = new Error('Okänt fel')
  for (let i = 0; i < o.attempts; i++) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const result = await Promise.race([
        call(),
        new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('Servern svarade inte i tid')), o.timeoutMs))),
      ]).finally(() => clearTimeout(timer))
      if (!result.error) return result
      last = result.error
    } catch (e) {
      last = e
    }
    if (i < o.attempts - 1) await o.sleep(800 * 3 ** i)
  }
  throw last instanceof Error ? last : new Error((last as ApiError)?.message ?? String(last))
}

export interface SyncResult { pushed: number; pulled: number; requests: number }

/** En synkrunda: skickar upp lokala ändringar i storleksbitar och hämtar sedan allt nytt från
 *  servern i små sidor. Framsteg sparas löpande: avbryts synken fortsätter nästa runda där
 *  den slutade i stället för att börja om. */
export async function syncOnce(api: RowsApi, userId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const o = { ...DEFAULTS, sleep: wait, ...options }
  const retryOpts = { attempts: o.attempts, timeoutMs: o.timeoutMs, sleep: o.sleep }
  const result: SyncResult = { pushed: 0, pulled: 0, requests: 0 }

  // 1. Skicka upp lokala ändringar.
  const dirty = await db.rows.where('dirty').equals(1).toArray()
  const chunks = chunkBySize(dirty, o.maxBytes, o.maxRows, (r) => byteSize(r.data) + 120)
  let done = 0
  for (const batch of chunks) {
    const payload: PushRow[] = batch.map((r) => ({ user_id: userId, id: r.id, kind: r.kind, data: r.data, updated_at: r.updatedAt, deleted: r.deleted }))
    result.requests++
    await attempt(() => api.upsert(payload), retryOpts)
    // Markera som synkat – men bara rader som inte hunnit ändras igen under tiden.
    await db.transaction('rw', db.rows, async () => {
      const current = await db.rows.bulkGet(batch.map((r) => r.id))
      const still = batch.filter((r, i) => current[i] && current[i]!.updatedAt === r.updatedAt)
      await db.rows.bulkPut(still.map((r) => ({ ...r, dirty: 0 as const })))
    })
    done += batch.length
    result.pushed += batch.length
    o.onProgress?.(done, dirty.length)
  }

  // 2. Hämta allt som ändrats på servern sedan sist, en sida i taget.
  const cursorKey = 'cursor:' + userId
  let cursor = ((await db.meta.get(cursorKey))?.value as number | undefined) ?? 0
  for (;;) {
    result.requests++
    const { data } = await attempt(() => api.fetchSince(cursor, o.pageSize), retryOpts)
    const rows = data ?? []
    if (!rows.length) break
    await mergeRemote(rows.map((r): Row => ({ id: r.id, kind: r.kind, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted, dirty: 0 })))
    cursor = Number(rows[rows.length - 1].seq)
    await db.meta.put({ key: cursorKey, value: cursor })
    result.pulled += rows.length
    if (rows.length < o.pageSize) break
  }
  return result
}
