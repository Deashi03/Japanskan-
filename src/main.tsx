import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './ui/App'
import { loadStore } from './store'
import { initSync } from './sync'
import './styles.css'

registerSW({ immediate: true })
void navigator.storage?.persist?.()

loadStore().then(() => {
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
