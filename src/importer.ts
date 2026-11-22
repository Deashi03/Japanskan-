import type { Breakdown, Distinction, Example, Word } from './types'

export const AI_PROMPT = `Du ska skapa en ordlista för appen "Japanskan". Jag ger dig japanska ord i slutet av meddelandet. Svara ENBART med en JSON-fil (inget annat före eller efter) i exakt detta format:

{
  "version": 1,
  "words": [
    {
      "word": "冤罪",
      "reading": "えんざい",
      "meaning": "Felaktig dom / att bli oskyldigt anklagad eller dömd för ett brott.",
      "synonyms": ["oskyldigt dömd", "justitiemord", "falsk anklagelse"],
      "breakdown": [
        { "kanji": "冤", "reading": "えん", "meaning": "falsk anklagelse, orättvisa" },
        { "kanji": "罪", "reading": "ざい", "meaning": "brott, skuld" }
      ],
      "examples": [
        { "ja": "彼は冤罪を訴えている。", "reading": "かれは えんざいを うったえている", "sv": "Han hävdar att han är oskyldigt dömd." },
        { "ja": "冤罪事件として大きく報道された。", "reading": "えんざいじけんとして おおきく ほうどうされた", "sv": "Det rapporterades stort som ett fall av felaktig dom." }
      ],
      "distinctions": [
        { "word": "冤罪", "reading": "えんざい", "meaning": "en felaktig anklagelse eller dom" },
        { "word": "無罪", "reading": "むざい", "meaning": "oskyldig / frikänd i juridisk mening" }
      ]
    }
  ]
}

Regler:
- "word": ordet så som det normalt skrivs (med kanji om det brukar skrivas så).
- "reading": hela ordets läsning i hiragana (katakana om ordet skrivs med katakana).
- "meaning": kort och tydlig förklaring på svenska.
- "breakdown": en rad per kanji eller orddel, med läsningen den har i just detta ord och betydelsen på svenska. Tom lista [] om ordet inte går att dela upp.
- "examples": två exempelmeningar. "ja" är meningen på japanska, "reading" är hela meningen i hiragana med mellanslag mellan orden, "sv" är den svenska översättningen. Exempelmeningarna ska vara enkla: använd bara vanliga, lätta ord utöver målordet, så att meningen går att förstå även om målordet är det enda svåra.
- "distinctions": ta bara med om det finns ord som är lätta att blanda ihop med målordet. Lista då målordet och de liknande orden med en kort förklaring av skillnaden. Annars tom lista [].
- All förklarande text ska vara på svenska.
- Svaret ska vara giltig JSON: dubbla citattecken, inga kommentarer, inga avslutande kommatecken.

Här är orden:
`

export interface ParsedWord {
  word: string
  reading: string
  meaning: string
  breakdown: Breakdown[]
  examples: Example[]
  distinctions: Distinction[]
  synonyms: string[]
}

export interface ParseResult {
  words: ParsedWord[]
  errors: string[]
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function list<T>(v: unknown, fields: (keyof T & string)[], required: (keyof T & string)[]): T[] | null {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) return null
  const out: T[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') return null
    const o: Record<string, string> = {}
    for (const f of fields) o[f] = str((item as Record<string, unknown>)[f])
    if (required.some((f) => !o[f])) return null
    out.push(o as T)
  }
  return out
}

export function parseWordFile(text: string): ParseResult {
  const errors: string[] = []
  let raw = text.trim().replace(/^﻿/, '')
  // AI:n lägger ibland svaret i ett kodblock eller skriver text runt omkring.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  else {
    const a = raw.search(/[{[]/)
    const b = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
    if (a > 0 && b > a) raw = raw.slice(a, b + 1)
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return { words: [], errors: ['Filen är inte giltig JSON: ' + (e as Error).message] }
  }
  const arr = Array.isArray(json) ? json : (json as { words?: unknown })?.words
  if (!Array.isArray(arr)) return { words: [], errors: ['Hittar ingen lista "words" i filen.'] }

  const words: ParsedWord[] = []
  arr.forEach((item, i) => {
    const o = (item ?? {}) as Record<string, unknown>
    const label = `Ord ${i + 1}${str(o.word) ? ` (${str(o.word)})` : ''}`
    const word = str(o.word)
    const reading = str(o.reading)
    const meaning = str(o.meaning)
    const missing = [!word && '"word"', !reading && '"reading"', !meaning && '"meaning"'].filter(Boolean)
    if (missing.length) {
      errors.push(`${label}: saknar ${missing.join(', ')}.`)
      return
    }
    const breakdown = list<Breakdown>(o.breakdown, ['kanji', 'reading', 'meaning'], ['kanji', 'meaning'])
    const examples = list<Example>(o.examples, ['ja', 'reading', 'sv'], ['ja', 'sv'])
    const distinctions = list<Distinction>(o.distinctions, ['word', 'reading', 'meaning'], ['word', 'meaning'])
    if (!breakdown) errors.push(`${label}: "breakdown" har fel format (ordet importeras utan nedbrytning).`)
    if (!examples) errors.push(`${label}: "examples" har fel format (ordet importeras utan exempel).`)
    if (!distinctions) errors.push(`${label}: "distinctions" har fel format (ordet importeras utan skillnader).`)
    words.push({
      word,
      reading,
      meaning,
      breakdown: breakdown ?? [],
      examples: examples ?? [],
      distinctions: distinctions ?? [],
      synonyms: Array.isArray(o.synonyms) ? [...new Set(o.synonyms.map(str).filter(Boolean))] : [],
    })
  })
  if (!words.length && !errors.length) errors.push('Filen innehåller inga ord.')
  return { words, errors }
}

/** Delar upp i nya ord och dubbletter (samma ord finns redan, eller två gånger i filen).
 *  Ord som redan finns ändras aldrig, med ett undantag: de får de synonymer filen har
 *  och som de saknar. Det rör bara ordets text, aldrig framstegen. */
export function splitDuplicates(parsed: ParsedWord[], existing: Iterable<Word>) {
  const byWord = new Map<string, Word>()
  for (const w of existing) byWord.set(w.word, w)
  const seen = new Set<string>(byWord.keys())
  const fresh: ParsedWord[] = []
  const duplicates: ParsedWord[] = []
  const updates: Word[] = []
  for (const p of parsed) {
    if (!seen.has(p.word)) {
      seen.add(p.word)
      fresh.push(p)
      continue
    }
    duplicates.push(p)
    const old = byWord.get(p.word)
    if (!old) continue
    const have = new Set(old.synonyms ?? [])
    const added = p.synonyms.filter((x) => !have.has(x))
    if (added.length) {
      const next = { ...old, synonyms: [...(old.synonyms ?? []), ...added] }
      byWord.set(p.word, next)
      const i = updates.findIndex((u) => u.id === old.id)
      if (i >= 0) updates[i] = next
      else updates.push(next)
    }
  }
  return { fresh, duplicates, updates }
}
