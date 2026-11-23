import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { loadStore } from './store'
import { initSync } from './sync'
import { initUpdates } from './update'
import './styles.css'

initUpdates()
void navigator.storage?.persist?.()

loadStore().then(() => {
  initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
