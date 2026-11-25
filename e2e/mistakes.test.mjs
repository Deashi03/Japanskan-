import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { bare, cardOf, DAY, DAY0, importFile, knowledge, newPage, openBrowser, read, startServer, step, wordRow } from './helpers.mjs'

let server, browser
before(async () => {
  server = await startServer(4303)
  browser = await openBrowser()
})
after(async () => {
  await browser?.close()
  server?.stop()
})

/** Importerar Horimiya-listan med tillägg och gör de 30 första orden till repetitioner en månad senare. */
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
  // Inga nya ord i det här passet, bara repetitioner.
  await page.click('.nav-item:nth-of-type(4)')
  for (let i = 0; i < 5; i++) await page.click('[aria-label="Minska Nya ord per pass"]')
  await page.click('.nav-item:nth-of-type(1)')
}

test('fel svar visar en exempelmening, och en förväxling visar det andra ordet och övas igen i morgon', async () => {
  const hori = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const K = knowledge(hori, extra)
  const known = hori.slice(0, 30)
  const { page, errors } = await newPage(browser, server.url)
  await reviewSetup(page)
  await page.click('text=Starta')

  // Svara rätt tills en skrivövning "svenska → japanska" kommer, och svara då med ett annat ord.
  let prompted
  let confusedWith
  for (let i = 0; i < 80 && !confusedWith; i++) {
    if ((await page.$('.type-input')) && !(await page.$('.prompt-ja'))) {
      prompted = K.byPrompt[await page.$eval('.prompt-sv', (e) => e.textContent)]
      // Ett ord som är entydigt (ingen annan har samma skrivsätt eller läsning) och som inte
      // betyder samma sak som det som skulle skrivas – annars godkänns svaret eller så pekar
      // förväxlingen ut ett annat ord med samma läsning.
      const tokens = (w) => new Set(`${w.meaning} ${(w.synonyms ?? []).join(' ')}`.toLowerCase().match(/[a-zåäö]{4,}/g) ?? [])
      const mine = tokens(prompted)
      confusedWith = known.find(
        (w) =>
          w.word !== prompted.word &&
          hori.filter((x) => x.word === w.word || x.reading === w.reading).length === 1 &&
          ![...tokens(w)].some((t) => mine.has(t)),
      )
      break
    }
    await step(page, K)
  }
  assert.ok(prompted, 'en skrivövning svenska → japanska kom')
  const before = await cardOf(page, confusedWith.word)
  assert.ok(before, 'det förväxlade ordet är redan påbörjat')
  const day = Math.round((DAY0 + 32 * DAY - 4 * 3_600_000) / DAY)

  await page.fill('.type-input', confusedWith.word)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.sheet.bad')

  // 1. Även vid fel visas en exempelmening med ordet.
  assert.ok(await page.$('.sheet-example'), 'exempelmening efter fel svar')
  // 2. "Du tänkte på": det ord man faktiskt skrev, med betydelse.
  const hint = await page.$eval('.sheet-confusion', (e) => e.innerText)
  assert.match(hint, /du tänkte på/i)
  assert.ok(hint.replace(/\s/g, '').includes(confusedWith.word.replace(/\s/g, '')), 'det förväxlade ordet visas')
  assert.match(hint, /övas igen i morgon/)
  // Det förväxlade ordet får bara ett omprov i morgon, och dess intervall är orört.
  const after = await cardOf(page, confusedWith.word)
  assert.equal(after.retry?.length, 1)
  assert.equal(after.retry[0].type, 'type_from_sv')
  assert.equal(after.retry[0].day, day + 1)
  assert.equal(after.stability, before.stability)
  assert.equal(after.due, before.due)
  assert.equal(after.reps, before.reps)
  // Det som skulle skrivas får det vanliga omprovet (två).
  assert.equal((await cardOf(page, prompted.word)).retry?.length, 2)
  // Paret är sparat åt båda hållen.
  const a = await wordRow(page, prompted.word)
  const b = await wordRow(page, confusedWith.word)
  assert.deepEqual(a.confusable, [b.id])
  assert.deepEqual(b.confusable, [a.id])

  // Ångra: allt återställs.
  await page.click('text=Ångra')
  await page.waitForSelector('.type-input')
  assert.equal((await cardOf(page, confusedWith.word)).retry, undefined)
  assert.equal((await wordRow(page, prompted.word)).confusable, undefined)

  // Svara fel igen och gå vidare; paret syns sedan på ordets sida i ordlistan.
  await page.fill('.type-input', confusedWith.word)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.sheet.bad')
  await page.click('.session-top .icon-btn')
  await page.waitForSelector('.summary')
  await page.clock.runFor(5000)
  await page.click('button:text-is("Klar")')
  await page.click('.nav-item:nth-of-type(2)')
  await page.fill('.search', prompted.word)
  await page.waitForTimeout(300)
  await page.click('.wordrow')
  await page.waitForSelector('.modal')
  const card = await page.$eval('.modal', (e) => e.innerText)
  assert.match(card, /du har blandat ihop det med/i)
  assert.ok(card.replace(/\s/g, '').includes(confusedWith.word.replace(/\s/g, '')))
  assert.deepEqual(errors, [])
  void bare
})

test('ett fel utan förväxling visar exempelmening men ingen "Du tänkte på"', async () => {
  const hori = read('ordlistor/Horimiya.json').words
  const extra = read('ordlistor/Horimiya-tillagg.json').enrich
  const K = knowledge(hori, extra)
  const { page, errors } = await newPage(browser, server.url)
  await reviewSetup(page)
  await page.click('text=Starta')
  for (let i = 0; i < 80 && !((await page.$('.type-input')) && (await page.$('.prompt-ja'))); i++) await step(page, K)
  await page.fill('.type-input', 'xyzzy qwert')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.sheet.bad')
  assert.ok(await page.$('.sheet-example'))
  assert.equal(await page.$('.sheet-confusion'), null)
  assert.deepEqual(errors, [])
})
