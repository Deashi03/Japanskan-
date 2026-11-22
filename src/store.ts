import Dexie, { type Table } from 'dexie'
import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, type CardData, type Kind, type LogData, type Row, type Settings, type Word } from './types'

class DB extends Dexie {
  rows!: Table<Row, string>
  meta!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('japanskan')
    this.version(1).stores({ rows: '&id, kind, dirty', meta: '&key' })
  }
}

export const db = new DB()

export interface Snapshot {
  version: number
  words: Map<string, Word>
  cards: Map<string, CardData>
  logs: Map<string, LogData>
  settings: Settings
}

let snap: Snapshot = { version: 0, words: new Map(), cards: new Map(), logs: new Map(), settings: DEFAULT_SETTINGS }
const listeners = new Set<() => void>()
const writeListeners = new Set<() => void>()
let loaded = false

const wid = (id: string) => 'w:' + id
const cid = (id: string) => 'c:' + id
const lid = (id: string) => 'l:' + id
const SETTINGS_ID = 'settings'

function applyToSnap(next: Snapshot, row: Row) {
  const key = row.id.slice(2)
  if (row.kind === 'word') row.deleted ? next.words.delete(key) : next.words.set(key, row.data as Word)
  else if (row.kind === 'card') row.deleted ? next.cards.delete(key) : next.cards.set(key, row.data as CardData)
  else if (row.kind === 'log') row.deleted ? next.logs.delete(key) : next.logs.set(key, row.data as LogData)
  else if (row.kind === 'settings' && !row.deleted) next.settings = { ...DEFAULT_SETTINGS, ...(row.data as Settings) }
}

function commit(rows: Row[]) {
  const next: Snapshot = { ...snap, version: snap.version + 1 }
  for (const r of rows) applyToSnap(next, r)
  snap = next
  listeners.forEach((l) => l())
}

export async function loadStore() {
  if (loaded) return
  const rows = await db.rows.toArray()
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
  saveSettings: (patch: Partial<Settings>) =>
    write([{ id: SETTINGS_ID, kind: 'settings', data: { ...snap.settings, ...patch } }]),
}

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
