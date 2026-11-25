import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { importFile, knowledge, newPage, openBrowser, read, startServer, step } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4302)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

test('svarsalternativen i lyssningsövningar visas först en sekund efter att uppläsningen är klar', async () => {
  const K = knowledge(read('exempel-ordlista.json').words)
  const { page, errors } = await newPage(browser, server.url)
  await importFile(page, 'exempel-ordlista.json')
  await page.click('.nav-item:nth-of-type(1)')
  await page.click('text=Starta')
  // Gå fram till första lyssningsfrågan utan att låta lösaren vänta ut väntetiden.
  for (let i = 0; i < 80 && !(await page.$('.prompt-listen')); i++) {
    if (await page.$('.options, .match, .type-input, .sheet, .intro')) await step(page, K)
    else await page.clock.runFor(100)
  }
  await page.waitForSelector('.prompt-listen')
  assert.ok((await page.evaluate(() => window.__spoken.length)) > 0, 'ordet läses upp när frågan visas')
  assert.ok(await page.$('.listen-wait'), 'väntar innan svaren visas')
  assert.equal((await page.$$('.option')).length, 0)

  let elapsed = 0
  while (!(await page.$('.option')) && elapsed < 3000) {
    await page.clock.runFor(100)
    await page.waitForTimeout(20)
    elapsed += 100
  }
  // Uppläsningen tar 50 ms i testet; alternativen kommer en sekund efter det.
  assert.ok(elapsed >= 800, `för tidigt: ${elapsed} ms`)
  assert.ok(elapsed <= 1300, `för sent: ${elapsed} ms`)
  assert.equal((await page.$$('.option')).length, 4)
  assert.deepEqual(errors, [])
})
