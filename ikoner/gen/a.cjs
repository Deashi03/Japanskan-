// A. Tecken och sidor: bokstäverna är hjälten.
const { glyph, C, svg, lin, rad, bg } = require('./lib.cjs')

module.exports = [
  {
    name: 'Sol', desc: 'Tecknet 日, sol och dag, vitt på sinoberrött.',
    svg: svg(`${bg('a')}${glyph('maru', '日', 50, 51, 52, 62, '#fff')}`, lin('a', '#F2593B', '#D2361F')),
  },
  {
    name: 'あ', desc: 'Hiraganan あ, det första tecknet, vitt på indigo med en liten sol.',
    svg: svg(`${bg('a')}<circle cx="76" cy="25" r="6" fill="${C.gold}"/>${glyph('maru', 'あ', 48, 54, 56, 62, '#fff')}`, lin('a', '#2F52A5', '#15295A')),
  },
  {
    name: 'Språk', desc: 'Tecknet 語 (språk) i kräm på en röd sol över nattblått.',
    svg: svg(`${bg('a')}<circle cx="50" cy="50" r="38" fill="url(#b)"/>${glyph('serif', '語', 50, 51, 44, 48, C.cream)}`, lin('a', '#1D3470', '#0F1E44') + lin('b', '#F2593B', '#CE331C')),
  },
  {
    name: 'Japanska', desc: '日本語 stående i tre led, vitt på rött.',
    svg: svg(`${bg('a')}${glyph('serif', '日', 50, 22, 28, 24, '#fff')}${glyph('serif', '本', 50, 50, 30, 26, '#fff')}${glyph('serif', '語', 50, 78, 30, 26, '#fff')}`, lin('a', '#F2593B', '#C93019')),
  },
  {
    name: 'Nihon', desc: '日本 i vitt med en guldlinje, på indigo.',
    svg: svg(`${bg('a')}${glyph('serif', '日本', 50, 46, 72, 34, '#fff')}<rect x="14" y="68" width="72" height="5" rx="2.5" fill="${C.gold}"/>`, lin('a', '#2B4B9C', '#14285A')),
  },
  {
    name: 'Pratbubbla', desc: 'En vit pratbubbla med あ, på klarblått.',
    svg: svg(`${bg('a')}<path d="M50 14c20 0 36 12.5 36 29S70 72 50 72c-3 0-6-.3-9-.9L24 84l4-17C20 62 14 53 14 43c0-16.500 16-29 36-29z" fill="#fff"/>${glyph('maru', 'あ', 50, 43, 30, 32, C.indigo)}`, lin('a', '#5BB8EE', '#2B7FD0')),
  },
  {
    name: 'Tala', desc: 'Tecknet 話 (tala) i en röd bubbla på guld.',
    svg: svg(`${bg('a')}<path d="M50 14c20 0 36 12.500 36 29S70 72 50 72c-3 0-6-.3-9-.9L24 84l4-17C20 62 14 53 14 43c0-16.500 16-29 36-29z" fill="url(#b)"/>${glyph('serif', '話', 50, 43, 36, 38, '#fff')}`, lin('a', '#FFD76A', '#F5A623') + lin('b', '#F2593B', '#C93019')),
  },
  {
    name: 'Pensel', desc: 'Penseldrag 字 i svart bläck på papper, med ett rött sigill.',
    svg: svg(`${bg('a')}${glyph('brush', '字', 47, 48, 66, 70, C.ink)}<rect x="68" y="66" width="20" height="20" rx="3" fill="${C.verm}" transform="rotate(-4 78 76)"/>${glyph('serif', '日', 78, 76, 12, 12, C.cream, 'transform="rotate(-4 78 76)"')}`, lin('a', '#FBF3E0', '#EEDFBE')),
  },
  {
    name: 'ん', desc: 'Ett stort glatt ん i indigo på guld. Lekfullt.',
    svg: svg(`${bg('a')}${glyph('maru', 'ん', 50, 52, 62, 60, C.indigoD)}`, lin('a', '#FFD76A', '#F2A41F')),
  },
  {
    name: 'Kana', desc: 'かな i två rader, vitt på bladgrönt.',
    svg: svg(`${bg('a')}${glyph('maru', 'か', 50, 28, 40, 38, '#fff')}${glyph('maru', 'な', 50, 72, 40, 40, '#fff')}`, lin('a', '#7FD06F', '#3E9F50')),
  },
]
