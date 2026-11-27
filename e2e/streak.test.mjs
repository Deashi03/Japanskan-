import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DAY, DAY0, importFile, knowledge, newPage, openBrowser, read, startServer, step } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4305)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

test('tio rätt i rad ger en milstolpe med egen banderoll', async () => {
  const hori = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const K = knowledge(hori, extra)
  const { page, errors } = await newPage(browser, server.url)
  await importFile(page, 'ordlistor/Horimiya.json')
  await importFile(page, 'ordlistor/Horimiya-tillagg.json')
  await page.click('.nav-item:nth-of-type(2)')
  await page.click('text=Välj flera')
  for (const row of (await page.$$('.wordrow')).slice(0, 30)) await row.click()
  await page.click('.bulk-bar .btn:text-matches("Kan redan")')
  await page.waitForTimeout(300)
  await page.clock.setSystemTime(DAY0 + 32 * DAY)
  await page.reload()
  await page.waitForSelector('.home')
  await page.click('.nav-item:nth-of-type(4)')
  for (let i = 0; i < 5; i++) await page.click('[aria-label="Minska Nya ord per pass"]')
  await page.click('.nav-item:nth-of-type(1)')
  await page.click('text=Starta')

  const banners = []
  let answers = 0
  for (let i = 0; i < 200 && answers < 12; i++) {
    const t = await step(page, K)
    if (t && !['sheet', 'intro', 'summary'].includes(t)) answers++
    const toast = await page.$eval('.toast', (e) => e.className + '|' + e.textContent.trim()).catch(() => null)
    if (toast && !banners.includes(toast)) banners.push(toast)
  }
  assert.ok(answers >= 12, 'minst tolv svar gavs')
  // 5 ger en vanlig banderoll, 10 en milstolpe.
  assert.ok(banners.some((b) => /5 i rad/.test(b) && !b.includes('milestone')), `5 i rad: ${banners}`)
  assert.ok(banners.some((b) => /10 i rad/.test(b) && b.includes('milestone l1')), `10 i rad: ${banners}`)
  assert.deepEqual(errors, [])
})
