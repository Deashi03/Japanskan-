import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DAY, DAY0, dbRows, importFile, knowledge, newPage, openBrowser, read, startServer, step } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4306)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

/** Importerar Horimiya-listan och gör de 30 första orden till repetitioner en månad senare.
 *  Kvoten för nya ord lämnas orörd, för att visa att repetitionspasset ändå inte tar några nya. */
async function reviewSetup(page) {
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
}

const cardCount = async (page) => (await dbRows(page)).filter((r) => r.kind === 'card' && !r.deleted).length

test('knappen är avstängd när inga ord har påbörjats', async () => {
  const { page, errors } = await newPage(browser, server.url)
  await importFile(page, 'exempel-ordlista.json')
  await page.click('.nav-item:nth-of-type(1)')
  await page.waitForSelector('#repeat')
  assert.equal(await page.$eval('#repeat .btn.primary', (b) => b.disabled), true)
  assert.match(await page.$eval('#repeat', (e) => e.innerText), /inga påbörjade ord/i)
  assert.deepEqual(errors, [])
})

test('ett repetitionspass på fem minuter tar bara repetitioner, inga nya ord', async () => {
  const hori = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const K = knowledge(hori, extra)
  const { page, errors } = await newPage(browser, server.url)
  await reviewSetup(page)
  const before = await cardCount(page)
  assert.match(await page.$eval('#repeat', (e) => e.innerText), /30 ord att repetera/)
  await page.click('#repeat .seg-item:has-text("5")')
  await page.click('#repeat .btn.primary')
  await page.waitForSelector('.session')

  // Klockan räknar ned från fem minuter.
  assert.match(await page.$eval('.clock', (e) => e.textContent), /^[45]:\d\d$/)
  let answers = 0
  const seen = new Set()
  for (let i = 0; i < 120 && answers < 10; i++) {
    const t = await step(page, K)
    if (t) seen.add(t)
    if (t && !['sheet', 'intro', 'summary'].includes(t)) answers++
  }
  assert.ok(answers >= 10, `tio svar gavs (${answers})`)
  assert.equal(seen.has('intro'), false, 'inget introduktionskort visades')
  await page.click('.session-top .icon-btn')
  await page.waitForSelector('.summary')
  await page.clock.runFor(5000)
  await page.click('button:text-is("Klar")')
  assert.equal(await cardCount(page), before, 'inga nya kort skapades')
  assert.deepEqual(errors, [])
})

test('ett obegränsat repetitionspass räknar upp tiden och har ingen nedräkning', async () => {
  const hori = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const K = knowledge(hori, extra)
  const { page, errors } = await newPage(browser, server.url)
  await reviewSetup(page)
  await page.click('#repeat .seg-item:has-text("obegr.")')
  assert.equal(await page.evaluate(() => localStorage.getItem('repMinutes')), '0')
  await page.click('#repeat .btn.primary')
  await page.waitForSelector('.session')
  assert.equal(await page.getAttribute('.progress', 'aria-label'), 'Framsteg')
  assert.match(await page.$eval('.clock', (e) => e.textContent), /^0:0\d$/)
  await page.clock.runFor(65_000)
  const clock = await page.$eval('.clock', (e) => e.textContent)
  assert.match(clock, /^1:\d\d$/, `klockan räknar uppåt: ${clock}`)
  let answers = 0
  for (let i = 0; i < 100 && answers < 6; i++) {
    const t = await step(page, K)
    if (t && !['sheet', 'intro', 'summary'].includes(t)) answers++
  }
  assert.ok(answers >= 6)
  // Framstegsfältet visar andelen av de ord som skulle repeteras som är gjorda.
  const pct = Number(await page.getAttribute('.progress', 'aria-valuenow'))
  assert.ok(pct > 0 && pct < 100, `framsteg ${pct}`)
  assert.deepEqual(errors, [])
})
