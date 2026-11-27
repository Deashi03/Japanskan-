// E. Märken: former och symboler som hör ihop med att lära sig och prata.
const { glyph, C, svg, lin, rad, bg, rot, pts, arcPt } = require('./lib.cjs')

const bubble = (x, y, w, h, tailX, tailY, fill) => {
  const r = Math.min(w, h) / 2.4
  return `<path d="M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${tailX + 12}L${tailX} ${tailY}L${tailX - 2} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z" fill="${fill}"/>`
}

module.exports = [
  {
    name: 'Ensō', desc: 'En penselcirkel (ensō) i bläck med ett rött あ i mitten.',
    svg: svg(
      `${bg('a')}
      <path d="M50 12C71 12 88 29 88 50C88 71 71 88 50 88C29 88 12 71 12 50C12 38 17 28 25 21" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
      <path d="M12 50C12 71 29 88 50 88" fill="none" stroke="${C.ink}" stroke-width="12" stroke-linecap="round" opacity=".9"/>
      <path d="M26 20C32 15 41 12 50 12" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      ${glyph('brush', 'あ', 50, 52, 30, 34, C.verm)}`,
      lin('a', '#FBF3E0', '#EEDFBE'),
    ),
  },
  {
    name: 'Två bubblor', desc: 'あ och A i två pratbubblor: att växla mellan språk.',
    svg: svg(
      `${bg('a')}
      ${bubble(10, 12, 54, 40, 24, 66, '#fff')}${bubble(36, 46, 54, 40, 76, 94, C.verm)}
      ${glyph('maru', 'あ', 37, 32, 22, 24, C.indigo)}${glyph('maru', 'A', 63, 66, 20, 22, '#fff')}`,
      lin('a', '#2F52A5', '#15295A'),
    ),
  },
  {
    name: 'Ljudvåg', desc: 'あ med ljudvågor åt båda håll: lyssna och tala.',
    svg: svg(
      `${bg('a')}
      <circle cx="50" cy="50" r="22" fill="#fff"/>
      ${[1, 2, 3].map((i) => `<path d="M${50 - 24 - i * 7} ${50 - 7 - i * 4}Q${50 - 24 - i * 7 - 4} 50 ${50 - 24 - i * 7} ${50 + 7 + i * 4}" fill="none" stroke="#fff" stroke-width="3.500" stroke-linecap="round" opacity="${1 - i * 0.2}"/><path d="M${50 + 24 + i * 7} ${50 - 7 - i * 4}Q${50 + 24 + i * 7 + 4} 50 ${50 + 24 + i * 7} ${50 + 7 + i * 4}" fill="none" stroke="#fff" stroke-width="3.500" stroke-linecap="round" opacity="${1 - i * 0.2}"/>`).join('')}
      ${glyph('maru', 'あ', 50, 51, 26, 28, '#5B3FB0')}`,
      lin('a', '#7E6FC8', '#3B2A8C'),
    ),
  },
  {
    name: 'Hörlurar', desc: 'Guldiga hörlurar runt ett 日 på indigo.',
    svg: svg(
      `${bg('a')}
      <path d="M20 62V52C20 30 33 18 50 18S80 30 80 52V62" fill="none" stroke="${C.gold}" stroke-width="7" stroke-linecap="round"/>
      <rect x="14" y="56" width="16" height="26" rx="8" fill="${C.goldL}"/><rect x="70" y="56" width="16" height="26" rx="8" fill="${C.goldL}"/>
      <rect x="18" y="62" width="8" height="14" rx="4" fill="#C98A14"/><rect x="74" y="62" width="8" height="14" rx="4" fill="#C98A14"/>
      ${glyph('serif', '日', 50, 56, 24, 30, '#fff')}`,
      lin('a', '#2B4B9C', '#14285A'),
    ),
  },
  {
    name: 'Seigaiha', desc: 'Det klassiska vågmönstret seigaiha med en röd sol och 日.',
    svg: svg(
      `${bg('a')}
      ${Array.from({ length: 9 }, (_, row) => Array.from({ length: 7 }, (_, col) => {
        const cx = col * 20 + (row % 2 ? 0 : 10) - 0
        const cy = row * 10 + 6
        return [18, 13, 8, 3.500].map((r, k) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${k % 2 ? '#3D62B3' : '#1B3470'}" stroke="#7FA3E6" stroke-width=".7" opacity="${0.95}"/>`).join('')
      }).join('')).join('')}
      <circle cx="50" cy="50" r="27" fill="url(#r)"/>${glyph('serif', '日', 50, 51, 22, 26, '#fff')}`,
      lin('a', '#2D4C9E', '#162B60') + lin('r', '#F2593B', '#C93019'),
    ),
  },
  {
    name: 'Kikkō', desc: 'Ett sköldpaddsmönster av sexhörningar med あ i en kräm medaljong.',
    svg: svg(
      `${bg('a')}
      ${(() => {
        const s = 11
        let o = ''
        for (let row = -1; row < 9; row++) {
          for (let col = -1; col < 8; col++) {
            const cx = col * s * 1.732 + (row % 2 ? s * 0.866 : 0)
            const cy = row * s * 1.5
            o += `<path d="${[0, 1, 2, 3, 4, 5].map((i) => `${i ? 'L' : 'M'}${arcPt(cx, cy, s * 0.92, 60 * i - 30).map((v) => v.toFixed(1)).join(' ')}`).join('')}Z" fill="none" stroke="#7BD0C0" stroke-width="1.100" opacity=".55"/>`
          }
        }
        return o
      })()}
      <circle cx="50" cy="50" r="30" fill="${C.cream}"/><circle cx="50" cy="50" r="30" fill="none" stroke="${C.gold}" stroke-width="2.500"/>
      ${glyph('maru', 'あ', 50, 52, 30, 32, '#1A7C70')}`,
      lin('a', '#1F8F80', '#0F5A52'),
    ),
  },
  {
    name: 'Horisont', desc: 'En ren sol över horisonten i skymningsfärger, modern och lugn.',
    svg: svg(
      `${bg('a')}<circle cx="50" cy="56" r="24" fill="url(#s)"/><rect y="56" width="100" height="44" fill="url(#w)"/>
      <rect x="22" y="62" width="56" height="3" rx="1.500" fill="#FFD9B8" opacity=".8"/><rect x="30" y="69" width="40" height="3" rx="1.500" fill="#FFD9B8" opacity=".6"/><rect x="38" y="76" width="24" height="3" rx="1.500" fill="#FFD9B8" opacity=".4"/>`,
      lin('a', '#3A3F9A', '#F27B7B', 0, 0, 0, 1) + lin('s', '#FFF1C8', '#FFB07A') + lin('w', '#2A2F7E', '#4B3F96'),
    ),
  },
  {
    name: 'Bok', desc: 'En uppslagen bok med あ och ett kronblad som svävar förbi.',
    svg: svg(
      `${bg('a')}
      <path d="M50 28C38 22 22 22 12 26V76C22 72 38 72 50 78Z" fill="#fff"/><path d="M50 28C62 22 78 22 88 26V76C78 72 62 72 50 78Z" fill="#F2F4FA"/>
      <path d="M8 30V80C20 76 36 76 50 82C64 76 80 76 92 80V30" fill="none" stroke="${C.indigoD}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M50 28V82" stroke="#C9D0E4" stroke-width="2"/>
      ${glyph('maru', 'あ', 31, 50, 20, 22, C.indigo)}
      <path d="M62 40H78M62 48H74M62 56H78M62 64H70" stroke="#C9D0E4" stroke-width="2.500" stroke-linecap="round"/>
      <path d="M72 10c6-2 12 2 12 8c-6 2-12-2-12-8z" fill="${C.sakuraD}"/>`,
      lin('a', '#FBD0DC', '#F29DB6'),
    ),
  },
  {
    name: 'Pensel och sol', desc: 'Ett svart penseldrag över en röd sol på nattblått.',
    svg: svg(
      `${bg('a')}<circle cx="58" cy="44" r="27" fill="url(#r)"/>
      <path d="M6 58C26 46 50 64 72 54C82 50 90 52 97 44L98 52C92 62 82 70 66 70C46 80 24 68 8 74C5 70 4 64 6 58Z" fill="${C.cream}"/>
      <path d="M90 50l6-3M86 60l8-1M80 66l9 2" stroke="${C.cream}" stroke-width="1.300" stroke-linecap="round" opacity=".7"/>`,
      lin('a', '#1D3470', '#0F1E44') + lin('r', '#F2593B', '#C93019'),
    ),
  },
  {
    name: 'Handpan', desc: 'En handpan, som i ljudet du valde, med glödande guldfält på mörkt stål.',
    svg: svg(
      `${bg('a')}
      <circle cx="50" cy="52" r="43" fill="url(#g)"/>
      <circle cx="50" cy="52" r="38" fill="url(#m)"/><circle cx="50" cy="52" r="38" fill="none" stroke="#8D99BC" stroke-width="1.400"/><circle cx="50" cy="52" r="33" fill="none" stroke="#1E2547" stroke-width="1" opacity=".6"/>
      ${Array.from({ length: 7 }, (_, i) => {
        const [x, y] = arcPt(50, 52, 25, i * (360 / 7) - 90)
        return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="8" ry="5.800" transform="rotate(${(i * (360 / 7)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#d)" stroke="#FFE7A8" stroke-width=".8"/>`
      }).join('')}
      <circle cx="50" cy="52" r="10" fill="url(#d)" stroke="#FFE7A8" stroke-width="1"/><circle cx="48" cy="50" r="3.500" fill="#FFF3D0" opacity=".7"/>`,
      lin('a', '#2D2468', '#10103C') + rad('g', 'rgba(255,196,96,.6)', 'rgba(255,196,96,0)', 0.5, 0.5, 0.5) + rad('m', '#4A5580', '#1E2547', 0.35, 0.3, 0.9) + lin('d', '#FFD36B', '#E8A22A', 0, 0, 1, 1),
    ),
  },
]
