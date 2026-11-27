// D. Figurer och mat: små, vänliga motiv.
const { glyph, C, svg, lin, rad, bg, rot, pts, arcPt } = require('./lib.cjs')

module.exports = [
  {
    name: 'Shiba', desc: 'En shiba inu med leende och röd halsduk.',
    svg: svg(
      `${bg('a')}
      <path d="M16 46L14 14L40 28Z" fill="#E59A45"/><path d="M84 46L86 14L60 28Z" fill="#E59A45"/><path d="M20 38L19 21L34 30Z" fill="#F8D2A8"/><path d="M80 38L81 21L66 30Z" fill="#F8D2A8"/>
      <path d="M50 24C74 24 88 38 88 56C88 76 72 88 50 88S12 76 12 56C12 38 26 24 50 24Z" fill="#E59A45"/>
      <path d="M50 46C60 46 70 54 74 64C74 78 64 86 50 86S26 78 26 64C30 54 40 46 50 46Z" fill="#FFF3E2"/>
      <path d="M50 30C54 36 56 42 50 48C44 42 46 36 50 30Z" fill="#FFF3E2"/>
      <circle cx="36" cy="52" r="4.500" fill="${C.ink}"/><circle cx="64" cy="52" r="4.500" fill="${C.ink}"/><circle cx="37.500" cy="50.500" r="1.400" fill="#fff"/><circle cx="65.500" cy="50.500" r="1.400" fill="#fff"/>
      <path d="M32 44Q36 41 40 44M60 44Q64 41 68 44" fill="none" stroke="#FFF3E2" stroke-width="2" stroke-linecap="round" opacity="0"/>
      <ellipse cx="50" cy="63" rx="6" ry="4.500" fill="${C.ink}"/><path d="M50 67V71M50 71Q44 76 40 71M50 71Q56 76 60 71" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>
      <path d="M46 74Q50 84 54 74Z" fill="#F07A8E"/>`,
      lin('a', '#BFE6F7', '#7DC3EC'),
    ),
  },
  {
    name: 'Kitsune', desc: 'En räv (kitsune) med röda ansiktsmarkeringar på indigo.',
    svg: svg(
      `${bg('a')}
      <path d="M50 88L12 52L10 12L36 30Q50 26 64 30L90 12L88 52Z" fill="url(#f)"/>
      <path d="M50 88L22 60Q34 52 50 60Q66 52 78 60Z" fill="#fff"/><path d="M12 52L26 62L14 58Z" fill="#fff"/><path d="M88 52L74 62L86 58Z" fill="#fff"/>
      <path d="M16 18L18 38L30 32Z" fill="#2A2330"/><path d="M84 18L82 38L70 32Z" fill="#2A2330"/>
      <path d="M26 46Q34 42 42 50" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/><path d="M74 46Q66 42 58 50" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 52L44 54M70 52L56 54" stroke="${C.verm}" stroke-width="2.600" stroke-linecap="round"/><path d="M44 36Q50 30 56 36" fill="none" stroke="${C.verm}" stroke-width="2.600" stroke-linecap="round"/>
      <ellipse cx="50" cy="70" rx="5" ry="3.600" fill="${C.ink}"/>`,
      lin('a', '#2D4C9E', '#162B60') + lin('f', '#F79A3E', '#E8651B'),
    ),
  },
  {
    name: 'Svart katt', desc: 'En svart katt med gula ögon på rosa, och ett kronblad på huvudet.',
    svg: svg(
      `${bg('a')}
      <path d="M18 50L14 12L42 30Z" fill="#23232C"/><path d="M82 50L86 12L58 30Z" fill="#23232C"/><path d="M22 40L20 22L34 31Z" fill="${C.sakuraD}"/><path d="M78 40L80 22L66 31Z" fill="${C.sakuraD}"/>
      <ellipse cx="50" cy="58" rx="36" ry="30" fill="#2B2B35"/>
      <ellipse cx="36" cy="52" rx="8.500" ry="9.500" fill="${C.goldL}"/><ellipse cx="64" cy="52" rx="8.500" ry="9.500" fill="${C.goldL}"/>
      <ellipse cx="36" cy="52" rx="2.800" ry="7" fill="${C.ink}"/><ellipse cx="64" cy="52" rx="2.800" ry="7" fill="${C.ink}"/>
      <circle cx="39" cy="48" r="1.800" fill="#fff"/><circle cx="67" cy="48" r="1.800" fill="#fff"/>
      <path d="M46 64L54 64L50 69Z" fill="${C.sakuraD}"/><path d="M50 69Q45 75 40 71M50 69Q55 75 60 71" fill="none" stroke="#C9CED8" stroke-width="1.800" stroke-linecap="round"/>
      <path d="M20 62L4 58M20 68L6 72M80 62L96 58M80 68L94 72" stroke="#C9CED8" stroke-width="1.400" stroke-linecap="round"/>
      <path d="M46 28c3-4 9-4 12 0c-3 4-9 4-12 0z" fill="${C.sakura}"/>`,
      lin('a', '#FBD0DC', '#F2A2BA'),
    ),
  },
  {
    name: 'Sparv', desc: 'En liten sparv (suzume) på en gren med körsbärsblom.',
    svg: svg(
      `${bg('a')}
      <path d="M-4 74C20 70 40 74 60 72S92 66 104 70" fill="none" stroke="#5A3A2C" stroke-width="4" stroke-linecap="round"/>
      <path d="M30 60L8 72L32 70Z" fill="#8F5A30"/>
      <ellipse cx="52" cy="52" rx="28" ry="23" fill="#B97A3E"/><ellipse cx="56" cy="60" rx="20" ry="14" fill="#FFF0DC"/>
      <path d="M40 48C52 38 70 40 76 52C66 50 50 52 40 48Z" fill="#8F5A30"/>
      <circle cx="68" cy="40" r="15" fill="#B97A3E"/><circle cx="73" cy="44" r="6.500" fill="#FFF0DC"/><path d="M62 46A7 7 0 0 0 69 52L64 54Z" fill="${C.ink}"/>
      <path d="M62 36A7 7 0 0 1 72 34" fill="none" stroke="#8F5A30" stroke-width="0"/>
      <circle cx="67" cy="38" r="2.300" fill="${C.ink}"/><circle cx="67.800" cy="37.200" r="0.8" fill="#fff"/>
      <path d="M79 40L90 44L79 47Z" fill="${C.orange}"/>
      <path d="M50 74V82M58 74V82" stroke="#E5875A" stroke-width="2" stroke-linecap="round"/>
      <circle cx="20" cy="26" r="5" fill="${C.sakura}"/><circle cx="84" cy="22" r="4" fill="${C.sakura}"/><circle cx="90" cy="82" r="4.500" fill="${C.sakura}"/><circle cx="14" cy="84" r="3.500" fill="${C.sakura}"/>`,
      lin('a', '#A9DDF6', '#DDF1FB'),
    ),
  },
  {
    name: 'Ramen', desc: 'En skål ramen med ägg, kryddor och pinnar.',
    svg: svg(
      `${bg('a')}
      <path d="M40 24c-5-5 5-7 0-14M54 26c-5-5 5-7 0-16M68 24c-5-5 5-7 0-14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <path d="M70 6L96 56" stroke="#E8C27A" stroke-width="3.200" stroke-linecap="round"/><path d="M78 4L100 50" stroke="#D9AD5E" stroke-width="3.200" stroke-linecap="round"/>
      <path d="M10 50H90C90 74 74 90 50 90S10 74 10 50Z" fill="url(#b)"/>
      <ellipse cx="50" cy="50" rx="40" ry="10" fill="#F3C969"/>
      <path d="M16 50Q24 44 32 50T48 50T64 50T80 50" fill="none" stroke="#E4A93C" stroke-width="2.600" stroke-linecap="round"/><path d="M20 55Q28 50 36 55T52 55T68 55T84 53" fill="none" stroke="#E4A93C" stroke-width="2.600" stroke-linecap="round"/>
      <ellipse cx="34" cy="48" rx="10" ry="6.500" fill="#fff"/><ellipse cx="34" cy="48" rx="4.500" ry="3.500" fill="#F5A623"/>
      <circle cx="58" cy="47" r="7" fill="#fff"/><path d="M58 47m-3 0a3 3 0 0 1 6 0a1.500 1.500 0 0 1-3 0a1.500 1.500 0 0 0-3 0" fill="#F08BA6"/>
      <rect x="66" y="40" width="10" height="13" rx="1.500" fill="#23352B"/>
      <circle cx="46" cy="55" r="1.800" fill="#5CB85C"/><circle cx="50" cy="53" r="1.800" fill="#5CB85C"/><circle cx="54" cy="56" r="1.800" fill="#5CB85C"/><circle cx="42" cy="52" r="1.600" fill="#5CB85C"/>
      <path d="M18 66H82" stroke="#fff" stroke-width="2" opacity=".35"/><path d="M24 74H76" stroke="#fff" stroke-width="2" opacity=".25"/>
      <rect x="34" y="88" width="32" height="5" rx="2.500" fill="#14264F"/>`,
      lin('a', '#F2593B', '#C93019') + lin('b', '#2E4C99', '#17295E'),
    ),
  },
  {
    name: 'Onigiri', desc: 'Ett leende risbollar (onigiri) med nori.',
    svg: svg(
      `${bg('a')}
      <path d="M50 10C56 10 60 13 63 18L88 66C92 74 86 86 76 86H24C14 86 8 74 12 66L37 18C40 13 44 10 50 10Z" fill="#fff"/>
      <path d="M30 60H70L80 80C82 84 80 86 76 86H24C20 86 18 84 20 80Z" fill="#23352B"/><path d="M30 60H70" stroke="#2F4A3A" stroke-width="1.500"/>
      <circle cx="39" cy="44" r="3.200" fill="${C.ink}"/><circle cx="61" cy="44" r="3.200" fill="${C.ink}"/><circle cx="40" cy="43" r="1" fill="#fff"/><circle cx="62" cy="43" r="1" fill="#fff"/>
      <path d="M45 50Q50 55 55 50" fill="none" stroke="${C.ink}" stroke-width="2.200" stroke-linecap="round"/>
      <ellipse cx="32" cy="50" rx="4.500" ry="2.800" fill="${C.sakura}"/><ellipse cx="68" cy="50" rx="4.500" ry="2.800" fill="${C.sakura}"/>
      <path d="M44 20C48 16 54 18 54 22" fill="none" stroke="#E6EAF2" stroke-width="2.500" stroke-linecap="round"/>`,
      lin('a', '#F9C4D2', '#F29DB6'),
    ),
  },
  {
    name: 'Sushi', desc: 'En nigiri med lax på petrolgrön botten.',
    svg: svg(
      `${bg('a')}
      <rect x="14" y="48" width="72" height="30" rx="15" fill="#fff"/><path d="M14 63H86" stroke="#E4E9F2" stroke-width="1" opacity="0"/>
      <path d="M10 46C10 32 28 26 50 26S90 32 90 46C90 54 82 58 74 56C62 62 38 62 26 56C18 58 10 54 10 46Z" fill="url(#s)"/>
      <path d="M24 38Q34 34 44 38M48 34Q58 30 70 34M30 46Q40 42 52 46M58 44Q68 40 78 44" fill="none" stroke="#FFE2D2" stroke-width="2.800" stroke-linecap="round" opacity=".85"/>
      <rect x="42" y="30" width="16" height="50" rx="2" fill="#23352B"/>`,
      lin('a', '#35B3A3', '#1A7C70') + lin('s', '#FF9A6B', '#F2603B'),
    ),
  },
  {
    name: 'Dango', desc: 'Tre dango på spett: rosa, vit och grön.',
    svg: svg(
      `${bg('a')}
      <g transform="rotate(-38 50 50)"><rect x="46.500" y="2" width="7" height="96" rx="3.500" fill="#D9B27A"/>
      <circle cx="50" cy="26" r="15" fill="url(#p)"/><circle cx="50" cy="50" r="15" fill="#fff"/><circle cx="50" cy="74" r="15" fill="url(#g)"/>
      <ellipse cx="44" cy="20" rx="4.500" ry="3" fill="#fff" opacity=".45"/><ellipse cx="44" cy="68" rx="4.500" ry="3" fill="#fff" opacity=".35"/></g>`,
      lin('a', '#FFF0C2', '#FFD77A') + lin('p', '#F7A8BE', '#EE7D9C') + lin('g', '#A5D86C', '#6FB44A'),
    ),
  },
  {
    name: 'Kokeshi', desc: 'En kokeshi-docka med svart lugg och röd kimono.',
    svg: svg(
      `${bg('a')}
      <path d="M34 62H66L72 92H28Z" fill="url(#k)"/><rect x="31" y="66" width="38" height="9" rx="2" fill="${C.gold}"/>
      <circle cx="42" cy="84" r="2.200" fill="#fff" opacity=".85"/><circle cx="56" cy="87" r="2.200" fill="#fff" opacity=".85"/><circle cx="62" cy="80" r="2" fill="#fff" opacity=".85"/><circle cx="36" cy="79" r="1.800" fill="#fff" opacity=".85"/>
      <circle cx="50" cy="38" r="27" fill="#2A2330"/><circle cx="50" cy="42" r="21" fill="#FFE9D2"/>
      <path d="M26 38C28 22 42 18 50 18S72 22 74 38C66 32 56 30 50 30S34 32 26 38Z" fill="#2A2330"/>
      <circle cx="42" cy="46" r="1.800" fill="${C.ink}"/><circle cx="58" cy="46" r="1.800" fill="${C.ink}"/><path d="M47 54Q50 56 53 54" fill="none" stroke="${C.verm}" stroke-width="1.800" stroke-linecap="round"/>
      <ellipse cx="38" cy="51" rx="3.200" ry="2" fill="${C.sakura}"/><ellipse cx="62" cy="51" rx="3.200" ry="2" fill="${C.sakura}"/>
      <circle cx="68" cy="26" r="5.500" fill="${C.verm}"/><circle cx="68" cy="26" r="2" fill="${C.goldL}"/>`,
      lin('a', '#BFE6D8', '#7DC9B4') + lin('k', '#F2593B', '#C2321C'),
    ),
  },
  {
    name: 'Taiyaki', desc: 'En taiyaki, fiskformad kaka, gyllene och rund.',
    svg: svg(
      `${bg('a')}
      <g transform="rotate(-18 50 50)">
      <path d="M8 48C8 30 28 22 50 22C66 22 76 30 82 40L96 28C98 40 98 58 96 70L82 58C76 68 66 76 50 76C28 76 8 66 8 48Z" fill="url(#t)"/>
      <path d="M82 40L96 28C98 40 98 58 96 70L82 58Z" fill="#C9772B"/>
      <g fill="none" stroke="#B5651E" stroke-width="1.700" stroke-linecap="round" opacity=".7"><path d="M40 34Q46 48 40 62M52 32Q58 48 52 64M64 34Q69 48 64 62"/></g>
      <path d="M24 40Q22 48 24 56" fill="none" stroke="#B5651E" stroke-width="1.700" stroke-linecap="round" opacity=".7"/>
      <circle cx="22" cy="42" r="4" fill="${C.ink}"/><circle cx="23.200" cy="40.800" r="1.200" fill="#fff"/>
      <path d="M12 56Q16 60 22 58" fill="none" stroke="#B5651E" stroke-width="2" stroke-linecap="round"/></g>`,
      lin('a', '#FBE3B6', '#F5C478') + lin('t', '#F2A944', '#DD7F25'),
    ),
  },
]
