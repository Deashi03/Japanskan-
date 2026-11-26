import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { onLocalWrite } from './store'
import { syncOnce, type RemoteRow, type RowsApi } from './syncCore'

export interface SyncState {
  configured: boolean
  email: string | null
  status: 'idle' | 'syncing' | 'error'
  error: string | null
  lastSync: number | null
  /** Under en stor uppladdning, till exempel "120 av 900". */
  progress: string | null
}

const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const client: SupabaseClient | null = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

let state: SyncState = { configured, email: null, status: 'idle', error: null, lastSync: null, progress: null }
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

/** Kopplar synkkärnan till Supabase-tabellen "rows". */
function supabaseApi(c: SupabaseClient): RowsApi {
  return {
    upsert: async (rows) => ({ error: (await c.from('rows').upsert(rows, { onConflict: 'user_id,id' })).error }),
    fetchSince: async (cursor, limit) => {
      const { data, error } = await c.from('rows').select('id,kind,data,updated_at,deleted,seq').gt('seq', cursor).order('seq', { ascending: true }).limit(limit)
      return { data: (data ?? null) as RemoteRow[] | null, error }
    },
  }
}

export async function syncNow() {
  if (!client || !userId) return
  if (running) {
    again = true
    return
  }
  running = true
  set({ status: 'syncing', error: null, progress: null })
  try {
    await syncOnce(supabaseApi(client), userId, {
      onProgress: (done, total) => set({ progress: total > 20 ? `${done} av ${total}` : null }),
    })
    set({ status: 'idle', lastSync: Date.now(), progress: null })
  } catch (e) {
    set({ status: 'error', error: (e as { message?: string })?.message ?? String(e), progress: null })
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
