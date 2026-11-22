import { getSnap } from './store'

let ctx: AudioContext | null = null

/** iPhone spelar bara upp ljud som startats av en tryckning, och tystar webbljud när
 *  ringsignalen är avstängd. Därför väcks ljudet vid varje tryckning, och appen ber om
 *  att få spela upp som en vanlig mediaapp. */
function unlock() {
  if (!getSnap().settings.sound) return
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') session.type = 'playback'
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new Ctor()
    if (ctx.state !== 'running') {
      void ctx.resume()
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, 1, 22050)
      src.connect(ctx.destination)
      src.start(0)
    }
  } catch {
    /* ljud är inte nödvändigt */
  }
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true })
}

function audio(): AudioContext | null {
  if (!getSnap().settings.sound) return null
  unlock()
  return ctx
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur)
  const peak = (opts.gain ?? 0.18) * 1.8
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** Klockljud: grundton plus svag överton ger en renare, "dyrare" klang. */
function bell(freq: number, start: number, dur = 0.45, gain = 0.16) {
  tone(freq, start, dur, { gain })
  tone(freq * 2, start, dur * 0.6, { gain: gain * 0.35 })
  tone(freq * 3, start, dur * 0.3, { gain: gain * 0.12 })
}

function vibrate(pattern: number | number[]) {
  if (getSnap().settings.haptics) navigator.vibrate?.(pattern)
}

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12]
const note = (semi: number) => 523.25 * Math.pow(2, semi / 12)

export const fx = {
  /** Rätt svar – tonen stiger för varje rätt i rad. */
  correct(combo = 0) {
    const base = SCALE[Math.min(combo, SCALE.length - 1)]
    bell(note(base), 0, 0.3)
    bell(note(base + 7), 0.09, 0.5)
    vibrate(15)
  },
  wrong() {
    tone(196, 0, 0.22, { type: 'triangle', gain: 0.2, slideTo: 147 })
    tone(147, 0.12, 0.3, { type: 'triangle', gain: 0.16, slideTo: 110 })
    vibrate([40, 60, 40])
  },
  pop(i = 0) {
    tone(note(SCALE[Math.min(i, 7)]) * 1.5, 0, 0.12, { gain: 0.14, slideTo: note(SCALE[Math.min(i, 7)]) * 2 })
    vibrate(8)
  },
  tap() {
    tone(880, 0, 0.05, { gain: 0.05 })
  },
  complete() {
    ;[0, 4, 7, 12].forEach((s, i) => bell(note(s), i * 0.11, 0.5))
    bell(note(16), 0.48, 0.9, 0.18)
    bell(note(12), 0.48, 0.9, 0.12)
    vibrate([20, 40, 20, 40, 60])
  },
}

let voices: SpeechSynthesisVoice[] = []
if (typeof speechSynthesis !== 'undefined') {
  const load = () => (voices = speechSynthesis.getVoices())
  load()
  speechSynthesis.addEventListener?.('voiceschanged', load)
}

export const canSpeak = typeof speechSynthesis !== 'undefined'

export function speak(text: string) {
  if (!canSpeak) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  const v = voices.find((v) => v.lang.replace('_', '-').startsWith('ja'))
  if (v) u.voice = v
  u.rate = 0.9
  speechSynthesis.speak(u)
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100'
  document.body.appendChild(canvas)
  const dpr = devicePixelRatio || 1
  const w = (canvas.width = innerWidth * dpr)
  const h = (canvas.height = innerHeight * dpr)
  const c = canvas.getContext('2d')!
  const colors = ['#e5484d', '#f5a524', '#30a46c', '#3e63dd', '#8e4ec6', '#ffd60a']
  const parts = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.45,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-Math.random() * 20 - 6) * dpr,
    s: (Math.random() * 7 + 5) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }))
  const t0 = performance.now()
  const frame = (t: number) => {
    const age = t - t0
    c.clearRect(0, 0, w, h)
    for (const p of parts) {
      p.vy += 0.55 * dpr
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.r += p.vr
      c.save()
      c.translate(p.x, p.y)
      c.rotate(p.r)
      c.globalAlpha = Math.max(0, 1 - age / 2600)
      c.fillStyle = p.color
      c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
      c.restore()
    }
    if (age < 2600) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

/** Avgör om mörkt läge ska gälla just nu enligt inställningarna. */
export function isDark(theme: string, from: string, to: string, now = new Date()): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  if (theme === 'schedule') {
    const mins = (s: string) => {
      const [h, m] = s.split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    const cur = now.getHours() * 60 + now.getMinutes()
    const a = mins(from)
    const b = mins(to)
    return a <= b ? cur >= a && cur < b : cur >= a || cur < b
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}
