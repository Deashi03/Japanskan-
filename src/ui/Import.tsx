import { useMemo, useState } from 'react'
import { AI_PROMPT, matchEnrichment, parseWordFile, splitDuplicates, toWord, type Update } from '../importer'
import { actions, uid, useStore } from '../store'
import { Ja, Modal } from './bits'

export function ImportView({ onClose }: { onClose: () => void }) {
  const snap = useStore()
  const [text, setText] = useState('')
  const [listName, setListName] = useState(() => 'Lista ' + new Date().toLocaleDateString('sv-SE'))
  const [copied, setCopied] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [done, setDone] = useState<{ added: number; updated: number; enriched: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => (text.trim() ? parseWordFile(text) : null), [text])
  const split = useMemo(() => (result ? splitDuplicates(result.words, snap.words.values()) : null), [result, snap.words])
  const enrich = useMemo(() => (result?.enrich.length ? matchEnrichment(result.enrich, snap.words.values()) : null), [result, snap.words])

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Kunde inte kopiera. Markera och kopiera texten manuellt i stället.')
    }
  }

  /** Hämtar AI:ns svar direkt ur urklipp, så att man slipper spara en fil. */
  async function paste() {
    try {
      const clip = await navigator.clipboard.readText()
      if (!clip.trim()) return setPasteError('Urklipp är tomt. Kopiera AI:ns svar först.')
      setPasteError(null)
      setText(clip)
    } catch {
      setPasteError('Appen fick inte läsa urklipp. Klistra in texten i rutan nedanför i stället.')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
    setListName(file.name.replace(/\.[^.]+$/, ''))
  }

  /** Sparar i omgångar, så att en stor fil inte låser appen. */
  async function save(items: Update[]) {
    for (let i = 0; i < items.length; i += 100) {
      await actions.saveWordsWithExtras(items.slice(i, i + 100))
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  async function doImport() {
    if (busy) return
    setBusy(true)
    try {
      if (enrich) {
        // Tilläggsfil: befintliga ord får nytt innehåll; kort och framsteg rörs inte.
        await save(enrich.updates)
        return setDone({ added: 0, updated: enrich.updates.length, enriched: true })
      }
      if (!split || (!split.fresh.length && !split.updates.length)) return
      const now = Date.now()
      const fresh = split.fresh.map((p, i) => toWord(p, { id: uid(), list: listName.trim() || 'Lista', createdAt: now, order: i }))
      await save([...fresh, ...split.updates])
      setDone({ added: fresh.length, updated: split.updates.length, enriched: split.updates.some((u) => !!u.extra) })
    } finally {
      setBusy(false)
    }
  }

  if (done !== null)
    return (
      <Modal title="Importera ord" onClose={onClose}>
        <div className="center">
          <p className="big-emoji">🎉</p>
          {done.added > 0 && <p><strong>{done.added} ord</strong> har lagts till. De introduceras några i taget i dina kommande pass.</p>}
          {done.updated > 0 && (
            <p>
              <strong>{done.updated} ord</strong> som du redan hade har fått {done.enriched ? 'nytt innehåll' : 'fler godkända svar (synonymer)'}. Dina framsteg är orörda.
            </p>
          )}
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
          <button className="btn primary" onClick={() => void paste()}>Klistra in från urklipp</button>
          {pasteError && <div className="notice">{pasteError}</div>}
          <input type="file" accept=".json,.txt,application/json,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          <textarea rows={5} placeholder="…eller klistra in AI:ns svar här" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </li>
        {result && enrich && (
          <li>
            <h3>Kontrollera</h3>
            {result.errors.length > 0 && <div className="notice bad">{result.errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
            <p>
              Filen innehåller nytt innehåll – ordklass, ämnen, exempelmeningar och böjningar – till <strong>{enrich.updates.length} ord</strong> som du redan har. Dina framsteg påverkas inte.
            </p>
            {enrich.missing.length > 0 && (
              <div className="notice">{enrich.missing.length} ord i filen finns inte i din ordlista och hoppas över{enrich.missing.length <= 12 && <>: <Ja>{enrich.missing.join('、')}</Ja></>}.</div>
            )}
            {enrich.updates.length > 0 && (
              <button className="btn primary big" disabled={busy} onClick={() => void doImport()}>{busy ? 'Sparar…' : `Lägg till innehåll för ${enrich.updates.length} ord`}</button>
            )}
          </li>
        )}
        {result && split && !enrich && (
          <li>
            <h3>Kontrollera</h3>
            {result.errors.length > 0 && (
              <div className="notice bad">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {split.duplicates.length > 0 && (
              <div className="notice">
                {split.duplicates.length} ord finns redan och läggs inte till igen
                {split.duplicates.length <= 12 && <>: <Ja>{split.duplicates.map((d) => d.word).join('、')}</Ja></>}.
                {split.updates.length > 0 && <> {split.updates.length} av dem får nytt innehåll från filen – framstegen påverkas inte.</>}
              </div>
            )}
            {split.fresh.length === 0 && split.updates.length > 0 && (
              <button className="btn primary big" disabled={busy} onClick={() => void doImport()}>Uppdatera {split.updates.length} ord</button>
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
                <button className="btn primary big" disabled={busy} onClick={() => void doImport()}>{busy ? 'Sparar…' : `Importera ${split.fresh.length} ord`}</button>
              </>
            )}
          </li>
        )}
      </ol>
    </Modal>
  )
}
