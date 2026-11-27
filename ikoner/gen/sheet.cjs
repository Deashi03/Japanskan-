// Kontaktblad: node sheet.cjs <modul> <png> [kolumner]. Renderar ikonerna i rundade rutor.
const { chromium } = require('playwright')
const items = require(require('path').resolve(process.argv[2]))
const cols = +(process.argv[4] || 5)
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: cols * 230 + 20, height: Math.ceil(items.length / cols) * 250 + 20 } })
  const html = `<body style="margin:10px;background:#d9dde6;font:12px system-ui;display:grid;grid-template-columns:repeat(${cols},220px);gap:10px">${items
    .map((it, i) => `<div><div style="width:220px;height:220px;border-radius:22%;overflow:hidden">${it.svg}</div><div>${i + 1}. ${it.name}</div></div>`)
    .join('')}</body><style>svg{width:100%;height:100%;display:block}</style>`
  await p.setContent(html)
  await p.screenshot({ path: process.argv[3] })
  await b.close()
})()
