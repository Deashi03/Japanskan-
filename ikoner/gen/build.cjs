// Bygger galleriet: node build.cjs <utfil> [svg-mapp]
const fs = require('fs')
const path = require('path')
const groups = [
  ['Tecken', 'Bokstäverna är hjälten.', require('./a.cjs')],
  ['Natur', 'Berg, blommor, vatten och måne.', require('./b.cjs')],
  ['Föremål', 'Japansk kultur i form av saker.', require('./c.cjs')],
  ['Figurer och mat', 'Små, vänliga motiv.', require('./d.cjs')],
  ['Märken', 'Symboler för språk, ljud och lärande.', require('./e.cjs')],
]
let n = 0
const data = groups.map(([name, desc, items]) => ({
  name,
  desc,
  items: items.map((it) => ({ nr: ++n, name: it.name, desc: it.desc, svg: it.svg })),
}))
if (process.argv[3]) {
  fs.mkdirSync(process.argv[3], { recursive: true })
  for (const g of data) for (const it of g.items) fs.writeFileSync(path.join(process.argv[3], `${String(it.nr).padStart(2, '0')}-${it.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.svg`), it.svg)
}
const tpl = fs.readFileSync(path.join(__dirname, 'sida.html'), 'utf8')
fs.writeFileSync(process.argv[2], tpl.replace('/*DATA*/', () => `const DATA = ${JSON.stringify(data).replace(/<\/script>/g, '<\\/script>')};`))
console.log('klar', n, 'bilder', Math.round(fs.statSync(process.argv[2]).size / 1024), 'kB')
