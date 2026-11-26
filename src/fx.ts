import { milestoneLevel, planCorrect, type Note } from './streak'
import { getSnap } from './store'

// ---------------------------------------------------------------- Ljud

interface Engine { ctx: AudioContext; out: AudioNode; wet: AudioNode; noise: AudioBuffer }
let engine: Engine | null = null

/** Bygger ljudkedjan: allt går genom en kompressor (jämn nivå) och en liten del genom
 *  ett syntetiskt rumseko, vilket ger ljuden kropp i stället för torra pip. */
function build(existing?: AudioContext): Engine {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  // 'interactive' ber om minsta möjliga fördröjning mellan kod och högtalare.
  let ctx: AudioContext
  if (existing) ctx = existing
  else
    try {
      ctx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      ctx = new Ctor()
    }
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
  // Ett delat brus som alla brusljud klipper ur, i stället för att skapa nytt varje gång.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  return { ctx, out: master, wet, noise }
}

// Mobiler stänger av ljudutgången efter en stunds tystnad, och nästa ljud kommer då för
// sent – efter animationen det hör till. Under ett pass spelas därför en helt tyst signal
// (bara nollor, inget brus) som håller utgången vaken. Utanför pass stängs ljudet av helt.
let keepAlive: AudioBufferSourceNode | null = null
let sessionActive = false
let sleepTimer: ReturnType<typeof setTimeout> | undefined

function startKeepAlive() {
  if (!engine || keepAlive) return
  const src = engine.ctx.createBufferSource()
  src.buffer = engine.ctx.createBuffer(1, engine.ctx.sampleRate, engine.ctx.sampleRate)
  src.loop = true
  src.connect(engine.ctx.destination)
  src.start()
  keepAlive = src
}

function stopKeepAlive() {
  try {
    keepAlive?.stop()
  } catch {
    /* redan stoppad */
  }
  keepAlive?.disconnect()
  keepAlive = null
}

/** Ett pass börjar: ljudet hålls redo så att effekterna kommer i takt med animationerna. */
export function audioSessionStart() {
  sessionActive = true
  clearTimeout(sleepTimer)
  if (engine) startKeepAlive()
}

/** Ett pass är slut: när sista ljudet klingat ut (`afterMs`) stängs ljudmotorn av helt. */
export function audioSessionEnd(afterMs = 0) {
  sessionActive = false
  clearTimeout(sleepTimer)
  sleepTimer = setTimeout(() => {
    if (sessionActive) return
    stopKeepAlive()
    if (engine?.ctx.state === 'running') void engine.ctx.suspend()
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'auto'
  }, afterMs)
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
    if (sessionActive) startKeepAlive()
    else {
      // Utanför pass: väck ljudet för ett enstaka ljud och stäng av igen strax efteråt.
      clearTimeout(sleepTimer)
      sleepTimer = setTimeout(() => !sessionActive && engine?.ctx.state === 'running' && void engine.ctx.suspend(), 4000)
    }
    syncLag()
  } catch {
    /* ljud är inte nödvändigt */
  }
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true })
  // Spara batteri när appen inte syns; ljudet väcks igen vid nästa tryckning.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && engine?.ctx.state === 'running') void engine.ctx.suspend()
  })
}

/** Hur många millisekunder ljudet når örat efter att det startats. Enheten rapporterar
 *  sin egen fördröjning; därtill kommer det användaren ställt in själv. Animationer som
 *  hör ihop med ett ljud väntar lika länge, så att de syns och hörs samtidigt. */
export function lagMs(): number {
  const settings = getSnap().settings
  if (!settings.sound) return 0
  const ctx = engine?.ctx as (AudioContext & { outputLatency?: number }) | undefined
  const measured = ctx ? ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 : 0
  return Math.round(Math.min(400, Math.max(0, measured + (settings.audioLag || 0))))
}

/** Lägger fördröjningen i en CSS-variabel som stilmallen använder för sina animationer. */
export function syncLag() {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--lag', lagMs() + 'ms')
}

/** Satt när ljud renderas offline (för mätning och ljudprov) i stället för att spelas upp. */
let override: Engine | null = null

function audio(): Engine | null {
  if (override) return override
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
function noise(start: number, dur: number, opts: { from: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType; attack?: number }) {
  const e = audio()
  if (!e) return
  const t = e.ctx.currentTime + start
  const src = e.ctx.createBufferSource()
  src.buffer = e.noise
  const f = e.ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.Q.value = opts.q ?? 1.2
  f.frequency.setValueAtTime(opts.from, t)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
  const g = e.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t + (opts.attack ?? Math.min(0.02, dur / 3)))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(e.out)
  src.start(t, Math.random() * Math.max(0, 1 - dur), dur + 0.05)
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

// Harpa: en knäppt sträng enligt Karplus–Strong. En kort brusstöt får cirkulera i en
// fördröjningsslinga som är exakt en svängning lång och mjukas upp för varje varv – det
// ger den naturliga, avklingande strängklangen. Varje ton räknas ut en gång och sparas.
const strings = new Map<number, AudioBuffer>()

function stringBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  const key = Math.round(freq * 10)
  const cached = strings.get(key)
  if (cached) return cached
  const sr = ctx.sampleRate
  const total = Math.floor(sr * 2.6)
  const period = Math.max(2, Math.round(sr / freq))
  const ring = new Float32Array(period)
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
  // Mjukare anslag (fingertopp i stället för plektrum): jämna ut bruset några varv.
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < period; i++) ring[i] = (ring[i] + ring[(i + 1) % period]) / 2
  const buffer = ctx.createBuffer(1, total, sr)
  const out = buffer.getChannelData(0)
  // Höga strängar tappar energi fortare per sekund, så de får klinga lite längre per varv.
  const keepEnergy = 0.9935 + 0.0055 * Math.min(1, freq / 1400)
  let peak = 0
  for (let i = 0, at = 0; i < total; i++) {
    const next = (at + 1) % period
    const v = ring[at]
    out[i] = v
    ring[at] = keepEnergy * 0.5 * (v + ring[next])
    at = next
    if (Math.abs(v) > peak) peak = Math.abs(v)
  }
  const fade = Math.floor(sr * 0.25)
  for (let i = 0; i < total; i++) out[i] = (out[i] / (peak || 1)) * (i > total - fade ? (total - i) / fade : 1)
  strings.set(key, buffer)
  // Cachen hålls liten (ett par tiotal toner) så att minnet inte växer.
  if (strings.size > 56) strings.delete(strings.keys().next().value as number)
  return buffer
}

function harp(freq: number, start: number, gain = 0.2) {
  const e = audio()
  if (!e) return
  const src = e.ctx.createBufferSource()
  src.buffer = stringBuffer(e.ctx, freq)
  const g = e.ctx.createGain()
  g.gain.value = gain
  const send = e.ctx.createGain()
  send.gain.value = 1.4
  src.connect(g)
  g.connect(e.out)
  g.connect(send).connect(e.wet)
  src.start(e.ctx.currentTime + start)
}

// Avslutningens toner, i halvtoner från C5.
const HARP_GLISS = [-24, -22, -20, -17, -15, -12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12]
const HARP_FINALE = [-12, -8, -5, 0, 4, 7, 12, 16, 19, 24, 28, 31, 36]
const CHORDS = [
  { at: 0.6, bass: -24, harp: [-12, -5, 0, 4, 7, 12], bell: 16, mallets: [0, 4, 7, 12] }, // C
  { at: 1.2, bass: -19, harp: [-19, -12, -7, -3, 0, 5], bell: 17, mallets: [5, 9, 12] }, // F
  { at: 1.8, bass: -17, harp: [-17, -10, -5, -1, 2, 7], bell: 19, mallets: [7, 11, 14] }, // G
]
/** När slutackordet slår. Animationerna i sammanfattningen är tajmade mot samma tider. */
export const FINALE_AT = 2.4
export const HIT_TIMES = [...CHORDS.map((c) => c.at), FINALE_AT]

/** Räknar ut harpans strängar i förväg, lite i taget, så att avslutningen startar direkt. */
export function prepareHarp() {
  if (!getSnap().settings.sound || !engine) return
  const ctx = engine.ctx
  const notes = [...new Set([...HARP_GLISS, ...HARP_FINALE, ...CHORDS.flatMap((c) => c.harp)])]
  notes.forEach((semi, i) => setTimeout(() => stringBuffer(ctx, note(semi)), 400 + i * 30))
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

// ---------------------------------------------------------------- Fler instrument

/** Kalimba: en kort, rund ton med en ostämd överton som klingar av fort. */
function kalimba(freq: number, start: number, dur = 0.7, gain = 0.28) {
  tone(freq, start, dur, { gain, attack: 0.002 })
  tone(freq * 6.27, start, dur * 0.14, { gain: gain * 0.3, attack: 0.001 })
  noise(start, 0.012, { from: Math.min(freq * 4, 7000), gain: gain * 0.2, q: 1.5 })
}

/** Pad: tre svagt avstämda toner med mjukt anslag – ger ackordet kropp utan att ta plats. */
function pad(freq: number, start: number, dur = 1.2, gain = 0.1) {
  for (const f of [freq * 0.996, freq, freq * 1.004]) tone(f, start, dur, { gain: gain / 1.6, attack: 0.22, type: 'sine' })
}

/** Horn: tre sågtandstoner genom ett filter som öppnar sig vid anslaget, som ett blåsinstrument. */
function horn(freq: number, start: number, dur = 0.6, gain = 0.18) {
  const e = audio()
  if (!e) return
  const t = e.ctx.currentTime + start
  const lp = e.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.6
  lp.frequency.setValueAtTime(500, t)
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.05)
  lp.frequency.exponentialRampToValueAtTime(1300, t + Math.max(0.1, dur))
  const g = e.ctx.createGain()
  const peak = gain / 2.4
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.04)
  g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.05, dur - 0.14))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(g)
  g.connect(e.out)
  const send = e.ctx.createGain()
  send.gain.value = 0.7
  g.connect(send).connect(e.wet)
  for (const detune of [-7, 0, 7]) {
    const o = e.ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    o.detune.value = detune
    o.connect(lp)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

/** Puka: en sinuston som sjunker i tonhöjd, plus en dov duns. */
function timpani(freq: number, start: number, dur = 0.6, gain = 0.3) {
  tone(freq, start, dur, { gain, attack: 0.004, slideTo: freq * 0.62, wet: 0.5 })
  noise(start, 0.09, { from: 220, gain: gain * 0.7, type: 'lowpass', q: 0.7 })
}

/** Cymbal: brus som sväller upp och klingar av. */
function cymbal(start: number, dur = 0.8, gain = 0.05) {
  noise(start, dur, { from: 6500, type: 'highpass', q: 0.5, gain, attack: dur * 0.55 })
}

/** Spelar en not ur en ljudplan med rätt instrument. */
function play(n: Note) {
  const f = note(n.semi)
  switch (n.voice) {
    case 'mallet': return mallet(f, n.at, n.dur, n.gain)
    case 'kalimba': return kalimba(f, n.at, n.dur, n.gain)
    case 'bell': return bell(f, n.at, n.dur, n.gain)
    // Höga harptoner klingar av fort och blir svaga, låga klingar länge och blir starka: nivån
    // jämnas ut efter tonhöjd så att harpan låter lika stark i alla lägen.
    case 'harp': return harp(f, n.at, n.gain * (0.85 + 0.95 * Math.min(1, Math.max(0, (n.semi + 12) / 12))))
    case 'pad': return pad(f, n.at, n.dur, n.gain)
    case 'bass': return bass(f, n.at, n.dur, n.gain)
    case 'horn': return horn(f, n.at, n.dur, n.gain)
    case 'timpani': return timpani(f, n.at, n.dur, n.gain)
    case 'cymbal': return cymbal(n.at, n.dur, n.gain)
    case 'sparkle': return sparkle(f, n.at, 3, n.gain)
  }
}

/** Renderar ljud offline till ljudspår (vänster, höger) utan att något spelas upp. Används för
 *  att mäta ljuden – toppnivå, tonläge, variation – och för att göra ljudprov. */
export async function renderOffline(seconds: number, schedule: () => void, sampleRate = 44100): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate)
  const previous = override
  override = build(ctx as unknown as AudioContext)
  try {
    schedule()
  } finally {
    override = previous
  }
  const rendered = await ctx.startRendering()
  return [rendered.getChannelData(0), rendered.getChannelData(1)]
}

export const fx = {
  /** Rätt svar. `n` är hur många rätt i rad det här var (1 för det första). Melodin rör sig i
   *  mellanregistret över växlande ackord och instrument, så att inga två svar i rad låter
   *  likadant och tonläget inte klättrar. Var femte svar får en löpning, och 10, 20, 30 …
   *  får en egen fanfar som växer för varje milstolpe. */
  correct(n = 1) {
    planCorrect(n).forEach(play)
    const level = milestoneLevel(n)
    vibrate(level ? [20, 40, 20, 40, 80] : n % 5 === 0 ? [15, 40, 25] : 15)
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
  /** Passet är klart: ett harpsvep uppåt, tre ackord som stiger (C–F–G) med harpan
   *  rullande under, och ett stort slutackord med ett sista svep upp i diskanten. */
  complete() {
    // Uppåtsvepet och den inledande figuren.
    HARP_GLISS.forEach((semi, i) => harp(note(semi), i * 0.034, 0.1 + i * 0.008))
    ;[0, 4, 7, 12].forEach((semi, i) => mallet(note(semi), 0.1 + i * 0.1, 0.5, 0.22))

    for (const c of CHORDS) {
      c.harp.forEach((semi, i) => harp(note(semi), c.at + i * 0.085, 0.2))
      c.mallets.forEach((semi) => mallet(note(semi), c.at, 0.9, 0.17))
      bell(note(c.bell), c.at, 1.3, 0.11)
      bass(note(c.bass), c.at, 0.7, 0.24)
      noise(c.at - 0.02, 0.22, { from: 3000, to: 7000, gain: 0.025 })
    }

    // Slutackordet.
    const t = FINALE_AT
    ;[0, 4, 7, 12, 16].forEach((semi) => mallet(note(semi), t, 1.8, 0.22))
    ;[12, 19, 24].forEach((semi) => bell(note(semi), t, 2.2, 0.1))
    bass(note(-24), t, 1.6, 0.28)
    bass(note(-36), t, 1.6, 0.18)
    HARP_FINALE.forEach((semi, i) => harp(note(semi), t + i * 0.045, 0.2))
    noise(t - 0.25, 0.3, { from: 800, to: 6000, gain: 0.04 })
    noise(t, 0.9, { from: 6000, to: 9000, gain: 0.035 })
    sparkle(note(24), t + 0.25, 6, 0.06)
    sparkle(note(31), t + 0.55, 6, 0.05)
    sparkle(note(36), t + 0.9, 5, 0.035)
    // Efterklang: harpan faller mjukt tillbaka.
    ;[24, 19, 16, 12, 7, 4, 0].forEach((semi, i) => harp(note(semi), t + 1.1 + i * 0.11, 0.09))
    vibrate([20, 560, 20, 560, 20, 560, 30, 560, 80])
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

// Ökar för varje ny uppläsning, så att en väntande fortsättning vet om den har blivit avbruten.
let speechRun = 0

function utter(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  const v = voices.find((v) => v.lang.replace('_', '-').startsWith('ja'))
  if (v) u.voice = v
  u.rate = 0.9
  return u
}

/** Läser upp en japansk text. Avbryter det som eventuellt redan läses. */
export function speak(text: string, onDone?: () => void) {
  speakAll([text], 0, 0, onDone)
}

/** Läser upp flera texter i följd med en paus emellan. Nästa text startar först när den
 *  förra har lästs klart och pausen har gått; en ny uppläsning eller `stopSpeaking`
 *  avbryter resten. */
export function speakAll(texts: string[], gapMs = 1500, delayMs = 0, onDone?: () => void) {
  const queue = texts.filter(Boolean)
  if (!canSpeak || !queue.length) {
    onDone?.()
    return
  }
  const run = ++speechRun
  speechSynthesis.cancel()
  const next = (i: number) => {
    if (run !== speechRun) return
    if (i >= queue.length) return onDone?.()
    const u = utter(queue[i])
    let done = false
    const after = () => {
      if (done) return
      done = true
      clearTimeout(guard)
      if (i + 1 < queue.length) setTimeout(() => next(i + 1), gapMs)
      else next(i + 1)
    }
    u.onend = after
    u.onerror = after
    // Om rösten aldrig meddelar att den är klar (händer på vissa enheter) går vi vidare
    // efter ungefär den tid meningen borde ta att läsa.
    const guard = setTimeout(after, 1500 + [...queue[i]].length * 260)
    speechSynthesis.speak(u)
  }
  if (delayMs > 0) setTimeout(() => next(0), delayMs)
  else next(0)
}

export function stopSpeaking() {
  speechRun++
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
  const lag = lagMs()
  if (lag > 0) return void setTimeout(() => burstNow(el, count), lag)
  burstNow(el, count)
}

function burstNow(el: Element, count: number) {
  if (!el.isConnected) return
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

/** Fyrverkeri: en rund smäll av gnistor på en plats på skärmen (0–1 i bredd och höjd). */
export function firework(x: number, y: number, palette: string[], count = 46, power = 1) {
  const cx = x * innerWidth
  const cy = y * innerHeight
  emit(
    Array.from({ length: count }, (_, i): Particle => {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.25
      const v = (3.5 + Math.random() * 5.5) * power
      return {
        x: cx,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        s: 6 + Math.random() * 8,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: palette[i % palette.length],
        life: 900 + Math.random() * 500,
        age: 0,
        shape: i % 2 ? 2 : 1,
        g: 0.09,
      }
    }),
  )
}

/** Långsamt fallande konfetti från överkanten. */
function rain(count = 70) {
  emit(
    Array.from({ length: count }, (): Particle => ({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      s: 6 + Math.random() * 7,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 3200 + Math.random() * 1400,
      age: 0,
      shape: Math.random() < 0.7 ? 0 : 1,
      g: 0.03,
    })),
  )
}

/** Firandet när ett pass är klart: musiken, och fyrverkerier som smäller på ackorden. */
export function celebrate() {
  fx.complete()
  const lag = lagMs()
  const at = (seconds: number, run: () => void) => setTimeout(run, seconds * 1000 + lag)
  const GOLD = ['#ffd60a', '#ffe98a', '#ffffff', '#f5a524']
  const ROSE = ['#f0595e', '#ffb1b3', '#ffffff', '#ffd60a']
  const MINT = ['#3fbf7c', '#8fe3b6', '#ffffff', '#6ea8ff']
  at(HIT_TIMES[0], () => firework(0.5, 0.3, GOLD))
  at(HIT_TIMES[1], () => firework(0.2, 0.24, ROSE))
  at(HIT_TIMES[2], () => firework(0.8, 0.24, MINT))
  at(FINALE_AT, () => {
    firework(0.5, 0.3, [...GOLD, ...ROSE, ...MINT], 90, 1.5)
    confetti()
  })
  at(FINALE_AT + 0.35, () => rain())
  at(FINALE_AT + 0.6, () => {
    firework(0.15, 0.5, GOLD, 30, 0.8)
    firework(0.85, 0.5, GOLD, 30, 0.8)
  })
}

/** Fyrverkerier på skärmen för det 10:e, 20:e, 30:e … svaret i rad – fler och större för varje
 *  nivå, i takt med fanfaren. Returnerar hur många sekunder firandet pågår. */
export function streakFireworks(n: number) {
  const level = milestoneLevel(n)
  if (!level) return
  const lag = lagMs()
  const at = (seconds: number, run: () => void) => setTimeout(run, seconds * 1000 + lag)
  const GOLD = ['#ffd60a', '#ffe98a', '#ffffff', '#f5a524']
  const ROSE = ['#f0595e', '#ffb1b3', '#ffffff', '#ffd60a']
  const MINT = ['#3fbf7c', '#8fe3b6', '#ffffff', '#6ea8ff']
  const SKY = ['#6ea8ff', '#b7d2ff', '#ffffff', '#c58af0']
  const power = 1 + Math.min(level, 6) * 0.12
  at(0.18, () => firework(0.5, 0.3, GOLD, 40 + level * 6, power))
  if (level >= 2) at(0.3, () => firework(0.22, 0.26, ROSE, 36, power))
  if (level >= 2) at(0.36, () => firework(0.78, 0.26, MINT, 36, power))
  if (level >= 3) at(0.5, () => confetti())
  if (level >= 4) at(0.6, () => firework(0.5, 0.18, SKY, 60, power * 1.2))
  if (level >= 5) {
    at(1.1, () => firework(0.3, 0.4, GOLD, 50, power))
    at(1.2, () => firework(0.7, 0.4, ROSE, 50, power))
    at(1.5, () => firework(0.5, 0.3, [...GOLD, ...ROSE, ...MINT, ...SKY], 110, power * 1.4))
  }
  if (level >= 10) at(1.8, () => rain(110))
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
