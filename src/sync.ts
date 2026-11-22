import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { db, mergeRemote, onLocalWrite } from './store'
import type { Kind, Row } from './types'

export interface SyncState {
  configured: boolean
  email: string | null
  status: 'idle' | 'syncing' | 'error'
  error: string | null
  lastSync: number | null
}

const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const client: SupabaseClient | null = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

let state: SyncState = { configured, email: null, status: 'idle', error: null, lastSync: null }
const listeners = new Set<() => void>()
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

let userId: string | null = null
let running = false
let again = false

interface RemoteRow { id: string; kind: Kind; data: unknown; updated_at: number; deleted: boolean; seq: number }

export async function syncNow() {
  if (!client || !userId) return
  if (running) {
    again = true
    return
  }
  running = true
  set({ status: 'syncing', error: null })
  try {
    // 1. Skicka upp lokala ändringar.
    const dirty = await db.rows.where('dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += 500) {
      const batch = dirty.slice(i, i + 500)
      const { error } = await client.from('rows').upsert(
        batch.map((r) => ({ user_id: userId, id: r.id, kind: r.kind, data: r.data, updated_at: r.updatedAt, deleted: r.deleted })),
        { onConflict: 'user_id,id' },
      )
      if (error) throw error
      await db.transaction('rw', db.rows, async () => {
        for (const r of batch) {
          const cur = await db.rows.get(r.id)
          // Markera bara som synkad om raden inte hunnit ändras igen under tiden.
          if (cur && cur.updatedAt === r.updatedAt) await db.rows.update(r.id, { dirty: 0 })
        }
      })
    }
    // 2. Hämta allt som ändrats på servern sedan sist.
    const cursorKey = 'cursor:' + userId
    let cursor = ((await db.meta.get(cursorKey))?.value as number | undefined) ?? 0
    for (;;) {
      const { data, error } = await client
        .from('rows')
        .select('id,kind,data,updated_at,deleted,seq')
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(1000)
      if (error) throw error
      const rows = (data ?? []) as RemoteRow[]
      if (!rows.length) break
      await mergeRemote(
        rows.map((r): Row => ({ id: r.id, kind: r.kind, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted, dirty: 0 })),
      )
      cursor = Number(rows[rows.length - 1].seq)
      await db.meta.put({ key: cursorKey, value: cursor })
      if (rows.length < 1000) break
    }
    set({ status: 'idle', lastSync: Date.now() })
  } catch (e) {
    set({ status: 'error', error: (e as { message?: string })?.message ?? String(e) })
  } finally {
    running = false
    if (again) {
      again = false
      void syncNow()
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleSync(delay = 2500) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export function initSync() {
  if (!client) return
  client.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null
    const changed = id !== userId
    userId = id
    set({ email: session?.user.email ?? null })
    if (id && changed) scheduleSync(0)
  })
  onLocalWrite(() => scheduleSync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  window.addEventListener('online', () => scheduleSync(0))
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
}

const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Fel e-post eller lösenord.',
  'Email not confirmed': 'Bekräfta din e-post via länken i mejlet först.',
  'User already registered': 'Det finns redan ett konto med den e-posten.',
}
const tr = (m: string) => AUTH_ERRORS[m] ?? m

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!client) return 'Synk är inte konfigurerad.'
  const { error } = await client.auth.signInWithPassword({ email, password })
  return error ? tr(error.message) : null
}

/** Returnerar ett meddelande att visa (fel eller "kolla din mejl"), eller null om man loggades in direkt. */
export async function signUp(email: string, password: string): Promise<string | null> {
  if (!client) return 'Synk är inte konfigurerad.'
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
  if (error) return tr(error.message)
  return data.session ? null : 'Konto skapat. Bekräfta via länken i mejlet och logga sedan in.'
}

export async function signOut() {
  await client?.auth.signOut()
}
