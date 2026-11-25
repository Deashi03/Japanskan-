import { CATEGORIES } from './categories'
import type { Breakdown, Distinction, Example, Form, Grammar, Word, WordExtra } from './types'

const EXAMPLE_WORD = {
  word: '冤罪',
  reading: 'えんざい',
  meaning: 'Felaktig dom / att bli oskyldigt anklagad eller dömd för ett brott.',
  synonyms: ['oskyldigt dömd', 'justitiemord', 'falsk anklagelse'],
  pos: ['noun'],
  categories: ['juridik', 'brott'],
  tags: ['felaktig dom', 'domstol', 'rättegång'],
  breakdown: [
    { kanji: '冤', reading: 'えん', meaning: 'falsk anklagelse, orättvisa' },
    { kanji: '罪', reading: 'ざい', meaning: 'brott, skuld' },
  ],
  examples: [
    { ja: '彼は冤罪を訴えている。', reading: 'かれは えんざいを うったえている', sv: 'Han hävdar att han är oskyldigt dömd.' },
    { ja: 'それは冤罪です。', reading: 'それは えんざいです', sv: 'Det är en felaktig anklagelse.' },
  ],
  moreExamples: [
    { ja: '冤罪事件として大きく報道された。', reading: 'えんざいじけんとして おおきく ほうどうされた', sv: 'Det rapporterades stort som ett fall av felaktig dom.', level: 2 },
    { ja: '…', reading: '…', sv: '…', level: 3 },
  ],
  distinctions: [
    { word: '冤罪', reading: 'えんざい', meaning: 'en felaktig anklagelse eller dom' },
    { word: '無罪', reading: 'むざい', meaning: 'oskyldig / frikänd i juridisk mening' },
  ],
  forms: [],
}

export const AI_PROMPT = `Du ska skapa en ordlista för appen "Japanskan" (en svensk som lär sig förstå och prata japanska). Jag ger dig japanska ord i slutet av meddelandet. Svara ENBART med en JSON-fil (inget annat före eller efter) i exakt detta format:

${JSON.stringify({ version: 2, words: [EXAMPLE_WORD] }, null, 2)}

Regler:
- "word": ordet så som det normalt skrivs (med kanji om det brukar skrivas så).
- "reading": hela ordets läsning i hiragana (katakana om ordet skrivs med katakana).
- "meaning": kort och tydlig förklaring på svenska.
- "synonyms": 3–8 andra svenska ord eller korta uttryck som också är fullt korrekta översättningar.
- "pos": ordklass som lista, med värden ur: noun, suru (substantiv + する), ru (ichidan-verb), u (godan-verb), irregular, i-adj, na-adj, no-adj, adverb, pronoun, counter, prefix, suffix, particle, conjunction, interjection, expression, proverb, grammar (grammatisk konstruktion snarare än vokabulär), slang, name.
- "categories": 1–5 ämnen ur exakt denna lista: ${CATEGORIES.join(', ')}.
- "tags": 2–8 fria svenska sökord i gemener (t.ex. "åklagare", "yrke", "titel").
- "breakdown": en rad per kanji eller orddel, med läsningen den har i just detta ord och betydelsen på svenska. Tom lista [] om ordet inte går att dela upp.
- "examples": EXAKT två enkla exempelmeningar som visas när ordet är nytt: bara vanliga, lätta ord (N5–N4) utöver målordet. "ja" = meningen, "reading" = hela meningen i hiragana med mellanslag mellan orden, "sv" = naturlig svensk översättning.
- "moreExamples": 18 fler meningar (33 om pos innehåller "grammar"), med "level": 1 = enkel, 2 = vardaglig mellannivå, 3 = längre eller formellare. Minst 4 av varje nivå. Målordet ska finnas i varje mening, gärna i olika böjningar och sammanhang. Ingen mening får upprepas.
- I alla meningar: kana i "ja" måste stå exakt likadant i "reading" (skriv は som は), katakanaord skrivs i katakana även i "reading", och siffror skrivs med kanji (三人), inte 3.
- "grammar": bara om pos innehåller "grammar": { "formula": hur konstruktionen byggs, "function": en mening om vad den gör, "explanation": 3–6 meningar om betydelse, nyans och ton och hur den skiljer sig från liknande grammatik, "pitfalls": vanliga fel }.
- "forms": bara för böjbara ord (suru, ru, u, irregular, i-adj, na-adj): 6–10 vanliga böjningar som en lyssnare måste känna igen (t.ex. て-form, た-form, ない-form, potential, passiv, kausativ, villkor; för adjektiv 〜くない, 〜かった osv.). Varje form: { "label": "て-form", "ja": "食べて", "reading": "たべて", "ex": { "ja": mening som innehåller exakt formen, "reading": ..., "sv": ... } }. Annars tom lista [].
- "distinctions": bara om det finns ord som är lätta att blanda ihop med målordet. Lista då målordet och de liknande orden med en kort förklaring av skillnaden. Annars tom lista [].
- All förklarande text ska vara på svenska.
- Svaret ska vara giltig JSON: dubbla citattecken, inga kommentarer, inga avslutande kommatecken. Blir svaret för långt, dela upp orden på flera svar med samma format.

Här är orden:
`

/** Det som kan läsas ut om ett ords innehåll utöver grundkortet. */
export interface Rich {
  pos: string[]
  categories: string[]
  tags: string[]
  grammar?: Grammar
  moreExamples: Example[]
  forms: Form[]
}

export interface ParsedWord extends Rich {
  word: string
  reading: string
  meaning: string
  breakdown: Breakdown[]
  examples: Example[]
  distinctions: Distinction[]
  synonyms: string[]
}

/** En rad i en tilläggsfil: nytt innehåll till ett ord som redan finns. */
export interface ParsedEnrich extends Rich {
  word: string
}

export interface ParseResult {
  words: ParsedWord[]
  enrich: ParsedEnrich[]
  errors: string[]
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : [])

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

function example(v: unknown): Example | null {
  const o = (v ?? {}) as Record<string, unknown>
  const ja = str(o.ja)
  const sv = str(o.sv)
  if (!ja || !sv) return null
  const level = o.level === 1 || o.level === 2 || o.level === 3 ? o.level : undefined
  return { ja, reading: str(o.reading), sv, ...(level ? { level } : {}) }
}

const examples = (v: unknown) => (Array.isArray(v) ? v.map(example).filter((e): e is Example => !!e) : [])

function forms(v: unknown): Form[] {
  if (!Array.isArray(v)) return []
  return v
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>
      const ex = example(o.ex)
      const label = str(o.label)
      const ja = str(o.ja)
      return label && ja && ex ? { label, ja, reading: str(o.reading), ex } : null
    })
    .filter((f): f is Form => !!f)
}

function rich(o: Record<string, unknown>, more: unknown): Rich {
  const g = (o.grammar ?? null) as Record<string, unknown> | null
  const grammar = g && str(g.formula) && str(g.explanation)
    ? { formula: str(g.formula), function: str(g.function), explanation: str(g.explanation), pitfalls: str(g.pitfalls) || undefined }
    : undefined
  const cats = new Set<string>(CATEGORIES)
  return {
    pos: strList(o.pos),
    categories: strList(o.categories).filter((c) => cats.has(c)),
    tags: strList(o.tags).map((t) => t.toLowerCase()),
    grammar,
    moreExamples: examples(more),
    forms: forms(o.forms),
  }
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
    return { words: [], enrich: [], errors: ['Filen är inte giltig JSON: ' + (e as Error).message] }
  }

  // Tilläggsfil: nytt innehåll till ord som redan finns.
  const enrichArr = (json as { enrich?: unknown })?.enrich
  if (Array.isArray(enrichArr)) {
    const enrich: ParsedEnrich[] = []
    enrichArr.forEach((item, i) => {
      const o = (item ?? {}) as Record<string, unknown>
      const word = str(o.word)
      if (!word) return void errors.push(`Rad ${i + 1}: saknar "word".`)
      enrich.push({ word, ...rich(o, o.examples) })
    })
    if (!enrich.length && !errors.length) errors.push('Filen innehåller inga ord.')
    return { words: [], enrich, errors }
  }

  const arr = Array.isArray(json) ? json : (json as { words?: unknown })?.words
  if (!Array.isArray(arr)) return { words: [], enrich: [], errors: ['Hittar ingen lista "words" i filen.'] }

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
    const intro = list<Example>(o.examples, ['ja', 'reading', 'sv'], ['ja', 'sv'])
    const distinctions = list<Distinction>(o.distinctions, ['word', 'reading', 'meaning'], ['word', 'meaning'])
    if (!breakdown) errors.push(`${label}: "breakdown" har fel format (ordet importeras utan nedbrytning).`)
    if (!intro) errors.push(`${label}: "examples" har fel format (ordet importeras utan exempel).`)
    if (!distinctions) errors.push(`${label}: "distinctions" har fel format (ordet importeras utan skillnader).`)
    // Fler än två exempel i "examples" (äldre format): de två första visas när ordet är
    // nytt, resten hamnar bland de övriga meningarna.
    const introList = intro ?? []
    const r = rich(o, o.moreExamples)
    words.push({
      word,
      reading,
      meaning,
      breakdown: breakdown ?? [],
      examples: introList.slice(0, 2),
      distinctions: distinctions ?? [],
      synonyms: strList(o.synonyms),
      ...r,
      moreExamples: [...introList.slice(2), ...r.moreExamples],
    })
  })
  if (!words.length && !errors.length) errors.push('Filen innehåller inga ord.')
  return { words, enrich: [], errors }
}

const hasRich = (r: Rich) => !!(r.pos.length || r.categories.length || r.tags.length || r.grammar || r.moreExamples.length || r.forms.length)

/** Ordets alla meningar: de två enkla från introduktionen följda av de övriga. */
const fullExtra = (intro: Example[], r: Rich): WordExtra => ({
  examples: [...intro.map((e) => ({ ...e, level: e.level ?? (1 as const) })), ...r.moreExamples.filter((e) => !intro.some((i) => i.ja === e.ja))],
  forms: r.forms,
})

/** Lägger till nytt innehåll i ett befintligt ord. Bara ordets text ändras – aldrig framstegen. */
export function enrichWord(old: Word, r: Rich): { word: Word; extra?: WordExtra } {
  const extra = r.moreExamples.length || r.forms.length ? fullExtra(old.examples, r) : undefined
  const word: Word = {
    ...old,
    pos: r.pos.length ? r.pos : old.pos,
    categories: r.categories.length ? r.categories : old.categories,
    tags: r.tags.length ? [...new Set([...(old.tags ?? []), ...r.tags])] : old.tags,
    grammar: r.grammar ?? old.grammar,
    ...(extra ? { extraCount: extra.examples.length, formCount: extra.forms.length } : {}),
  }
  return { word, extra }
}

/** Gör om ett tolkat ord till ett nytt ord i appen, med sitt extrainnehåll. */
export function toWord(p: ParsedWord, base: Pick<Word, 'id' | 'list' | 'createdAt' | 'order'>): { word: Word; extra?: WordExtra } {
  const { moreExamples, forms: f, pos, categories, tags, grammar, ...core } = p
  const word: Word = { ...core, ...base, ...(pos.length ? { pos } : {}), ...(categories.length ? { categories } : {}), ...(tags.length ? { tags } : {}), ...(grammar ? { grammar } : {}) }
  if (!moreExamples.length && !f.length) return { word }
  const extra = fullExtra(p.examples, p)
  return { word: { ...word, extraCount: extra.examples.length, formCount: extra.forms.length }, extra }
}

export interface Update { word: Word; extra?: WordExtra }

/** Delar upp i nya ord och dubbletter (samma ord finns redan, eller två gånger i filen).
 *  Ord som redan finns läggs aldrig till igen, men de får det som filen har och som de
 *  saknar: synonymer, och – om filen har det – ordklass, ämnen, exempelmeningar och
 *  böjningar. Det rör bara ordets text, aldrig framstegen. */
export function splitDuplicates(parsed: ParsedWord[], existing: Iterable<Word>) {
  const byWord = new Map<string, Word>()
  for (const w of existing) byWord.set(w.word, w)
  const seen = new Set<string>(byWord.keys())
  const fresh: ParsedWord[] = []
  const duplicates: ParsedWord[] = []
  const updates: Update[] = []
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
    let next: Update | undefined = added.length ? { word: { ...old, synonyms: [...(old.synonyms ?? []), ...added] } } : undefined
    if (hasRich(p) && !old.extraCount) next = enrichWord(next?.word ?? old, p)
    if (!next) continue
    byWord.set(p.word, next.word)
    const i = updates.findIndex((u) => u.word.id === old.id)
    if (i >= 0) updates[i] = next
    else updates.push(next)
  }
  return { fresh, duplicates, updates }
}

/** Matchar en tilläggsfil mot orden som finns. */
export function matchEnrichment(entries: ParsedEnrich[], existing: Iterable<Word>) {
  const byWord = new Map<string, Word>()
  for (const w of existing) byWord.set(w.word, w)
  const updates: Update[] = []
  const missing: string[] = []
  for (const e of entries) {
    const old = byWord.get(e.word)
    if (!old) missing.push(e.word)
    else updates.push(enrichWord(old, e))
  }
  return { updates, missing }
}
