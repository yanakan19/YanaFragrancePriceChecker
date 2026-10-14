/**
 * What a search says about the kind of product it is after, and how a word of it
 * is matched (docs/GIFT-SETS-AND-OILS-PLAN.md, 2.6 and Phase 8).
 *
 * Sets and oils are not in the bottle results of a search, a brand or a shop
 * (they have their own tabs); a line above the results says how many of each
 * also match and opens the tab with the same words. This module is the one place
 * that decides which words mean "oil" and which mean "set", and the one match
 * rule every search box on the site uses, so the count in that line is the count
 * the tab then shows.
 *
 * Pure: no catalogue and no document, so a test in Node can reach it.
 */

/** Words that say the reader wants oils: "oil", "attar", and "roll on" (see ROLL_ON). */
const OIL_WORDS = new Set(['oil', 'oils', 'attar', 'attars']);
/** Words that say the reader wants sets and bundles. */
const SET_WORDS = new Set(['set', 'sets', 'gift', 'gifts', 'bundle', 'bundles', 'coffret', 'coffrets', 'duo', 'duos', 'trio', 'trios']);

/** "roll on", "roll-on" and "rollon" are one phrase: an oil's format, never a spray's. */
const ROLL_ON = /\broll[- ]?on\b/g;

const normalise = (s: string): string => s.toLowerCase().replace(ROLL_ON, 'roll on');

/** The words of a search, lowercase, "roll-on" and "rollon" read as the two words "roll on". */
export function searchWords(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

/** An intent word is matched as a whole word: "oil" is in "Perfume Oil" and not in "Eau de Toilette". */
const isIntentWord = (w: string): boolean => OIL_WORDS.has(w) || SET_WORDS.has(w) || w === 'roll';

const wordRegexes = new Map<string, RegExp>();
function wholeWord(w: string): RegExp {
  let re = wordRegexes.get(w);
  if (!re) {
    // A plural in the search finds the singular in the name ("oils" finds "Perfume Oil").
    const stem = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
    wordRegexes.set(w, (re = new RegExp(`(?:^|[^a-z0-9])${stem.replace(/[^a-z0-9]/g, '')}s?(?:$|[^a-z0-9])`)));
  }
  return re;
}

/**
 * Whether a product's words (its brand, name and strength) hold every word of the
 * search. Most words match anywhere in the text, as search always has; the words
 * that name a kind of product (oil, attar, roll on, set, gift, bundle, coffret,
 * duo, trio) match whole words only, so "oil" never finds "Toilette" and "set"
 * never finds "Settimo".
 */
export function searchMatches(text: string, query: string): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const hay = normalise(text);
  return words.every((w) => (isIntentWord(w) ? wholeWord(w).test(hay) : hay.includes(w)));
}

/**
 * Short names people type for a brand, by the brand's lowercase name. They count as
 * part of the brand's searched text, so "ck man" finds Calvin Klein's Man.
 */
const BRAND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'calvin klein': ['ck'],
  'yves saint laurent': ['ysl'],
  'jean paul gaultier': ['jpg', 'jpgaultier'],
  'dolce & gabbana': ['d&g', 'dg', 'dolce and gabbana'],
  'dolce and gabbana': ['d&g', 'dg', 'dolce & gabbana'],
  'marc jacobs': ['mj'],
  'giorgio armani': ['armani', 'ga'],
  'emporio armani': ['ea'],
  'armani': ['giorgio armani'],
  'hugo boss': ['boss'],
  'boss': ['hugo boss'],
  'paco rabanne': ['rabanne', 'paco'],
  'rabanne': ['paco rabanne'],
  'carolina herrera': ['ch'],
  'viktor & rolf': ['v&r', 'viktor and rolf'],
  'viktor and rolf': ['v&r', 'viktor & rolf'],
  'maison francis kurkdjian': ['mfk'],
  'thierry mugler': ['mugler'],
  'mugler': ['thierry mugler'],
  'issey miyake': ['miyake'],
  'ralph lauren': ['rl'],
  'tom ford': ['tf'],
  'christian dior': ['dior'],
  'dior': ['christian dior'],
  'jo malone london': ['jo malone'],
  'jo malone': ['jo malone london'],
  'armani privé': ['armani prive'],
  'maison margiela': ['margiela', 'mm'],
  'initio parfums prives': ['initio'],
  'parfums de marly': ['pdm', 'marly'],
  'penhaligon\'s': ['penhaligons'],
  'atelier cologne': ['atelier'],
  'nina ricci': ['nina'],
  'lancôme': ['lancome'],
  'estée lauder': ['estee lauder'],
};

const aliasText = new Map<string, string>();
/** The brand's aliases as one string ("" for most brands), worked out once per brand. */
function aliasesOf(brand: string): string {
  let t = aliasText.get(brand);
  if (t === undefined) aliasText.set(brand, (t = (BRAND_ALIASES[brand.toLowerCase()] ?? []).join(' ')));
  return t;
}

/** The text a search is matched against: brand, the brand's short names, name and strength. */
export function searchText(brand: string, name: string, concentration = ''): string {
  const a = aliasesOf(brand);
  return a ? `${brand} ${a} ${name} ${concentration}` : `${brand} ${name} ${concentration}`;
}

const tokens = (s: string): string[] => normalise(s).split(/[^a-z0-9&]+/).filter(Boolean);

/**
 * How well a matching product fits the search, 0 best: 0 when the words are exactly the
 * brand (or a short name of it) and the name, in any order, or exactly the name; 1 when
 * every word starts a word of the brand and name; 2 for the rest (a word found inside one).
 */
export function searchRank(brand: string, name: string, query: string): 0 | 1 | 2 {
  const q = tokens(query);
  if (q.length === 0) return 2;
  const key = (w: string[]): string => [...w].sort().join(' ');
  const qk = key(q);
  const nameT = tokens(name);
  if (qk === key(nameT)) return 0;
  const brands = [brand, ...(aliasesOf(brand) ? (BRAND_ALIASES[brand.toLowerCase()] ?? []) : [])];
  if (brands.some((b) => qk === key([...tokens(b), ...nameT]))) return 0;
  const words = [...tokens(brand), ...tokens(aliasesOf(brand)), ...nameT];
  return q.every((w) => words.some((h) => h.startsWith(w))) ? 1 : 2;
}

/** The list with the best fitting products first; products that fit alike keep their order. */
export function rankSearch<T>(list: readonly T[], query: string, parts: (item: T) => { brand: string; name: string }): T[] {
  if (!query.trim()) return list.slice();
  return list
    .map((item, i) => ({ item, i, r: searchRank(parts(item).brand, parts(item).name, query) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

export interface Intent {
  /** The search asks for oils. */
  oils: boolean;
  /** The search asks for sets. */
  sets: boolean;
}

export function intentOf(query: string): Intent {
  const words = searchWords(query);
  return {
    oils: words.some((w) => OIL_WORDS.has(w)) || (words.includes('roll') && words.includes('on')),
    sets: words.some((w) => SET_WORDS.has(w)),
  };
}

/** "5 Sets and 8 Oils": the counts that are above nothing, in the order asked for. */
export function countsPhrase(sets: number, oils: number, first: 'sets' | 'oils'): string {
  const part = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
  const parts: { kind: 'sets' | 'oils'; text: string }[] = [];
  if (sets > 0) parts.push({ kind: 'sets', text: part(sets, 'Set', 'Sets') });
  if (oils > 0) parts.push({ kind: 'oils', text: part(oils, 'Oil', 'Oils') });
  parts.sort((a, b) => (a.kind === first ? -1 : b.kind === first ? 1 : 0));
  return parts.map((p) => p.text).join(' and ');
}

/** Which tab leads the line: the one the search's own words name, else Sets. */
export function leadingKind(intent: Intent): 'sets' | 'oils' {
  return intent.oils && !intent.sets ? 'oils' : 'sets';
}
