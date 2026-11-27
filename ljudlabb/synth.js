// Ljudmotor för ljudlabbet. Ren JavaScript utan beroenden: allt räknas ut sampel för sampel
// och blir ett stereoljud (två Float32Array). Samma kod kan sedan köras i appen, som då
// förrenderar de valda ljuden till AudioBuffer vid start – ljudet blir identiskt överallt.

export const SR = 44100
const TAU = Math.PI * 2
export const midi = (m) => 440 * Math.pow(2, (m - 69) / 12)
export const dB = (x) => Math.pow(10, x / 20)
const len = (s) => Math.max(1, Math.ceil(s * SR))
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)

/** Slumpgenerator med frö, så att varje ljud blir exakt likadant varje gång. */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Skalar så att den högsta toppen blir 1. */
function unit(x) {
  let p = 0
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]))
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] /= p
  return x
}

/** Mjuk in- och utfasning (cosinus), så att inget klickar. */
function fade(out, attack, rel) {
  const a = Math.min(out.length, Math.max(1, Math.round(attack * SR)))
  const r = Math.min(out.length, Math.max(1, Math.round(rel * SR)))
  for (let i = 0; i < a; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a)
  for (let i = 0; i < r; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / r)
  return out
}

/** Additiv syntes: en rad deltoner [förhållande, styrka, avklingning i sekunder]. Med
 *  ojämna förhållanden (2.32, 4.25 …) blir det klockor och glas, med jämna blir det toner. */
export function additive({ f, dur, partials, attack = 0.003, rel = 0.03, trem = 0, tremRate = 5, vib = 0, vibRate = 5, vibDelay = 0.1 }) {
  const n = len(dur)
  const out = new Float32Array(n)
  let mod = null
  if (vib) {
    mod = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      mod[i] = 1 + vib * clamp((t - vibDelay) / 0.2, 0, 1) * Math.sin(TAU * vibRate * t)
    }
  }
  for (const [r, a, d] of partials) {
    const fr = f * r
    if (fr > SR * 0.45) continue
    const w = (TAU * fr) / SR
    const k = Math.exp(-1 / (d * SR))
    let amp = a
    let ph = 0
    if (mod) for (let i = 0; i < n; i++) { out[i] += amp * Math.sin(ph); ph += w * mod[i]; amp *= k }
    else for (let i = 0; i < n; i++) { out[i] += amp * Math.sin(ph); ph += w; amp *= k }
  }
  if (trem) for (let i = 0; i < n; i++) out[i] *= 1 - trem * 0.5 * (1 - Math.cos((TAU * tremRate * i) / SR))
  return unit(fade(out, attack, rel))
}

/** FM-syntes: en bärvåg som moduleras av en annan. Klockor, elpiano, digitala toner. */
export function fm({ f, dur, ratio = 1, index = 2, idxDecay = 0.2, decay = 0.4, sustain = 0, attack = 0.002, rel = 0.03 }) {
  const n = len(dur)
  const out = new Float32Array(n)
  const wc = (TAU * f) / SR
  const wm = (TAU * f * ratio) / SR
  let pc = 0
  let pm = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const I = index * Math.exp(-t / idxDecay)
    const a = sustain + (1 - sustain) * Math.exp(-t / decay)
    out[i] = a * Math.sin(pc + I * Math.sin(pm))
    pc += wc
    pm += wm
  }
  return unit(fade(out, attack, rel))
}

/** Karplus–Strong: ett plockat strängljud (harpa, koto, nylon, pizzicato). t60 är tiden
 *  det tar för tonen att klinga ut, bright (0–1) hur ljus anslaget är. */
export function pluck({ f, dur, t60 = 1.2, bright = 0.5, pos = 0.18, seed = 7, rel = 0.05, lp: lpHz = 4200 }) {
  const n = len(dur)
  const out = new Float32Array(n)
  const D = SR / f - 0.5
  const Dl = Math.floor(D)
  const fr = D - Dl
  const M = Dl + 4
  const r = rng(seed)
  let lp = 0
  for (let i = 0; i < M && i < n; i++) {
    lp += bright * (r() * 2 - 1 - lp)
    out[i] = lp
  }
  const pk = Math.max(1, Math.round(pos * D))
  for (let i = M - 1; i >= pk; i--) out[i] -= out[i - pk]
  const g = Math.pow(10, -3 / (t60 * f))
  for (let i = M; i < n; i++) {
    const y1 = out[i - Dl] * (1 - fr) + out[i - Dl - 1] * fr
    const y2 = out[i - Dl - 1] * (1 - fr) + out[i - Dl - 2] * fr
    out[i] = g * 0.5 * (y1 + y2)
  }
  return unit(fade(biquad(out, 'lp', lpHz, 0.6), 0.0005, rel))
}

/** Spelar upp ett ljud snabbare i början och sedan i normal takt – ger en liten glidning
 *  uppåt eller nedåt (koto, fågelläten). */
export function bend(x, r0, tau) {
  const out = new Float32Array(x.length)
  let p = 0
  for (let i = 0; i < out.length; i++) {
    const j = Math.floor(p)
    if (j + 1 >= x.length) break
    const fr = p - j
    out[i] = x[j] * (1 - fr) + x[j + 1] * fr
    p += 1 + (r0 - 1) * Math.exp(-i / SR / tau)
  }
  return out
}

/** En sinus som glider från f0 till f1 (droppar, visslingar, "bloop"). */
export function sweep({ f0, f1, dur, glide = 0.08, decay = 0.2, h2 = 0, attack = 0.003, rel = 0.03, sustain = 0 }) {
  const n = len(dur)
  const out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = f1 + (f0 - f1) * Math.exp(-t / glide)
    ph += (TAU * f) / SR
    const a = sustain + (1 - sustain) * Math.exp(-t / decay)
    out[i] = a * (Math.sin(ph) + h2 * Math.sin(2 * ph))
  }
  return unit(fade(out, attack, rel))
}

/** Stack av (lätt orena) sågvågor, fyrkantvågor eller pulsvågor med bandbegränsade övertoner
 *  och en "ljusstyrka" som rör sig över tiden. Blås, stråkar, synthar och chip-ljud. */
export function stack({
  f, dur, kind = 'saw', duty = 0.5, voices = 1, detune = 0, harmonics = 12,
  hStart = 12, hEnd = 12, hTime = 0.1, attack = 0.01, decay = 0.3, sustain = 1, rel = 0.05,
  vib = 0, vibRate = 5.3, vibDelay = 0.15, vibRateJitter = 0,
}) {
  const n = len(dur)
  const out = new Float32Array(n)
  const maxH = Math.max(1, Math.min(harmonics, Math.floor((SR * 0.45) / f)))
  const coef = new Float32Array(maxH + 2)
  for (let h = 1; h <= maxH; h++) {
    if (kind === 'saw') coef[h] = 1 / h
    else if (kind === 'square') coef[h] = h % 2 ? 1 / h : 0
    else coef[h] = Math.sin(Math.PI * h * duty) / h
  }
  const ws = []
  for (let v = 0; v < voices; v++) {
    const cents = voices === 1 ? 0 : ((v / (voices - 1)) * 2 - 1) * detune
    ws.push({ w: (TAU * f * Math.pow(2, cents / 1200)) / SR, ph: (v * 0.37) % 1 * TAU })
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const Hc = hEnd + (hStart - hEnd) * Math.exp(-t / hTime)
    const env = t < attack ? t / attack : sustain + (1 - sustain) * Math.exp(-(t - attack) / decay)
    const m = vib ? 1 + vib * clamp((t - vibDelay) / 0.25, 0, 1) * Math.sin(TAU * (vibRate + vibRateJitter) * t) : 1
    let sum = 0
    for (let v = 0; v < ws.length; v++) {
      const o = ws[v]
      const s1 = Math.sin(o.ph)
      const c1 = Math.cos(o.ph)
      let sPrev = 0
      let sCur = s1
      let acc = coef[1] * clamp(Hc, 0, 1) * s1
      for (let h = 2; h <= maxH; h++) {
        const sNext = 2 * c1 * sCur - sPrev
        sPrev = sCur
        sCur = sNext
        const g = clamp(Hc - h + 1, 0, 1)
        if (g > 0) acc += coef[h] * g * sCur
      }
      sum += acc
      o.ph += o.w * m
    }
    out[i] = env * sum
  }
  return unit(fade(out, 0.002, rel))
}

// --- brus och filter -----------------------------------------------------------------

export function noise(dur, seed = 3) {
  const r = rng(seed)
  const out = new Float32Array(len(dur))
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1
  return out
}

/** Biquad-filter (RBJ): 'lp', 'hp' eller 'bp'. */
export function biquad(x, type, fc, q = 0.707) {
  const w = (TAU * clamp(fc, 20, SR * 0.45)) / SR
  const al = Math.sin(w) / (2 * q)
  const cw = Math.cos(w)
  let b0, b1, b2
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2 }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2 }
  else { b0 = al; b1 = 0; b2 = -al }
  const a0 = 1 + al
  const a1 = -2 * cw
  const a2 = 1 - al
  const out = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y
    out[i] = y
  }
  return out
}

/** Brus genom ett bandpassfilter vars frekvens glider (svisch, stigande skimmer). */
export function swish({ dur, f0, f1, q = 4, curve = 1, seed = 5, attack = 0.02, rel = 0.05, peak = 0.5 }) {
  const n = len(dur)
  const x = noise(dur, seed)
  const out = new Float32Array(n)
  let low = 0
  let band = 0
  for (let i = 0; i < n; i++) {
    const t = Math.pow(i / n, curve)
    const fc = f0 * Math.pow(f1 / f0, t)
    const f = 2 * Math.sin((Math.PI * Math.min(fc, 7000)) / SR)
    low += f * band
    const high = x[i] - low - band / q
    band += f * high
    const env = Math.sin(Math.PI * Math.pow(i / n, peak))
    out[i] = band * env
  }
  return unit(fade(out, attack, rel))
}

/** Dova slag: kick, taiko, puka. En sinus som faller i tonhöjd plus ett slag av brus. */
export function thump({ f0, f1, dur, pitchTime = 0.03, decay = 0.25, click = 0.3, h2 = 0, seed = 11 }) {
  const n = len(dur)
  const out = new Float32Array(n)
  const nz = biquad(noise(dur, seed), 'lp', 1800, 0.7)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = f1 + (f0 - f1) * Math.exp(-t / pitchTime)
    ph += (TAU * f) / SR
    out[i] = Math.exp(-t / decay) * (Math.sin(ph) + h2 * Math.sin(2 * ph)) + click * nz[i] * Math.exp(-t / 0.008)
  }
  return unit(fade(out, 0.001, 0.03))
}

/** Cymbal/crash: högpassat brus som sväller upp och klingar ut. */
export function cymbal({ dur, swell = 0.05, decay = 0.8, hp = 5500, seed = 13 }) {
  const n = len(dur)
  const x = biquad(biquad(noise(dur, seed), 'hp', hp, 0.6), 'lp', 14000, 0.6)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    x[i] *= clamp(t / swell, 0, 1) * Math.exp(-t / decay)
  }
  return unit(fade(x, 0.002, 0.05))
}

/** Kort brusstöt (klapp, hi-hat, popp, tick). */
export function burst({ dur = 0.08, decay = 0.02, lo = 1500, hi = 9000, q = 1, seed = 17 }) {
  const n = len(dur)
  let x = noise(dur, seed)
  x = biquad(x, 'hp', lo, 0.7)
  x = biquad(x, 'lp', hi, 0.7)
  if (q > 1.2) x = biquad(x, 'bp', Math.sqrt(lo * hi), q)
  for (let i = 0; i < n; i++) x[i] *= Math.exp(-i / SR / decay)
  return unit(fade(x, 0.0004, 0.01))
}

// --- efterklang och mixer ----------------------------------------------------------------

const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLP = [556, 441, 341, 225]

/** Freeverb: åtta kamfilter och fyra allpass per kanal. Returnerar [vänster, höger]. */
export function reverb(x, { room = 0.8, damp = 0.4 } = {}) {
  const fb = 0.28 + room * 0.7
  const d1 = damp * 0.4
  const chan = (spread) => {
    const out = new Float32Array(x.length)
    const combs = COMB.map((c) => ({ b: new Float32Array(c + spread), i: 0, f: 0 }))
    const aps = ALLP.map((c) => ({ b: new Float32Array(c + spread), i: 0 }))
    for (let n = 0; n < x.length; n++) {
      const inp = x[n] * 0.015
      let s = 0
      for (const c of combs) {
        const y = c.b[c.i]
        c.f = y * (1 - d1) + c.f * d1
        c.b[c.i] = inp + c.f * fb
        if (++c.i >= c.b.length) c.i = 0
        s += y
      }
      for (const a of aps) {
        const y = a.b[a.i]
        const o = -s + y
        a.b[a.i] = s + y * 0.5
        if (++a.i >= a.b.length) a.i = 0
        s = o
      }
      out[n] = s
    }
    return out
  }
  return [chan(0), chan(23)]
}


// --- ren efterklang: faltning med ett utklingande, mörknande brus -------------------------

function fftInPlace(re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let l = 2; l <= n; l <<= 1) {
    const a = ((inverse ? 2 : -2) * Math.PI) / l
    const wr = Math.cos(a)
    const wi = Math.sin(a)
    for (let i = 0; i < n; i += l) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < l / 2; k++) {
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + l / 2] * cr - im[i + k + l / 2] * ci
        const vi = re[i + k + l / 2] * ci + im[i + k + l / 2] * cr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + l / 2] = ur - vr; im[i + k + l / 2] = ui - vi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

/** Faltar x med h (FFT) och returnerar lika många sampel som x. */
export function convolve(x, h) {
  let N = 1
  while (N < x.length + h.length) N <<= 1
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N)
  ar.set(x)
  br.set(h)
  fftInPlace(ar, ai, false)
  fftInPlace(br, bi, false)
  for (let i = 0; i < N; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i]
    ai[i] = ar[i] * bi[i] + ai[i] * br[i]
    ar[i] = r
  }
  fftInPlace(ar, ai, true)
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = ar[i]
  return out
}

/** Impulssvar för en liten, jämn "platta": brus som klingar ut och mörknar med tiden. Till
 *  skillnad från Freeverb har det inga kamfilter och därför ingen metallisk ringning. */
export function makeIR({ t60 = 0.5, dark = 0.5, pre = 0.004, seed = 1 } = {}) {
  const n = len(t60 * 1.15 + pre)
  const p = Math.round(pre * SR)
  return [0, 1].map((ch) => {
    const r = rng(seed + ch * 101)
    const ir = new Float32Array(n)
    let y = 0
    for (let i = p; i < n; i++) {
      const t = (i - p) / SR
      const env = Math.exp((-6.9078 * t) / t60)
      const a = (0.85 - 0.8 * Math.min(1, t / t60)) * dark + 0.03
      y += a * ((r() * 2 - 1) * env - y)
      ir[i] = y * Math.min(1, t / 0.006)
    }
    let e = 0
    for (let i = 0; i < n; i++) e += ir[i] * ir[i]
    const g = 1 / Math.sqrt(e)
    for (let i = 0; i < n; i++) ir[i] *= g
    return ir
  })
}

/** Mixer: lägger ljud på en tidslinje med volym, panorering och mängd efterklang. */
export class Mix {
  constructor(seconds = 3) {
    this.cap = len(seconds)
    this.L = new Float32Array(this.cap)
    this.R = new Float32Array(this.cap)
    this.S = new Float32Array(this.cap)
    this.end = 0
  }
  grow(n) {
    if (n <= this.cap) return
    const cap = Math.max(n, this.cap * 2)
    for (const k of ['L', 'R', 'S']) {
      const a = new Float32Array(cap)
      a.set(this[k])
      this[k] = a
    }
    this.cap = cap
  }
  /** gain i dB (0 = full), pan -1…1, send = andel till efterklangen (0–1). */
  add(buf, t, gain = 0, pan = 0, send = 0.2) {
    const s = Math.max(0, Math.round(t * SR))
    this.grow(s + buf.length)
    const g = dB(gain)
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * g
    const gr = Math.sin(((pan + 1) * Math.PI) / 4) * g
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]
      this.L[s + i] += v * gl
      this.R[s + i] += v * gr
      this.S[s + i] += v * g * send
    }
    this.end = Math.max(this.end, s + buf.length)
  }

  /** Ren avslutning för korta gränssnittsljud: lätt högpass och lågpass, en mjuk platta som
   *  efterklang och samma volymjämkning som finish. */
  finishClean({ wet = 0.15, target = -22, window = 0.5, peak = 0.95, hp = 150, lp = 11000, t60 = 0.45, dark = 0.5, seed = 1 }) {
    const tail = Math.round(SR * (t60 * 1.15 + 0.05))
    const n = this.end + tail
    this.grow(n)
    const cut = (a) => {
      let x = a.slice(0, n)
      if (hp) x = biquad(x, 'hp', hp, 0.707)
      if (lp) x = biquad(x, 'lp', lp, 0.707)
      return x
    }
    let L = cut(this.L)
    let R = cut(this.R)
    const send = cut(this.S)
    const [il, ir2] = makeIR({ t60, dark, seed })
    const wl = convolve(send, il)
    const wr = convolve(send, ir2)
    for (let i = 0; i < n; i++) { L[i] += wl[i] * wet; R[i] += wr[i] * wet }
    return this.normalise(L, R, { target, window, peak })
  }
  /** Trimmar tystnaden, jämnar volymen (RMS över fönstret), begränsar toppar och fasar ut. */
  normalise(L, R, { target, window, peak }) {
    let last = L.length - 1
    while (last > 0 && Math.abs(L[last]) < 3e-4 && Math.abs(R[last]) < 3e-4) last--
    const m = Math.min(L.length, last + 1 + Math.round(0.05 * SR))
    L = L.slice(0, m)
    R = R.slice(0, m)
    const w = Math.min(m, Math.round(window * SR))
    let e = 0
    for (let i = 0; i < w; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2
    const gain = dB(target) / (Math.sqrt(e / w) || 1)
    const lim = (v) => {
      v *= gain
      const a = Math.abs(v)
      return a < 0.7 ? v : Math.sign(v) * (0.7 + (peak - 0.7) * Math.tanh((a - 0.7) / (peak - 0.7)))
    }
    for (let i = 0; i < m; i++) { L[i] = lim(L[i]); R[i] = lim(R[i]) }
    fade(L, 0.001, 0.05)
    fade(R, 0.001, 0.05)
    return { L, R, sr: SR, dur: m / SR }
  }
  /** Lägger på efterklang, jämnar ut volymen, begränsar toppar och trimmar tystnaden. */
  finish({ wet = 0.25, room = 0.8, damp = 0.4, target = -22, window = 0.7, peak = 0.95, ir = null, hp = 0, lp = 0 } = {}) {
    if (ir) return this.finishClean({ wet, target, window, peak, hp, lp, ...ir })
    const tail = Math.round(SR * (0.4 + room * 1.6))
    const n = this.end + tail
    this.grow(n)
    const pre = Math.round(0.012 * SR)
    const send = new Float32Array(n)
    for (let i = 0; i + pre < n; i++) send[i + pre] = this.S[i]
    const [wl, wr] = reverb(send, { room, damp })
    const wg = wet * 14
    let L = new Float32Array(n)
    let R = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      L[i] = this.L[i] + wl[i] * wg
      R[i] = this.R[i] + wr[i] * wg
    }
    // Trimma tystnaden i slutet (under −70 dB) och lägg en mjuk avslutning.
    let last = n - 1
    while (last > 0 && Math.abs(L[last]) < 3e-4 && Math.abs(R[last]) < 3e-4) last--
    const m = Math.min(n, last + 1 + Math.round(0.05 * SR))
    L = L.slice(0, m)
    R = R.slice(0, m)
    // Jämn volym: RMS över de första sekunderna ska landa på målet.
    const w = Math.min(m, Math.round(window * SR))
    let e = 0
    for (let i = 0; i < w; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2
    const rms = Math.sqrt(e / w) || 1
    const gain = dB(target) / rms
    const lim = (v) => {
      v *= gain
      const a = Math.abs(v)
      return a < 0.7 ? v : Math.sign(v) * (0.7 + (peak - 0.7) * Math.tanh((a - 0.7) / (peak - 0.7)))
    }
    for (let i = 0; i < m; i++) { L[i] = lim(L[i]); R[i] = lim(R[i]) }
    fade(L, 0.001, 0.05)
    fade(R, 0.001, 0.05)
    return { L, R, sr: SR, dur: m / SR }
  }
}

/** Mätvärden för ett färdigt ljud (för testerna). */
export function stats(s, winSec = 0.7) {
  let peak = 0, sumsq = 0, nan = 0, clip = 0
  for (let i = 0; i < s.L.length; i++) {
    for (const v of [s.L[i], s.R[i]]) {
      if (!Number.isFinite(v)) nan++
      peak = Math.max(peak, Math.abs(v))
      sumsq += v * v
      if (Math.abs(v) >= 0.999) clip++
    }
  }
  const win = Math.min(s.L.length, Math.round(winSec * SR))
  let e = 0
  for (let i = 0; i < win; i++) e += (s.L[i] ** 2 + s.R[i] ** 2) / 2
  // Var ljudet är över −40 dB (relativt toppen): "hörbar längd".
  let aud = 0
  const th = peak * 0.01
  for (let i = s.L.length - 1; i >= 0; i--) if (Math.abs(s.L[i]) > th || Math.abs(s.R[i]) > th) { aud = i / SR; break }
  return { dur: s.dur, audible: aud, peak, peakDb: 20 * Math.log10(peak), rmsDb: 20 * Math.log10(Math.sqrt(e / win)), nan, clip, endAbs: Math.max(Math.abs(s.L.at(-1)), Math.abs(s.R.at(-1))) }
}
