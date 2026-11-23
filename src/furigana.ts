import { toHiragana } from 'wanakana'

/** En bit av en mening: texten, och läsningen om biten innehåller kanji. */
export interface Seg { t: string; r?: string; start: number }

const KANA = /[぀-ゟ゠-ヿー]/
const PUNCT = /[\s　、。，．,.!?！？「」『』（）()［］\[\]…‥・〜～~：:；;"'”“’‘-]/
const hira = (s: string) => toHiragana(s, { passRomaji: true, convertLongVowelMark: false })
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lägger meningens läsning (ren hiragana) ovanpå rätt kanji.
 *
 *  Kana i meningen måste stå likadant i läsningen, så varje kanjigrupp får det som blir
 *  över mellan sina kana-grannar. `fixed` pekar ut ett ord vars läsning redan är känd
 *  (målordet): det blir en egen grupp med exakt den läsningen, så att kanji bredvid
 *  inte råkar få en bit av den. Går meningen inte att passa ihop med läsningen
 *  returneras null, och då får läsningen visas för sig. */
export function furigana(ja: string, reading: string, fixed?: { at: number; len: number; reading: string }): Seg[] | null {
  if (!ja || !reading) return null
  const cuts = new Set(fixed ? [fixed.at, fixed.at + fixed.len] : [])
  const runs: { t: string; kind: 'kana' | 'punct' | 'kanji' | 'fixed'; start: number }[] = []
  for (let i = 0; i < ja.length; i++) {
    const c = ja[i]
    const inFixed = !!fixed && i >= fixed.at && i < fixed.at + fixed.len
    const kind = inFixed ? 'fixed' : PUNCT.test(c) ? 'punct' : KANA.test(c) ? 'kana' : 'kanji'
    const last = runs[runs.length - 1]
    if (last && last.kind === kind && !cuts.has(i)) last.t += c
    else runs.push({ t: c, kind, start: i })
  }
  if (!runs.some((r) => r.kind === 'kanji' || r.kind === 'fixed')) return runs.map((r) => ({ t: r.t, start: r.start }))

  const part = (r: (typeof runs)[number]) =>
    r.kind === 'kanji' ? '(.+?)' : r.kind === 'fixed' ? '(' + escape(hira(fixed!.reading)) + ')' : r.kind === 'kana' ? escape(hira(r.t)) : ''
  const target = hira(reading)
    .split('')
    .filter((c) => !PUNCT.test(c))
    .join('')
  let m: RegExpMatchArray | null
  try {
    m = target.match(new RegExp('^' + runs.map(part).join('') + '$'))
  } catch {
    return null
  }
  // Ordet kan stå böjt i meningen; försök då utan den kända läsningen.
  if (!m) return fixed ? furigana(ja, reading) : null
  let g = 1
  return runs.map((r) => (r.kind === 'kanji' || r.kind === 'fixed' ? { t: r.t, r: m![g++], start: r.start } : { t: r.t, start: r.start }))
}
