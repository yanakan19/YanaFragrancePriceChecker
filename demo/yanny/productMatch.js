/**
 * Which product a question names. The single identity step every
 * product-anchored lookup shares (price, stock, notes, sizes, compare, deals,
 * brand), and the thing the old matcher got wrong in the reported case.
 *
 * ── The reported case ────────────────────────────────────────────────────
 * "how much is bleu de channel edp" was answered with eight unrelated
 * "Bleu ... (Eau de Parfum)" products and "Did you mean one of those?",
 * while the catalogue held Chanel's Bleu De in three sizes. Three things in
 * the old word-overlap scorer produced that:
 *
 *   1. It had no tolerance for a misspelling: "channel" ≠ "chanel", so the
 *      one word that identified the house counted for nothing.
 *   2. It treated the concentration as part of the product's identity, so
 *      "edp" scored a hit against every Eau de Parfum in the catalogue and
 *      "de" (from "Eau de Parfum" in the haystack) scored another, which is
 *      how eight EDPs that merely contained "Bleu" reached 3/4 while the
 *      real product, an EDT, sat at 2/4.
 *   3. Every query word carried the same weight, so "de" counted as much as
 *      "chanel".
 *
 * ── What this does instead ───────────────────────────────────────────────
 *   - Identity is brand + name only. A concentration word in the question
 *     ("edp", "eau de toilette", "parfum") is read as a *preference*: it
 *     picks between concentrations of the product the rest of the words
 *     identify, and when that product is not tracked in the concentration
 *     asked for, the answer says so and gives the one it has. It never makes
 *     a different product look closer.
 *   - Each query word is matched against the title's own tokens: exactly,
 *     as a prefix (the site's own search box already treats "one million
 *     eli" as Elixir), or within a small edit distance for words long
 *     enough to carry one ("channel" → "chanel", "savage" → "sauvage").
 *     Accents are folded first, so "hermes" finds Hermès; "1" and "one" are
 *     the same word; the abbreviations shoppers actually type for a house
 *     ("ysl", "ck", "jpg") are read as that house.
 *   - Function words ("de", "pour", "the", "eau") weigh a quarter of a
 *     content word. They still help "Bleu de" against "Bleu", but cannot
 *     carry a match on their own.
 *   - Between products that cover the question equally, the one whose name
 *     the question describes most completely wins ("Aventus" is Creed
 *     Aventus before it is Creed Aventus Cologne; "One Million Elixir" is
 *     1 Million Elixir Intense before 1 Million Night Elixir). This is a
 *     containment argument — how much of the name is accounted for — not a
 *     popularity guess.
 *   - Between concentrations of the *same* brand + name, the one asked for
 *     wins; with none asked for, the one more shops stock is the closest
 *     match and the others are reported as alternatives rather than turned
 *     into a question. The reader asked for a price, so the answer is a
 *     price, with a one-line way to correct it.
 *
 * ── What it still refuses ────────────────────────────────────────────────
 * Two *different* products (different brand + name) that describe the
 * question equally well and equally completely are still a question, not a
 * guess. A query that names only a house ("how much is Rabanne") is still a
 * question: a house is not a bottle. Anything scoring under the floor is
 * still "nothing matches", and a single weak match is still hedged. Every
 * figure any caller prints is read from the product this settles on, never
 * composed.
 */

/* ── text ──────────────────────────────────────────────────────────────── */

/** Lower-case, accents folded, punctuation to spaces. */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that appear in titles as connective tissue rather than identity. */
const FUNCTION_WORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'the', 'pour', 'for', 'eau', 'and', 'of', 'by', 'di', 'el', 'y', 'a', 'an', 'in',
]);
const FUNCTION_WEIGHT = 0.25;

/** "1 Million" is typed as "one million" and vice versa. Applied to titles
 *  and queries alike, so the two are compared on the same footing. */
const NUMBER_WORDS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
function canonicalToken(t) {
  return NUMBER_WORDS[t] ?? t;
}
function tokensOf(text) {
  return normalizeText(text).split(' ').filter(Boolean).map(canonicalToken);
}

/**
 * How shoppers abbreviate a house. A query word here is read as the brand
 * on the right, and matches a product whose brand tokens contain all of
 * those words. Deliberately short and deliberately only abbreviations —
 * this is not a place to encode which house owns which line.
 */
const BRAND_ALIASES = {
  ysl: ['yves', 'saint', 'laurent'],
  ck: ['calvin', 'klein'],
  jpg: ['jean', 'paul', 'gaultier'],
  dg: ['dolce', 'gabbana'],
  tf: ['tom', 'ford'],
  mfk: ['maison', 'francis', 'kurkdjian'],
  pdm: ['parfums', 'de', 'marly'],
  mm: ['maison', 'margiela'],
};

/**
 * The shorthand fragrance forums use for a handful of very common bottles,
 * expanded to the words of the product's own title before matching. Each
 * one stands for exactly one product line, which is the bar for being here:
 * "cdnim" can only mean Club de Nuit Intense Man, whereas "tv" (Tobacco
 * Vanille? television?) cannot, so it is not listed. Only ever expands a
 * whole word, so it cannot change a name that merely contains the letters.
 *
 * Measured before this existed: "cdnim price" and "br540 price" both
 * answered "I don't have a fragrance matching that", for bottles the
 * catalogue lists at several shops.
 */
const PRODUCT_SHORTHAND = {
  cdnim: 'armaf club de nuit intense man',
  cdni: 'armaf club de nuit intense man',
  cdniw: 'armaf club de nuit intense woman',
  br540: 'baccarat rouge 540',
  bdc: 'bleu de chanel',
  adg: 'acqua di gio',
  adgp: 'acqua di gio profumo',
  jpgum: 'jean paul gaultier ultra male',
  lmle: 'le male elixir',
  '1m': '1 million',
  sdj: 'sol de janeiro',
};

/** The question with any known shorthand spelt out. Exported for tests. */
export function expandShorthand(text) {
  let out = ` ${normalizeText(text)} `;
  // "br 540" / "br540" are both how Baccarat Rouge 540 gets typed.
  out = out.replace(/ br 540 /g, ' baccarat rouge 540 ');
  // The lookahead leaves each trailing space for the next word, so two
  // neighbouring shorthands ("adg cdnim") both expand.
  out = out.replace(/ ([a-z0-9]+)(?= )/g, (m, w) => (Object.prototype.hasOwnProperty.call(PRODUCT_SHORTHAND, w) ?` ${PRODUCT_SHORTHAND[w]}` : m));
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * A product name with the house's own words taken out, for deciding which
 * listings are the same product.
 *
 * Shops disagree about whether the house belongs in the product's name:
 * Giorgio Armani "Armani Code" and Giorgio Armani "Code" are the same bottle,
 * as are Hugo Boss "Boss Bottled" and "Bottled", and Yves Saint Laurent
 * "YSL Libre" and "Libre". Treated as different names they split one
 * product's sizes and shops into two groups that then tie with each other,
 * so "armani code price" was answered with "a few products match" and a
 * list of five near-identical lines. Stripping the brand's own words (and
 * its common abbreviation) puts them back together. A name that is nothing
 * but the house's words ("Dolce" by Dolce & Gabbana) is left as it is.
 */
function nameTokensWithoutBrand(brandTokens, nameTokens) {
  const brandWords = new Set(brandTokens);
  for (const [alias, parts] of Object.entries(BRAND_ALIASES)) {
    if (parts.every((p) => brandWords.has(p))) brandWords.add(alias);
  }
  const kept = nameTokens.filter((t) => !brandWords.has(t));
  return kept.length > 0 ? kept : nameTokens;
}

/* ── concentration, read as a preference ──────────────────────────────── */

/**
 * How a concentration is written in a question, and the catalogue value it
 * asks for. Longest phrases first so "eau de parfum" is consumed before
 * "parfum" is. `label` is the catalogue's own spelling where it has one.
 */
const CONCENTRATION_PHRASES = [
  { re: /\beau de parfum\b|\bedp\b/, label: 'Eau de Parfum' },
  { re: /\beau de toilette\b|\bedt\b/, label: 'Eau de Toilette' },
  { re: /\beau de cologne\b|\bedc\b/, label: 'Eau de Cologne' },
  { re: /\bextrait de parfum\b|\bextrait\b/, label: 'Extrait de Parfum' },
  { re: /\bpure parfum\b|\bparfum\b/, label: 'Parfum' },
  { re: /\bperfume oil\b/, label: 'Perfume Oil' },
  { re: /\baftershave\b/, label: 'Aftershave' },
  { re: /\beau fraiche\b/, label: 'Eau Fraiche' },
];

/**
 * The concentration a question asks for, if any, and the question with
 * that phrase removed so it cannot be mistaken for part of a name.
 *
 * "cologne" on its own is deliberately NOT stripped: it is a real product
 * word ("Creed Aventus Cologne" is a different bottle from Creed Aventus)
 * as well as a concentration, so it stays in the identity words and only
 * sets the preference.
 */
export function readConcentration(question) {
  let text = ` ${normalizeText(question)} `;
  for (const { re, label } of CONCENTRATION_PHRASES) {
    if (re.test(text)) {
      text = text.replace(re, ' ');
      return { wanted: label, rest: text.replace(/\s+/g, ' ').trim() };
    }
  }
  if (/\bcologne\b/.test(text)) return { wanted: 'Eau de Cologne', rest: text.trim() };
  return { wanted: null, rest: text.trim() };
}

/** Catalogue concentrations that satisfy a preference. "Extrait" and
 *  "Extrait de Parfum" are the same thing spelt two ways by two shops. */
function concentrationSatisfies(catalogueValue, wanted) {
  const have = normalizeText(catalogueValue);
  const want = normalizeText(wanted);
  if (have === want) return true;
  if (want === 'extrait de parfum') return have === 'extrait';
  if (want === 'parfum') return have === 'parfum' || have === 'pure parfum';
  return false;
}

/* ── token matching ────────────────────────────────────────────────────── */

/**
 * Optimal string alignment distance (Levenshtein plus adjacent
 * transposition), with an early exit when the lengths alone rule a match
 * out. Only ever called on short words.
 */
export function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const cols = b.length + 1;
  let prev2 = null;
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(cols);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[cols - 1];
}

/** How many edits a word of this length may be off by and still be the
 *  same word. Short words are not fuzzed at all: "dior" one letter out is
 *  some other word. */
function tolerance(word) {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

const EXACT = 1;
const FUZZY = 0.9;
const PREFIX = 0.85;

/**
 * The strength with which one query word is found among a title's tokens:
 * 1 for the word itself, a little less for a prefix or a near-miss, 0 for
 * nothing. Exported for tests; the index below does the same thing over
 * the whole vocabulary at once.
 */
export function wordMatch(word, tokens) {
  const w = canonicalToken(word);
  let best = 0;
  const max = tolerance(w);
  for (const t of tokens) {
    if (t === w) return EXACT;
    if (best < PREFIX && w.length >= 3 && t.length > w.length && t.startsWith(w)) best = PREFIX;
    if (best < FUZZY && max > 0 && editDistance(w, t, max) <= max) best = FUZZY;
  }
  return best;
}

/* ── the index ─────────────────────────────────────────────────────────── */

/** `<brand>|<name>|<concentration>`, lowercased: every size of one perfume
 *  shares this key (mirrors `variantGroup` in demo/data.ts). */
export function groupKeyFor(f) {
  return `${f.brand}|${f.name}|${f.concentration}`.toLowerCase();
}

/**
 * The key two shops' spellings of one product fold to: accents, case,
 * punctuation and "one"/"1" all normalised. "1 Million Elixir Intense" and
 * "One Million Elixir Intense" are one product with two ids, and the
 * answer for it should carry both shops' sizes and prices.
 */
function canonicalKey(f) {
  const brandTokens = tokensOf(f.brand);
  const nameTokens = nameTokensWithoutBrand(brandTokens, tokensOf(f.name));
  return `${brandTokens.join(' ')}|${nameTokens.join(' ')}|${normalizeText(f.concentration)}`;
}

/**
 * One entry per (canonical) brand + name + concentration, with the tokens
 * the matcher scores against and the rows (sizes) that make it up, plus an
 * inverted index from every token to the entries carrying it. Built once
 * per fragrance list and reused; the list a page ships with never changes.
 *
 * The display `brand`/`name` are taken from the most widely stocked row,
 * so a mangled spelling from one shop does not become the answer's name
 * when a sound one exists.
 */
export function buildProductIndex(fragrances) {
  const byKey = new Map();
  for (const frag of fragrances) {
    const key = canonicalKey(frag);
    let g = byKey.get(key);
    if (!g) {
      const brandTokens = [...new Set(tokensOf(frag.brand))];
      const nameTokens = nameTokensWithoutBrand(brandTokens, tokensOf(frag.name));
      g = {
        key,
        productKey: key.slice(0, key.lastIndexOf('|')),
        brand: frag.brand,
        name: frag.name,
        concentration: frag.concentration,
        brandTokens,
        nameTokens: [...new Set(nameTokens)],
        nameChars: nameTokens.reduce((n, t) => n + t.length, 0),
        titleTokens: [...new Set([...brandTokens, ...nameTokens])],
        rows: [],
        popularity: 0,
        lead: null,
      };
      byKey.set(key, g);
    }
    g.rows.push(frag);
    const pop = Number(frag.popularity ?? 0);
    g.popularity += pop;
    if (!g.lead || pop > g.lead.pop) {
      g.lead = { pop, brand: frag.brand, name: frag.name, concentration: frag.concentration };
    }
  }
  const groups = [...byKey.values()];
  const vocab = new Map();
  // How often each token is part of a house's name versus a product's name,
  // and which house it most often names — see `brandWordIn` below.
  const brandCount = new Map();
  const nameCount = new Map();
  const brandOfToken = new Map();
  groups.forEach((g, i) => {
    g.brand = g.lead.brand;
    g.name = g.lead.name;
    g.concentration = g.lead.concentration;
    delete g.lead;
    g.rows.sort((a, b) => (a.sizeMl ?? Infinity) - (b.sizeMl ?? Infinity));
    for (const t of g.titleTokens) {
      let list = vocab.get(t);
      if (!list) vocab.set(t, (list = []));
      list.push(i);
    }
    for (const t of g.brandTokens) {
      brandCount.set(t, (brandCount.get(t) ?? 0) + 1);
      const seen = brandOfToken.get(t);
      if (!seen || g.popularity > seen.popularity) brandOfToken.set(t, { brand: g.brand, popularity: g.popularity });
    }
    for (const t of g.nameTokens) nameCount.set(t, (nameCount.get(t) ?? 0) + 1);
  });
  return { groups, vocab, tokens: [...vocab.keys()], brandCount, nameCount, brandOfToken };
}

/**
 * The house a query word names, if it is a word that mostly names houses.
 *
 * "chanel no 5" was answered "Closest match: Laurelle Parfums Royal Ring
 * Blue - Inspired by No. 5" with a price, because "no" and "5" both landed
 * in that title and only "chanel" missed — two words out of three is a
 * confident match by coverage alone. But the word that missed was the
 * house, and a bottle from a different house is not a near miss for it: it
 * is a different product, here an imitation of the one asked for. So a
 * word that is overwhelmingly a brand word in this catalogue (it appears in
 * more houses' names than products' names, and is not connective tissue)
 * and that the chosen product does not carry is reported, and the caller
 * refuses rather than quoting the other house's bottle.
 */
function brandWordIn(word, index) {
  const w = canonicalToken(word);
  if (BRAND_ALIASES[w]) return { alias: BRAND_ALIASES[w], brand: null };
  if (w.length < 4 || FUNCTION_WORDS.has(w)) return null;
  const b = index.brandCount.get(w) ?? 0;
  if (b === 0 || b <= (index.nameCount.get(w) ?? 0)) return null;
  return { alias: null, brand: index.brandOfToken.get(w)?.brand ?? null, token: w };
}

/** Whether a group's title carries a query word in any form the matcher
 *  would accept (exact, prefix, near miss or brand abbreviation). */
function groupCarries(g, word) {
  const w = canonicalToken(word);
  if (BRAND_ALIASES[w]) return BRAND_ALIASES[w].every((p) => g.brandTokens.includes(p));
  return wordMatch(w, g.titleTokens) > 0;
}

const indexCache = new WeakMap();
/** Builds (or reuses) the index for a fragrance list without matching. */
export function warmIndex(fragrances) {
  return indexFor(fragrances);
}
function indexFor(fragrances) {
  let idx = indexCache.get(fragrances);
  if (!idx) {
    idx = buildProductIndex(fragrances);
    indexCache.set(fragrances, idx);
  }
  return idx;
}

/* ── scoring ───────────────────────────────────────────────────────────── */

/** Scores above this are a settled identity; between the two, one product
 *  but a weak fit; below the floor, nothing. */
export const MATCH_FLOOR = 0.45;
export const MATCH_CONFIDENT = 0.65;
/** Two coverages closer than this are a tie, settled by tightness. */
const TIE = 0.01;

/**
 * Every group one query word lands in, with the strength it landed at.
 * Walks the vocabulary once per word — exact, prefix and near-miss — so the
 * edit-distance work is per distinct title token, not per product.
 */
function hitsFor(word, index) {
  const w = canonicalToken(word);
  const hits = new Map();
  const add = (token, strength) => {
    for (const gi of index.vocab.get(token)) {
      if ((hits.get(gi) ?? 0) < strength) hits.set(gi, strength);
    }
  };
  if (index.vocab.has(w)) add(w, EXACT);
  // A word the catalogue already uses in several titles is not a typo, so it
  // is not also read as a near miss for some other word. Before this,
  // "do you have Sauvage Elixir" scored "sauvage" as a near miss for
  // "salvage" and answered "Yes — Brandy Designs Salvage Elixir", a
  // different house's imitation, because that one title carried both words.
  const established = (index.vocab.get(w)?.length ?? 0) >= 2;
  const max = established ? 0 : tolerance(w);
  for (const t of index.tokens) {
    if (t === w) continue;
    if (w.length >= 3 && t.length > w.length && t.startsWith(w)) add(t, PREFIX);
    else if (max > 0 && editDistance(w, t, max) <= max) add(t, FUZZY);
  }
  return hits;
}

/** A brand abbreviation lands, at full strength, in every group whose
 *  brand carries all of the words it stands for. */
function aliasHitsFor(word, index) {
  const parts = BRAND_ALIASES[word];
  if (!parts) return null;
  const hits = new Map();
  index.groups.forEach((g, gi) => {
    if (parts.every((p) => g.brandTokens.includes(p))) hits.set(gi, EXACT);
  });
  return hits;
}

/**
 * Resolves `words` (already stripped of question filler by the caller)
 * against every product, and settles on one, or says why it cannot.
 *
 * Returns one of:
 *   { status: 'no_match' }
 *   { status: 'ambiguous', matchConfidence, exact, candidates }   distinct products tied
 *   { status: 'low_confidence', matchConfidence, anchor, group, alternatives, ... }
 *   { status: 'matched', matchConfidence, anchor, group, alternatives, wantedConcentration, concentrationMismatch }
 *
 * `group` is every row (size) of the chosen concentration, smallest first;
 * `alternatives` the product's other concentrations, each with its rows.
 */
export function matchProduct({ words, wantedConcentration }, fragrances) {
  const weighted = words.map((word) => ({ word, weight: FUNCTION_WORDS.has(word) ? FUNCTION_WEIGHT : 1 }));
  // A question made only of function words identifies nothing.
  if (!weighted.some((w) => w.weight === 1)) return { status: 'no_match' };

  const index = indexFor(fragrances);
  const totalWeight = weighted.reduce((n, w) => n + w.weight, 0);

  // Per group: weighted strength gathered, how many words landed, whether
  // any landed in the *name*, and how many name characters they account for.
  const acc = new Map();
  for (const { word, weight } of weighted) {
    const hits = aliasHitsFor(word, index) ?? hitsFor(word, index);
    // How rare the word is across the catalogue, for ordering a tie that
    // has to be shown as a list (see `distinctCandidates`).
    const rarity = weight / Math.log2(2 + hits.size);
    for (const [gi, strength] of hits) {
      const g = index.groups[gi];
      let a = acc.get(gi);
      if (!a) acc.set(gi, (a = { got: 0, nameHit: false, nameChars: 0, seen: new Set(), rarity: 0, fuzzy: 0 }));
      a.got += weight * strength;
      a.rarity += rarity;
      if (strength === FUZZY) a.fuzzy += 1;
      const w = canonicalToken(word);
      // Which name token this word accounts for, for tightness. Exact or
      // near-miss: the token itself; prefix: the token it is a prefix of.
      const nameToken = g.nameTokens.find((t) => t === w || t.startsWith(w) || (strength === FUZZY && editDistance(w, t, tolerance(w)) <= tolerance(w)));
      if (nameToken && !a.seen.has(nameToken)) {
        a.seen.add(nameToken);
        a.nameHit = true;
        a.nameChars += nameToken.length;
      }
    }
  }
  if (acc.size === 0) return { status: 'no_match' };

  let scored = [];
  for (const [gi, a] of acc) {
    const g = index.groups[gi];
    const coverage = a.got / totalWeight;
    const tight = g.nameChars > 0 ? Math.min(1, a.nameChars / g.nameChars) : 0;
    scored.push({ g, coverage, tight, nameHit: a.nameHit, rarity: a.rarity, fuzzy: a.fuzzy });
  }

  // A house named in the question is a hard constraint, not one word among
  // several — see `brandWordIn` for the case that forced this.
  const houseWords = weighted.filter((w) => w.weight === 1 && brandWordIn(w.word, index)).map((w) => w.word);
  if (houseWords.length > 0) {
    const carriesHouse = scored.filter((s) => houseWords.every((w) => groupCarries(s.g, w)));
    const named = brandWordIn(houseWords[0], index);
    const brandNamed =
      named.brand ??
      index.groups.find((g) => named.alias.every((p) => g.brandTokens.includes(p)))?.brand ??
      null;
    if (carriesHouse.length === 0 || Math.max(...carriesHouse.map((s) => s.coverage)) < MATCH_FLOOR) {
      // Said as "I can't find that <house> fragrance" only when the rest of
      // the words really did land on some other bottle — that is the case
      // this exists for. "guess what zorblax nebula costs" names the house
      // Guess by accident and matches nothing else at all: a plain "no
      // match" is the true answer there.
      // A house whose whole multi-word name was typed ("le labo santal 33")
      // was named on purpose, whatever the other words matched.
      const elsewhere = Math.max(...scored.map((s) => s.coverage));
      const houseTokens = index.groups.find((g) => g.brand === brandNamed)?.brandTokens ?? [];
      const typed = new Set(words.map(canonicalToken));
      const wholeName = houseTokens.length >= 2 && houseTokens.every((t) => typed.has(t));
      return elsewhere >= MATCH_FLOOR || wholeName ? { status: 'no_match', brandNamed } : { status: 'no_match' };
    }
    scored = carriesHouse;
  }

  const best = Math.max(...scored.map((s) => s.coverage));
  if (best < MATCH_FLOOR) return { status: 'no_match' };

  let top = scored.filter((s) => s.coverage >= best - TIE);
  const matchConfidence = Math.round(best * 100);
  const exact = best >= 0.999;

  // A house is not a bottle: if the words are fully explained by some
  // product's *brand* alone, the reader named a house and nothing else, and
  // no title length can settle which bottle they meant. Checked as "any top
  // group has no name hit" rather than "no group has one", because a shop's
  // mangled listing can carry the house's name inside a product name
  // ("Unbranded | Rabanne Olympea") and must not turn "Rabanne" into that
  // one bottle.
  //
  // Only for a complete match, though. When the words are only partly
  // explained, a group that carries one of them in its *brand* has not been
  // "named as a house" — it is one more partial hit. Measured: "sauvage
  // elixir" (a bottle the catalogue does not hold) tied Dior Sauvage with
  // every Elixir at half coverage, and because a house called "... Elixir"
  // was in the tie the whole answer was the eight most popular Elixirs, with
  // Dior Sauvage — the word the question most specifically named — absent.
  if (top.some((s) => !s.nameHit)) {
    const named = top.filter((s) => s.nameHit);
    if (exact || named.length === 0) {
      return { status: 'ambiguous', matchConfidence, exact, candidates: distinctCandidates(top, 'popularity') };
    }
    top = named;
  }

  // Several distinct products cover the words equally: the one whose name
  // the words describe most completely wins, if it is uniquely the tightest.
  let alsoNamed = [];
  if (new Set(top.map((s) => s.g.productKey)).size > 1) {
    const tightest = Math.max(...top.map((s) => s.tight));
    const tightSet = top.filter((s) => s.tight >= tightest - 1e-9);
    const products = productsIn(tightSet);
    if (products.length > 1) {
      // Two houses selling a bottle of the identical name ("Sauvage" by
      // Dior and by Privee Couture Collection). The words cannot separate
      // them, so the one the market has clearly picked up is the answer
      // and the others are named beside it for the reader to correct.
      // "Clearly": at least twice as many rankable shops, and at least two.
      const [lead, runnerUp] = products;
      if (lead.popularity >= 2 && lead.popularity >= 2 * runnerUp.popularity) {
        alsoNamed = products.slice(1).map((p) => p.sample);
        top = tightSet.filter((s) => s.g.productKey === lead.key);
      } else {
        return { status: 'ambiguous', matchConfidence, exact, candidates: distinctCandidates(top, exact ? 'tight' : 'rarity') };
      }
    } else {
      top = tightSet;
    }
  }

  // One product; choose the concentration.
  const concentrations = top.map((s) => s.g);
  let chosen = null;
  if (wantedConcentration) chosen = concentrations.find((g) => concentrationSatisfies(g.concentration, wantedConcentration)) ?? null;
  const concentrationMismatch = Boolean(wantedConcentration) && chosen === null;
  if (!chosen) {
    chosen = [...concentrations].sort((a, b) => b.popularity - a.popularity || b.rows.length - a.rows.length)[0];
  }
  const alternatives = concentrations
    .filter((g) => g !== chosen)
    .map((g) => ({ brand: g.brand, name: g.name, concentration: g.concentration, group: g.rows }));

  const anchor = chosen.rows[0];
  const shape = {
    matchConfidence,
    // Whether any word reached this product only as a near miss ("sauvge"
    // for Sauvage). Callers that must not guess — a question that may not
    // be about a product at all — can refuse a match that rests on one:
    // "weather" is one letter from "leather".
    fuzzy: (top.find((s) => s.g === chosen)?.fuzzy ?? 0) > 0,
    anchor,
    brand: chosen.brand,
    name: chosen.name,
    concentration: chosen.concentration,
    group: chosen.rows,
    alternatives,
    alsoNamed,
    wantedConcentration: wantedConcentration ?? null,
    concentrationMismatch,
  };
  return { status: best >= MATCH_CONFIDENT ? 'matched' : 'low_confidence', ...shape };
}

/** Distinct products in a scored set, most widely stocked first, each with
 *  its pooled popularity and one row to name it by. */
function productsIn(set) {
  const byKey = new Map();
  for (const s of set) {
    let p = byKey.get(s.g.productKey);
    if (!p) byKey.set(s.g.productKey, (p = { key: s.g.productKey, popularity: 0, sample: null }));
    p.popularity += s.g.popularity;
    if (!p.sample) p.sample = { brand: s.g.brand, name: s.g.name, concentration: s.g.concentration };
  }
  return [...byKey.values()].sort((a, b) => b.popularity - a.popularity);
}

/** Up to eight distinct products from a tied set, the ones the query
 *  describes most completely first, then the more widely stocked. One row
 *  per product (its first size), which is what the callers list. */
function distinctCandidates(top, order = 'tight') {
  const seen = new Set();
  const out = [];
  // 'rarity' is for a partial tie: "sauvage elixir" covers half of Dior
  // Sauvage and half of every Elixir equally, and listing five Elixirs
  // because their names are shorter buried the one the words most
  // specifically point at. The rarer word decides which half leads.
  const ordered = [...top].sort((a, b) =>
    order === 'popularity'
      ? b.g.popularity - a.g.popularity || b.tight - a.tight
      : order === 'rarity'
        ? b.rarity - a.rarity || b.g.popularity - a.g.popularity || b.tight - a.tight
        : b.tight - a.tight || b.g.popularity - a.g.popularity,
  );
  for (const s of ordered) {
    if (seen.has(s.g.key)) continue;
    seen.add(s.g.key);
    // The row a caller lists is given the group's chosen spelling.
    out.push({ ...s.g.rows[0], brand: s.g.brand, name: s.g.name, concentration: s.g.concentration });
    if (out.length >= 8) break;
  }
  return out;
}
