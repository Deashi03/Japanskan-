// Hjälpmedel för appbilderna: typsnitt som kurvor, enkla former och färger.
const opentype = require('opentype.js')
const fs = require('fs')
const path = require('path')
const FD = path.join(__dirname, 'node_modules/@expo-google-fonts')
const load = (p) => {
  const b = fs.readFileSync(p)
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}
const F = {
  maru: load(`${FD}/zen-maru-gothic/900Black/ZenMaruGothic_900Black.ttf`),
  maruB: load(`${FD}/zen-maru-gothic/700Bold/ZenMaruGothic_700Bold.ttf`),
  serif: load(`${FD}/noto-serif-jp/900Black/NotoSerifJP_900Black.ttf`),
  brush: load(`${FD}/yuji-syuku/400Regular/YujiSyuku_400Regular.ttf`),
  dela: load(`${FD}/dela-gothic-one/400Regular/DelaGothicOne_400Regular.ttf`),
}

/** Text som en kurva, inpassad i en ruta (cx, cy, bredd, höjd) utan att tappa proportionerna. */
function glyph(font, text, cx, cy, w, h, fill = '#fff', extra = '') {
  const p = F[font].getPath(text, 0, 0, 100)
  const bb = p.getBoundingBox()
  const sw = bb.x2 - bb.x1
  const sh = bb.y2 - bb.y1
  const s = Math.min(w / sw, h / sh)
  const tx = cx - (bb.x1 + sw / 2) * s
  const ty = cy - (bb.y1 + sh / 2) * s
  return `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})" d="${p.toPathData(1)}" fill="${fill}" ${extra}/>`
}

const C = {
  verm: '#E8452C', vermD: '#C2321C', vermL: '#F5694B',
  indigo: '#24427F', indigoD: '#142754', indigoL: '#3D62B3',
  sakura: '#F7BDCB', sakuraD: '#EE8FA9',
  cream: '#FFF6E4', paper: '#F6EAD2',
  ink: '#1C1C24', gold: '#F5B92E', goldL: '#FFD76A',
  sky: '#86CBEF', skyL: '#D9F0FB', leaf: '#6FC264', leafD: '#3F9A4D', leafL: '#C9E8A8',
  purple: '#7E6FC8', teal: '#2A9D8F', orange: '#F28A30',
}

let uid = 0
/** Gör en SVG. `defs` kan innehålla gradienter; id:n görs unika. */
function svg(body, defs = '') {
  const n = `i${++uid}_`
  const r = (s) => s.replace(/#\(([a-zA-Z0-9]+)\)/g, `#${n}$1`).replace(/url\(#([a-zA-Z0-9]+)\)/g, `url(#${n}$1)`).replace(/ id="([a-zA-Z0-9]+)"/g, ` id="${n}$1"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs ? `<defs>${r(defs)}</defs>` : ''}${r(body)}</svg>`
}
const lin = (id, a, b, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
const rad = (id, a, b, cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`
const bg = (id) => `<rect width="100" height="100" fill="url(#${id})"/>`
const rot = (a, cx, cy, inner) => `<g transform="rotate(${a} ${cx} ${cy})">${inner}</g>`
const pts = (a) => a.map((p) => p.join(',')).join(' ')
const arcPt = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)]

module.exports = { F, glyph, C, svg, lin, rad, bg, rot, pts, arcPt }
