import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { importFile, newPage, openBrowser, read, startServer } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4304)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

const shown = async (page) => Number((await page.$eval('.page .muted.small', (e) => e.textContent)).match(/(\d+) ord visas/)[1])

test('tilläggsfilen ger ordklass, ämnen och exempel utan att ändra något annat; filtren och svepet fungerar', async () => {
  const words = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const { page, errors } = await newPage(browser, server.url)
  await importFile(page, 'ordlistor/Horimiya.json')
  await page.click('.nav-item:nth-of-type(2)')
  assert.equal(await page.$('select[aria-label="Ämne"]'), null, 'inga ämnen före tilläggsfilen')
  await importFile(page, 'ordlistor/Horimiya-tillagg.json')
  await page.click('.nav-item:nth-of-type(2)')
  assert.equal(await shown(page), words.length)

  // Ämnesfilter: antalet i listan stämmer med filen.
  const count = (key, value) => extra.filter((e) => e[key].includes(value)).length
  const cats = {}
  for (const e of extra) for (const c of e.categories) cats[c] = (cats[c] ?? 0) + 1
  const [cat, catCount] = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]
  await page.selectOption('select[aria-label="Ämne"]', cat)
  await page.waitForTimeout(150)
  assert.equal(await shown(page), catCount)
  assert.equal(count('categories', cat), catCount)
  // Ordklassfilter kombineras med ämnesfiltret.
  const verbs = extra.filter((e) => e.categories.includes(cat) && e.pos.includes('u')).length
  await page.selectOption('select[aria-label="Ordklass"]', 'u')
  await page.waitForTimeout(150)
  assert.equal(await shown(page), verbs)
  await page.selectOption('select[aria-label="Ämne"]', '')
  await page.selectOption('select[aria-label="Ordklass"]', '')
  assert.equal(await shown(page), words.length)

  // Sökning på ämne och sökord hittar orden: varje ord med ämnet finns bland träffarna.
  await page.fill('.search', cat)
  await page.waitForTimeout(250)
  assert.ok((await shown(page)) >= catCount)
  await page.fill('.search', '')

  // Ordets sida: ordklass, ämnen och alla exempelmeningar.
  const withForms = extra.find((e) => e.forms.length && e.pos.length)
  await page.fill('.search', withForms.word)
  await page.waitForTimeout(250)
  await page.click('.wordrow')
  await page.waitForSelector('.modal')
  assert.ok((await page.$$('.modal .pos')).length >= 1, 'ordklass visas')
  assert.ok((await page.$$('.modal .topic')).length >= 1, 'ämnen visas')
  await page.click('.examples-btn')
  await page.waitForSelector('.examples-list section')
  const sentences = (await page.$$('.examples-list .wc-example')).length
  const expected = extra.find((e) => e.word === withForms.word)
  const original = words.find((w) => w.word === withForms.word)
  assert.equal(sentences, expected.examples.length + original.examples.length + expected.forms.length)
  const headings = await page.$$eval('.examples-list h4', (e) => e.map((x) => x.textContent))
  assert.ok(headings.some((h) => h.startsWith('Enkla')) && headings.some((h) => h.startsWith('Böjningar')))
  await page.click('.modal-head .icon-btn >> nth=-1')
  await page.waitForTimeout(150)
  await page.click('.modal-head .icon-btn >> nth=-1')
  await page.fill('.search', '')
  await page.waitForTimeout(250)

  // Svepmarkering: dra fingret längs kryssrutorna.
  await page.click('text=Välj flera')
  const boxes = await page.$$('.pick.box')
  const a = await boxes[0].boundingBox()
  const z = await boxes[5].boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  assert.equal(await page.$eval('.bulk-bar strong', (e) => e.textContent), '6 markerade')
  assert.deepEqual(errors, [])
})
