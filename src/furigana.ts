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
  const out: Seg[] = []
  for (const r of runs) {
    if (r.kind !== 'kanji' && r.kind !== 'fixed') {
      out.push({ t: r.t, start: r.start })
      continue
    }
    const read = m[g++]
    // En grupp med flera kanji delas upp tecken för tecken när läsningarna är kända, så att
    // läsningen hamnar över rätt tecken (頭[ず]突[つ]き i stället för 頭突[ずつ]き).
    const parts = splitGroup(r.t, read)
    if (parts) {
      let at = r.start
      parts.forEach((p, i) => {
        out.push({ t: [...r.t][i], r: p, start: at })
        at += [...r.t][i].length
      })
    } else out.push({ t: r.t, r: read, start: r.start })
  }
  return out
}

// ---------------------------------------------------------------- Kanjiläsningar

/** Kända läsningar per kanji, hämtade från ordens nedbrytningar (冤 → えん osv.). */
let dict = new Map<string, Set<string>>()

export function setReadingDict(entries: Iterable<{ kanji: string; reading: string }>) {
  const next = new Map<string, Set<string>>()
  for (const { kanji, reading } of entries) {
    const chars = [...(kanji ?? '')]
    const read = hira(reading ?? '').replace(/[^\u3040-\u309f]/g, '')
    if (chars.length !== 1 || !read || KANA.test(chars[0]) || PUNCT.test(chars[0])) continue
    const set = next.get(chars[0]) ?? new Set<string>()
    set.add(read)
    next.set(chars[0], set)
  }
  dict = next
}

const VOICED: Record<string, string[]> = {
  か: ['が'], き: ['ぎ'], く: ['ぐ'], け: ['げ'], こ: ['ご'],
  さ: ['ざ'], し: ['じ'], す: ['ず'], せ: ['ぜ'], そ: ['ぞ'],
  た: ['だ'], ち: ['ぢ', 'じ'], つ: ['づ', 'ず'], て: ['で'], と: ['ど'],
  は: ['ば', 'ぱ'], ひ: ['び', 'ぴ'], ふ: ['ぶ', 'ぷ'], へ: ['べ', 'ぺ'], ほ: ['ぼ', 'ぽ'],
}

/** Läsningen och de varianter den får i sammansättningar: tonande första ljud
 *  (かわ → がわ) och kort paus på slutet (がく → がっ). */
function variants(read: string): string[] {
  const out = new Set([read])
  for (const v of VOICED[read[0]] ?? []) out.add(v + read.slice(1))
  if (read.length > 1 && /[くつちき]$/.test(read)) {
    for (const base of [...out]) out.add(base.slice(0, -1) + 'っ')
  }
  return [...out]
}

/** Delar en kanjigrupps läsning tecken för tecken. Högst ett tecken får sakna känd läsning –
 *  det får då det som blir över. Går det inte att dela entydigt returneras null. */
function splitGroup(text: string, reading: string): string[] | null {
  const chars = [...text]
  if (chars.length < 2 || chars.length > 6) return null
  const solve = (i: number, j: number, wildcardLeft: boolean): string[] | null => {
    if (i === chars.length) return j === reading.length ? [] : null
    const known = dict.get(chars[i])
    if (known) {
      for (const base of known) {
        for (const v of variants(base)) {
          if (!reading.startsWith(v, j)) continue
          const rest = solve(i + 1, j + v.length, wildcardLeft)
          if (rest) return [v, ...rest]
        }
      }
    }
    if (wildcardLeft) {
      // Ett okänt tecken får 1–4 kana, men måste lämna minst en kana till varje tecken efter.
      const room = reading.length - j - (chars.length - i - 1)
      for (let len = 1; len <= Math.min(4, room); len++) {
        const rest = solve(i + 1, j + len, false)
        if (rest) return [reading.slice(j, j + len), ...rest]
      }
    }
    return null
  }
  return solve(0, 0, true)
}
