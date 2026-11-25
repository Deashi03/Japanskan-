import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { furigana, setReadingDict, type Seg } from '../furigana'
import { canSpeak, speak } from '../fx'
import { shortMeaning } from '../session'
import { useStore } from '../store'
import type { Word } from '../types'

const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M5 20V11M12 20V4M19 20v-6',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3Z',
  sound: 'M4 9.5v5h3.5L12 18V6L7.5 9.5H4ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  undo: 'M8 5 3.5 9.5 8 14M4 9.5h10a5.5 5.5 0 0 1 0 11h-3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pause: 'M8 5v14M16 5v14',
  tag: 'M3.5 12.5 11 5h8v8l-7.5 7.5a1.5 1.5 0 0 1-2 0l-6-6a1.5 1.5 0 0 1 0-2ZM15 9h.01',
  book: 'M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5ZM5 17a3 3 0 0 1 3-3h9',
  flame: 'M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C10 9.500 10.500 6 12 3Z',
}

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Ja({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span lang="ja" className={'ja ' + (className ?? '')}>
      {children}
    </span>
  )
}

export function SpeakButton({ text, small }: { text: string; small?: boolean }) {
  if (!canSpeak) return null
  return (
    <button
      type="button"
      className={'icon-btn speak' + (small ? ' small' : '')}
      aria-label="Lyssna på uttalet"
      title="Lyssna på uttalet"
      onClick={(e) => {
        e.stopPropagation()
        speak(text)
      }}
    >
      <Icon name="sound" size={small ? 18 : 22} />
    </button>
  )
}

/** Bygger om tabellen med kanjiläsningar när orden ändras, och returnerar ett versionsnummer
 *  så att furigana räknas om. */
let dictFor = -1
let dictSize = -1
function useDictVersion(): number {
  const snap = useStore()
  if (snap.words.size !== dictSize || dictFor < 0) {
    dictSize = snap.words.size
    dictFor = snap.version
    setReadingDict([...snap.words.values()].flatMap((w) => w.breakdown))
  }
  return dictFor
}

const KANA_ONLY = /^[\u3040-\u30ffー・〜～\s]+$/

/** Ordet med läsningen (furigana) ovanför. */
export function Furi({ word, reading }: { word: string; reading: string }) {
  const dictVersion = useDictVersion()
  const plain = KANA_ONLY.test(word) || !reading || reading === word
  // Läsningen läggs över varje kanjigrupp för sig (開[あ]ける i stället för hela ordet),
  // så att långa ord kan radbrytas och kana inte får kana över sig.
  const segs = useMemo(() => (plain ? null : furigana(word, reading)), [plain, word, reading, dictVersion])
  // --len låter stilmallen krympa texten så att ordet får plats där det visas.
  const style = { '--len': Math.max(2, [...word].length) } as CSSProperties
  return (
    <span lang="ja" className="ja furi-word" style={style}>
      {plain ? (
        word
      ) : segs ? (
        segs.map((s, i) => (s.r ? <ruby className="furi" key={i}>{s.t}<rt>{s.r}</rt></ruby> : <span key={i}>{s.t}</span>))
      ) : (
        <ruby className="furi">{word}<rt>{reading}</rt></ruby>
      )}
    </span>
  )
}

export const POS_LABEL: Record<string, string> = {
  noun: 'Substantiv',
  suru: 'Suru-verb',
  ru: 'Ru-verb',
  u: 'U-verb',
  irregular: 'Oregelbundet verb',
  'i-adj': 'I-adjektiv',
  'na-adj': 'Na-adjektiv',
  'no-adj': 'No-adjektiv',
  adverb: 'Adverb',
  pronoun: 'Pronomen',
  counter: 'Räkneord',
  prefix: 'Prefix',
  suffix: 'Suffix',
  particle: 'Partikel',
  conjunction: 'Konjunktion',
  interjection: 'Interjektion',
  expression: 'Uttryck',
  proverb: 'Ordspråk',
  grammar: 'Grammatik',
  slang: 'Slang',
  name: 'Egennamn',
}

/** Ordklass som små etiketter, t.ex. "U-verb" eller "Substantiv · Suru-verb". */
export function PosTags({ word }: { word: Word }) {
  if (!word.pos?.length) return null
  return (
    <div className="pos-tags">
      {word.pos.map((p) => <span className={'pos pos-' + p} key={p}>{POS_LABEL[p] ?? p}</span>)}
    </div>
  )
}

export function WordHead({ word }: { word: Word }) {
  return (
    <>
      <div className="wc-head">
        <div>
          <PosTags word={word} />
          <div className="wc-reading"><Ja>{word.reading}</Ja></div>
          <div className="wc-word" style={{ '--len': Math.max(2, [...word.word].length) } as CSSProperties}><Ja>{word.word}</Ja></div>
        </div>
        <SpeakButton text={word.word} />
      </div>
      <p className="wc-meaning">{word.meaning}</p>
    </>
  )
}

/** Grammatisk förklaring: formel, funktion, utförlig förklaring och vanliga fel. */
export function WordGrammar({ word }: { word: Word }) {
  const g = word.grammar
  if (!g) return null
  return (
    <section className="grammar">
      <h4>Grammatik</h4>
      <div className="grammar-formula"><Ja>{g.formula}</Ja></div>
      <p className="grammar-function">{g.function}</p>
      <p>{g.explanation}</p>
      {g.pitfalls && (
        <p className="grammar-pitfalls">
          <strong>Se upp: </strong>
          {g.pitfalls}
        </p>
      )}
    </section>
  )
}

export function WordBreakdown({ word }: { word: Word }) {
  return (
    <section>
      <h4>Nedbrytning</h4>
      <ul className="wc-list">
        {word.breakdown.map((b, i) => (
          <li key={i}>
            <Ja className="strong">{b.kanji}</Ja>
            {b.reading && <Ja className="muted">（{b.reading}）</Ja>} <span>= {b.meaning}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function WordExamples({ word }: { word: Word }) {
  const showReading = useStore().settings.showExampleReading
  return (
    <section>
      <h4>Exempel</h4>
      {word.examples.map((ex, i) => (
        <div className="wc-example" key={i}>
          <div className="wc-ex-ja">
            <FuriText ja={ex.ja} reading={ex.reading} show={showReading} word={word} />
            <SpeakButton text={ex.ja} small />
          </div>
          <div>{ex.sv}</div>
        </div>
      ))}
    </section>
  )
}

export function WordDistinctions({ word }: { word: Word }) {
  return (
    <section>
      <h4>Vanlig skillnad</h4>
      <ul className="wc-list">
        {word.distinctions.map((d, i) => (
          <li key={i}>
            <Ja className="strong">{d.word}</Ja>
            {d.reading && <Ja className="muted">（{d.reading}）</Ja>} <span>= {d.meaning}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** En mening med läsningen ovanför varje kanjigrupp. Går det inte att räkna ut
 *  visas läsningen på en egen rad under meningen. */
export function FuriText({ ja, reading, show = true, word }: { ja: string; reading: string; show?: boolean; word?: Word }) {
  const dictVersion = useDictVersion()
  const segs = useMemo(() => {
    if (!show) return null
    const at = word ? ja.indexOf(word.word) : -1
    return furigana(ja, reading, at >= 0 ? { at, len: word!.word.length, reading: word!.reading } : undefined)
  }, [ja, reading, show, word, dictVersion])
  if (!show || !reading) return <Ja>{ja}</Ja>
  if (!segs)
    return (
      <span>
        <Ja>{ja}</Ja>
        <span className="reading-line"><Ja>{reading}</Ja></span>
      </span>
    )
  return <Segs segs={segs} />
}

export function Segs({ segs }: { segs: Seg[] }) {
  return (
    <span lang="ja" className="ja">
      {segs.map((s, i) => (s.r ? <ruby className="furi sent" key={i}>{s.t}<rt>{s.r}</rt></ruby> : <span key={i}>{s.t}</span>))}
    </span>
  )
}

/** Ord man har blandat ihop med det här ordet i skrivövningar, med betydelse så att
 *  skillnaden syns direkt. */
export function WordConfusions({ word }: { word: Word }) {
  const snap = useStore()
  const others = (word.confusable ?? []).map((id) => snap.words.get(id)).filter((w): w is Word => !!w)
  if (!others.length) return null
  return (
    <section>
      <h4>Du har blandat ihop det med</h4>
      <ul className="wc-list">
        {others.map((o) => (
          <li key={o.id}>
            <Furi word={o.word} reading={o.reading} /> <span>= {shortMeaning(o.meaning)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Hela ordkortet: ord, läsning, betydelse, nedbrytning, exempel och skillnader. */
export function WordCard({ word }: { word: Word }) {
  return (
    <div className="wordcard">
      <WordHead word={word} />
      {word.grammar && <WordGrammar word={word} />}
      {word.breakdown.length > 0 && <WordBreakdown word={word} />}
      {word.examples.length > 0 && <WordExamples word={word} />}
      {word.distinctions.length > 0 && <WordDistinctions word={word} />}
      <WordConfusions word={word} />
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Stäng">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
