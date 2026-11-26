// Gemensamma hjälpmedel för webbläsartesterna: startar appen, öppnar en sida med låtsasklocka
// och låtsasuppläsning, importerar ordlistor, svarar på frågor och läser ur appens databas.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

export const read = (file) => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'))

/** Startar `vite preview` (kräver att appen är byggd) och väntar tills den svarar. */
export async function startServer(port) {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  const url = `http://localhost:${port}/`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => proc.kill() }
    } catch {
      /* inte uppe än */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error('Servern startade inte')
}

export async function openBrowser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
}

export const DAY0 = new Date(2026, 10, 25, 10, 0).getTime()
export const DAY = 86_400_000

/** En ny sida med låtsasklocka (så att tid går att styra) och låtsasuppläsning (som är klar efter
 *  50 ms och sparar vad som lästs upp i window.__spoken). */
export async function newPage(browser, url, { time = DAY0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(() => {
    window.__spoken = []
    if (!window.speechSynthesis) return
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text)
      setTimeout(() => u.onend && u.onend(), 50)
    }
    window.speechSynthesis.cancel = () => {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.clock.install({ time })
  await page.goto(url)
  await page.waitForSelector('.home')
  return { page, ctx, errors }
}

export async function importFile(page, file) {
  await page.click('.nav-item:nth-of-type(2)')
  await page.click('.page-head .btn.primary')
  await page.setInputFiles('input[type=file]', new URL('../' + file, import.meta.url).pathname)
  await page.waitForSelector('.modal .btn.primary.big:not([disabled])', { timeout: 60000 })
  await page.click('.modal .btn.primary.big')
  await page.waitForSelector('button:text-is("Klar")', { timeout: 120000 })
  await page.click('button:text-is("Klar")')
}

/** Alla rader i appens databas. */
export const dbRows = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('japanskan')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const get = open.result.transaction('rows').objectStore('rows').getAll()
          get.onsuccess = () => resolve(get.result)
          get.onerror = () => reject(get.error)
        }
      }),
  )

/** Ordets rad ur databasen, via ordets japanska text. */
export async function wordRow(page, wordText) {
  const rows = await dbRows(page)
  return rows.find((r) => r.kind === 'word' && !r.deleted && r.data.word === wordText)?.data
}

/** Ordets kort ur databasen, via ordets japanska text. */
export async function cardOf(page, wordText) {
  const rows = await dbRows(page)
  const word = rows.find((r) => r.kind === 'word' && !r.deleted && r.data.word === wordText)
  if (!word) return undefined
  return rows.find((r) => r.id === 'c:' + word.id.slice(2) && !r.deleted)?.data
}

/** Texten utan furigana (ruby-läsningarna tas bort). */
export const bare = (el) => {
  const c = el.cloneNode(true)
  c.querySelectorAll('rt').forEach((r) => r.parentNode.removeChild(r))
  return c.textContent
}

/** Den svenska frågan i skrivövningar: japanska exempel i betydelsen döljs i appen. */
export function meaningPrompt(m) {
  const JA = /[぀-ヿ㐀-鿿]/
  if (!JA.test(m)) return m
  const kept = m
    .replace(/\s*\([^)]*\)|\s*（[^）]*）/g, (x) => (JA.test(x) ? '' : x))
    .split(/(?<=[.!?])\s+/)
    .filter((x) => !JA.test(x))
    .join(' ')
    .trim()
  return kept.length >= 3 ? kept : m.replace(/[぀-ヿ㐀-鿿〜～ー]+/g, '…')
}

/** Slår upp ord ur de importerade filerna för att kunna svara rätt. */
export function knowledge(words, extra = []) {
  const byWord = Object.fromEntries(words.map((w) => [w.word, w]))
  const byPrompt = Object.fromEntries(words.map((w) => [meaningPrompt(w.meaning), w]))
  const byMeaning = Object.fromEntries(words.map((w) => [w.meaning, w]))
  const bySv = {}
  const spoken = new Map()
  for (const w of words) {
    spoken.set(w.word, { w, sv: w.meaning })
    for (const e of w.examples ?? []) {
      spoken.set(e.ja, { w, sv: e.sv })
      bySv[e.sv] = w
    }
  }
  for (const e of extra) {
    const w = byWord[e.word]
    for (const x of [...(e.examples ?? []), ...(e.forms ?? []).map((f) => f.ex)]) {
      spoken.set(x.ja, { w, sv: x.sv })
      bySv[x.sv] = w
    }
  }
  return { byWord, byPrompt, byMeaning, bySv, spoken }
}

/** Lösaren: gör ett steg i ett pass genom att svara rätt (eller på det sätt `wrong` anger).
 *  Returnerar övningstypen som besvarades, 'intro', 'sheet', 'summary' eller null. */
export async function step(page, K, { wrong = null } = {}) {
  await page.clock.runFor(150)
  await page.waitForTimeout(30)
  if (await page.$('.summary')) return 'summary'
  if (await page.$('.sheet')) {
    await page.click('.sheet .btn.primary', { timeout: 3000 }).catch(() => {})
    // Låt appen hinna byta fråga (och, när passet tar slut, gå över i extra övning).
    await page.waitForTimeout(120)
    return 'sheet'
  }
  if (await page.$('.intro')) {
    await page.click('.session-foot .btn.primary', { timeout: 3000 }).catch(() => {})
    return 'intro'
  }
  const label = await page.$eval('.ex-label', (e) => e.textContent).catch(() => null)
  if (!label) return null
  if (await page.$('.listen-wait')) {
    await page.clock.runFor(1500)
    await page.waitForTimeout(60)
  }
  const pickOption = async (target) => {
    for (const o of await page.$$('.option')) {
      const t = await o.evaluate((e) => {
        const c = e.lastElementChild.cloneNode(true)
        c.querySelectorAll('rt').forEach((r) => r.parentNode.removeChild(r))
        return c.textContent
      })
      if (t === target) {
        await o.click()
        return true
      }
    }
    return false
  }
  const settle = () => page.waitForSelector('.sheet', { timeout: 5000 })
  if (await page.$('.match')) {
    for (;;) {
      const chip = await page.$('.chip.word:not(.gone)')
      if (!chip) break
      const w = K.byWord[await chip.evaluate(bare)]
      for (const t of await page.$$('.chip.meaning:not(.done)')) {
        if ((await t.evaluate((e) => e.textContent)) === w.meaning) {
          await chip.click()
          await t.click()
          break
        }
      }
      await page.waitForTimeout(40)
    }
    await page.clock.runFor(900)
    await settle()
    return 'match'
  }
  if (await page.$('.cloze')) {
    const w = K.bySv[await page.$eval('.cloze-sv', (e) => e.textContent)]
    await pickOption(w.word)
    await settle()
    return 'cloze'
  }
  if (await page.$('.prompt-listen')) {
    const spoken = await page.evaluate(() => window.__spoken[window.__spoken.length - 1])
    const hit = K.spoken.get(spoken)
    const isSentence = label.includes('meningen')
    await pickOption(isSentence ? hit.sv : hit.w.meaning)
    await settle()
    return label.includes('böjt') ? 'form' : isSentence ? 'sentence' : 'listen'
  }
  if (await page.$('.options')) {
    const ja = await page.$('.prompt-ja')
    const w = ja ? K.byWord[await page.$eval('.prompt-ja .furi-word', bare)] : K.byPrompt[await page.$eval('.prompt-sv', (e) => e.textContent)]
    await pickOption(ja ? w.meaning : w.word)
    await settle()
    return ja ? 'mc_ja_sv' : 'mc_sv_ja'
  }
  if (await page.$('.type-input')) {
    const toSwedish = !!(await page.$('.prompt-ja'))
    const w = toSwedish ? K.byWord[await page.$eval('.prompt-ja .furi-word', bare)] : K.byPrompt[await page.$eval('.prompt-sv', (e) => e.textContent)]
    const type = toSwedish ? 'type_sv' : 'type_from_sv'
    const right = toSwedish ? (w.synonyms?.[0] ?? w.meaning.split(/[/.,(]/)[0].trim().toLowerCase()) : w.reading
    await page.fill('.type-input', wrong?.(type, w) ?? right)
    await page.keyboard.press('Enter')
    await settle()
    return type
  }
  return null
}
