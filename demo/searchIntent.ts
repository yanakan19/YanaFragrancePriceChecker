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

/**
 * How the site reads text for search, the same for what is typed and for what is
 * searched, so punctuation and accents never decide a match (owner's rule,
 * 21 Oct 2026): lowercase; accents folded (Côte is cote) and the joined letters
 * spelled out (œ, æ, ß); an apostrophe or a dot joins what is either side of it
 * (J'adore is jadore, L'Homme is lhomme, Y.S.L is ysl); a degree sign reads as o
 * (N°5 is no5); every other mark but & is a space (a hyphen, a slash, brackets).
 */
export function foldText(s: string): string {
  let t = s.toLowerCase();
  // Most names are plain ASCII: the accent folding is skipped for them (it is most of the cost).
  if (/[^\x00-\x7f]/.test(t)) {
    t = t
      .normalize('NFKD')
      .replace(/\p{Mn}/gu, '')
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss')
      .replace(/ø/g, 'o')
      .replace(/[°º]/g, 'o');
  }
  return t
    .replace(/['’‘`´.]/g, '')
    .replace(/[^a-z0-9&\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text without any space: "y s l" and "ysl", "j adore" and "jadore" read alike. */
const squash = (s: string): string => s.replace(/\s+/g, '');

const normalise = (s: string): string => foldText(s).replace(ROLL_ON, 'roll on');

/**
 * A searched text as matched: folded, and where it holds a degree sign also
 * without it, so N°5 is found by "no 5", "no5" and "n5". Kept per text: the same
 * products are searched on every key press.
 */
const haystacks = new Map<string, { text: string; squashed: string }>();
function haystack(text: string): { text: string; squashed: string } {
  let h = haystacks.get(text);
  if (!h) {
    let t = normalise(text);
    if (/[°º]/.test(text)) t = `${t} ${normalise(text.replace(/[°º]/g, ''))}`;
    haystacks.set(text, (h = { text: t, squashed: squash(t) }));
  }
  return h;
}

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
/** The last search, read once: the same words are matched against every product. */
let lastQuery: { query: string; words: string[]; intent: boolean; joined: string } | null = null;
function parsedQuery(query: string): { words: string[]; intent: boolean; joined: string } {
  if (lastQuery?.query !== query) {
    const words = searchWords(query);
    lastQuery = { query, words, intent: words.some(isIntentWord), joined: words.join('') };
  }
  return lastQuery;
}

export function searchMatches(text: string, query: string): boolean {
  const { words, intent, joined } = parsedQuery(query);
  if (words.length === 0) return true;
  const hay = haystack(text);
  if (words.every((w) => (isIntentWord(w) ? wholeWord(w).test(hay.text) : hay.text.includes(w)))) return true;
  // The words run together, or split where the text has none: "y s l" finds YSL,
  // "jadore" finds J'adore however the shop spelt it. Never for an intent word.
  // Only for two words or more, or one of four letters or more: a short word run
  // across the gap between two others ("sa" in "Las Alturas") is noise.
  return !intent && (words.length > 1 || joined.length >= 4) && hay.squashed.includes(joined);
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

/** A text's words, folded; kept per text, as names and brands repeat on every key press. */
const tokenCache = new Map<string, string[]>();
const tokens = (s: string): string[] => {
  let t = tokenCache.get(s);
  if (!t) tokenCache.set(s, (t = normalise(s).split(/[^a-z0-9&]+/).filter(Boolean)));
  return t;
};
/** "&" and "and" join two names and are never what tells one apart: Dolce & Gabbana is dolce gabbana. */
const JOINERS = new Set(['&', 'and']);
const bare = (t: string[]): string[] => t.filter((w) => !JOINERS.has(w));
const key = (w: string[]): string => bare(w).sort().join(' ');

/** A brand and its short names, as token lists. */
const formCache = new Map<string, string[][]>();
function brandForms(brand: string): string[][] {
  let f = formCache.get(brand);
  if (!f) formCache.set(brand, (f = [brand, ...(BRAND_ALIASES[brand.toLowerCase()] ?? [])].map(tokens)));
  return f;
}

/**
 * How well a matching product fits the search, 0 best, whichever comes first in
 * what is typed (owner's rule, 21 Oct 2026):
 *   0  exactly the name, the brand (or a short name of it), or the brand and the
 *      name in any order, spaces and punctuation aside ("dior sauvage",
 *      "sauvage dior", "jadore", "dolce gabbana");
 *   1  the start of the name, or of the brand and the name ("bleu de chan", "dior sauv");
 *   2  every word is a whole word of the brand or the name ("dior", "dolce gabbana");
 *   3  every word starts a word of the brand or the name ("chan", "ysl y");
 *   4  the rest: a word found inside another, or the words run together.
 * Products that fit alike keep the order they came in, the most stocked first.
 */
export function searchRank(brand: string, name: string, query: string): 0 | 1 | 2 | 3 | 4 {
  const q = rankQuery(query);
  if (q.words.length === 0) return 4;
  const p = rankProfile(brand, name);
  if (p.exactKeys.has(q.key) || p.exactSquashed.has(q.squashed)) return 0;
  if (p.starts.some((t) => t.startsWith(q.phrase))) return 1;
  if (q.words.every((w) => p.words.has(w))) return 2;
  if (q.words.every((w) => p.wordList.some((h) => h.startsWith(w)))) return 3;
  return 4;
}

/** What searchRank compares a product by, worked out once per brand and name. */
interface RankProfile {
  /** The name, the brand forms, and each brand form with the name, as sorted word keys and run together. */
  exactKeys: Set<string>;
  exactSquashed: Set<string>;
  /** The name, and each brand form followed by the name, as phrases. */
  starts: string[];
  words: Set<string>;
  wordList: string[];
}
const profiles = new Map<string, RankProfile>();
function rankProfile(brand: string, name: string): RankProfile {
  const id = `${brand}\u0000${name}`;
  let p = profiles.get(id);
  if (!p) {
    const nameT = tokens(name);
    const forms = brandForms(brand);
    const exact = [nameT, ...forms, ...forms.map((b) => [...b, ...nameT])];
    const wordList = [...forms.flat(), ...nameT];
    p = {
      exactKeys: new Set(exact.map(key)),
      exactSquashed: new Set(exact.map((t) => bare(t).join(''))),
      starts: [bare(nameT), ...forms.map((b) => bare([...b, ...nameT]))].map((t) => t.join(' ')),
      words: new Set(wordList),
      wordList,
    };
    profiles.set(id, p);
  }
  return p;
}

let lastRankQuery: { query: string; words: string[]; key: string; squashed: string; phrase: string } | null = null;
function rankQuery(query: string): { words: string[]; key: string; squashed: string; phrase: string } {
  if (lastRankQuery?.query !== query) {
    const words = bare(tokens(query));
    lastRankQuery = { query, words, key: key(words), squashed: words.join(''), phrase: words.join(' ') };
  }
  return lastRankQuery;
}

/**
 * Works out ahead what matching and ranking a product needs (its folded text and
 * its words), so the first key press does not pay for every product at once. The
 * app calls it in small slices when the search box gets the focus.
 */
export function prepareSearch(brand: string, name: string, concentration = ''): void {
  haystack(searchText(brand, name, concentration));
  rankProfile(brand, name);
}

/** The list with the best fitting products first; products that fit alike keep their order. */
export function rankSearch<T>(list: readonly T[], query: string, parts: (item: T) => { brand: string; name: string }): T[] {
  if (!query.trim()) return list.slice();
  return list
    .map((item, i) => ({ item, i, r: searchRank(parts(item).brand, parts(item).name, query) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * How well a brand fits what is typed, 0 best, or null when it does not: 0 when the
 * words are the brand or a short name of it, spaces and punctuation aside ("ysl",
 * "y s l", "dolce gabbana"); 1 when they start it ("dio", "yves sa"); 2 when every
 * word starts a word of it ("gabbana", "klein"). The brand suggestions under the
 * search box (demo/searchSuggest.ts) use it.
 */
export function brandRank(brand: string, query: string): 0 | 1 | 2 | null {
  const q = bare(tokens(query));
  if (q.length === 0) return null;
  const qs = q.join('');
  let best: 0 | 1 | 2 | null = null;
  for (const form of brandForms(brand)) {
    const f = bare(form);
    const fs = f.join('');
    if (qs === fs) return 0;
    if (fs.startsWith(qs) && (best === null || best > 1)) best = 1;
    else if (best === null && q.every((w) => f.some((h) => h.startsWith(w)))) best = 2;
  }
  return best;
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
