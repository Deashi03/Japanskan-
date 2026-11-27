import { describe, expect, it } from 'vitest'
import { celebrationTier, milestoneLevel, soundFor } from './sound/plan'
import { renderSound } from './sound/render'
import { SR, midi, stats } from './sound/synth'

describe('vilket ljud som hör till svit-längden', () => {
  it('vanliga svar, var femte och tiotalen', () => {
    expect([1, 2, 3, 4, 6, 7, 9, 11].map(soundFor)).toEqual(Array(8).fill('ok'))
    expect([5, 15, 25, 35, 45, 55].map(soundFor)).toEqual(Array(6).fill('five'))
    expect([10, 20, 30, 40, 50].map(soundFor)).toEqual(['t1', 't2', 't3', 't4', 't5'])
  })
  it('efter 50 låter alla tiotal som nivå 5', () => {
    expect([60, 70, 100, 250].map(soundFor)).toEqual(Array(4).fill('t5'))
    expect(celebrationTier(100)).toBe(5)
    expect(milestoneLevel(100)).toBe(10)
    expect(milestoneLevel(9)).toBe(0)
  })
})

describe('de förrenderade ljuden', () => {
  const keys = ['ok', 'five', 't1', 't2', 't3', 't4', 't5'] as const
  const sounds = Object.fromEntries(keys.map((k) => [k, renderSound(k)]))
  const st = (k: (typeof keys)[number]) => stats(sounds[k], k === 'ok' ? 0.5 : k === 'five' ? 0.9 : 1.2)

  it('är hela, utan klippning och slutar tyst', () => {
    for (const k of keys) {
      const s = st(k)
      expect(s.nan).toBe(0)
      expect(s.clip).toBe(0)
      expect(s.peak).toBeLessThan(0.97)
      expect(s.endAbs).toBeLessThan(1e-3)
    }
  })
  it('ett vanligt svar är kort, femte-ljudet något längre och firandet växer med nivån', () => {
    expect(st('ok').audible).toBeLessThan(1.6)
    expect(st('five').audible).toBeGreaterThan(st('ok').audible)
    const d = [1, 2, 3, 4, 5].map((t) => st(`t${t}` as 't1').audible)
    expect(d[0]).toBeGreaterThan(1.5)
    expect(d[4]).toBeGreaterThan(d[0])
  })
  it('har jämn volym: vanliga svar likadant, firandet stiger stegvis', () => {
    expect(Math.abs(st('ok').rmsDb - -22)).toBeLessThan(0.6)
    expect(Math.abs(st('five').rmsDb - -20)).toBeLessThan(0.6)
    const r = [1, 2, 3, 4, 5].map((t) => st(`t${t}` as 't1').rmsDb)
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1])
  })
  it('det vanliga ljudet är exakt stämt: första tonen ligger på G4', () => {
    const L = sounds.ok.L as Float32Array
    // Autokorrelation över en avklingande period strax efter anslaget.
    const f0 = midi(67)
    let best = 0
    let lag = 0
    for (let l = Math.round(SR / (f0 * 1.05)); l <= Math.round(SR / (f0 * 0.95)); l++) {
      let sum = 0
      for (let i = 800; i < 3200; i++) sum += L[i] * L[i + l]
      if (sum > best) { best = sum; lag = l }
    }
    expect(Math.abs(1200 * Math.log2(SR / lag / f0))).toBeLessThan(15)
  })
})
