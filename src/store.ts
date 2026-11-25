import Dexie, { type Table } from 'dexie'
import { useSyncExternalStore } from 'react'
import { dayKey } from './days'
import { DEFAULT_SETTINGS, type CardData, type Kind, type LogData, type Row, type Settings, type Word, type WordExtra } from './types'

class DB extends Dexie {
  rows!: Table<Row, string>
  meta!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('japanskan')
    this.version(1).stores({ rows: '&id, kind, dirty', meta: '&key' })
  }
}

export const db = new DB()

/** Summering av en dags svar. Hålls uppdaterad löpande, så att statistiken aldrig behöver
 *  gå igenom varje enskilt svar – hur många som än samlas över tid. */
export interface DayAgg {
  total: number
  correct: number
  ms: number
  /** Ord som repeterats (inte nya, inte extra övning) och hur många svar de fått. */
  reviewed: Map<string, number>
}

export interface Snapshot {
  version: number
  words: Map<string, Word>
  cards: Map<string, CardData>
  logs: Map<string, LogData>
  days: Map<string, DayAgg>
  settings: Settings
}

let snap: Snapshot = { version: 0, words: new Map(), cards: new Map(), logs: new Map(), days: new Map(), settings: DEFAULT_SETTINGS }
const listeners = new Set<() => void>()
const writeListeners = new Set<() => void>()
let loaded = false

const extraCache = new Map<string, WordExtra>()
const extraListeners = new Set<() => void>()
const EXTRA_CACHE_MAX = 300

/** Cachen hålls liten (de äldsta släpps först), hur mycket innehåll som än importeras eller
 *  synkas. Ett ord som saknas i cachen läses in igen från databasen när det behövs. */
function trimExtras() {
  if (extraCache.size <= EXTRA_CACHE_MAX) return
  for (const key of [...extraCache.keys()].slice(0, extraCache.size - EXTRA_CACHE_MAX)) extraCache.delete(key)
}
let extraVersion = 0

const wid = (id: string) => 'w:' + id
const cid = (id: string) => 'c:' + id
const lid = (id: string) => 'l:' + id
const xid = (id: string) => 'x:' + id
const SETTINGS_ID = 'settings'

function applyToSnap(next: Snapshot, row: Row) {
  const key = row.id.slice(2)
  if (row.kind === 'word') row.deleted ? next.words.delete(key) : next.words.set(key, row.data as Word)
  else if (row.kind === 'card') row.deleted ? next.cards.delete(key) : next.cards.set(key, row.data as CardData)
  else if (row.kind === 'log') {
    const old = next.logs.get(key)
    if (old) countLog(next.days, old, -1)
    if (row.deleted) next.logs.delete(key)
    else {
      next.logs.set(key, row.data as LogData)
      countLog(next.days, row.data as LogData, 1)
    }
  } else if (row.kind === 'extra') {
    // Extrainnehållet hålls utanför ögonblicksbilden; bara cachen uppdateras.
    if (row.deleted) extraCache.delete(key)
    else {
      extraCache.set(key, row.data as WordExtra)
      trimExtras()
    }
    extraVersion++
  }
  else if (row.kind === 'settings' && !row.deleted) next.settings = { ...DEFAULT_SETTINGS, ...(row.data as Settings) }
}

function countLog(days: Map<string, DayAgg>, l: LogData, sign: 1 | -1) {
  const k = dayKey(l.ts)
  const d = days.get(k) ?? { total: 0, correct: 0, ms: 0, reviewed: new Map() }
  d.total += sign
  if (l.correct) d.correct += sign
  d.ms += sign * Math.min(l.ms, 60_000)
  if (l.review ?? (!l.extra && !l.isNew)) {
    const n = (d.reviewed.get(l.wordId) ?? 0) + sign
    if (n > 0) d.reviewed.set(l.wordId, n)
    else d.reviewed.delete(l.wordId)
  }
  if (d.total > 0) days.set(k, d)
  else days.delete(k)
}

function commit(rows: Row[]) {
  const next: Snapshot = { ...snap, version: snap.version + 1 }
  for (const r of rows) applyToSnap(next, r)
  snap = next
  listeners.forEach((l) => l())
}

export async function loadStore() {
  if (loaded) return
  // Extrainnehållet (tusentals exempelmeningar) läses inte in vid start, bara när det behövs.
  const rows = await db.rows.where('kind').anyOf(['word', 'card', 'log', 'settings']).toArray()
  commit(rows)
  loaded = true
}

export const getSnap = () => snap
export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snap,
  )
}
export function onLocalWrite(l: () => void) {
  writeListeners.add(l)
  return () => writeListeners.delete(l)
}

let lastStamp = 0
/** Strikt växande tidsstämpel så att två snabba ändringar aldrig får samma. */
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

interface Change { id: string; kind: Kind; data: unknown; deleted?: boolean }

async function write(changes: Change[]) {
  if (!changes.length) return
  const rows: Row[] = changes.map((c) => ({
    id: c.id,
    kind: c.kind,
    data: c.deleted ? null : c.data,
    deleted: !!c.deleted,
    updatedAt: stamp(),
    dirty: 1,
  }))
  commit(rows)
  await db.rows.bulkPut(rows)
  writeListeners.forEach((l) => l())
}

/** Rader som kommer från synk eller backup: nyaste ändringen vinner. */
export async function mergeRemote(rows: Row[], markDirty = false) {
  if (!rows.length) return 0
  const existing = await db.rows.bulkGet(rows.map((r) => r.id))
  const accepted: Row[] = []
  rows.forEach((r, i) => {
    const old = existing[i]
    if (!old || r.updatedAt > old.updatedAt) accepted.push({ ...r, dirty: markDirty ? 1 : 0 })
  })
  if (accepted.length) {
    await db.rows.bulkPut(accepted)
    commit(accepted)
    if (markDirty) writeListeners.forEach((l) => l())
  }
  return accepted.length
}

export const actions = {
  saveWords: (words: Word[]) => write(words.map((w) => ({ id: wid(w.id), kind: 'word', data: w }))),
  deleteWords: (ids: string[]) =>
    write(
      ids.flatMap((id) => {
        const out: Change[] = [{ id: wid(id), kind: 'word', data: null, deleted: true }]
        if (snap.cards.has(id)) out.push({ id: cid(id), kind: 'card', data: null, deleted: true })
        if (snap.words.get(id)?.extraCount) out.push({ id: xid(id), kind: 'extra', data: null, deleted: true })
        return out
      }),
    ),
  saveCard: (wordId: string, card: CardData) => write([{ id: cid(wordId), kind: 'card', data: card }]),
  /** Sparar flera kort och loggar i ett svep (ett svar eller en ångring). */
  apply: (ops: { cards?: [string, CardData | null][]; logs?: [string, LogData | null][] }) =>
    write([
      ...(ops.cards ?? []).map(([id, c]): Change => ({ id: cid(id), kind: 'card', data: c, deleted: c === null })),
      ...(ops.logs ?? []).map(([id, l]): Change => ({ id: lid(id), kind: 'log', data: l, deleted: l === null })),
    ]),
  /** Sparar ord tillsammans med deras extrainnehåll (exempelmeningar och böjningar). */
  saveWordsWithExtras: (items: { word: Word; extra?: WordExtra }[]) =>
    write(
      items.flatMap(({ word, extra }): Change[] => [
        { id: wid(word.id), kind: 'word', data: word },
        ...(extra ? [{ id: xid(word.id), kind: 'extra' as Kind, data: extra }] : []),
      ]),
    ),
  saveSettings: (patch: Partial<Settings>) =>
    write([{ id: SETTINGS_ID, kind: 'settings', data: { ...snap.settings, ...patch } }]),
}

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

// ---------------------------------------------------------------- Extrainnehåll


/** Extrainnehållet för ett ord, om det redan är inläst (annars undefined). */
export const getExtra = (wordId: string) => extraCache.get(wordId)

/** Läser in extrainnehållet för de ord som inte redan finns i cachen. */
export async function loadExtras(wordIds: string[]) {
  const missing = [...new Set(wordIds)].filter((id) => !extraCache.has(id) && snap.words.get(id)?.extraCount)
  if (!missing.length) return
  const rows = await db.rows.bulkGet(missing.map(xid))
  rows.forEach((row) => row && !row.deleted && extraCache.set(row.id.slice(2), row.data as WordExtra))
  trimExtras()
  extraVersion++
  extraListeners.forEach((l) => l())
}

/** Extrainnehållet för ett ord i en komponent; läses in vid behov. */
export function useExtra(wordId: string | undefined): WordExtra | undefined {
  useSyncExternalStore(
    (l) => (extraListeners.add(l), () => extraListeners.delete(l)),
    () => extraVersion,
  )
  if (wordId && !extraCache.has(wordId)) void loadExtras([wordId])
  return wordId ? extraCache.get(wordId) : undefined
}
