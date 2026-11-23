import { useEffect, useState } from 'react'
import { isDark, syncLag } from '../fx'
import { useStore } from '../store'
import { Icon } from './bits'
import { Home } from './Home'
import { ImportView } from './Import'
import { Session } from './Session'
import { SettingsView } from './Settings'
import { StatsView } from './Stats'
import { WordList } from './WordList'

type Tab = 'home' | 'words' | 'stats' | 'settings'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Öva', icon: 'home' },
  { id: 'words', label: 'Ordlista', icon: 'list' },
  { id: 'stats', label: 'Statistik', icon: 'chart' },
  { id: 'settings', label: 'Inställningar', icon: 'gear' },
]

function useTheme() {
  const { theme, darkFrom, darkTo } = useStore().settings
  useEffect(() => {
    const apply = () => {
      const dark = isDark(theme, darkFrom, darkTo)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#151312' : '#fbf7f2')
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    const timer = setInterval(apply, 30_000)
    return () => {
      mq.removeEventListener('change', apply)
      clearInterval(timer)
    }
  }, [theme, darkFrom, darkTo])
}

export function App() {
  useTheme()
  const { sound, audioLag } = useStore().settings
  useEffect(syncLag, [sound, audioLag])
  const [tab, setTab] = useState<Tab>('home')
  const [minutes, setMinutes] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)

  if (minutes !== null) return <Session minutes={minutes} onExit={() => setMinutes(null)} />

  return (
    <div className="shell">
      <nav className="nav" aria-label="Huvudmeny">
        <div className="brand"><span lang="ja">語</span> Japanskan</div>
        {TABS.map((t) => (
          <button key={t.id} className={'nav-item' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'home' && <Home onStart={setMinutes} onImport={() => setImporting(true)} />}
        {tab === 'words' && <WordList onImport={() => setImporting(true)} />}
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      {importing && <ImportView onClose={() => setImporting(false)} />}
    </div>
  )
}
