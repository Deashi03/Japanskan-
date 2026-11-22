import { getSnap } from './store'

// ---------------------------------------------------------------- Ljud

interface Engine { ctx: AudioContext; out: AudioNode; wet: AudioNode }
let engine: Engine | null = null

/** Bygger ljudkedjan: allt går genom en kompressor (jämn nivå) och en liten del genom
 *  ett syntetiskt rumseko, vilket ger ljuden kropp i stället för torra pip. */
function build(): Engine {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 4
  comp.attack.value = 0.003
  comp.release.value = 0.2
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(comp).connect(ctx.destination)

  const len = Math.floor(ctx.sampleRate * 1.4)
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
  }
  const reverb = ctx.createConvolver()
  reverb.buffer = impulse
  const wet = ctx.createGain()
  wet.gain.value = 0.22
  wet.connect(reverb).connect(master)
  return { ctx, out: master, wet }
}

/** iPhone spelar bara upp ljud som startats av en tryckning, och tystar webbljud när
 *  ringsignalen är avstängd. Därför väcks ljudet vid varje tryckning, och appen ber om
 *  att få spela upp som en vanlig mediaapp. */
function unlock() {
  if (!getSnap().settings.sound) return
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') session.type = 'playback'
    engine ??= build()
    const { ctx } = engine
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

function audio(): Engine | null {
  if (!getSnap().settings.sound) return null
  unlock()
  return engine
}

interface ToneOpts { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number; wet?: number }

function tone(freq: number, start: number, dur: number, opts: ToneOpts = {}) {
  const e = audio()
  if (!e) return
  const t = e.ctx.currentTime + start
  const osc = e.ctx.createOscillator()
  const g = e.ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + (opts.attack ?? 0.006))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(e.out)
  if (opts.wet !== 0) {
    const send = e.ctx.createGain()
    send.gain.value = opts.wet ?? 1
    g.connect(send).connect(e.wet)
  }
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** Kort brusstöt genom ett filter – används för anslag, svep och "luft". */
function noise(start: number, dur: number, opts: { from: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType }) {
  const e = audio()
  if (!e) return
  const t = e.ctx.currentTime + start
  const len = Math.max(1, Math.floor(e.ctx.sampleRate * dur))
  const buf = e.ctx.createBuffer(1, len, e.ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = e.ctx.createBufferSource()
  src.buffer = buf
  const f = e.ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.Q.value = opts.q ?? 1.2
  f.frequency.setValueAtTime(opts.from, t)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
  const g = e.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t + Math.min(0.02, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(e.out)
  src.start(t)
}

/** Marimbaliknande ton: grundton, en snabbt avklingande överton och ett litet anslag. */
function mallet(freq: number, start: number, dur = 0.5, gain = 0.3) {
  tone(freq, start, dur, { gain, attack: 0.004 })
  tone(freq * 4, start, dur * 0.22, { gain: gain * 0.28, attack: 0.002 })
  tone(freq * 2.01, start, dur * 0.5, { gain: gain * 0.12 })
  noise(start, 0.018, { from: Math.min(freq * 3, 6000), gain: gain * 0.25, q: 0.8 })
}

/** Glittrande skimmer ovanpå en ton. */
function sparkle(freq: number, start: number, count = 4, gain = 0.06) {
  for (let i = 0; i < count; i++) tone(freq * (1 + i * 0.5), start + i * 0.045, 0.28, { gain: gain * (1 - i * 0.15), type: 'triangle' })
}

function vibrate(pattern: number | number[]) {
  if (getSnap().settings.haptics) navigator.vibrate?.(pattern)
}

/** Klockton: grundton med ostämda övertoner och lång efterklang. */
function bell(freq: number, start: number, dur = 0.9, gain = 0.12) {
  tone(freq, start, dur, { gain, attack: 0.003 })
  tone(freq * 2.76, start, dur * 0.45, { gain: gain * 0.35, attack: 0.002 })
  tone(freq * 5.4, start, dur * 0.2, { gain: gain * 0.18, attack: 0.002 })
}

/** Mjuk baston som ger tyngd åt längre sviter. */
function bass(freq: number, start: number, dur = 0.5, gain = 0.2) {
  tone(freq, start, dur, { gain, type: 'triangle', attack: 0.01, wet: 0.4 })
  tone(freq * 2, start, dur * 0.5, { gain: gain * 0.3 })
}

// Pentatonisk skala från C5: alla toner låter bra ihop, i vilken ordning som helst.
const PENTA = [0, 2, 4, 7, 9]
const note = (semi: number) => 523.25 * Math.pow(2, semi / 12)
/** Skalsteg nummer i, uppåt över oktaverna. */
const deg = (i: number) => note(PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5))

// Små melodier (i skalsteg räknat från grundtonen) som turas om, så att två rätt
// i rad aldrig låter likadant.
const MOTIFS = [
  [0, 2],
  [0, 3],
  [1, 3],
  [0, 2, 4],
  [2, 4],
  [0, 1, 3],
  [3, 1, 4],
  [0, 2, 3, 5],
  [4, 2, 5],
  [0, 4],
]
// Avslutningar vid var femte rätt, en ny för varje nivå.
const FLOURISH = [
  [0, 2, 4, 5],
  [5, 4, 2, 5, 7],
  [0, 2, 4, 5, 7, 9],
  [4, 5, 7, 5, 7, 9, 10],
]

export const fx = {
  /** Rätt svar. Varje rätt i rad får en egen liten melodi, och ljudet växer med sviten:
   *  efter 5 rätt tillkommer klockor, efter 10 stämmor, efter 15 bas och efter 20 ett eko.
   *  Var femte rätt avslutas med en löpning. */
  correct(combo = 0) {
    const tier = Math.min(Math.floor(combo / 5), 4)
    const root = (combo % 5) + tier
    const motif = MOTIFS[(combo * 3 + tier) % MOTIFS.length]
    const step = tier >= 2 ? 0.07 : 0.085
    motif.forEach((d, i) => {
      const last = i === motif.length - 1
      const t = i * step
      mallet(deg(root + d), t, last ? 0.6 : 0.4, 0.3)
      if (tier >= 1 && last) bell(deg(root + d + 5), t + 0.02, 0.9, 0.09)
      if (tier >= 2) mallet(deg(root + d - 2), t, last ? 0.5 : 0.32, 0.14)
      if (tier >= 4) mallet(deg(root + d + 5), t + 0.16, 0.3, 0.07)
    })
    const end = (motif.length - 1) * step
    if (tier >= 3) bass(deg(root - 10), 0, 0.55, 0.2)
    sparkle(deg(root + motif[motif.length - 1] + 10), end + 0.04, 2 + Math.min(tier, 3), 0.04)

    if (combo > 0 && (combo + 1) % 5 === 0) {
      const run = FLOURISH[Math.min(tier, FLOURISH.length - 1)]
      run.forEach((d, i) => mallet(deg(root + d), end + 0.16 + i * 0.06, 0.45, 0.2))
      const top = end + 0.16 + run.length * 0.06
      ;[0, 2, 4].forEach((d) => bell(deg(root + d + 5), top, 1.2, 0.08))
      bass(deg(root - 10), top, 0.9, 0.18)
      sparkle(deg(root + 12), top + 0.05, 5, 0.06)
      noise(top - 0.05, 0.4, { from: 2500, to: 8000, gain: 0.03 })
    }
    vibrate(combo > 0 && (combo + 1) % 5 === 0 ? [15, 40, 25] : 15)
  },
  /** Fel svar – mjuk, dov och kort, så att det inte känns som ett straff. */
  wrong() {
    tone(233, 0, 0.2, { type: 'triangle', gain: 0.32, slideTo: 196 })
    tone(155, 0.13, 0.34, { type: 'triangle', gain: 0.3, slideTo: 123 })
    noise(0, 0.07, { from: 300, gain: 0.12, type: 'lowpass' })
    vibrate([40, 60, 40])
  },
  /** Ett par hamnar rätt i dra-övningen. */
  pop(i = 0) {
    const f = deg(i + 2)
    tone(f, 0, 0.14, { gain: 0.26, slideTo: f * 1.5, attack: 0.003 })
    mallet(f * 1.5, 0.06, 0.3, 0.16)
    vibrate(8)
  },
  /** Knapptryck. */
  tap() {
    tone(1400, 0, 0.035, { gain: 0.09, slideTo: 900, wet: 0 })
    noise(0, 0.012, { from: 3500, gain: 0.05 })
  },
  /** Nästa fråga glider in. */
  whoosh() {
    noise(0, 0.2, { from: 500, to: 2600, q: 0.9, gain: 0.05 })
  },
  /** Ny del av ordkortet visas. */
  reveal() {
    mallet(note(7), 0, 0.3, 0.14)
    noise(0, 0.12, { from: 900, to: 2400, gain: 0.03 })
  },
  /** Ett nytt ord presenteras. */
  newWord() {
    mallet(note(0), 0, 0.5, 0.18)
    mallet(note(7), 0.09, 0.5, 0.18)
    mallet(note(12), 0.18, 0.7, 0.18)
  },
  /** Passet är klart. */
  complete() {
    ;[0, 4, 7, 12].forEach((s, i) => mallet(note(s), i * 0.1, 0.6, 0.28))
    ;[12, 16, 19, 24].forEach((s) => mallet(note(s), 0.46, 1.4, 0.2))
    tone(note(0) / 2, 0.46, 1.3, { gain: 0.22, type: 'triangle' })
    sparkle(note(24), 0.6, 6, 0.07)
    sparkle(note(31), 0.85, 6, 0.05)
    noise(0.44, 0.5, { from: 2000, to: 7000, gain: 0.04 })
    vibrate([20, 40, 20, 40, 60])
  },
}

// ---------------------------------------------------------------- Uppläsning

let voices: SpeechSynthesisVoice[] = []
if (typeof speechSynthesis !== 'undefined') {
  const load = () => (voices = speechSynthesis.getVoices())
  load()
  speechSynthesis.addEventListener?.('voiceschanged', load)
}

export const canSpeak = typeof speechSynthesis !== 'undefined'

/** Läser upp en eller flera japanska texter i följd. Avbryter det som eventuellt redan läses. */
export function speak(...texts: string[]) {
  if (!canSpeak) return
  speechSynthesis.cancel()
  const v = voices.find((v) => v.lang.replace('_', '-').startsWith('ja'))
  for (const text of texts) {
    if (!text) continue
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    if (v) u.voice = v
    u.rate = 0.9
    speechSynthesis.speak(u)
  }
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel()
}

// ---------------------------------------------------------------- Partiklar

interface Particle { x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number; color: string; life: number; age: number; shape: 0 | 1 | 2; g: number }
let canvas: HTMLCanvasElement | null = null
let parts: Particle[] = []
let running = false
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function stage(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100'
    document.body.appendChild(canvas)
  }
  const dpr = devicePixelRatio || 1
  if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
  }
  return canvas.getContext('2d')
}

function loop(prev: number) {
  const c = stage()
  if (!c) return
  const dpr = devicePixelRatio || 1
  const frame = (t: number) => {
    const dt = Math.min(40, t - prev) / 16.7
    prev = t
    c.clearRect(0, 0, canvas!.width, canvas!.height)
    parts = parts.filter((p) => p.age < p.life)
    for (const p of parts) {
      p.age += dt * 16.7
      p.vy += p.g * dt
      p.vx *= Math.pow(0.985, dt)
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.r += p.vr * dt
      const k = 1 - p.age / p.life
      c.save()
      c.translate(p.x * dpr, p.y * dpr)
      c.rotate(p.r)
      c.globalAlpha = Math.min(1, k * 1.6)
      c.fillStyle = p.color
      const s = p.s * dpr * (p.shape === 2 ? k : 1)
      if (p.shape === 0) c.fillRect(-s / 2, -s / 4, s, s / 2)
      else if (p.shape === 1) {
        c.beginPath()
        c.arc(0, 0, s / 2, 0, Math.PI * 2)
        c.fill()
      } else {
        // fyruddig stjärna
        c.beginPath()
        for (let i = 0; i < 8; i++) {
          const rad = i % 2 ? s * 0.22 : s * 0.6
          c.lineTo(Math.cos((i * Math.PI) / 4) * rad, Math.sin((i * Math.PI) / 4) * rad)
        }
        c.closePath()
        c.fill()
      }
      c.restore()
    }
    if (parts.length) requestAnimationFrame(frame)
    else {
      running = false
      c.clearRect(0, 0, canvas!.width, canvas!.height)
    }
  }
  requestAnimationFrame(frame)
}

function emit(list: Particle[]) {
  if (reduced() || typeof document === 'undefined') return
  parts.push(...list)
  if (!running) {
    running = true
    loop(performance.now())
  }
}

const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#3e63dd', '#8e4ec6', '#ffd60a']
const GOOD = ['#3fbf7c', '#8fe3b6', '#ffd60a', '#ffffff']

/** Liten gnistkaskad från ett element – används när ett svar är rätt. */
export function burst(el: Element | null | undefined, count = 14) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  emit(
    Array.from({ length: count }, (_, i): Particle => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const v = 2.2 + Math.random() * 3.2
      return {
        x: cx + (Math.cos(a) * r.width) / 3,
        y: cy + (Math.sin(a) * r.height) / 3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1.2,
        s: 7 + Math.random() * 7,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: GOOD[i % GOOD.length],
        life: 520 + Math.random() * 280,
        age: 0,
        shape: i % 3 === 0 ? 1 : 2,
        g: 0.12,
      }
    }),
  )
}

/** Konfettiregn från båda sidor – används när passet är klart. */
export function confetti() {
  const make = (side: -1 | 1) =>
    Array.from({ length: 80 }, (): Particle => ({
      x: side < 0 ? 0 : innerWidth,
      y: innerHeight * 0.62,
      vx: -side * (4 + Math.random() * 9),
      vy: -(8 + Math.random() * 12),
      s: 6 + Math.random() * 7,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 2200 + Math.random() * 900,
      age: 0,
      shape: Math.random() < 0.75 ? 0 : 1,
      g: 0.38,
    }))
  emit([...make(-1), ...make(1)])
}

// ---------------------------------------------------------------- Tema

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
