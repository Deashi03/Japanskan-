import { useMemo, useState } from 'react'
import { AI_PROMPT, parseWordFile, splitDuplicates } from '../importer'
import { actions, uid, useStore } from '../store'
import type { Word } from '../types'
import { Ja, Modal } from './bits'

export function ImportView({ onClose }: { onClose: () => void }) {
  const snap = useStore()
  const [text, setText] = useState('')
  const [listName, setListName] = useState(() => 'Lista ' + new Date().toLocaleDateString('sv-SE'))
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  const result = useMemo(() => (text.trim() ? parseWordFile(text) : null), [text])
  const split = useMemo(() => (result ? splitDuplicates(result.words, snap.words.values()) : null), [result, snap.words])

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Kunde inte kopiera. Markera och kopiera texten manuellt i stället.')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
    setListName(file.name.replace(/\.[^.]+$/, ''))
  }

  async function doImport() {
    if (!split?.fresh.length) return
    const now = Date.now()
    const words: Word[] = split.fresh.map((p, i) => ({ ...p, id: uid(), list: listName.trim() || 'Lista', createdAt: now, order: i }))
    await actions.saveWords(words)
    setDone(words.length)
  }

  if (done !== null)
    return (
      <Modal title="Importera ord" onClose={onClose}>
        <div className="center">
          <p className="big-emoji">🎉</p>
          <p><strong>{done} ord</strong> har lagts till. De introduceras några i taget i dina kommande pass.</p>
          <button className="btn primary" onClick={onClose}>Klar</button>
        </div>
      </Modal>
    )

  return (
    <Modal title="Importera ord" onClose={onClose}>
      <ol className="steps">
        <li>
          <h3>Be en AI skapa ordlistan</h3>
          <p className="muted">Kopiera instruktionen, klistra in den hos valfri AI och skriv dina japanska ord sist i meddelandet.</p>
          <button className="btn" onClick={copyPrompt}>{copied ? 'Kopierad ✓' : 'Kopiera AI-instruktion'}</button>
        </li>
        <li>
          <h3>Ladda upp filen eller klistra in svaret</h3>
          <input type="file" accept=".json,.txt,application/json,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          <textarea rows={5} placeholder="…eller klistra in AI:ns svar här" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </li>
        {result && split && (
          <li>
            <h3>Kontrollera</h3>
            {result.errors.length > 0 && (
              <div className="notice bad">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {split.duplicates.length > 0 && (
              <div className="notice">
                {split.duplicates.length} ord finns redan och hoppas över: <Ja>{split.duplicates.map((d) => d.word).join('、')}</Ja>
              </div>
            )}
            {split.fresh.length > 0 && (
              <>
                <label className="field">
                  <span>Listans namn</span>
                  <input value={listName} onChange={(e) => setListName(e.target.value)} />
                </label>
                <ul className="preview">
                  {split.fresh.map((w, i) => (
                    <li key={i}>
                      <Ja className="strong">{w.word}</Ja> <Ja className="muted">{w.reading}</Ja>
                      <div className="clamp1">{w.meaning}</div>
                    </li>
                  ))}
                </ul>
                <button className="btn primary big" onClick={doImport}>Importera {split.fresh.length} ord</button>
              </>
            )}
          </li>
        )}
      </ol>
    </Modal>
  )
}
