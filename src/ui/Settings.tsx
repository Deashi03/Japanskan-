import { useState } from 'react'
import { fx } from '../fx'
import { actions, db, mergeRemote, useStore } from '../store'
import { signIn, signOut, signUp, syncNow, useSync } from '../sync'
import type { Row, Settings, ThemeMode } from '../types'
import pkg from '../../package.json'

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function NumberSetting({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="setting">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Minska ${label}`}>−</button>
        <output>{value}</output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Öka ${label}`}>+</button>
      </div>
    </div>
  )
}

const THEMES: [ThemeMode, string][] = [['light', 'Ljust'], ['dark', 'Mörkt'], ['system', 'Följ enheten'], ['schedule', 'Tidsstyrt']]

export function SettingsView() {
  const s = useStore().settings
  const set = (patch: Partial<Settings>) => void actions.saveSettings(patch)
  return (
    <div className="page">
      <header className="page-head"><h1>Inställningar</h1></header>

      <section className="card">
        <h2>Övning</h2>
        <NumberSetting label="Nya ord per pass" value={s.newPerSession} min={0} max={20} onChange={(v) => set({ newPerSession: v })} />
        <NumberSetting label="Max nya ord per dag" hint={s.dailyNewCap === 0 ? 'Ingen gräns' : undefined} value={s.dailyNewCap} min={0} max={50} onChange={(v) => set({ dailyNewCap: v })} />
        <Toggle label="Visa läsning i exempelmeningar" value={s.showExampleReading} onChange={(v) => set({ showExampleReading: v })} />
      </section>

      <section className="card">
        <h2>Ljud</h2>
        <Toggle label="Ljudeffekter" value={s.sound} onChange={(v) => { set({ sound: v }); if (v) setTimeout(() => fx.correct(), 50) }} />
        <Toggle label="Läs upp nya ord automatiskt" hint="Ordet och exempelmeningarna" value={s.autoSpeak} onChange={(v) => set({ autoSpeak: v })} />
        <Toggle label="Vibration" hint="Fungerar på Android" value={s.haptics} onChange={(v) => set({ haptics: v })} />
      </section>

      <section className="card">
        <h2>Utseende</h2>
        <div className="seg four" role="radiogroup" aria-label="Tema">
          {THEMES.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={s.theme === id} className={'seg-item text' + (s.theme === id ? ' active' : '')} onClick={() => set({ theme: id })}>{label}</button>
          ))}
        </div>
        {s.theme === 'schedule' && (
          <div className="times">
            <label className="field"><span>Mörkt läge från</span><input type="time" value={s.darkFrom} onChange={(e) => e.target.value && set({ darkFrom: e.target.value })} /></label>
            <label className="field"><span>Ljust läge från</span><input type="time" value={s.darkTo} onChange={(e) => e.target.value && set({ darkTo: e.target.value })} /></label>
          </div>
        )}
      </section>

      <Account />
      <Backup />
      <p className="version">Japanskan {pkg.version.replace(/\.0$/, '')}</p>
    </div>
  )
}

function Account() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: (e: string, p: string) => Promise<string | null>) {
    setBusy(true)
    setMsg(await fn(email.trim(), password))
    setBusy(false)
  }

  return (
    <section className="card">
      <h2>Synk mellan enheter</h2>
      {!sync.configured ? (
        <p className="muted">Synk är inte aktiverad än. Allt sparas på den här enheten tills appen kopplats till ett Supabase-projekt (se README).</p>
      ) : sync.email ? (
        <>
          <p>Inloggad som <strong>{sync.email}</strong></p>
          <p className="muted small">
            {sync.status === 'syncing' ? 'Synkar…' : sync.status === 'error' ? `Synken misslyckades: ${sync.error}` : sync.lastSync ? `Senast synkad ${new Date(sync.lastSync).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}` : 'Inte synkad än'}
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>Synka nu</button>
            <button className="btn ghost" onClick={() => void signOut()}>Logga ut</button>
          </div>
        </>
      ) : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void run(signIn) }}>
          <p className="muted">Logga in med samma konto på mobilen och datorn så följer orden och framstegen med.</p>
          <label className="field"><span>E-post</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span>Lösenord</span><input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {msg && <div className="notice">{msg}</div>}
          <div className="row wrap">
            <button type="submit" className="btn primary" disabled={busy}>Logga in</button>
            <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={() => void run(signUp)}>Skapa konto</button>
          </div>
        </form>
      )}
    </section>
  )
}

function Backup() {
  const [msg, setMsg] = useState<string | null>(null)

  async function exportAll() {
    const rows = await db.rows.toArray()
    const blob = new Blob([JSON.stringify({ app: 'japanskan', version: 1, exportedAt: new Date().toISOString(), rows })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `japanskan-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importAll(file: File | undefined) {
    if (!file) return
    try {
      const json = JSON.parse(await file.text()) as { app?: string; rows?: Row[] }
      if (json.app !== 'japanskan' || !Array.isArray(json.rows)) throw new Error('fel filtyp')
      const rows = json.rows.filter((r) => r && typeof r.id === 'string' && typeof r.updatedAt === 'number' && ['word', 'card', 'log', 'settings'].includes(r.kind))
      const n = await mergeRemote(rows, true)
      setMsg(n ? `Återställde ${n} poster.` : 'Allt i filen fanns redan (eller var äldre än det som finns här).')
    } catch {
      setMsg('Det där ser inte ut som en backup från Japanskan.')
    }
  }

  return (
    <section className="card">
      <h2>Backup</h2>
      <p className="muted">Spara alla ord och framsteg i en fil, eller återställ från en tidigare fil.</p>
      <div className="row wrap">
        <button className="btn" onClick={() => void exportAll()}>Ladda ner backup</button>
        <label className="btn">
          Återställ från fil
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { void importAll(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {msg && <div className="notice">{msg}</div>}
    </section>
  )
}
