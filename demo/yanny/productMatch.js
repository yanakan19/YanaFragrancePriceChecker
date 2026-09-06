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
};

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
  return `${tokensOf(f.brand).join(' ')}|${tokensOf(f.name).join(' ')}|${normalizeText(f.concentration)}`;
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
      const nameTokens = tokensOf(frag.name);
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
  });
  return { groups, vocab, tokens: [...vocab.keys()] };
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
  const max = tolerance(w);
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
    for (const [gi, strength] of hits) {
      const g = index.groups[gi];
      let a = acc.get(gi);
      if (!a) acc.set(gi, (a = { got: 0, nameHit: false, nameChars: 0, seen: new Set() }));
      a.got += weight * strength;
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

  let best = 0;
  const scored = [];
  for (const [gi, a] of acc) {
    const g = index.groups[gi];
    const coverage = a.got / totalWeight;
    const tight = g.nameChars > 0 ? Math.min(1, a.nameChars / g.nameChars) : 0;
    scored.push({ g, coverage, tight, nameHit: a.nameHit });
    if (coverage > best) best = coverage;
  }
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
  if (top.some((s) => !s.nameHit)) {
    return { status: 'ambiguous', matchConfidence, exact, candidates: distinctCandidates(top, 'popularity') };
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
        return { status: 'ambiguous', matchConfidence, exact, candidates: distinctCandidates(top) };
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
  const ordered = [...top].sort((a, b) =>
    order === 'popularity' ? b.g.popularity - a.g.popularity || b.tight - a.tight : b.tight - a.tight || b.g.popularity - a.g.popularity,
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
