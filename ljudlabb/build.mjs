// Bygger lyssningssidan: node build.mjs <utfil>. Sidan innehåller ljudmotorn och räknar ut
// ljuden i webbläsaren, så den är liten och behöver inga ljudfiler.
import fs from 'node:fs'
import { GROUPS, OK } from './bank.js'

const here = (f) => new URL(f, import.meta.url)
const strip = (src) =>
  src
    .replace(/^import .*$/gm, '')
    .replace(/^export (const|let|function|class)/gm, '$1')
    .replace(/<\/script>/g, '<\\/script>')

const meta = `const META = ${JSON.stringify({ ok: OK.map(({ name, desc }) => ({ name, desc })), groups: GROUPS.map(({ name, desc }) => ({ name, desc })) })}`
const code = `${strip(fs.readFileSync(here('synth.js'), 'utf8'))}\n${strip(fs.readFileSync(here('bank.js'), 'utf8'))}`
const html = fs.readFileSync(here('sida.html'), 'utf8').replace('/*META*/', () => meta).replace('/*SYNTH*/', () => code)
fs.writeFileSync(process.argv[2] ?? 'lyssna.html', html)
console.log('klar', Math.round(html.length / 1024), 'kB')
