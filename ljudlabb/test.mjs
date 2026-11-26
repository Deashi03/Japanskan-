// Renderar alla ljud och kontrollerar dem: inga NaN, ingen klippning, rimlig längd, jämn
// volym och en tystnad i slutet (så att inget klickar). Skriver gärna WAV-filer: node test.mjs <mapp>
import fs from 'node:fs'
import path from 'node:path'
import { stats } from './synth.js'
import { GROUPS, OK, renderFive, renderGroup, renderOk } from './bank.js'

function wav(s) {
  const n = s.L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(s.sr, 24)
  buf.writeUInt32LE(s.sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.L[i])) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.R[i])) * 32767), 46 + i * 4)
  }
  return buf
}

const out = process.argv[2]
if (out) fs.mkdirSync(out, { recursive: true })
const rows = []
const check = (id, label, fn, limits) => {
  const t0 = performance.now()
  const s = fn()
  const ms = Math.round(performance.now() - t0)
  const st = stats(s, limits.win ?? 0.7)
  const problems = []
  if (st.nan) problems.push('NaN')
  if (st.clip) problems.push('klipp')
  if (st.peak > 0.97) problems.push('topp')
  if (st.endAbs > 1e-3) problems.push('slut')
  if (st.audible > limits.audible) problems.push(`lång ${st.audible.toFixed(2)}`)
  if (st.audible < limits.min) problems.push(`kort ${st.audible.toFixed(2)}`)
  rows.push({ id, label, ms, dur: +st.dur.toFixed(2), audible: +st.audible.toFixed(2), peakDb: +st.peakDb.toFixed(1), rmsDb: +st.rmsDb.toFixed(1), problems: problems.join(',') })
  if (out) fs.writeFileSync(path.join(out, `${id}.wav`), wav(s))
}
OK.forEach((f, i) => {
  const id = String(i + 1).padStart(2, '0')
  check(`ok-${id}-${f.name}`, 'rätt', () => renderOk(f), { audible: 1.8, min: 0.15, win: 0.5 })
  check(`fem-${id}-${f.name}`, 'femte', () => renderFive(f), { audible: 3.0, min: 0.4, win: 0.9 })
})
GROUPS.forEach((g, gi) => {
  for (let T = 1; T <= 5; T++) check(`grupp-${String(gi + 1).padStart(2, '0')}-${g.name}-${T}`, `nivå ${T}`, () => renderGroup(g, T), { audible: 2.8 + T * 0.9, min: 0.6, win: 1.2 })
})
console.table(rows)
const bad = rows.filter((r) => r.problems)
console.log(`${rows.length} ljud, ${bad.length} med anmärkning, renderingstid max ${Math.max(...rows.map((r) => r.ms))} ms`)
const rms = (pre) => rows.filter((r) => r.id.startsWith(pre)).map((r) => r.rmsDb)
for (const p of ['ok-', 'fem-', 'grupp-']) console.log(p, 'RMS-spann', Math.min(...rms(p)), '…', Math.max(...rms(p)))
process.exit(bad.length ? 1 : 0)
