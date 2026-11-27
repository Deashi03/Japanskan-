// B. Natur: berg, blommor, vatten, måne.
const { glyph, C, svg, lin, rad, bg, rot, pts, arcPt } = require('./lib.cjs')

/** Körsbärsblomma: fem hjärtformade kronblad runt (cx, cy). */
const sakura = (cx, cy, s, a = 0, fill = 'url(#pet)') => {
  const petal = `<path d="M0 0C-13-7-17-27-8-34L0-29L8-34C17-27 13-7 0 0Z" fill="${fill}"/>`
  let g = ''
  for (let i = 0; i < 5; i++) g += `<g transform="rotate(${a + i * 72})">${petal}</g>`
  let st = ''
  for (let i = 0; i < 6; i++) {
    const [x, y] = arcPt(0, 0, 9, i * 60 + 15)
    st += `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#D9566F" stroke-width="1.1"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${C.gold}"/>`
  }
  return `<g transform="translate(${cx} ${cy}) scale(${s})">${g}<circle r="4" fill="#F08BA6"/>${st}</g>`
}
const petalGrad = rad('pet', '#F08BA6', '#FBD3DD', 0.5, 0.95, 0.9)

/** Ume: fem runda kronblad. */
const ume = (cx, cy, s) => {
  let g = ''
  for (let i = 0; i < 5; i++) {
    const [x, y] = arcPt(0, 0, 12, i * 72 - 90)
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11.500" fill="#FFF3F5"/>`
  }
  let st = ''
  for (let i = 0; i < 8; i++) {
    const [x, y] = arcPt(0, 0, 8, i * 45)
    st += `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E0607A" stroke-width="0.9"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${C.gold}"/>`
  }
  return `<g transform="translate(${cx} ${cy}) scale(${s})">${g}<circle r="3.600" fill="#F4A3B6"/>${st}</g>`
}

module.exports = [
  {
    name: 'Fuji', desc: 'Fuji med snötopp och en röd sol på klar himmel.',
    svg: svg(
      `${bg('a')}<circle cx="70" cy="30" r="12" fill="${C.verm}"/>
      <ellipse cx="22" cy="40" rx="11" ry="4.500" fill="#fff" opacity=".9"/><ellipse cx="30" cy="43" rx="9" ry="4" fill="#fff" opacity=".9"/>
      <path d="M2 84Q30 66 43 42L50 32L57 42Q70 66 98 84V100H2Z" fill="url(#m)"/>
      <path d="M43 42L50 32L57 42Q54 47 51.500 43Q50 48 48 43Q45 47 43 42Z" fill="#fff"/>
      <path d="M0 86Q25 80 50 86T100 86V100H0Z" fill="${C.indigoD}"/>`,
      lin('a', '#8FD2F2', '#E3F4FC') + lin('m', '#3D62B3', '#1E3A78'),
    ),
  },
  {
    name: 'Körsbärsblomma', desc: 'En enda blomma i rosa mot natthimlen.',
    svg: svg(
      `${bg('a')}${sakura(50, 52, 1.12)}
      <path d="M17 20c2 2 3 5 2 7c-3-1-4-4-2-7z" fill="${C.sakura}" opacity=".8"/><path d="M82 74c-1 3-3 5-6 5c0-3 2-5 6-5z" fill="${C.sakura}" opacity=".8"/><path d="M80 18c2 1 3 3 3 5c-3 0-4-3-3-5z" fill="${C.sakura}" opacity=".6"/>`,
      lin('a', '#24427F', '#10204A') + petalGrad,
    ),
  },
  {
    name: 'Blomgren och måne', desc: 'Körsbärsgren framför en stor, blek måne.',
    svg: svg(
      `${bg('a')}<circle cx="62" cy="40" r="27" fill="${C.cream}"/>
      <path d="M-4 86C20 74 30 60 52 56S84 48 106 28" fill="none" stroke="#3A2A33" stroke-width="3.600" stroke-linecap="round"/>
      <path d="M34 63C36 72 34 78 28 84" fill="none" stroke="#3A2A33" stroke-width="2.400" stroke-linecap="round"/>
      <path d="M70 50C74 56 82 58 90 56" fill="none" stroke="#3A2A33" stroke-width="2.200" stroke-linecap="round"/>
      ${sakura(24, 70, 0.34)}${sakura(46, 58, 0.3, 20)}${sakura(66, 52, 0.36, 40)}${sakura(86, 54, 0.3, 10)}${sakura(30, 84, 0.26, 30)}${sakura(80, 36, 0.26, 50)}`,
      lin('a', '#16224A', '#2A2F66') + petalGrad,
    ),
  },
  {
    name: 'Stora vågen', desc: 'En våg som rullar in, i indigo och skum, under en liten sol.',
    svg: svg(
      `${bg('a')}<circle cx="72" cy="26" r="11" fill="${C.verm}"/>
      <path d="M0 74C10 52 28 34 52 34C44 38 41 46 46 54C54 44 68 44 78 54C88 64 94 74 100 80V100H0Z" fill="url(#w)"/>
      <path d="M0 86C22 76 44 80 62 72C78 66 92 70 100 76V100H0Z" fill="${C.indigoD}"/>
      <circle cx="52" cy="35" r="2.600" fill="#fff"/><circle cx="58" cy="31" r="2" fill="#fff"/><circle cx="46" cy="38" r="2" fill="#fff"/><circle cx="64" cy="31" r="1.500" fill="#fff"/><circle cx="41" cy="43" r="1.700" fill="#fff"/><circle cx="36" cy="38" r="1.200" fill="#fff"/>
      <path d="M8 90Q16 86 24 90T40 90T56 90T72 90T88 90" fill="none" stroke="#fff" stroke-width="1.200" opacity=".5"/>`,
      lin('a', '#FFF1D6', '#F8DDB0') + lin('w', '#3D62B3', '#1B3470'),
    ),
  },
  {
    name: 'Koi', desc: 'Två karpar som cirklar runt varandra, orange och vit.',
    svg: svg(
      `${bg('a')}<circle cx="50" cy="50" r="38" fill="#fff"/>
      <path d="M50 12A38 38 0 0 1 50 88A19 19 0 0 1 50 50A19 19 0 0 0 50 12Z" fill="url(#o)"/>
      <circle cx="50" cy="69" r="5.500" fill="#fff"/><circle cx="50" cy="31" r="5.500" fill="#F2701F"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#fff" stroke-width="2.500" opacity=".6"/>
      <circle cx="50" cy="50" r="43.500" fill="none" stroke="#fff" stroke-width="1" opacity=".25"/>`,
      lin('a', '#1F7A8C', '#0F4458') + lin('o', '#F78A2D', '#E8541B'),
    ),
  },
  {
    name: 'Bambu', desc: 'Tre bambustammar med blad på ljusgrön botten.',
    svg: svg(
      `${bg('a')}
      ${[26, 50, 74].map((x, i) => `<rect x="${x - 6}" y="-2" width="12" height="104" rx="3" fill="url(#s)"/>${[18, 40, 62, 84].map((y) => `<rect x="${x - 7}" y="${y + (i % 2) * 6}" width="14" height="3.500" rx="1.700" fill="#2F8A45"/>`).join('')}`).join('')}
      <path d="M32 34C46 26 56 28 62 36C50 38 40 38 32 34Z" fill="#4FAE58"/><path d="M56 56C70 48 80 50 86 58C74 60 64 60 56 56Z" fill="#4FAE58"/><path d="M20 66C8 62 4 56 4 48C14 50 20 56 20 66Z" fill="#3F9A4D"/><path d="M68 22C78 14 88 14 94 20C84 24 76 26 68 22Z" fill="#3F9A4D"/>`,
      lin('a', '#EAF7D5', '#C2E59B') + lin('s', '#86D070', '#4FAE58', 0, 0, 1, 0),
    ),
  },
  {
    name: 'Månkaninen', desc: 'En kanin i silhuett på en stor måne, som i japansk folktro.',
    svg: svg(
      `${bg('a')}<circle cx="20" cy="22" r="1.200" fill="#fff"/><circle cx="80" cy="16" r="1.500" fill="#fff"/><circle cx="88" cy="40" r="1" fill="#fff"/><circle cx="12" cy="52" r="1" fill="#fff"/><circle cx="30" cy="10" r="1" fill="#fff"/>
      <circle cx="50" cy="54" r="34" fill="${C.cream}"/>
      <g fill="${C.indigo}"><ellipse cx="47" cy="66" rx="13" ry="11"/><circle cx="60" cy="53" r="8"/><ellipse cx="58" cy="37" rx="3" ry="10" transform="rotate(-12 58 37)"/><ellipse cx="65" cy="38" rx="3" ry="10" transform="rotate(10 65 38)"/><circle cx="34" cy="70" r="4"/><rect x="38" y="74" width="22" height="3.500" rx="1.700"/></g>
      <circle cx="63" cy="52" r="1.300" fill="${C.cream}"/>`,
      lin('a', '#1E3A78', '#0D1B42'),
    ),
  },
  {
    name: 'Lönnlöv', desc: 'Ett rött lönnlöv (momiji) mot varm kräm.',
    svg: svg(
      `${bg('a')}<g transform="translate(50 52)">
      <path d="M0-38L6-24L16-30L14-14L30-16L22-4L36 4L22 8L26 22L10 18L8 34L2 30L2 40L-2 40L-2 30L-8 34L-10 18L-26 22L-22 8L-36 4L-22-4L-30-16L-14-14L-16-30L-6-24Z" fill="url(#l)"/>
      <g stroke="#FFB38F" stroke-width="1.100" stroke-linecap="round" opacity=".8" fill="none"><path d="M0 36V-26"/><path d="M0 18L-20 8M0 18L20 8M0 6L-22-8M0 6L22-8M0-8L-10-22M0-8L10-22"/></g></g>`,
      lin('a', '#FFF4DD', '#F8E2BC') + lin('l', '#F4713F', '#C0301C'),
    ),
  },
  {
    name: 'Plommonblom', desc: 'Ume, plommonblomman, på mörk petrolblå botten.',
    svg: svg(
      `${bg('a')}<path d="M-4 84C14 72 24 62 34 54S60 46 76 30S92 12 104 10" fill="none" stroke="#2A1F26" stroke-width="3.600" stroke-linecap="round"/>
      ${ume(52, 48, 1.1)}${ume(20, 74, 0.5)}${ume(80, 26, 0.55)}${ume(84, 70, 0.4)}`,
      lin('a', '#256C7F', '#123E52'),
    ),
  },
  {
    name: 'Soluppgång', desc: 'Solen går upp över havet, mjuk färgskala och strålar.',
    svg: svg(
      `${bg('a')}${Array.from({ length: 9 }, (_, i) => rot(-80 + i * 20, 50, 62, '<rect x="48.500" y="8" width="3" height="16" rx="1.500" fill="#fff" opacity=".6"/>')).join('')}
      <path d="M26 62A24 24 0 0 1 74 62Z" fill="${C.cream}"/>
      <rect y="62" width="100" height="38" fill="url(#s)"/>
      <rect x="30" y="68" width="40" height="2.500" rx="1.200" fill="${C.cream}" opacity=".7"/><rect x="36" y="74" width="28" height="2.500" rx="1.200" fill="${C.cream}" opacity=".5"/><rect x="42" y="80" width="16" height="2.500" rx="1.200" fill="${C.cream}" opacity=".35"/>`,
      lin('a', '#E9577F', '#FFB27A') + lin('s', '#3D5BA9', '#1E3270'),
    ),
  },
]
