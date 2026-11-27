// Gör appikonerna av den valda bilden: node ikoner/gen/png.cjs
// Skriver public/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png och apple-touch-icon.png.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '../..')
const src = fs.readFileSync(path.join(root, 'ikoner/forslag/42-Två-bubblor.svg'), 'utf8')

// Den maskerbara varianten behåller bakgrunden men krymper motivet, så att en rund eller
// rundad mask aldrig skär i bubblorna (säkra zonen är de mellersta 80 procenten).
const bgEnd = src.indexOf('/>', src.indexOf('<rect width="100" height="100"')) + 2
const maskable = `${src.slice(0, bgEnd)}<g transform="translate(50 50) scale(.76) translate(-50 -50)">${src.slice(bgEnd, src.lastIndexOf('</svg>'))}</g></svg>`

;(async () => {
  const b = await chromium.launch()
  const render = async (svg, size, out) => {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
    await p.screenshot({ path: path.join(root, 'public', out), clip: { x: 0, y: 0, width: size, height: size } })
    await p.close()
  }
  fs.writeFileSync(path.join(root, 'public/icon.svg'), src)
  await render(src, 192, 'icon-192.png')
  await render(src, 512, 'icon-512.png')
  await render(src, 180, 'apple-touch-icon.png')
  await render(maskable, 512, 'icon-maskable-512.png')
  await b.close()
})()
