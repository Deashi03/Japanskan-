import { fx } from '../fx'
import { setNoListen, useNoListen } from '../prefs'
import { actions, useStore } from '../store'
import { Modal } from './bits'

/** Snabbinställningar som går att nå mitt i ett pass (och från startsidan). */
export function QuickSettings({ onClose }: { onClose: () => void }) {
  const s = useStore().settings
  const noListen = useNoListen()
  const set = (patch: Parameters<typeof actions.saveSettings>[0]) => void actions.saveSettings(patch)
  return (
    <Modal title="Inställningar" onClose={onClose}>
      <div className="form">
        <label className="setting">
          <span>Kan inte lyssna nu<small>Lyssningsövningar byts mot skrivövningar tills du stänger appen.</small></span>
          <input type="checkbox" className="switch" checked={noListen} onChange={(e) => setNoListen(e.target.checked)} />
        </label>
        <label className="setting">
          <span>Ljudeffekter</span>
          <input type="checkbox" className="switch" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} />
        </label>
        <label className="setting">
          <span>Läs upp nya ord automatiskt</span>
          <input type="checkbox" className="switch" checked={s.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
        </label>
        <label className="setting">
          <span>Visa läsning i exempelmeningar</span>
          <input type="checkbox" className="switch" checked={s.showExampleReading} onChange={(e) => set({ showExampleReading: e.target.checked })} />
        </label>
        {s.sound && (
          <div className="setting">
            <span>Fördröj animationer<small>Öka om ljudet hörs efter animationen.</small></span>
            <div className="stepper">
              <button type="button" onClick={() => set({ audioLag: Math.max(0, s.audioLag - 25) })} aria-label="Minska fördröjningen">−</button>
              <output>{s.audioLag}</output>
              <button type="button" onClick={() => { set({ audioLag: Math.min(300, s.audioLag + 25) }); setTimeout(() => fx.correct(), 30) }} aria-label="Öka fördröjningen">+</button>
            </div>
          </div>
        )}
        <p className="muted small">Alla inställningar finns också under Inställningar i menyn.</p>
      </div>
    </Modal>
  )
}
