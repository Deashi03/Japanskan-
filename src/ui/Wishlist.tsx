import { useEffect, useRef, useState } from 'react'
import { fx } from '../fx'
import { AI_PROMPT } from '../importer'
import { actions, getSnap, useStore } from '../store'

/** Antal ord i önskelistan. */
export const wishCount = (text: string) => text.split(/[\n,、]/).filter((x) => x.trim()).length

/** Lägger ett ord sist i önskelistan, om det inte redan står där. */
export function addToWishlist(word: string): boolean {
  const current = getSnap().settings.wishlist
  const lines = current.split('\n').map((x) => x.trim()).filter(Boolean)
  if (lines.includes(word.trim())) return false
  void actions.saveSettings({ wishlist: [...lines, word.trim()].join('\n') })
  return true
}

/** Anteckningslista för ord man stöter på och vill lära sig. "Kopiera och radera" lägger
 *  listan i urklipp – med AI-instruktionen först om man vill – och tömmer den. */
export function Wishlist() {
  const saved = useStore().settings.wishlist
  const [text, setText] = useState(saved)
  const [withPrompt, setWithPrompt] = useState(() => localStorage.getItem('wishPrompt') !== '0')
  const [undo, setUndo] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const dirty = useRef(false)

  // Ändringar från en annan enhet visas här, men bara när man inte själv håller på att skriva.
  useEffect(() => {
    if (!dirty.current) setText(saved)
  }, [saved])
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      void actions.saveSettings({ wishlist: text })
    }, 700)
    return () => clearTimeout(t)
  }, [text])

  const count = wishCount(text)

  async function copyAndClear() {
    const words = text.trim()
    if (!words) return
    try {
      await navigator.clipboard.writeText(withPrompt ? AI_PROMPT + words + '\n' : words)
    } catch {
      return setError(true)
    }
    setError(false)
    setUndo(words)
    setText('')
    dirty.current = false
    void actions.saveSettings({ wishlist: '' })
    fx.pop(1)
  }

  return (
    <div className="form">
      <p className="muted">Skriv upp ord du stöter på. När listan är lagom lång kopierar du den till en AI, som gör en ordlistefil du sedan importerar. {count > 0 && <strong>{count} ord just nu.</strong>}</p>
      <textarea
        rows={4}
        lang="ja"
        placeholder="Skriv ett ord per rad, när du stöter på dem."
        value={text}
        onChange={(e) => {
          dirty.current = true
          setUndo(null)
          setText(e.target.value)
        }}
        spellCheck={false}
        autoCapitalize="none"
      />
      <label className="check">
        <input
          type="checkbox"
          checked={withPrompt}
          onChange={(e) => {
            setWithPrompt(e.target.checked)
            localStorage.setItem('wishPrompt', e.target.checked ? '1' : '0')
          }}
        />
        <span>Ta med AI-instruktionen, så att listan kan klistras in direkt hos en AI</span>
      </label>
      <button className="btn primary" disabled={!text.trim()} onClick={() => void copyAndClear()}>Kopiera och radera</button>
      {error && <div className="notice bad">Det gick inte att kopiera. Listan är kvar – markera texten och kopiera den manuellt.</div>}
      {undo !== null && (
        <div className="notice row between">
          <span>Kopierat. Listan är tömd.</span>
          <button
            className="btn small"
            onClick={() => {
              setText(undo)
              setUndo(null)
              void actions.saveSettings({ wishlist: undo })
            }}
          >
            Ångra
          </button>
        </div>
      )}
    </div>
  )
}
