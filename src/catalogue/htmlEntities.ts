/**
 * HTML entities left in a shop's feed text, decoded.
 *
 * Some shops publish their vendor field and title HTML escaped: Beauty Flash
 * and Gorgeous Shop send "Abercrombie &amp; Fitch", "Dolce &amp; Gabbana" and
 * "L&#039;Occitane", Scent Store and Perfume Closet titles carry "&amp;", and
 * house sites do too ("Iris &amp; Amber"). Nothing decoded them, so on 10 Oct
 * 2026 the Brands list showed "Abercrombie &amp; Fitch" beside "Abercrombie &
 * Fitch" (and the same for Dolce & Gabbana, Tiffany & Co, Viktor & Rolf and
 * Zadig & Voltaire), 80 products sat under those brands and 89 product names
 * read "J&#039;Adore" or "D&amp;G Light Blue". The text is decoded where the
 * catalogue build reads a listing (scripts/build-demo-catalogue.ts) and again
 * before a brand is grouped (brandKey in brandName.ts), so the same string
 * reaches the brand match, the product name and the page.
 *
 * Numeric entities, decimal and hex, and the named ones a shop's text actually
 * carries: the markup five, the quotes and dashes, the symbols and every
 * accented Latin letter HTML names (`&eacute;`, `&Ocirc;`: a letter and a
 * grave, acute, circ, tilde, uml, ring or cedil). `&nbsp;` is a plain space,
 * since this is text to match and show, not to lay out, and `&shy;` (a soft
 * hyphen, invisible where the shop shows it) is dropped. A name not listed is
 * left exactly as written, as is a number that is no character or a control
 * one. Text escaped twice ("&amp;amp;", "&amp;#039;") is decoded until it
 * stops changing, which takes a few rounds at most.
 */

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '',
  lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', prime: '′', Prime: '″',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  trade: '™', reg: '®', copy: '©', deg: '°', times: '×',
  ordm: 'º', ordf: 'ª', sup2: '²', sup3: '³',
  frac12: '½', frac14: '¼', frac34: '¾',
  pound: '£', euro: '€', dollar: '$', cent: '¢', yen: '¥',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ',
  oslash: 'ø', Oslash: 'Ø', eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ',
  iexcl: '¡', iquest: '¿', sect: '§', para: '¶',
};

/** The combining mark each accent entity suffix names. */
const ACCENTS: Readonly<Record<string, string>> = {
  grave: '̀', acute: '́', circ: '̂', tilde: '̃',
  uml: '̈', ring: '̊', cedil: '̧',
};

const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

function decodeOne(whole: string, body: string): string {
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    // No character, a surrogate half, or a control character: left as written.
    if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    if (code < 0x20 ? code !== 0x09 && code !== 0x0a && code !== 0x0d : code >= 0x7f && code <= 0x9f) return whole;
    return code === 0xa0 ? ' ' : code === 0xad ? '' : String.fromCodePoint(code);
  }
  const named = NAMED[body];
  if (named !== undefined) return named;
  const accented = /^([a-zA-Z])(grave|acute|circ|tilde|uml|ring|cedil)$/.exec(body);
  if (accented) {
    const letter = `${accented[1]}${ACCENTS[accented[2]!]}`.normalize('NFC');
    // Only a letter Unicode composes with that accent is a real entity.
    if (letter.length === 1) return letter;
  }
  return whole;
}

/** `text` with its HTML entities decoded; see the module doc for which. */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  let out = text;
  for (let round = 0; round < 4; round++) {
    const next = out.replace(ENTITY, decodeOne);
    if (next === out) break;
    out = next;
  }
  return out;
}
