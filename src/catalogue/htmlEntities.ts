/**
 * HTML entities in a shop's text, decoded once where the text is read.
 *
 * Several shops hand over product titles and vendor names straight out of
 * their page markup or an Awin feed, entities and all: "Dolce &amp; Gabbana",
 * "L&#039;Occitane", "Men&#039;s Happy For Men", Paris Corner's
 * "IDENTITY ROSE &amp;amp; LEATHER" (encoded twice). Read as plain text those
 * are different strings from "Dolce & Gabbana", so the Brands list carried the
 * same house twice (one with `amp` in its address, /brands/dolce-and-amp-gabbana)
 * and 89 product names showed "&#039;" to a reader.
 *
 * The fix is here and at the places that read shop text (reconcile.ts for every
 * crawl, the catalogue and region builds for snapshots stored before this), not
 * a patch on the display: after this, no entity reaches a brand, a name, a key
 * or a slug.
 *
 * What it decodes: numeric references (`&#039;`, `&#39;`, `&#x27;`), the five
 * markup entities, `&nbsp;` (as a plain space, since every reader of a title
 * treats it as one), the Latin-1 named letters and symbols (`&eacute;`,
 * `&ouml;`, `&reg;`), and the typographic punctuation shops use (`&rsquo;`,
 * `&ndash;`, `&hellip;`). A reference to a Windows-1252 code point in the
 * 128 to 159 range is read the way a browser reads it (`&#150;` is an en dash).
 * Anything else, such as an unknown name or a bare "&", is left exactly as it
 * was: this never guesses. Text decoded twice by its shop ("&amp;amp;") is
 * decoded until it is stable, to a limit of three passes.
 *
 * Not an HTML parser: it does not strip tags and does not touch a string with no
 * `&` in it, which costs one `indexOf`.
 */

/** The Latin-1 block, U+00A0 to U+00FF, by name in code point order. */
const LATIN1_NAMES = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
  'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml ' +
  'eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
).split(' ');

const NAMED: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    // Typographic punctuation and the symbols shops put in a title.
    lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
    ndash: '–', mdash: '—', hellip: '…', bull: '•', trade: '™', euro: '€',
    prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', minus: '−', times: '×',
    OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ',
    circ: 'ˆ', tilde: '˜', ensp: ' ', emsp: ' ', thinsp: ' ',
  };
  LATIN1_NAMES.forEach((name, i) => { out[name] = String.fromCodePoint(0xa0 + i); });
  out['nbsp'] = ' ';
  return out;
})();

/** What a browser shows for a numeric reference to 0x80 to 0x9F (Windows-1252), 0 where it shows nothing. */
const WINDOWS_1252: readonly number[] = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/** The five entities that are case insensitive in HTML (`&AMP;` is `&`). */
const MARKUP = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

const REFERENCE = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g;

function codePoint(body: string): string | null {
  const hex = body[1] === 'x' || body[1] === 'X';
  let code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (!Number.isFinite(code) || code <= 0) return null;
  if (code >= 0x80 && code <= 0x9f) {
    code = WINDOWS_1252[code - 0x80]!;
    if (!code) return null;
  }
  // Surrogates and anything past the last code point are not characters.
  if ((code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return null;
  // A non breaking space is read as a plain one, by number as by name.
  if (code === 0xa0) return ' ';
  return String.fromCodePoint(code);
}

function decodeOnce(text: string): string {
  return text.replace(REFERENCE, (whole, body: string) => {
    if (body[0] === '#') return codePoint(body) ?? whole;
    const exact = NAMED[body];
    if (exact !== undefined) return exact;
    const lower = body.toLowerCase();
    return MARKUP.has(lower) ? NAMED[lower]! : whole;
  });
}

/** Decodes the HTML entities in `text`; see the header for exactly which and why. */
export function decodeHtmlEntities(text: string): string {
  if (text.indexOf('&') < 0) return text;
  let current = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** True when `text` still carries something `decodeHtmlEntities` would change. */
export function hasHtmlEntity(text: string): boolean {
  return text.indexOf('&') >= 0 && decodeOnce(text) !== text;
}

/**
 * A listing with the entities in its title and vendor name decoded: the one
 * step every route into the catalogue store goes through (reconcile.ts) and
 * every build that reads a stored snapshot repeats, for a snapshot written
 * before this existed. Returns the same object when there is nothing to decode.
 * The description is left alone: its readers (notes, sizes) decode what they
 * need themselves, and it is prose, not a name.
 */
export function decodeListingNames<T extends { rawTitle: string; rawBrand: string | null }>(listing: T): T {
  const rawTitle = decodeHtmlEntities(listing.rawTitle);
  const rawBrand = listing.rawBrand === null ? null : decodeHtmlEntities(listing.rawBrand);
  if (rawTitle === listing.rawTitle && rawBrand === listing.rawBrand) return listing;
  return { ...listing, rawTitle, rawBrand };
}

/**
 * The spellings a shop's markup gave this decoded text before it was decoded:
 * "&" as "&amp;", an apostrophe as "&#039;", "&#39;" or "&apos;", a quotation
 * mark as "&quot;", alone and together. Used to find an id that was made from
 * the title as it used to be read (a gift set's `set-<title>`), so the id the
 * decoded title now gives keeps answering for it. Never the text itself, and
 * nothing for a text with none of the three characters.
 */
export function entityEncodedForms(text: string): string[] {
  const hasAmp = text.includes('&');
  const apostrophes = text.includes("'") ? ["'", '&#039;', '&#39;', '&apos;'] : ["'"];
  const quotes = text.includes('"') ? ['"', '&quot;'] : ['"'];
  const out = new Set<string>();
  for (const amp of hasAmp ? ['&', '&amp;'] : ['&']) {
    for (const apostrophe of apostrophes) {
      for (const quote of quotes) {
        const form = (hasAmp ? text.replace(/&/g, amp) : text).replace(/'/g, apostrophe).replace(/"/g, quote);
        if (form !== text) out.add(form);
      }
    }
  }
  return [...out];
}
