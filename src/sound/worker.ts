import { renderSound } from './render'
import type { SoundKey } from './plan'

// Tar emot ljudnycklar och svarar med färdiga ljudspår.
self.onmessage = (e: MessageEvent<SoundKey>) => {
  const s = renderSound(e.data)
  ;(self as unknown as Worker).postMessage({ key: e.data, L: s.L, R: s.R, sr: s.sr }, [s.L.buffer, s.R.buffer])
}
