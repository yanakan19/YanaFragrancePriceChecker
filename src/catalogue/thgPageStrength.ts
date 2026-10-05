import { ML_SIZE_RE, OZ_SIZE_RE } from './fragranceId.js';
import { CONCENTRATION_NOT_STATED, concentration } from './productName.js';
import { isGiftSet } from './giftSet.js';
import { titleWithPageStrength } from './productPageStrength.js';
import { declinesStrengthWords } from './unstatedStrengthEvidence.js';
import type { RawListing } from './types.js';

/**
 * A perfume's strength, read from the copy on a THG product page (Cult Beauty,
 * LOOKFANTASTIC), inside the page read the crawl already makes.
 *
 * ── What the shop does and does not state, measured 2026-10-04 ──────────────
 * These titles often name no strength ("Alto Astral 100ml", "Lola at Coat
 * Check 50ml", "Wall Street 10ml"), so the strength rule kept them off the
 * site. The page has no field for it: the theme lists a `subtitle` and a
 * `strengthDetail` among its content keys, and not one of the perfume pages
 * read carried either (the keys a page had were whyChoose, synopsis,
 * ingredients, directions, productMessage and provenanceSchema). The JSON-LD
 * has none, the title tag and the h1 are the product's title, and the
 * ingredients list says only "Parfum (Fragrance)" for the formula.
 *
 * What the brand's own copy does state, in the page's data (`variationData`
 * or `defaultVariant`, the `whyChoose` and `synopsis` blocks), is a templated
 * phrase on most perfume pages: the product's name, its strength and, in
 * brackets, the size the copy was written for. "Meet Ain't That Sweet Eau de
 * Parfum (50ml)", "the Alto Astral Eau de Parfum (50ml)", "Sunlit Vanilla
 * Eau de Parfum (50ml)". That phrase is what is read here, and nothing looser.
 *
 * Pages that state none stay unstated: every Creed page read (Wild Vetiver,
 * Queen of Silk) says only "Meet the Wild Vetiver (50ml)", and so do the
 * Escentric Molecules, Sisley and Le Labo pages. Nothing is inferred for them
 * from the brand, the name or the price.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A strength counts only when all of these hold:
 *   1. it is exactly one of the known strengths (Eau de Parfum, Eau de
 *      Toilette, Eau de Cologne, Extrait de Parfum, Parfum), with "Intense"
 *      and then "Spray" allowed after it (TOM FORD's copy says "Black Orchid
 *      Eau de Parfum Spray (100ml)"); "Spray" is the form, not a strength;
 *   2. a size in brackets follows it directly, the shop's own template, so a
 *      comparison ("lighter than an Eau de Toilette") or a list of a gift
 *      set's contents is not the product's statement unless it has the same
 *      shape;
 *   3. the words before it end with the last words of this product's own name,
 *      so a neighbouring product named in the copy ("pairs with Vanilla 28 Eau
 *      de Parfum (50ml)") is never read as this one's;
 *   4. every phrase of that shape on the page says the same strength.
 * A page where any of that fails is left as it was: "Not stated".
 *
 * It is a fact about the product, so every size on the page gets it.
 */

/** The strengths the copy may name, as the catalogue spells them. */
const STRENGTHS: ReadonlyMap<string, string> = new Map([
  ['eau de parfum', 'Eau de Parfum'],
  ['eau de toilette', 'Eau de Toilette'],
  ['eau de cologne', 'Eau de Cologne'],
  ['extrait de parfum', 'Extrait de Parfum'],
  ['parfum', 'Parfum'],
]);

const NAMED = '(extrait de parfum|eau de parfum|eau de toilette|eau de cologne|parfum)';
const SIZE = '\\(\\s*\\d{1,4}(?:\\.\\d)?\\s*ml\\s*\\)';

/**
 * The three shapes the copy states a strength in. `anchor` is how many of the
 * product's last name words must stand just before the phrase: the copy often
 * leaves the brand out ("the Eladaria Eau de Parfum (30ml)" for "Creed
 * Eladaria"), so the bracketed size, which is the shop's template, needs only
 * the last word, and the bare phrase, which could be anything, needs two.
 */
const SHAPES: readonly { re: RegExp; anchor: number }[] = [
  // "Alto Astral Eau de Parfum (50ml)", "Black Orchid Eau de Parfum Spray (100ml)"
  { re: new RegExp(`\\b${NAMED}(\\s+intense)?(?:\\s+spray)?\\s*${SIZE}`, 'gi'), anchor: 1 },
  // "The Le Labo Eucalyptus 20 (50ml) eau de parfum"
  { re: new RegExp(`${SIZE}\\s+${NAMED}(\\s+intense)?\\b`, 'gi'), anchor: 1 },
  // "Molecule 01 + Mandarin Eau de Toilette is a game of two halves"
  { re: /\b(extrait de parfum|eau de parfum|eau de toilette|eau de cologne)(\s+intense)?\b/gi, anchor: 2 },
];

/** The text the page's own data carries as brand copy. */
const COPY_KEYS = new Set(['whyChoose', 'synopsis']);

/** What a page states about its own strength. */
export interface ThgPageStrength {
  /** The phrase as the copy prints it, with the size in brackets. */
  stated: string;
  /** The strength in the catalogue's own spelling, "Intense" kept. */
  strength: string;
}

/** The JSON value that starts at `from` (an object or array), or null. */
function jsonAt(html: string, from: number): unknown {
  const open = html[from];
  if (open !== '{' && open !== '[') return null;
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i]!;
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(from, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Plain text of a fragment of HTML: tags gone, entities decoded, quotes straightened, spaces collapsed. */
function plain(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;|[\u2018\u2019]/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every string inside a JSON value. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

/** The page's brand copy: the whyChoose and synopsis blocks of its first variant. */
export function pageCopy(html: string): string[] {
  for (const marker of ['const variationData = ', 'const defaultVariant = ']) {
    const at = html.indexOf(marker);
    if (at < 0) continue;
    const data = jsonAt(html, at + marker.length);
    const variant = Array.isArray(data) ? data[0] : data;
    const content = (variant as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    const out: string[] = [];
    for (const block of content) {
      const key = (block as { key?: unknown } | null)?.key;
      if (typeof key !== 'string' || !COPY_KEYS.has(key)) continue;
      out.push(...strings((block as { value?: unknown }).value).map(plain));
    }
    return out.filter(Boolean);
  }
  return [];
}

/** Words of a name, lower case, accents and punctuation gone. */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** A title without its size, the name the copy would use. */
function nameOf(title: string): string[] {
  const size = ML_SIZE_RE.exec(title) ?? OZ_SIZE_RE.exec(title);
  const bare = size ? title.slice(0, size.index) : title;
  return words(bare.replace(/\([^)]*$/, '').replace(/[-|:,]+\s*$/, ''));
}

/**
 * The strength the page's copy states for this product, or null.
 *
 * `title` is the listing's title, whose last words must be the words just
 * before the stated strength.
 */
export function parseThgPageStrength(html: string, title: string): ThgPageStrength | null {
  const name = nameOf(title);
  if (name.length === 0) return null;

  const found = new Map<string, string>();
  for (const text of pageCopy(html)) {
    for (const shape of SHAPES) {
      const tail = name.slice(-Math.min(shape.anchor, name.length));
      for (const m of text.matchAll(shape.re)) {
        const before = words(text.slice(Math.max(0, m.index! - 80), m.index!));
        const ends = before.length >= tail.length && tail.every((w, i) => before[before.length - tail.length + i] === w);
        if (!ends) continue;
        const base = STRENGTHS.get(m[1]!.toLowerCase())!;
        const key = m[2] ? `${base} Intense` : base;
        if (!found.has(key)) found.set(key, m[0]);
      }
    }
  }
  if (found.size !== 1) return null;
  const [strength, stated] = [...found][0]!;
  return { stated, strength };
}

/**
 * A title that names more than one product or size: a duo, a kit, a bundle
 * ("Dirty Duo: Dirty Heaven 15ml & Dirty Rice 15ml (Worth £158.00)"). Its
 * copy lists each bottle's strength, which says nothing about one product, and
 * these are never rewritten.
 */
function looksLikeSeveralProducts(title: string): boolean {
  if (/\b(duo|trio|set|kit|coffret|wardrobe|calendar|worth|bundle|bundles)\b|\+|\bx\s*\d|\d\s*x\b/i.test(title)) return true;
  const sizes = title.match(new RegExp(ML_SIZE_RE.source, 'gi')) ?? [];
  return sizes.length > 1;
}

/**
 * The listing's title with its page's strength put in before the size, or the
 * title unchanged: it already names a strength, it is a set, or the page
 * states none.
 */
export function titleWithThgPageStrength(
  listing: Pick<RawListing, 'rawTitle' | 'description' | 'rawBrand'> & { productType?: string | null },
  html: string,
  retailerId: string,
): string {
  const rawTitle = listing.rawTitle;
  if (concentration(rawTitle) !== CONCENTRATION_NOT_STATED) return rawTitle;
  if (looksLikeSeveralProducts(rawTitle)) return rawTitle;
  // A house that says it uses no strength words (Commodity) gets none from a shop's copy.
  if (declinesStrengthWords(listing)) return rawTitle;
  if (isGiftSet({ rawTitle, retailerId, productType: listing.productType ?? null, description: listing.description ?? null, rawBrand: listing.rawBrand })) {
    return rawTitle;
  }
  const page = parseThgPageStrength(html, rawTitle);
  return page ? titleWithPageStrength(rawTitle, page.strength) : rawTitle;
}
