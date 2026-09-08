import {
  NOTE_FAMILY_CANDIDATES,
  descriptorsIn,
  detectAudience,
  detectPerformanceRequest,
  detectOccasionRequest,
  parseBudget,
} from './requestPhrases.js';
import { normalizeText, readConcentration, matchProduct, warmIndex } from './productMatch.js';
import * as data from '../data';
import * as catalogue from '../catalogue.generated';
import * as priceService from '../../src/services/priceService';
import * as brandSites from '../brandSites';
import * as legal from '../legal';
import * as retailers from '../../src/config/retailers';
import * as gender from '../gender';

/**
 * The only place Virtual Yanny touches pricesniffs.space's actual data.
 *
 * There is no database and no API to call: pricesniffs.space is a static
 * site, and its real "database" is the TypeScript modules the rest of this
 * repo already builds and ships from — `demo/data.ts`, `demo/catalogue.
 * generated.ts`, `src/services/priceService.ts`, `demo/brandSites.ts`,
 * `demo/legal.ts`, `src/config/retailers.ts`, `demo/gender.ts`. Importing
 * those directly is the whole integration: no re-scrape, no JSON copy, no
 * second source of truth that can drift from the one the site renders from.
 *
 * ── This runs in the reader's browser ────────────────────────────────────
 * Until 2026-09-06 this engine lived in `YanaFreeAPIMerger/server/` and ran
 * as an Express process on Fly.io, importing the same modules through tsx
 * and paying a ~15 MB TypeScript parse on every cold start. That put a
 * network round trip, a machine resume from suspend and a shared free-tier
 * model router in front of every question — including the eleven intents
 * (price, stock, sizes, notes, delivery, deals, budget, compare, brand,
 * meta, greeting) that never needed a model at all, because their answer
 * is a lookup against data the page has *already downloaded*: demo/index.html
 * inlines the entire catalogue. So the engine now ships inside the site's
 * own bundle (see demo/virtualYanny.ts) and those questions are answered
 * on the reader's machine with no request of any kind. Only the two
 * intents whose answer is a model's phrasing (`suggest`, `general`) leave
 * the browser, and they go to a small Cloudflare Worker (workers/yanny/)
 * with the SITE DATA block already built here.
 *
 * The modules are static imports, so there is exactly one snapshot — the
 * one the page was built from — and every part of one answer is computed
 * from it. Freshness is the page's own freshness: the hourly harvest
 * rebuilds demo/index.html, and the engine inside it is rebuilt with it.
 * The old server had a per-process staleness report for a checkout that
 * could change underneath it; a static bundle has no such state, so that
 * machinery is gone with the server.
 *
 * `loadSite()` stays async and returns the same shape it always did so the
 * lookups and their tests read unchanged; the `await` costs one microtask.
 */
const SITE = Object.freeze({ data, catalogue, priceService, brandSites, legal, retailers, gender });

/**
 * Every site module this engine reads from, as one coherent snapshot.
 * Callers must treat it as read-only.
 */
export async function loadSite() {
  return SITE;
}


function normalize(s) {
  return normalizeText(s);
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A natural question ("how much is Sauvage EDT") is mostly filler around the
// two or three words that actually identify the fragrance — scoring every
// query word equally, filler included, dilutes a genuine match below the
// threshold on exactly the phrasing a real user types rather than a bare
// brand and name. Filtered out here, the same way scoring.js filters its own
// STOPWORDS before judging keyword overlap.
const QUERY_STOPWORDS = new Set([
  'how', 'much', 'is', 'are', 'the', 'a', 'an', 'do', 'does', 'what', 'whats',
  'price', 'cost', 'costs', 'for', 'of', 'in', 'me', 'my', 'you', 'i', 'to',
  'want', 'looking', 'find', 'get', 'buy', 'cheapest', 'lowest',
]);


/* ── "Not stated" is not a concentration ───────────────────────────────── */

/**
 * A concentration as it may be printed, or null when no shop stated one.
 *
 * `concentration` is a required string on every catalogue entry, so there is
 * no empty slot for "the shop did not say" and the harvest fills it with the
 * literal string "Not stated" instead — 208 of the 12,666 products as
 * measured with a count over DEMO_FRAGRANCES. That value is a statement
 * about the *listing*, not a strength of perfume oil in alcohol, and it used
 * to be interpolated into answers in exactly the slot every real strength
 * occupies:
 *
 *   Sol de Janeiro Cheirosa '59 Mist (Not stated), 240ml. Cheapest right
 *   now: £34.40 delivered from Perfume Click.
 *
 * which reads as a fourth concentration alongside Eau de Parfum and Extrait
 * de Parfum rather than as the absence of one. Every label in this backend
 * goes through here so that absence is spelled out instead.
 */
export function concentrationLabel(concentration) {
  const c = String(concentration ?? '').trim();
  return c && !/^not stated$/i.test(c) ? c : null;
}

/**
 * "Brand Name (Eau de Parfum)", or "Brand Name (concentration not stated)".
 *
 * Deliberately explicit rather than simply dropping the bracket: a reader
 * comparing two lines wants to know which of them the shop actually graded,
 * and a silently missing parenthetical looks like a formatting bug.
 */
export function productLabel(f) {
  const c = concentrationLabel(f.concentration);
  return `${f.brand} ${f.name} (${c ?? 'concentration not stated'})`;
}

/**
 * Extra filler to strip when resolving a *named product* out of a question
 * that is not a price question.
 *
 * QUERY_STOPWORDS above is tuned for "how much is X": it strips price
 * vocabulary and the filler that surrounds it, and it is deliberately left
 * exactly as it was, because the price path's behaviour is pinned by tests
 * against the live catalogue and widening its stopword list would move every
 * one of those match scores.
 *
 * The other intents need a different set, for a mechanical reason. The
 * matcher scores `hits / qWords.length`, so every query word that cannot
 * possibly appear in a brand or product name still sits in the denominator
 * and drags a real match below the 0.34 floor. Measured: "who sells Layton"
 * scores 1/3 = 0.33 under QUERY_STOPWORDS alone and resolves to *no match*
 * at all, for a fragrance the catalogue definitely holds.
 *
 * ── Why this is split per intent rather than one big list ────────────────
 * Common English words really are product names here. Checked against the
 * live catalogue: "Blue Note" (Bujairami), "Real Deal" (Bujairami), "Rumour
 * Has It" (Bujairami), "Where's The Party?" (Mr. Wonderful), "Girl of Now"
 * (Elie Saab), "Pleats Please" (Issey Miyake), "Under The Lemon Trees"
 * (Maison Margiela), "More Than Words" (Xerjoff) — a single flat stopword
 * list containing note/deal/size/stock vocabulary would strip the only
 * distinguishing word out of a genuine query for one of them.
 *
 * So each intent strips only its own trigger vocabulary, which by
 * construction is the vocabulary that is *about the question* rather than
 * about the product: an availability question strips "stock", a notes
 * question strips "notes", and neither strips the other's. "is Blue Note in
 * stock" keeps both "blue" and "note"; "what are the notes in Blue Note"
 * strips the plural "notes" and keeps the singular that names the bottle.
 */
const GENERIC_LOOKUP_STOPWORDS = [
  'it', 'its', 'they', 'them', 'their', 'there', 'here', 'this', 'that', 'these', 'those',
  'any', 'some', 'can', 'could', 'would', 'should', 'will', 'have', 'has', 'had', 'got',
  'tell', 'show', 'know', 'please', 'right', 'now', 'today', 'still', 'currently',
  'which', 'who', 'whos', 'where', 'wheres', 'when', 'why', 'be', 'been', 'was', 'were',
  'your', 'yours', 'all', 'about', 'more', 'most', 'many', 'much', 'also', 'just',
  'really', 'ever', 'then', 'so', 'if', 'but', 'not', 'im', 'ive', 'am',
  // Texting shorthand. "best deals rn" left "rn" as the only product word
  // once the deals vocabulary was stripped, and `haystack.includes('rn')`
  // scored 1.0 against Inferno, Eternia and every other title containing
  // the letter pair — turning a browse of the deals list into a clarifying
  // question about eight unrelated perfumes. Measured; pinned in
  // test/corpus.test.js.
  'rn', 'atm', 'pls', 'plz', 'thx', 'asap', 'lol', 'tbh', 'btw',
  // Bare prepositions and conjunctions. These do appear inside real product
  // names ("Game On", "Diamonds And Rubies", "Stronger With You"), which is
  // why they are only ever *removed from the query* and never from the
  // haystack — a query still matches those products on their distinctive
  // words. Left in, they are actively harmful: "what's on sale" reduces to
  // the single word "on" once the deals vocabulary is stripped, and that
  // scores 1.0 against every product with "on" anywhere in its title,
  // turning a question about the deals list into a clarifying question about
  // eight unrelated perfumes. Measured, before this line existed.
  'on', 'at', 'in', 'into', 'onto', 'with', 'and', 'or', 'as', 'per', 'via',
];

const INTENT_LOOKUP_STOPWORDS = {
  availability: [
    'stock', 'stocks', 'stocked', 'stocking', 'stockist', 'stockists', 'sold', 'sell',
    'sells', 'selling', 'available', 'availability', 'anywhere', 'everywhere', 'carry',
    'carries', 'order', 'out', 'in',
  ],
  delivery: [
    'delivery', 'deliveries', 'deliver', 'delivers', 'delivered', 'shipping', 'ship',
    'ships', 'shipped', 'postage', 'post', 'posted', 'free', 'from', 'including',
  ],
  notes: [
    'smell', 'smells', 'smelling', 'smelt', 'note', 'notes', 'accord', 'accords',
    'profile', 'top', 'base', 'middle', 'heart', 'kind', 'sort', 'contain', 'contains',
    'like', 'of',
  ],
  size: [
    'size', 'sizes', 'bottle', 'bottles', 'ml', 'come', 'comes', 'other', 'another',
    'bigger', 'smaller', 'larger', 'travel', 'mini',
  ],
  deals: [
    'sale', 'sales', 'deal', 'deals', 'discount', 'discounts', 'discounted', 'reduced',
    'reduction', 'offer', 'offers', 'off', 'percent', 'bargain', 'bargains', 'clearance',
    'saving', 'savings', 'biggest', 'best', 'drop', 'drops',
  ],
  // "one" is deliberately absent, despite "which one is better" being the
  // phrasing that suggested it: stripping it turned "One Million Elixir" into
  // "Million Elixir", which ties every Rabanne Elixir in the catalogue and
  // made a perfectly clear comparison unanswerable. "which" is already
  // generic filler, which is enough.
  compare: [
    'vs', 'versus', 'compare', 'compared', 'comparison', 'better', 'value', 'worth',
    'than', 'less', 'expensive', 'dearer', 'cheaper', 'cheap',
  ],
  brand: ['list', 'lists', 'listed', 'stock', 'carry', 'sell', 'sells', 'do', 'by'],
  budget: [
    'under', 'below', 'less', 'than', 'more', 'max', 'maximum', 'up', 'around', 'budget',
    'spend', 'quid', 'pounds', 'pound', 'anything', 'something', 'fragrance', 'fragrances',
    'perfume', 'perfumes',
  ],
};

/** The stopword set to strip for a given intent. 'price' keeps exactly the
 *  list it always had, so nothing about the pinned price path moves. */
function stopwordsFor(intent) {
  if (intent === 'price' || !intent) return QUERY_STOPWORDS;
  return new Set([
    ...QUERY_STOPWORDS,
    ...GENERIC_LOOKUP_STOPWORDS,
    ...(INTENT_LOOKUP_STOPWORDS[intent] ?? []),
  ]);
}

/** A bare bottle size written as one token, e.g. "100ml". Survives
 *  `normalize` intact because that keeps digits and letters. */
const SIZE_TOKEN_RE = /^\d+(?:\.\d+)?ml$/;

/** The words of a question that could plausibly name a product, for a given
 *  intent. Exported for tests, which is the only way to check the claims in
 *  the comment above rather than trust them. */
export function productWords(question, intent) {
  const stop = stopwordsFor(intent);
  return normalize(question)
    .split(' ')
    .filter((w) => {
      if (!w || stop.has(w)) return false;
      // A lone letter is apostrophe debris, not a product word: `normalize`
      // turns "what's on sale" into "what s on sale", and that stray "s"
      // survived every stopword list and then matched 1.0 against any
      // product whose title contains an s — which is most of them. Measured:
      // it turned "what's on sale" into a clarifying question about eight
      // unrelated perfumes. Single *digits* are kept, because "1 Million" is
      // a real product name.
      if (/^[a-z]$/.test(w)) return false;
      // A bare size is part of the question, never part of a product's name:
      // "is there a 30ml of Aventus" is about Aventus, and leaving "30ml" in
      // the word list drags a perfect match down to 0.5 (it appears in no
      // brand or product name) and turns an answerable question into a
      // clarifying one. The size itself is not discarded — every caller that
      // cares reads it back off the raw question with its own regex.
      //
      // Not applied to 'price', whose word list is pinned by tests against
      // the live catalogue: there "how much is Dior Sauvage 100ml" scores
      // 2/3 today, and removing the size would take it to 3/3, tying the
      // EDT, EDP and Parfum and turning a working answer into a question.
      if (intent !== 'price' && SIZE_TOKEN_RE.test(w)) return false;
      return true;
    });
}

/**
 * The fixture-friendly face of the matcher: one best row for a query, or
 * null. Used by tests with a synthetic list and by nothing else — the
 * catalogue paths go through `resolveProductQuery`, which reports ties and
 * weak fits instead of collapsing them to a row. Same scorer underneath
 * (see productMatch.js), so the two cannot disagree about what a query
 * names.
 */
export function findFragranceMatch(query, fragrances) {
  const { wanted, rest } = readConcentration(query);
  const words = rest.split(' ').filter((w) => w && !QUERY_STOPWORDS.has(w) && !/^[a-z]$/.test(w));
  const r = matchProduct({ words, wantedConcentration: wanted }, fragrances);
  if (r.status !== 'matched' && r.status !== 'low_confidence') return null;
  return { fragrance: r.anchor, matchConfidence: r.matchConfidence };
}

/** Where a "no <this>" exclusion starts, and what it excludes. Free text on
 *  the exclusion side deliberately: an exclusion is matched by substring
 *  against candidates' own notes below, so "no florals" usefully rules out
 *  "Floral Notes" and "White Floral" without either being a catalogue note
 *  name in its own right. */
const NOTE_EXCLUSION_RE = /no\s+([a-z, ]+)/;

function splitOnExclusion(lower) {
  const m = lower.match(NOTE_EXCLUSION_RE);
  return m
    ? { wantedText: lower.slice(0, m.index), unwanted: m[1].split(/[, ]+/).filter(Boolean) }
    : { wantedText: lower, unwanted: [] };
}

// (The original `parseNoteRequest` — split the sentence on commas and " and "
// and call each fragment a note — lived here until it had no production
// callers left: the wanted side moved to `extractNotes` below, the exclusion
// side to `splitOnExclusion` above. Removed as dead code from the
// pre-classifier era.)

/**
 * The note names this catalogue actually uses, for reading notes out of a
 * sentence.
 *
 * The original parser split the question on commas and " and " and
 * treated every fragment as a note name, which `fragrancesWithNote` then
 * matched *exactly*. That works for "vanilla, amber" and fails for every
 * sentence a person actually types: "suggest something with vanilla and
 * amber, no florals" yields the fragment "suggest something with vanilla",
 * which matches no note at all, so half the request is silently dropped
 * before the council ever sees it. The council then gets a SITE DATA block
 * saying nothing matched, for a request the catalogue could have answered —
 * and a model given nothing to work from is exactly the situation that
 * produced this project's original invented-answer bug.
 *
 * So the wanted side is read against the catalogue's own note vocabulary
 * (`NOTE_INDEX`, 1,576 distinct names) rather than guessed from punctuation.
 *
 * Two filters on the vocabulary, both because the index is harvested text
 * and not a curated list: names shorter than three characters and names used
 * by fewer than three fragrances are dropped. Without them the index's own
 * junk entries — measured, in the live catalogue: "An" (1 fragrance), "Mr"
 * (1), "Min" (1), "Tob" (1), "Deepening the experience" (1) — would match
 * ordinary English words in the question and invent a note request nobody
 * made.
 */
/**
 * Vocabulary entries that are listing metadata, not notes.
 *
 * `Notes` is populated from whatever a retailer labelled as notes, and some
 * feeds put a season or an audience in that field. Measured in the live
 * catalogue: Versace Pour Homme Dylan Blue's note list reads "Summer,
 * Autumn, Summer, Autumn, Summer, Autumn". Left in the query vocabulary,
 * "recommend me a summer fragrance" reads "summer" as a note request and
 * grounds the council with four products that share a season tag — a
 * confident-looking answer to a question about weather, built on metadata.
 *
 * Only the fragrances' stored notes are left untouched; this list governs
 * what may be read *out of a question* as a request.
 */
const NON_NOTE_VOCABULARY = new Set([
  'summer', 'autumn', 'winter', 'spring', 'fall',
  'women', 'men', 'unisex', 'ladies', 'gents', 'him', 'her',
  // ── The words that mean "perfume", not a smell ────────────────────────
  // Added 2026-09-08 after the harvest put an ingredients declaration into
  // some products' note lists: a shop's page lists "Parfum, Fragrance,
  // Aqua, Water, Linalool, Limonene, Ci 15985" as if those were notes, so
  // NOTE_INDEX gained a literal note called "Fragrance" (5 products) and
  // another called "Water" (11). Nothing guards a question against that,
  // and the effect was immediate and wrong in two directions at once:
  //
  //   "recommend me a summer fragrance"  — the season is already refused,
  //     but "fragrance" then matched a real note, so the question read as
  //     groundable and went to a model instead of the honest refusal.
  //   "cheapest niche fragrance you list" — 273 priced niche bottles were
  //     filtered down to the 0 that carry the note literally named
  //     "Fragrance", which then crashed the empty-answer branch (see
  //     formatBudgetAnswer). "cheapest designer fragrance" was worse: it
  //     survived with 4 bottles chosen for carrying an ingredients
  //     declaration, presented as the cheapest designer fragrances. A
  //     confident wrong answer, which is the one thing this path exists to
  //     rule out.
  //
  // So the words a shopper uses for the product itself are barred from
  // being read out of a question as a request for a note. As with the
  // seasons above, this governs only what a *question* may ask for; the
  // fragrances' own stored notes are untouched, and a genuine aroma
  // material that doubles as an allergen declaration (Coumarin, Linalool,
  // Geraniol, Citral) stays a note, because it really is one.
  'fragrance', 'fragrances', 'perfume', 'perfumes', 'scent', 'scents',
  'parfum', 'aqua', 'water', 'eau', 'alcohol',
]);

let noteVocabulary = null;
async function noteVocab() {
  if (noteVocabulary) return noteVocabulary;
  const { data } = await loadSite();
  noteVocabulary = data.NOTE_INDEX
    .filter((n) => n.count >= 3 && !NON_NOTE_VOCABULARY.has(normalize(n.name)))
    .map((n) => ({ name: n.name, needle: normalize(n.name) }))
    .filter((n) => n.needle.length >= 3)
    // Longest first, so "Dark Chocolate" is read as one note rather than
    // consumed as "Chocolate" with a stray "dark" left over.
    .sort((a, b) => b.needle.length - a.needle.length);
  return noteVocabulary;
}

/** Every catalogue note named in a piece of text, longest match first, each
 *  consumed so it cannot also match as part of a shorter one. Exported so
 *  the vocabulary claims above are testable. */
export async function extractNotes(text) {
  const vocab = await noteVocab();
  let haystack = ` ${normalize(text)} `;
  const found = [];
  for (const note of vocab) {
    const padded = ` ${note.needle} `;
    if (!haystack.includes(padded)) continue;
    found.push(note.name);
    haystack = haystack.split(padded).join('  ');
  }
  return found;
}

/**
 * The descriptor families, with every candidate note checked against the
 * live catalogue before it is allowed to be part of one.
 *
 * `requestPhrases.js` proposes the note names for "sweet", "fresh", "woody"
 * and the rest; this is where a proposal becomes usable, and the check is
 * the entire safety argument for the feature. A name is kept only if
 * NOTE_INDEX carries it with the same `count >= 3` floor `noteVocab` uses
 * (harvested text, so a name used once is as likely to be junk as a real
 * note). Anything else is dropped silently and the family is simply
 * smaller. That means this code cannot name a note the catalogue does not
 * use even if the table over there goes stale — measured today, "Marine
 * Notes", "Sea Notes", "Green Notes" and "Woody Notes" all resolve to 0 in
 * the live index, which is why they are not in the table at all.
 *
 * A family with nothing left is dropped entirely rather than answered as an
 * empty match, so a descriptor whose notes have all fallen out of the index
 * degrades to "I can't match that" instead of quietly matching everything.
 */
let noteFamilyCache = null;
export async function noteFamilies() {
  if (noteFamilyCache) return noteFamilyCache;
  const { data } = await loadSite();
  const counts = new Map(data.NOTE_INDEX.map((n) => [n.name.toLowerCase(), n]));
  const families = new Map();
  for (const [family, { notes }] of Object.entries(NOTE_FAMILY_CANDIDATES)) {
    const kept = notes
      .map((name) => counts.get(name.toLowerCase()))
      .filter((entry) => entry && entry.count >= 3)
      .map((entry) => entry.name);
    if (kept.length > 0) families.set(family, kept);
  }
  noteFamilyCache = families;
  return families;
}

/**
 * Everything a question asks for on the scent side: the notes it names
 * outright, plus the notes each descriptor word is read as.
 *
 * One function, because the two used to be one call and the gap was
 * invisible to a reader. "Something sweet under £30" named the literal
 * catalogue note "Sweet" — used by 8 fragrances out of 10,379 — and nothing
 * else, so the answer looked like the catalogue held almost nothing sweet.
 * Expanding the descriptor puts the request where the data actually is
 * (Vanilla 1,213, Tonka Bean 379, Caramel 206, …) without any answer ever
 * claiming a note a bottle does not list.
 *
 * `families` comes back beside the flat note list precisely so callers can
 * *show their working*: an answer built on a descriptor names the notes it
 * read the word as, which is the difference between a reading a reader can
 * disagree with and a fact this site invented.
 *
 * @returns {Promise<{ notes: string[], literal: string[], families: {family: string, word: string, notes: string[]}[], unmatchedDescriptors: string[] }>}
 */
export async function requestedNotes(text) {
  const literal = await extractNotes(text);
  const available = await noteFamilies();
  const families = [];
  const unmatchedDescriptors = [];
  for (const { word, family } of descriptorsIn(text)) {
    const notes = available.get(family);
    if (notes) families.push({ family, word, notes });
    else unmatchedDescriptors.push(word);
  }
  // Literal first: a note the reader typed by name outranks one this code
  // inferred from an adjective, and the candidate ranking below is by how
  // many requested notes a product carries.
  const notes = [...new Set([...literal, ...families.flatMap((f) => f.notes)])];
  return { notes, literal, families, unmatchedDescriptors };
}

/** "what smells like Aventus", "any dupes for Baccarat Rouge" — the phrases
 *  that name a *reference fragrance* rather than a note. Deliberately
 *  specific: a bare "like" is far too common in ordinary phrasing to treat
 *  as a product reference. */
const SIMILAR_TO_RE = /\b(?:similar to|smells? like|smelling like|dupes? (?:for|of)|alternatives? to|clones? of|something like|reminds me of|in the style of)\s+(.{2,60})$/i;

/**
 * The real, delivery-inclusive price for a fragrance — built from the exact
 * same `buildComparison`/`bestOffer` pipeline the site itself renders the
 * detail page from (see demo/app.ts's own rowsFor), so a number this backend
 * states can never disagree with what a reader sees on the page for the same
 * fragrance.
 */
async function priceContextFor(question) {
  const r = await resolvePriceQuery(question);
  if (r.status === 'no_match') {
    return 'PRICE MATCH: none. No fragrance in the current catalogue matched this query closely enough to quote a price.';
  }
  if (r.status === 'ambiguous') {
    const names = r.candidates.slice(0, 5).map((f) => productLabel(f)).join('; ');
    return `PRICE MATCH: none settled. Several distinct products match the words equally well: ${names}. Ask which was meant rather than quoting one.`;
  }

  const gbp = (n) => `£${n.toFixed(2)}`;
  const sizeLine = (v) =>
    v.best
      ? `${v.sizeMl}ml ${gbp(v.best.deliveredPriceGbp)} delivered from ${v.best.retailerName} (stocked by ${v.purchasableCount} shop(s))`
      : `${v.sizeMl}ml currently out of stock everywhere this site tracks`;
  const label = productLabel({ brand: r.brand, name: r.name, concentration: r.concentration });
  const weak = r.status === 'low_confidence' ? ', weak fit — hedge on identity' : '';
  const mismatch = r.concentrationMismatch
    ? ` The question asked for ${r.wantedConcentration}, which this product is not tracked in.`
    : '';
  const also = r.alternatives.length
    ? ` Also tracked as: ${r.alternatives
        .map((a) => `${concentrationLabel(a.concentration) ?? 'concentration not stated'} (${a.variants.map(sizeLine).join('; ')})`)
        .join('; ')}.`
    : '';
  return `PRICE MATCH (${r.matchConfidence}% confidence${weak}): ${label}. Sizes: ${r.variants.map(sizeLine).join('; ')}.${mismatch}${also}`;
}

/* ── who a fragrance is sold to ────────────────────────────────────────── */

/**
 * The site's own reading of who each bottle is for, and how much of the
 * catalogue that reading actually covers.
 *
 * ── Why this exists now, having been a refusal before ────────────────────
 * Virtual Yanny used to answer every gender question with "I can't filter by
 * who it is for — the catalogue doesn't record that." That was correct when
 * it was written and it is now half wrong. There is still no gender field
 * anywhere in this project, and there never will be one upstream; what
 * changed is that `demo/gender.ts` now exists, reads an audience off the
 * words a shop printed in its own title, and the site's filter panel offers
 * it. Refusing a question the site itself answers in a sidebar is no longer
 * honesty, it is a stale answer.
 *
 * ── What is read, and what is emphatically not ───────────────────────────
 * `readGenderEvidence` is imported, never reimplemented. Two readings of the
 * same titles would drift on the first exclusion anyone adds — "Portrait Of
 * A Lady" is not a women's fragrance, "Rose Of No Man's Land" is not a
 * men's, "Donna Karan" is a person — and then the chatbot and the filter
 * would classify the same bottle differently in front of the same reader.
 *
 * The rule that governs every answer built on this: **not stated never
 * becomes unisex**. They are different claims and only one of them is ours.
 * Measured on this snapshot (`npx tsx scripts/gender-coverage.ts`, 12,666
 * products):
 *
 *   Women's       657    5.19%
 *   Men's       1,040    8.21%
 *   Unisex         18    0.14%
 *   Not stated 10,951   86.46%
 *
 * 1,715 classified, 13.54%. Eighteen titles say unisex. Ten thousand nine
 * hundred and fifty-one say nothing, and folding those into unisex would
 * attach a marketing claim nobody made to the largest group in the
 * catalogue. So a gender answer filters to exactly the reading asked for
 * and discloses the split, the same way the filter panel does on screen.
 * `genderCoverage()` computes those numbers rather than quoting them, so the
 * disclosure is arithmetic a reader can check and not a comment that rots.
 */
let genderIndexPromise = null;

async function buildGenderIndex() {
  const { data, gender } = await loadSite();
  const byId = new Map();
  const counts = { mens: 0, womens: 0, unisex: 0, notStated: 0 };
  for (const f of data.DEMO_FRAGRANCES) {
    // Exactly the string demo/app.ts reads, so a classification the chatbot
    // states can be checked against the card the reader is looking at.
    const evidence = gender.readGenderEvidence(`${f.brand} ${f.name} ${f.concentration}`);
    byId.set(f.id, evidence);
    counts[evidence.reading] += 1;
  }
  const total = data.DEMO_FRAGRANCES.length;
  return {
    byId,
    counts,
    total,
    stated: total - counts.notStated,
    label: gender.GENDER_LABEL,
  };
}

/** The reading for every product, plus the coverage split. Computed once per
 *  process, like every other index here — the snapshot cannot change under
 *  it (see this file's header). */
export async function genderCoverage() {
  if (!genderIndexPromise) {
    genderIndexPromise = buildGenderIndex().catch((err) => {
      genderIndexPromise = null;
      throw err;
    });
  }
  return genderIndexPromise;
}

/**
 * The disclosure, in one sentence, written once and used by both the
 * deterministic answer and the council's SITE DATA block.
 *
 * It says three things and none of them is optional: where the reading comes
 * from, how much of the catalogue it covers, and that silence is not unisex.
 * Drop any one of them and the answer starts implying the other 86% were
 * considered and rejected.
 */
export async function genderDisclosure() {
  const g = await genderCoverage();
  const n = (x) => x.toLocaleString('en-GB');
  return (
    'Read from wording in the title, such as "Pour Homme" or "For Her" — ' +
    `${n(g.stated)} of the ${n(g.total)} bottles say who they are for and ${n(g.counts.notStated)} do not say. ` +
    `Not stated is not the same as unisex: only ${n(g.counts.unisex)} titles say unisex, and I don't read silence as one.`
  );
}

/** `<brand>|<name>|<concentration>`, lowercased: every size of one perfume
 *  shares this key (mirrors `variantGroup` in demo/data.ts). */
function groupKeyFor(f) {
  return `${f.brand}|${f.name}|${f.concentration}`.toLowerCase();
}

/**
 * Deterministic, LLM-free resolution of a price question against the live
 * catalogue — no model call, so it cannot hallucinate a denial, a price, a
 * size or a retailer the way the reported "One Million Elixir" bug did. See
 * `formatPriceAnswer` below for turning this into the words a reader sees,
 * and `runCouncil` in council.js for why intent `'price'` answers from this
 * alone rather than fanning the question out to the model council at all.
 *
 * Reuses `findFragranceMatch`'s exact scoring (same word-overlap, same 0.34
 * threshold, same stopword filter) — the whole point is that this can never
 * disagree with what the SITE DATA block already told a model, it just also
 * gets to act on the answer directly instead of asking an LLM to relay it.
 *
 * Goes one step further findFragranceMatch does not: `findFragranceMatch`
 * returns a single best-scoring *row*, silently picking whichever happens to
 * sit first in the catalogue when several score identically. That is fine
 * for grounding a prompt (the LLM sees the whole SITE DATA block, sizes
 * included), but wrong for a reply written with no LLM in the loop at all — a
 * bare brand name like "Rabanne" scores 1/1 against every Rabanne fragrance
 * equally, and confidently naming one of them as "the" answer would be a
 * fluent, well-formed, wrong answer, exactly the failure mode this whole fix
 * exists to remove. So this checks for a tie across *distinct products*
 * (different brand+name+concentration, not just different sizes of the same
 * one) at the top score, and reports `ambiguous` rather than guessing.
 */
/**
 * A matched group's rows, one slice per size, smallest first. A size with
 * no stated volume (`sizeMl` null) is its own slice at the end.
 */
export function sizeSlices(group) {
  const by = new Map();
  for (const f of group) {
    const key = f.sizeMl ?? 'unknown';
    if (!by.has(key)) by.set(key, { sizeMl: f.sizeMl, frags: [] });
    by.get(key).frags.push(f);
  }
  return [...by.values()].sort((a, b) => (a.sizeMl ?? Infinity) - (b.sizeMl ?? Infinity));
}

export async function resolvePriceQuery(question) {
  const { catalogue, priceService } = await loadSite();
  const resolved = await resolveProductQuery(question, 'price');
  if (resolved.status !== 'matched' && resolved.status !== 'low_confidence') return resolved;

  // One entry per size. Two shops' listings of the same bottle are separate
  // catalogue rows with separate ids (different EANs, or one shop without
  // one), and a price answer that read "50ml, 50ml, 50ml" was listing rows,
  // not sizes. Their offers are pooled before the comparison is built, so
  // the cheapest is the cheapest across both.
  const variantsOf = (group) =>
    sizeSlices(group).map(({ sizeMl, frags }) => {
      const offers = frags.flatMap((f) => catalogue.offersFor(f.id));
      const rows = priceService.buildComparison(offers, { sortBy: 'delivered', tier: frags[0].tier });
      const best = priceService.bestOffer(rows);
      return {
        sizeMl,
        purchasableCount: rows.filter((r) => r.isPurchasable).length,
        best: best ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name } : null,
      };
    });

  const { group, matchConfidence, alternatives, alsoNamed, wantedConcentration, concentrationMismatch } = resolved;
  return {
    status: resolved.status,
    matchConfidence,
    brand: resolved.brand,
    name: resolved.name,
    concentration: resolved.concentration,
    variants: variantsOf(group),
    alsoNamed,
    alternatives: alternatives.map((a) => ({
      brand: a.brand,
      name: a.name,
      concentration: a.concentration,
      variants: variantsOf(a.group),
    })),
    wantedConcentration,
    concentrationMismatch,
  };
}

/**
 * Which product a question names, if any — the single identity step every
 * deterministic lookup shares.
 *
 * This is `resolvePriceQuery`'s own matching, lifted out unchanged so that
 * "is X in stock", "what does X smell like", "what sizes of X" and "how much
 * is X" can never disagree about what X is. The only thing parameterised is
 * which stopwords get stripped first (see `stopwordsFor`); with
 * `intent: 'price'` the behaviour is byte-for-byte what it was, which is why
 * the price tests pinned against the live catalogue still pass.
 *
 * Four outcomes, and three of them are refusals:
 *   - `no_match`      nothing in the catalogue scored above the 0.34 floor.
 *   - `ambiguous`     several *distinct products* (not merely several sizes
 *                     of one) tied at the top score. Returns up to 8 of them
 *                     so the caller can ask which was meant rather than
 *                     picking one, which would be a fluent wrong answer.
 *   - `low_confidence` one product, but scoring under 0.5 — loose enough
 *                     that stating facts about it as though it were the
 *                     product asked for would be a guess.
 *   - `matched`       one product, at or above 0.5. `group` is every size of
 *                     it in the catalogue, smallest first.
 *
 * The three refusals are the whole safety argument for every caller: a
 * deterministic answer is only ever written when the identity of the product
 * is settled, and the words for the other three cases say plainly that it is
 * not.
 */
/**
 * Whether an unmatched question reads like a follow-up to an earlier one —
 * "what about the 50ml", "is it in stock", "how much is that one".
 *
 * `/api/chat` keeps no conversation (the README and demo/legal.ts both say
 * so), so there is nothing to resolve "it" against and the lookup rightly
 * finds no product. But the stock refusal — "try the brand and product
 * name" — reads as if the bot forgot something it was just told, which is
 * more confusing than the truth. This flag lets `formatIdentityRefusal` say
 * the truth instead: each message stands alone.
 *
 * Checked only after a lookup has already failed, which is what makes the
 * loose pronoun patterns safe: a question that *did* resolve never gets
 * here, so the only cost of a false positive is one extra true sentence on
 * a refusal.
 */
const FOLLOW_UP_RE = /\b(what|how|and) about\b|\b(it|its|that one|this one|the same one?|the other one)\b|^and\b/i;
export function seemsFollowUp(question) {
  return FOLLOW_UP_RE.test(String(question ?? ''));
}

/**
 * Which product a question names, if any — the single identity step every
 * deterministic lookup shares, so "is X in stock", "what does X smell
 * like", "what sizes of X" and "how much is X" can never disagree about
 * what X is. The scoring lives in productMatch.js, whose header explains
 * it and the reported case it was rewritten for; this reads the question's
 * concentration and size out first (a preference and a filter, not part of
 * the name) and strips the intent's own filler (see `stopwordsFor`).
 *
 * Four outcomes, and two of them are refusals:
 *   - `no_match`       nothing scored above the floor.
 *   - `ambiguous`      several *distinct products* tied. Returns up to 8 so
 *                      the caller can ask which was meant rather than pick.
 *   - `low_confidence` one product, but a weak fit: callers hedge on identity.
 *   - `matched`        one product. `group` is every size of the chosen
 *                      concentration, smallest first; `alternatives` its
 *                      other concentrations; `concentrationMismatch` says the
 *                      question asked for a concentration it is not tracked in.
 */
export async function resolveProductQuery(question, intent = 'price') {
  const { data } = await loadSite();
  const { wanted, rest } = readConcentration(question);
  // A bare size is part of the question, never part of a product's name:
  // "is there a 30ml of Aventus" is about Aventus. Every caller that cares
  // reads the size back off the raw question with its own regex.
  const qWords = productWords(rest.replace(/\b\d+(?:\.\d+)?\s?ml\b/g, ' '), intent);
  if (qWords.length === 0) return { status: 'no_match', followUp: seemsFollowUp(question) };
  const result = matchProduct({ words: qWords, wantedConcentration: wanted }, data.DEMO_FRAGRANCES);
  if (result.status === 'no_match') return { status: 'no_match', followUp: seemsFollowUp(question) };
  return result;
}

/** "A, B and C". */
function listWords(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const ANSWER_SIZE_RE = /(\d+(?:\.\d+)?)\s?ml\b/i;
const ANSWER_CHEAPEST_RE = /\b(cheapest|lowest|all sizes|every size|each size|full list)\b/i;

/**
 * The deterministic reply text for a `resolvePriceQuery` result — the only
 * place user-facing words get attached to that data. Every price, size and
 * retailer here is read straight off `result`; nothing is composed from the
 * question or invented to sound complete.
 *
 * One shape, per the owner's request for what a price answer should do:
 * name the closest match, give every tracked size with its cheapest
 * delivered price, and end with the one-line way to correct it if the match
 * was wrong. A question that names a size gets that size's price and the
 * other sizes by name only; one that asks for a concentration the product
 * is not tracked in is told so before the sizes rather than quietly given
 * a different bottle.
 */
export function formatPriceAnswer(question, result) {
  const gbp = (n) => `£${n.toFixed(2)}`;
  const priced = (v) =>
    v.best
      ? `${v.sizeMl}ml: ${gbp(v.best.deliveredPriceGbp)} delivered from ${v.best.retailerName}`
      : `${v.sizeMl}ml: out of stock everywhere we track`;
  const CORRECTION = "Not the one you meant? Type the exact brand and product name and I'll look again.";

  if (result.status === 'no_match') {
    // Same follow-up honesty as formatIdentityRefusal in lookups.js: a
    // question that leans on a pronoun failed because no conversation is
    // kept, and the refusal should say that rather than imply the name was
    // wrong.
    const followUpNote = result.followUp
      ? 'Each message here stands alone — I don\'t carry the previous question over, so I can\'t tell what "it" refers to. '
      : '';
    return (
      `${followUpNote}I don't have a fragrance matching that in the current catalogue. Try the brand and product name — ` +
      'for example "Dior Sauvage EDT".'
    );
  }

  if (result.status === 'ambiguous') {
    // At most five: enough to pick from, not a wall of names. The matcher
    // score is deliberately not printed — on this branch it is a score for
    // the set, not for an answer.
    const names = result.candidates.slice(0, 5).map((f) => productLabel(f));
    if (result.exact === false) {
      return `Nothing matches that exactly. Closest I have: ${names.join(', ')}. Type the full name of the one you meant and I'll look again.`;
    }
    return `A few products match that: ${names.join(', ')}. Which one did you mean? Type its full name.`;
  }

  const { brand, name, concentration, variants = [], alternatives = [], alsoNamed = [], wantedConcentration, concentrationMismatch } = result;
  const label = productLabel({ brand, name, concentration });
  const exact = result.status === 'matched' && result.matchConfidence >= 97;
  const lead =
    result.status === 'low_confidence'
      ? `Closest I can find, though I'm not certain it's the one: ${label}.`
      : exact
        ? `${label}.`
        : `Closest match: ${label}.`;
  const mismatch = concentrationMismatch
    ? ` I don't track it as ${wantedConcentration}; this is the ${concentrationLabel(concentration) ?? 'listing with no concentration stated'}.`
    : '';
  const also = alternatives.length
    ? ` Also tracked as ${listWords(alternatives.map((a) => concentrationLabel(a.concentration) ?? 'a listing with no concentration stated'))}.`
    : '';

  let sizes = '';
  const sizeMatch = question.match(ANSWER_SIZE_RE);
  if (variants.length === 0) {
    sizes = '';
  } else if (result.status === 'low_confidence') {
    // A weak fit names its sizes so the reader can recognise the bottle,
    // and quotes nothing: a price beside a guess reads as a price for the
    // thing that was asked about.
    sizes = `Tracked in ${listWords(variants.map((v) => `${v.sizeMl}ml`))}.`;
  } else if (sizeMatch) {
    const wantedSize = Number(sizeMatch[1]);
    const hit = variants.find((v) => v.sizeMl === wantedSize);
    if (hit) {
      const others = variants.filter((v) => v !== hit).map((v) => `${v.sizeMl}ml`);
      sizes = `${priced(hit)}.${others.length ? ` Also in ${others.join(', ')}.` : ''}`;
    } else {
      sizes = `Not tracked in ${sizeMatch[1]}ml. Sizes I have — ${variants.map(priced).join(' · ')}.`;
    }
  } else {
    sizes = `${variants.length === 1 ? 'Size' : 'Sizes'} — ${variants.map(priced).join(' · ')}.`;
  }

  // Another house sells a bottle of the same name; say so beside the
  // answer rather than silently choosing, so the correction is one line.
  const namesake = alsoNamed.length
    ? ` There is also ${listWords(alsoNamed.map((p) => productLabel(p)))}, if that was the one.`
    : '';

  return [`${lead}${mismatch}${also}${namesake}`, sizes, CORRECTION].filter(Boolean).join('\n');
}

/**
 * Everything one messy sentence asks for, read once.
 *
 * Split out of `suggestContextFor` so the *decision* about whether a
 * question can be answered from the catalogue at all is available before
 * any answer is written — `resolveSuggestQuery` in lookups.js needs exactly
 * this reading in order to refuse deterministically, rather than handing an
 * ungroundable question to a model and trusting the prompt to hold. One
 * parse, two consumers, so the refusal and the grounding cannot disagree
 * about what was asked.
 *
 * Reading four things off the same sentence is the other half of the point.
 * A real question carries several constraints at once — "find a woman a
 * perfume under £30 that smells sweet" is an audience, a price ceiling and
 * a scent — and honouring one while silently dropping the rest is how an
 * answer ends up fluent, confident and off-target. Measured before this
 * existed, that exact question was classified `budget` and answered with
 * the five most widely stocked bottles under £30, none of them selected for
 * sweetness, the second of them Calvin Klein Obsession For Men.
 */
export async function parseSuggestRequest(question) {
  const raw = String(question ?? '');
  const { data } = await loadSite();
  const { wantedText, unwanted } = splitOnExclusion(raw.toLowerCase());

  // "What smells like Aventus" names no note at all, and the honest way to
  // ground it is not to give the council nothing: it is to look the
  // reference fragrance up, take the notes the catalogue holds *for it*, and
  // find real products that share them. The council still writes the answer
  // — whether two perfumes actually smell alike is a judgement no note list
  // settles — but it now writes it from this site's own data rather than
  // from a model's memory of what Aventus smells like.
  let reference = null;
  let referenceUnresolved = null;
  const similar = wantedText.match(SIMILAR_TO_RE);
  if (similar) {
    const resolved = await resolveProductQuery(similar[1], 'suggest');
    let group = resolved.status === 'matched' ? resolved.group : null;
    let anchor = resolved.anchor ?? null;

    // "What smells like Tom Ford Black Orchid" ties the EDP, the EDT and the
    // Parfum, and `resolveProductQuery` is right to refuse to pick one for a
    // price. Here it does not have to: the question is about what something
    // smells like, and the concentrations of one perfume are the one kind of
    // ambiguity that question does not care about. So when the tie is
    // *only* across concentrations of a single brand+name, all of them are
    // taken as the reference and their notes merged. Any wider ambiguity is
    // still refused.
    if (!group && resolved.status === 'ambiguous' && resolved.exact === true) {
      // Tightest fit first, the same containment argument
      // `resolveProductQuery` uses: "Tom Ford Black Orchid" ties its EDP,
      // EDT and Parfum with "Tom Ford Black Orchid Reserve", which is a
      // different perfume with an extra word. Dropping the longer titles
      // leaves only the concentrations, which is the ambiguity this branch
      // is allowed to collapse.
      const words = (c) => normalize(`${c.brand} ${c.name}`).split(' ').length;
      const fewest = Math.min(...resolved.candidates.map(words));
      const tightest = resolved.candidates.filter((c) => words(c) === fewest);
      const names = new Set(tightest.map((c) => `${c.brand}|${c.name}`.toLowerCase()));
      if (names.size === 1) {
        const [brand, name] = [tightest[0].brand, tightest[0].name];
        group = data.DEMO_FRAGRANCES.filter((f) => f.brand === brand && f.name === name);
        anchor = { brand, name, concentration: 'all concentrations' };
      }
    }

    if (!group) referenceUnresolved = similar[1].trim();
    else {
      const notes = new Set();
      for (const frag of group) {
        for (const layer of ['top', 'middle', 'base']) {
          for (const n of frag.notes?.[layer] ?? []) if (n.trim()) notes.add(n.trim());
        }
      }
      reference = {
        label: productLabel(anchor),
        key: groupKeyFor(anchor),
        brandName: `${anchor.brand}|${anchor.name}`.toLowerCase(),
        notes: [...notes],
      };
    }
  }

  // When the question names a reference fragrance, notes are read from that
  // fragrance and never from the rest of the sentence.
  //
  // The fallback that used to sit here read the whole question instead, and
  // the question contains the reference's own *name*: "any dupes for Tom
  // Ford Black Orchid" extracted the note "Orchid" straight out of the
  // product title and grounded the council with five unrelated florals that
  // happen to list orchid. The words the reader typed to identify a bottle
  // are not a description of what they want it to smell like.
  const scent = similar
    ? { notes: reference?.notes ?? [], literal: reference?.notes ?? [], families: [], unmatchedDescriptors: [] }
    : await requestedNotes(wantedText);

  return {
    wantedText,
    unwanted,
    reference,
    referenceUnresolved,
    wanted: scent.notes,
    literal: scent.literal,
    families: scent.families,
    unmatchedDescriptors: scent.unmatchedDescriptors,
    // Read off the raw question rather than `wantedText`: an exclusion
    // clause truncates wantedText, and "for my wife" can sit after it.
    audience: detectAudience(raw),
    performance: detectPerformanceRequest(raw),
    occasion: detectOccasionRequest(raw),
    budget: parseBudget(raw),
  };
}

/**
 * What the model is told when a question names who a fragrance is for.
 *
 * This block replaced a flat "not recorded" refusal, and the wording is
 * doing more work than it looks. There is still no gender field anywhere in
 * this project; what exists is a reading of the product's own title, and it
 * covers 13.54% of the catalogue. A model shown only "the reader asked who
 * it is for" fills that gap from its own training, so the block states the
 * mechanism, the coverage, and the inferences that are forbidden — silence
 * is not unisex, a note list is not an audience, a famous name is not an
 * audience — rather than leaving any of them to be worked out.
 *
 * It is paired with the per-candidate readings `suggestContextFor` prints,
 * so anything a model says about who a listed bottle is for is quoting SITE
 * DATA under rule 1 rather than recalling it.
 */
export async function audienceContextLine(request) {
  if (!request.audience) return '';
  const g = await genderCoverage();
  const n = (x) => x.toLocaleString('en-GB');
  return (
    'Read from title wording only. The catalogue has no gender or audience field — a fragrance record is ' +
    'brand, name, concentration, size, EAN, tier, popularity, photo and notes — so the audience shown on ' +
    `each candidate above comes from words in its own title. ${n(g.stated)} of the ${n(g.total)} bottles ` +
    `say who they are for (${n(g.counts.womens)} women's, ${n(g.counts.mens)} men's, ${n(g.counts.unisex)} ` +
    `unisex) and ${n(g.counts.notStated)} do not say. State that coverage whenever you use the reading. ` +
    'Never treat "not stated" as unisex, never infer an audience from a note list or from your own ' +
    'knowledge of a fragrance, and never say a bottle is for someone when its line above says the ' +
    'audience is not stated.'
  );
}

/**
 * The two constraints this catalogue holds no data for, written out for
 * whoever is going to answer.
 *
 * Both are things people really ask for and neither is in the data (see
 * `detectAudience` and `detectPerformanceRequest` in requestPhrases.js for
 * the measurements). Naming them explicitly in the SITE DATA block matters
 * more than it looks: rule 1 of the council prompt lets a model state only
 * what SITE DATA contains, and a block that is merely *silent* about gender
 * leaves the model free to read "for a woman" out of the question and
 * quietly filter on its own idea of what that means. A block that says the
 * catalogue has no such field turns that into a rule violation.
 */
export function unsupportedConstraintLines(request) {
  const lines = [];
  // Gender used to head this list and no longer appears in it at all. It is
  // no longer a constraint the data cannot meet — it is one the data meets
  // partly, from title wording, and saying "cannot" about it would now be
  // the false statement. It has its own block; see `audienceContextLine`.
  if (request.performance) {
    lines.push(
      'STRENGTH AND LONGEVITY: not recorded. Nothing in the catalogue measures how strong a fragrance ' +
        'is, how long it lasts or how far it projects. Say so plainly rather than ranking anything by ' +
        'it, and do not use concentration as a stand-in for it.',
    );
  }
  if (request.occasion) {
    lines.push(
      'SEASON AND OCCASION: not recorded. The catalogue does not say when or where a fragrance suits ' +
        '— season words inside harvested note lists are listing metadata, not data. Do not match a ' +
        'season or occasion to notes from your own knowledge; say the data does not hold it.',
    );
  }
  return lines;
}

/** The descriptor words this catalogue can genuinely filter on right now,
 *  for offering a reader something real when their question named nothing
 *  matchable. Built from the validated families, so it never offers a word
 *  whose notes have all fallen out of the index. */
export async function offerableDescriptors() {
  return [...(await noteFamilies()).keys()];
}

/**
 * Real note-matched candidates, from whichever fragrances this site's own
 * feeds actually published notes for — never a guessed or generic note list.
 *
 * Exported so the product-level dedup (see the comment inside) is directly
 * testable against a known live-catalogue case, the same reason
 * `policyContextFor` above is exported.
 */
/** Every catalogue row of each product, keyed like `groupKeyFor`. Built
 *  once; the snapshot never changes. */
let rowsByGroupCache = null;
async function rowsByGroup() {
  if (rowsByGroupCache) return rowsByGroupCache;
  const { data } = await loadSite();
  const map = new Map();
  for (const f of data.DEMO_FRAGRANCES) {
    const key = groupKeyFor(f);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  rowsByGroupCache = map;
  return map;
}

/**
 * Builds the product index ahead of the first question, so the first
 * answer does not pay for it. The widget calls this when the reader looks
 * like they are about to open the chat (demo/virtualYanny.ts); the tests
 * call it once up front so timings measure the lookup, not the build.
 */
export async function warmProductIndex() {
  const { data } = await loadSite();
  warmIndex(data.DEMO_FRAGRANCES);
  await rowsByGroup();
}

export async function suggestContextFor(question) {
  const { data } = await loadSite();
  const request = await parseSuggestRequest(question);
  const { unwanted, reference, referenceUnresolved, wanted, literal, families } = request;
  const unsupported = unsupportedConstraintLines(request);
  const audience = await audienceContextLine(request);
  const unsupportedBlock =
    (audience ? `\nWHO IT IS FOR:\n${audience}` : '') +
    (unsupported.length ? `\nCONSTRAINTS THIS DATA CANNOT MEET:\n${unsupported.join('\n')}` : '');

  if (wanted.length === 0) {
    let why = ' The question did not name any notes to match against.';
    if (reference) {
      why = ` The reference fragrance ${reference.label} is in the catalogue but has no published notes, so there is nothing to match it against.`;
    } else if (referenceUnresolved) {
      why = ` The question asks for something like "${referenceUnresolved}", which does not resolve to a single product in the catalogue, so there are no notes to match it against.`;
    }
    const offer =
      `\nWHAT CAN BE FILTERED ON INSTEAD: scent words — ${(await offerableDescriptors()).join(', ')} — ` +
      'a delivered price ceiling, or the published notes of a fragrance named by name. Offer those. ' +
      'Do not name a fragrance.';
    return `NOTE MATCHED CANDIDATES: none requested.${why}${unsupportedBlock}${offer}`;
  }

  // Grouped by product (brand+name+concentration), not by row id: the same
  // perfume's different bottle sizes are separate catalogue entries with
  // separate ids, sometimes carrying different note data because they were
  // harvested from different retailers' pages of differing completeness —
  // measured case, Tom Ford Black Orchid EDP: the 30ml row lists 3 notes,
  // the 100ml row lists 7, none of which overlap perfectly. Grouping by id
  // showed the same product name twice with two different, seemingly
  // arbitrary note lists, which reads as a broken duplicate rather than one
  // real recommendation. Grouping by product and merging every size's notes
  // into one set keeps the real information from every size instead of
  // silently dropping whichever variant lost the id race.
  //
  // Every row of the product contributes its notes, not only the rows that
  // carried the requested note: a 50ml row can list "Bellini accord" that
  // the 100ml row (the one that matched on Rose) does not, and the line the
  // model reads should be the product's full published set.
  const groups = new Map();
  const rowsOf = await rowsByGroup();
  for (const note of wanted) {
    for (const frag of data.fragrancesWithNote(note, 'any')) {
      const key = groupKeyFor(frag);
      let entry = groups.get(key);
      if (!entry) {
        entry = { frag, matched: new Set(), notes: { top: new Set(), middle: new Set(), base: new Set() } };
        groups.set(key, entry);
        for (const row of rowsOf.get(key) ?? [frag]) {
          for (const layer of ['top', 'middle', 'base']) {
            for (const n of row.notes?.[layer] ?? []) entry.notes[layer].add(n);
          }
        }
      }
      entry.matched.add(note);
    }
  }

  // The reference fragrance is never its own recommendation — nor is any
  // other concentration of it, which is why this drops by brand+name rather
  // than by the full group key.
  if (reference) {
    for (const [key, entry] of groups) {
      if (`${entry.frag.brand}|${entry.frag.name}`.toLowerCase() === reference.brandName) groups.delete(key);
    }
  }

  let candidates = [...groups.values()].map((entry) => ({
    frag: entry.frag,
    matchedCount: entry.matched.size,
    matched: [...entry.matched],
    // Deduplicated across layers, not just within them. A note listed in
    // both a fragrance's top and base rendered twice, which reads as broken
    // data rather than as a note appearing in two layers — measured case,
    // Versace Dylan Blue: "Summer, Autumn, Summer, Autumn, Summer, Autumn".
    notes: [...new Set([...entry.notes.top, ...entry.notes.middle, ...entry.notes.base])],
  }));
  if (unwanted.length > 0) {
    candidates = candidates.filter(({ notes }) => {
      const noteWords = notes.map((n) => n.toLowerCase());
      return !unwanted.some((u) => noteWords.some((n) => n.includes(u) || u.includes(n)));
    });
  }
  // Most of the request satisfied first. The previous order was whatever
  // BY_POPULARITY happened to yield for the *first* requested note, so a
  // three-note request could be answered with five products sharing only the
  // first note while products matching all three sat below the cut.
  candidates.sort((a, b) => b.matchedCount - a.matchedCount);
  candidates = candidates.slice(0, 5);

  // What the *reader* asked for, not the expansion of it. Printing all
  // fourteen notes "sweet" resolves to as the request would misreport the
  // question back to the model: it asked for one word.
  // A literal note that *is* the descriptor word is dropped from the label
  // rather than printed beside it: the catalogue really does have a note
  // called "Sweet", so `requested: Sweet, "sweet"` was accurate and read
  // like a bug.
  const descriptorWords = new Set(families.map(({ word }) => word.toLowerCase()));
  const requestedLabel = [
    ...literal.filter((n) => !descriptorWords.has(n.toLowerCase())),
    ...families.map(({ word }) => `"${word}"`),
  ].join(', ') || wanted.join(', ');

  // How each descriptor was read, stated as a reading rather than as a
  // fact. Every note named here exists in the catalogue (noteFamilies drops
  // any that does not) and every candidate above genuinely lists at least
  // one of them — but "sweet means vanilla" is this site's interpretation
  // of an English word, and an answer that hides that is passing off an
  // editorial choice as data.
  const familyLines = families.length
    ? `\nHOW THE SCENT WORDS WERE READ: ${families
        .map(({ word, notes }) => `"${word}" -> catalogue notes ${notes.join(', ')}`)
        .join('; ')}. That is this site's reading of the word, not a claim about any bottle; ` +
      'say which notes the match was made on so the reader can disagree with it.'
    : '';

  const unmatchedLine = request.unmatchedDescriptors.length
    ? `\nSCENT WORDS WITH NO MATCH: ${request.unmatchedDescriptors.join(', ')} — the catalogue has no ` +
      'notes on file for these, so nothing above was chosen for them.'
    : '';

  if (candidates.length === 0) {
    return (
      `NOTE MATCHED CANDIDATES: none. No fragrance in the current catalogue has a published note ` +
      `match for [${requestedLabel}].${familyLines}${unmatchedLine}${unsupportedBlock}`
    );
  }

  // Each candidate's own audience reading is attached only when the reader
  // asked about one. Printing "audience: not stated" on every candidate of
  // every scent question would be noise on 86% of lines; withholding it when
  // the reader did ask would leave a model to supply the answer itself.
  const genderIndex = request.audience ? await genderCoverage() : null;
  const audienceOf = (frag) => {
    if (!genderIndex) return '';
    const e = genderIndex.byId.get(frag.id);
    return e && e.reading !== 'notStated'
      ? ` — audience: ${genderIndex.label[e.reading]}, from "${e.phrase}" in its title`
      : ' — audience: not stated by any shop; do not assign one';
  };
  const lines = candidates.map(({ frag, notes, matched }) =>
    `${productLabel(frag)} — shares: ${matched.join(', ')} — notes on file: ${
      notes.join(', ') || 'none published'
    }${audienceOf(frag)}`,
  );
  // The reference line is appended rather than prepended so that the block
  // still opens with "NOTE MATCHED CANDIDATES", which is what the rest of
  // this file and the council prompt's rule 1b both key off.
  const referenceLine = reference
    ? `\nREFERENCE FRAGRANCE: ${reference.label} — its own notes on file: ${reference.notes.join(', ')}. ` +
      'The candidates above were found by sharing those notes; whether they actually smell alike is not something this data settles.'
    : '';
  return (
    `NOTE MATCHED CANDIDATES (requested: ${requestedLabel}${unwanted.length ? `; excluding: ${unwanted.join(', ')}` : ''}):\n` +
    `${lines.join('\n')}${referenceLine}${familyLines}${unmatchedLine}${unsupportedBlock}`
  );
}

/** Simple keyword overlap against the site's own policy/FAQ pages — the only
 *  source for anything about how the site works, delivery methodology,
 *  affiliate disclosure, privacy or contact details.
 *
 *  Exported (not just used internally by buildSiteDataBlock) so council.js's
 *  price bypass can tell a genuine "no such fragrance" from a question that
 *  merely contains a price-ish word — "how does your price comparison
 *  work" trips classifyIntent's 'price' regex on the word "price" alone,
 *  but it is a policy question, not a lookup, and resolvePriceQuery finding
 *  no fragrance in it should not be read as "the fragrance does not exist". */
/** Interrogative and filler words that appear in every legal page's prose
 *  and carry no topic at all. Before this filter, "guess what zorblax
 *  nebula costs" matched the about page on "what" + "costs" alone, and a
 *  plain no-such-product refusal got re-routed to the council as a policy
 *  question in disguise. (Measured; pinned in test/corpus.test.js.) */
const POLICY_FILLER = new Set([
  'what', 'whats', 'when', 'where', 'which', 'your', 'yours', 'this', 'that',
  'these', 'those', 'does', 'have', 'much', 'many', 'want', 'know', 'tell',
  'just', 'guess', 'please', 'could', 'would', 'should', 'will', 'they',
  'them', 'then', 'than', 'some', 'about', 'really', 'actually',
]);

/** The words people use for a policy topic that the pages themselves do not
 *  use. Query expansion only — the *pages* remain the sole source of any
 *  answer; this only lets "how do you make money" find the affiliate
 *  disclosure, whose own vocabulary is "commission" and "affiliate". */
const POLICY_QUERY_EXPANSIONS = [
  [/\b(make|earn|making|earning) money\b|\bwho pays\b|\bpaid for\b|\bget paid\b/i, ['commission', 'affiliate']],
];

export async function policyContextFor(question) {
  const { legal } = await loadSite();
  let asked = normalize(question);
  const qWords = [];
  for (const [re, extra] of POLICY_QUERY_EXPANSIONS) {
    if (re.test(question)) {
      // The words that triggered the expansion are replaced by it, not
      // added to: "make money" is answered by the page's own "commission"
      // and must not then count as two words the page failed to contain.
      asked = asked.replace(re, ' ');
      qWords.push(...extra);
    }
  }
  qWords.push(...asked.split(' ').filter((w) => w.length > 3 && !POLICY_FILLER.has(w)));
  if (qWords.length === 0) return null;

  let best = null;
  let bestHits = 0;
  for (const page of legal.LEGAL_PAGES) {
    const haystack = normalize(`${page.title} ${stripHtml(page.body)}`);
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = page;
    }
  }
  // Two hits, except for a question whose entire substance is one strong
  // word: "do you get commission" reduces to exactly ['commission'], and a
  // hard floor of 2 made it unmatchable on principle.
  if (!best || bestHits < Math.min(2, qWords.length)) return null;
  // And the page has to account for most of the question. "price of
  // zorblax nebula parfum" hits the about page on "price" and "parfum" and
  // is not a question about the site: the two words that carry its meaning
  // appear nowhere on any page. A policy match is allowed at most half as
  // many unexplained words as explained ones.
  if (qWords.length - bestHits > bestHits / 2) return null;

  const text = stripHtml(best.body);
  return `SITE POLICY (${best.title}): ${text.slice(0, 1200)}${text.length > 1200 ? '…' : ''}`;
}

/**
 * Catalogue-wide facts every answer can lean on, computed fresh from the same
 * imports as everything else in this file rather than typed as a number
 * anywhere — a hardcoded count would start drifting the hour after it was
 * written, since the harvest recommits `demo/catalogue.generated.ts` roughly
 * every hour (see this file's own header comment on cache-busted imports).
 */
async function aboutContext() {
  const { legal, data, catalogue, retailers } = await loadSite();

  const totalFragrances = data.DEMO_FRAGRANCES.length;
  const enabledRetailers = retailers.RETAILERS.filter((r) => r.enabled !== false);
  // Mirrors resolveDelivery's own check in src/services/shipping.ts exactly:
  // `standardGbp === null` is the one signal that means "delivery not stated"
  // there, in buildComparison's sort, and now here.
  const unstatedRetailers = enabledRetailers.filter((r) => r.shipping?.standardGbp === null);
  const unstatedNote = unstatedRetailers.length
    ? ` ${unstatedRetailers.length} of those retailers (${unstatedRetailers.map((r) => r.name).join(', ')}) ` +
      `do not publish a standard delivery cost. They are shown as "delivery not stated", never as the cheapest option.`
    : '';

  return (
    `ABOUT THIS SITE: ${legal.COMPANY.name} is a UK fragrance price comparison site run by ` +
    `${legal.COMPANY.legalName}. Contact: ${legal.COMPANY.email}. Currently tracks ` +
    `${totalFragrances.toLocaleString('en-GB')} fragrances across ${enabledRetailers.length} enabled UK ` +
    `retailers, last refreshed ${catalogue.CRAWLED_AT}.${unstatedNote} No retailer pays for placement: results ` +
    `are ordered by stock and then delivered price only, never by commission ("No Promoted Listings").`
  );
}

/**
 * The single entry point council.js calls: builds the labelled SITE DATA
 * block for a question, using every source relevant to its intent. Always
 * includes the about-site line so a general "what is this" question is
 * groundable even outside the price/suggest intents.
 */
export async function buildSiteDataBlock(question, intent) {
  const parts = [await aboutContext()];

  if (intent === 'price') {
    parts.push(await priceContextFor(question));
  } else if (intent === 'suggest') {
    parts.push(await suggestContextFor(question));
  }

  const policy = await policyContextFor(question);
  if (policy) parts.push(policy);

  return parts.join('\n\n');
}
