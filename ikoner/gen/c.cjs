// C. Föremål och kultur.
const { glyph, C, svg, lin, rad, bg, rot, pts, arcPt } = require('./lib.cjs')

module.exports = [
  {
    name: 'Torii', desc: 'Ett rött torii framför en bleknad måne.',
    svg: svg(
      `${bg('a')}<circle cx="50" cy="46" r="30" fill="${C.cream}" opacity=".95"/>
      <rect x="25" y="38" width="9" height="50" fill="url(#t)"/><rect x="66" y="38" width="9" height="50" fill="url(#t)"/>
      <rect x="19" y="44" width="62" height="7" fill="url(#t)"/>
      <path d="M6 30C26 37 74 37 94 30L99 21C76 31 24 31 1 21Z" fill="url(#t)"/><rect x="12" y="31" width="76" height="6" fill="#2A2330"/>
      <rect x="43.500" y="36" width="13" height="9" fill="#2A2330"/><rect x="21" y="86" width="17" height="5" rx="1" fill="#2A2330"/><rect x="62" y="86" width="17" height="5" rx="1" fill="#2A2330"/>`,
      lin('a', '#2D3E7A', '#18224A') + lin('t', '#F0553A', '#C93019', 0, 0, 1, 0),
    ),
  },
  {
    name: 'Lykta', desc: 'En röd papperslykta (chōchin) med 日, glöder mot natten.',
    svg: svg(
      `${bg('a')}<circle cx="50" cy="52" r="38" fill="url(#g)"/>
      <rect x="47" y="8" width="6" height="12" fill="#2A2330"/>
      <rect x="34" y="18" width="32" height="8" rx="2" fill="#2A2330"/><rect x="34" y="78" width="32" height="8" rx="2" fill="#2A2330"/>
      <ellipse cx="50" cy="52" rx="28" ry="30" fill="url(#r)"/>
      <g stroke="#8E1F10" stroke-width="1.200" fill="none" opacity=".55"><path d="M24 40Q50 46 76 40M23 52H77M24 64Q50 58 76 64"/></g>
      ${glyph('serif', '日', 50, 52, 20, 24, '#FFF3D6')}
      <path d="M50 86V96" stroke="#2A2330" stroke-width="2"/><rect x="46" y="93" width="8" height="5" rx="1" fill="${C.gold}"/>`,
      lin('a', '#25306A', '#121A44') + rad('g', 'rgba(255,190,90,.55)', 'rgba(255,190,90,0)', 0.5, 0.5, 0.5) + lin('r', '#F7694A', '#C7311B', 0, 0, 1, 0),
    ),
  },
  {
    name: 'Solfjäder', desc: 'En uppvikt solfjäder (sensu) med körsbärsblom.',
    svg: svg(
      `${bg('a')}<g transform="translate(50 88)">${Array.from({ length: 7 }, (_, i) => {
        const a0 = -162 + i * 20.571
        const a1 = a0 + 20.571
        const p = (r, a) => arcPt(0, 0, r, a).map((v) => v.toFixed(1)).join(' ')
        return `<path d="M0 0L${p(46, a0)}A46 46 0 0 1 ${p(46, a1)}Z" fill="${i % 2 ? '#F7BDCB' : '#FFF1F4'}"/>`
      }).join('')}
      ${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="0" x2="${arcPt(0, 0, 46, -162 + i * 20.571).map((v) => v.toFixed(1)).join('" y2="')}" stroke="#C2321C" stroke-width="1.100" opacity=".55"/>`).join('')}
      <path d="M${arcPt(0, 0, 46, -162).map((v) => v.toFixed(1)).join(' ')}A46 46 0 0 1 ${arcPt(0, 0, 46, -18).map((v) => v.toFixed(1)).join(' ')}" fill="none" stroke="#C2321C" stroke-width="3" stroke-linecap="round"/>
      <circle cx="0" cy="-28" r="5.500" fill="${C.verm}"/><circle cx="-17" cy="-19" r="3.300" fill="${C.verm}" opacity=".85"/><circle cx="17" cy="-19" r="3.300" fill="${C.verm}" opacity=".85"/>
      <circle cx="0" cy="0" r="5" fill="#3A2A33"/></g>`,
      lin('a', '#FFD9C7', '#F9B7AB'),
    ),
  },
  {
    name: 'Origamitrana', desc: 'En vikt papperstrana i vitt mot indigo.',
    svg: svg(
      `${bg('a')}
      <path d="M38 58L6 44L32 66Z" fill="#B9C8E6"/>
      <path d="M52 50L76 60L84 18Z" fill="#CBD7EE"/>
      <path d="M36 62L54 50L76 62L56 78Z" fill="#E9EFFA"/>
      <path d="M44 56L68 62L26 14Z" fill="#fff"/><path d="M44 56L56 59L36 34Z" fill="#E3EAF7"/>
      <path d="M70 60L80 58L94 32L88 30Z" fill="#F4F7FD"/><path d="M88 30L99 28L95 37Z" fill="#fff"/><circle cx="93" cy="31.500" r="1.700" fill="${C.verm}"/>`,
      lin('a', '#2D4C9E', '#162B60'),
    ),
  },
  {
    name: 'Daruma', desc: 'Daruma-dockan, en röd lyckobringare med guldtecknet 福.',
    svg: svg(
      `${bg('a')}
      <path d="M50 12C74 12 86 32 86 54C86 76 72 90 50 90S14 76 14 54C14 32 26 12 50 12Z" fill="url(#r)"/>
      <ellipse cx="50" cy="40" rx="25" ry="17" fill="#FFF3E2"/>
      <path d="M26 22Q33 16 41 24M74 22Q67 16 59 24" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="40" cy="40" r="6" fill="#fff" stroke="${C.ink}" stroke-width="1.500"/><circle cx="60" cy="40" r="6" fill="${C.ink}"/><circle cx="62" cy="38" r="1.700" fill="#fff"/>
      <path d="M32 50Q40 56 50 49Q60 56 68 50" fill="none" stroke="${C.ink}" stroke-width="2.200" stroke-linecap="round"/>
      ${glyph('serif', '福', 50, 72, 20, 20, C.goldL)}`,
      lin('a', '#FFE49A', '#F5B52E') + rad('r', '#F7694A', '#BF2C18', 0.4, 0.3, 0.8),
    ),
  },
  {
    name: 'Lyckokatt', desc: 'Maneki-neko med lyft tass, röd krage och guldklocka.',
    svg: svg(
      `${bg('a')}
      <path d="M26 40L22 14L44 28Z" fill="#fff"/><path d="M74 40L78 14L56 28Z" fill="#fff"/><path d="M28 34L26 20L38 28Z" fill="${C.sakura}"/><path d="M72 34L74 20L62 28Z" fill="${C.sakura}"/>
      <ellipse cx="50" cy="54" rx="34" ry="28" fill="#fff"/>
      <path d="M36 50Q40 45 44 50M56 50Q60 45 64 50" fill="none" stroke="${C.ink}" stroke-width="2.500" stroke-linecap="round"/>
      <path d="M47 57L53 57L50 61Z" fill="#F08BA6"/><path d="M50 61Q46 66 42 63M50 61Q54 66 58 63" fill="none" stroke="${C.ink}" stroke-width="1.800" stroke-linecap="round"/>
      <path d="M22 56L8 56M23 61L10 64M78 56L92 56M77 61L90 64" stroke="#C9CED8" stroke-width="1.500" stroke-linecap="round"/>
      <path d="M22 72Q50 90 78 72L78 80Q50 98 22 80Z" fill="${C.verm}"/><circle cx="50" cy="86" r="6" fill="${C.gold}"/><path d="M47 86H53" stroke="#B5801A" stroke-width="1.200"/>
      <rect x="62" y="10" width="14" height="20" rx="7" fill="#fff" transform="rotate(14 69 20)" display="none"/>`,
      lin('a', '#7FC6EC', '#3F94D6'),
    ),
  },
  {
    name: 'Sigill', desc: 'Ett rött sigill (hanko) med 語 i en stämpel på papper.',
    svg: svg(
      `${bg('a')}<rect x="20" y="20" width="60" height="60" rx="6" fill="url(#r)" transform="rotate(-3 50 50)"/>
      <rect x="25" y="25" width="50" height="50" rx="3" fill="none" stroke="#FFE9DD" stroke-width="1.600" opacity=".7" transform="rotate(-3 50 50)"/>
      ${glyph('serif', '語', 50, 50, 38, 40, '#FFF3E6', 'transform="rotate(-3 50 50)"')}`,
      lin('a', '#FBF3E0', '#EDDDBA') + lin('r', '#EE5033', '#C42E19'),
    ),
  },
  {
    name: 'Parasoll', desc: 'Ett japanskt parasoll (wagasa) sett uppifrån, i rött och kräm.',
    svg: svg(
      `${bg('a')}${Array.from({ length: 12 }, (_, i) => {
        const a0 = i * 30 - 90
        const a1 = a0 + 30
        const p = (r, a) => arcPt(50, 50, r, a).map((v) => v.toFixed(1)).join(' ')
        return `<path d="M50 50L${p(40, a0)}A40 40 0 0 1 ${p(40, a1)}Z" fill="${i % 2 ? '#FFF1DC' : '#E8452C'}"/>`
      }).join('')}
      ${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="50" x2="${arcPt(50, 50, 40, i * 30 - 90).map((v) => v.toFixed(1)).join('" y2="')}" stroke="#7A2A18" stroke-width="0.7" opacity=".5"/>`).join('')}
      <circle cx="50" cy="50" r="40" fill="none" stroke="#7A2A18" stroke-width="1.800"/><circle cx="50" cy="50" r="6" fill="#2A2330"/><circle cx="50" cy="50" r="2" fill="${C.gold}"/>`,
      lin('a', '#2D4C9E', '#162B60'),
    ),
  },
  {
    name: 'Vindklocka', desc: 'En glasklocka (fūrin) med en pappersremsa, sommarsvalka.',
    svg: svg(
      `${bg('a')}<path d="M50 4V20" stroke="#3A2A33" stroke-width="2" stroke-linecap="round"/>
      <path d="M22 54C22 34 34 22 50 22S78 34 78 54Z" fill="url(#g)"/><path d="M18 54H82" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
      <path d="M34 36C37 30 42 27 48 26" fill="none" stroke="#fff" stroke-width="2.500" stroke-linecap="round" opacity=".7"/>
      <path d="M40 46c4-4 10-4 14 0c-4 4-10 4-14 0z" fill="${C.verm}"/><path d="M54 46l6-4v8z" fill="${C.verm}"/>
      <path d="M50 54V68" stroke="#3A2A33" stroke-width="1.600"/><circle cx="50" cy="68" r="3" fill="#B8C4D8"/>
      <path d="M44 70H56V94Q50 90 44 94Z" fill="${C.sakura}" stroke="${C.sakuraD}" stroke-width="1"/>`,
      lin('a', '#A8DCF6', '#E3F5FD') + lin('g', '#7ECBEA', '#3F9ED6'),
    ),
  },
  {
    name: 'Matcha', desc: 'En skål matcha med skum och ånga.',
    svg: svg(
      `${bg('a')}<path d="M38 28c-6-6 6-8 0-16M52 30c-6-6 6-8 0-18M66 28c-6-6 6-8 0-16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M12 46H88C88 70 72 86 50 86S12 70 12 46Z" fill="url(#b)"/>
      <ellipse cx="50" cy="46" rx="38" ry="9" fill="#2F7A3A"/><ellipse cx="50" cy="45" rx="33" ry="6.500" fill="#8CCB5E"/>
      <ellipse cx="42" cy="44" rx="4" ry="1.600" fill="#C6E8A0"/><ellipse cx="56" cy="46" rx="5" ry="1.800" fill="#C6E8A0"/>
      <path d="M30 58Q50 66 70 58" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".5"/>
      <rect x="36" y="84" width="28" height="6" rx="3" fill="#1B2E66"/>`,
      lin('a', '#D6EFB8', '#9ED47A') + lin('b', '#2E4C99', '#17295E'),
    ),
  },
]
