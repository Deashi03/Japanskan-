import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { cardOf, importFile, knowledge, newPage, openBrowser, read, startServer, step } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4301)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

test('ett första pass: fem nya ord går igenom alla fem övningstyper och blir inlärda', async () => {
  const words = read('exempel-ordlista.json').words
  const K = knowledge(words)
  const { page, errors } = await newPage(browser, server.url)
  await importFile(page, 'exempel-ordlista.json')
  await page.click('.nav-item:nth-of-type(1)')
  assert.match(await page.$eval('.tiles', (e) => e.innerText), /5\s*\n?\s*nya ord/)
  await page.click('text=Starta')

  const types = new Set()
  for (let i = 0; i < 200; i++) {
    // När de nya orden är klara har passet inget mer att repetera och blir extra övning.
    if (await page.$('.notice.slim')) break
    const t = await step(page, K)
    if (t === 'summary') break
    if (t && !['sheet', 'intro'].includes(t)) types.add(t)
  }
  assert.deepEqual([...types].sort(), ['listen', 'match', 'mc_ja_sv', 'mc_sv_ja', 'type_sv'])

  // De fem första orden i filen är nu inlärda (Review) och kommer tillbaka först efter en dag.
  for (const w of words.slice(0, 5)) {
    const card = await cardOf(page, w.word)
    assert.equal(card?.state, 2, `${w.word} ska vara inlärt`)
    assert.ok(card.due > Date.now(), `${w.word} ska ha ett datum framåt`)
  }
  // De två sista har inte presenterats.
  for (const w of words.slice(5)) assert.equal(await cardOf(page, w.word), undefined)
  assert.deepEqual(errors, [])
})
