// Renhetsmätning av de rena rätt-ljuden: stämning (cent), hur stor del av energin som ligger
// på grundtonens överton-serie (HNR), anslagstid, klickrisk och volym. Skriver WAV: node test-clean.mjs <mapp>
import fs from 'node:fs'
import path from 'node:path'
import { Mix, SR, midi, stats } from './synth.js'
import { CLEAN, PATCH, renderClean, renderCleanFive } from './clean.js'

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let l = 2; l <= n; l <<= 1) { const a = (-2 * Math.PI) / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + l / 2] * wr - im[i + k + l / 2] * wi, vi = re[i + k + l / 2] * wi + im[i + k + l / 2] * wr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + l / 2] = ur - vr; im[i + k + l / 2] = ui - vi } }
}

function analyse(f) {
  const m0 = f.root + f.ok[0][0]
  const mix = new Mix(2)
  PATCH[f.patch](mix, 0, m0, 1)
  const s = mix.finishClean({ wet: 0, hp: 0, lp: 0, target: -22, window: 0.5 })
  const f0 = midi(m0)
  const N = 8192
  const start = Math.round(0.03 * SR)
  const re = new Float64Array(N), im = new Float64Array(N)
  for (let i = 0; i < N; i++) re[i] = (s.L[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  fft(re, im)
  const pw = new Float64Array(N / 2)
  for (let k = 0; k < N / 2; k++) pw[k] = re[k] ** 2 + im[k] ** 2
  // Stämning: parabolisk topp nära grundtonen.
  const k0 = Math.round((f0 * N) / SR)
  let kb = k0
  for (let k = k0 - 4; k <= k0 + 4; k++) if (pw[k] > pw[kb]) kb = k
  const a = Math.log(pw[kb - 1] + 1e-30), b = Math.log(pw[kb] + 1e-30), c = Math.log(pw[kb + 1] + 1e-30)
  const off = (0.5 * (a - c)) / (a - 2 * b + c)
  const fe = ((kb + off) * SR) / N
  const cents = 1200 * Math.log2(fe / f0)
  // HNR: energi inom ±2 % av varje överton jämfört med resten (över 0,6·f0).
  let harm = 0, rest = 0
  const mark = new Uint8Array(N / 2)
  for (let h = 1; f0 * h < SR * 0.45; h++) {
    const lo = Math.floor(((f0 * h * 0.98) * N) / SR), hi = Math.ceil(((f0 * h * 1.02) * N) / SR)
    for (let k = lo; k <= hi; k++) mark[k] = 1
  }
  for (let k = Math.floor((f0 * 0.6 * N) / SR); k < N / 2; k++) (mark[k] ? (harm += pw[k]) : (rest += pw[k]))
  const hnr = 10 * Math.log10(harm / (rest + 1e-30))
  // Anslag: tid till 90 % av toppen; klickrisk: största hopp mellan två sampel i förhållande till toppen.
  let pk = 0
  for (const v of s.L) pk = Math.max(pk, Math.abs(v))
  let att = 0
  while (Math.abs(s.L[att]) < 0.9 * pk && att < s.L.length - 1) att++
  // Klickrisk: största steget mellan två sampel under de första 3 ms (en mjuk start har små steg).
  let jump = 0
  for (let i = 1; i < Math.round(0.003 * SR); i++) jump = Math.max(jump, Math.abs(s.L[i] - s.L[i - 1]))
  return { cents: +cents.toFixed(1), hnr: +hnr.toFixed(1), attackMs: +((att / SR) * 1000).toFixed(1), jump: +(jump / pk).toFixed(2) }
}

function wav(s) {
  const n = s.L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(s.sr, 24)
  buf.writeUInt32LE(s.sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.R[i])) * 32767), 46 + i * 4) }
  return buf
}

const out = process.argv[2]
if (out) fs.mkdirSync(out, { recursive: true })
const rows = []
CLEAN.forEach((f, i) => {
  const a = analyse(f)
  const ok = renderClean(f)
  const five = renderCleanFive(f)
  const so = stats(ok, 0.5), sf = stats(five, 0.9)
  const problems = []
  const glide = f.patch === 'bubble' // tonhöjden glider med flit, så stämning och renhet mäts inte
  if (!glide && Math.abs(a.cents) > 3) problems.push('stämning')
  if (!glide && a.hnr < 20) problems.push('orent')
  if (a.attackMs > (f.patch === 'flute' ? 30 : 15)) problems.push('trögt anslag')
  if (a.attackMs < 1.5) problems.push('för skarpt anslag (klick)')
  for (const [n, s] of [['ok', so], ['fem', sf]]) { if (s.nan || s.clip || s.endAbs > 1e-3 || s.peak > 0.97) problems.push(n + ':fel') }
  rows.push({ nr: i + 1, namn: f.name, ...a, okSek: +so.audible.toFixed(2), femSek: +sf.audible.toFixed(2), okRms: +so.rmsDb.toFixed(1), femRms: +sf.rmsDb.toFixed(1), problem: problems.join(',') })
  if (out) { const id = String(i + 1).padStart(2, '0'); fs.writeFileSync(path.join(out, `ok-${id}-${f.name}.wav`), wav(ok)); fs.writeFileSync(path.join(out, `fem-${id}-${f.name}.wav`), wav(five)) }
})
console.table(rows)
const bad = rows.filter((r) => r.problem)
console.log(`${rows.length} ljud, ${bad.length} med anmärkning`)
process.exit(bad.length ? 1 : 0)
