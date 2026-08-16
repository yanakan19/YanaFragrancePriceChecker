/**
 * The text layer of a messy question: what a person typed, before anything
 * is looked up.
 *
 * Nothing here touches the catalogue, which is the point — this module is
 * imported by `intent.js` (synchronous, no data, decides a route) *and* by
 * the resolvers in `lookups.js` / `siteData.js` (async, catalogue-backed,
 * write the answer). Both used to carry their own copy of "what a budget
 * phrase looks like" and the copies had already drifted: `lookups.js`'s
 * `BUDGET_AMOUNT_RES` recognised "30 quid" and "for £30", `intent.js`'s
 * budget rules did not, so "perfume for 30 pounds" classified as `general`
 * and never reached the resolver that could have read the amount out of it.
 * Measured before this file existed:
 *
 *   "perfume for 30 pounds"      -> general   (resolver would have read £30)
 *   "something £30ish"           -> general
 *   "whats good for under fifty quid" -> general
 *
 * One definition, two consumers, so a phrase the resolver can read is a
 * phrase the classifier routes to it.
 *
 * ── What this module does NOT do ─────────────────────────────────────────
 * It reads *requests*, never facts about products. A descriptor family
 * below is a stated reading of an English word ("sweet" → the catalogue's
 * own Vanilla/Tonka Bean/Caramel notes), and every answer built on one says
 * so. It is not a claim that any product is sweet: the products come back
 * because the catalogue really lists those notes for them. Contrast the
 * gender case, which is why there is no gender family here — see
 * `detectAudience` below.
 */

/* ── money ─────────────────────────────────────────────────────────────── */

/**
 * Number words a UK shopper types instead of digits. "tenner" is here
 * because the README's own example of a budget question with no threshold
 * was "is anything nice under a tenner" — it names a threshold perfectly
 * well, digits were just the only form the parser could read.
 */
const NUMBER_WORDS = new Map([
  ['tenner', 10], ['ten', 10], ['eleven', 11], ['twelve', 12], ['thirteen', 13],
  ['fourteen', 14], ['fifteen', 15], ['sixteen', 16], ['seventeen', 17],
  ['eighteen', 18], ['nineteen', 19], ['twenty', 20], ['thirty', 30],
  ['forty', 40], ['fourty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70],
  ['eighty', 80], ['ninety', 90],
]);
const UNIT_WORDS = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
  ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9],
]);

const TENS_SRC = 'twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety';
const UNITS_SRC = [...UNIT_WORDS.keys()].join('|');
const TEENS_SRC = 'tenner|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten';
/** A written amount: "fifty", "twenty five", "a hundred", "two hundred". */
const WORD_AMOUNT_SRC =
  `(?:(?:${UNITS_SRC}|a)\\s+hundred|hundred|(?:${TENS_SRC})(?:[\\s-](?:${UNITS_SRC}))?|${TEENS_SRC})`;
/** Digits or a written amount. */
const AMOUNT_SRC = `(\\d{1,4}(?:\\.\\d{1,2})?|${WORD_AMOUNT_SRC})`;

/** Turn one captured amount — digits or words — into a number, or null. */
function amountValue(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/^\d/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const hundreds = text.match(new RegExp(`^(${UNITS_SRC}|a)\\s+hundred$`));
  if (hundreds) return (hundreds[1] === 'a' ? 1 : UNIT_WORDS.get(hundreds[1])) * 100;
  if (text === 'hundred') return 100;
  const compound = text.match(new RegExp(`^(${TENS_SRC})[\\s-](${UNITS_SRC})$`));
  if (compound) return NUMBER_WORDS.get(compound[1]) + UNIT_WORDS.get(compound[2]);
  return NUMBER_WORDS.get(text) ?? null;
}

/**
 * The phrases that name a spending ceiling, each tagged with which one
 * matched so a caller can see *why* something was read as a budget.
 *
 * A bare "£30" with no framing at all is deliberately absent. It is the one
 * amount phrase that is genuinely ambiguous — "is Sauvage still £30" is a
 * price check, not a budget — and `intent.js` places budget above price, so
 * admitting it would reroute real price questions. Every pattern below
 * carries a word that says the number is a limit or a wallet.
 */
const BUDGET_PATTERNS = [
  // "under £30", "up to fifty", "no more than 30", "around a hundred"
  ['threshold',
    new RegExp(`\\b(?:under|below|less than|no more than|not more than|up to|within|max(?:imum)?|around|about|roughly|approx(?:imately)?)\\s*(?:a\\s+)?£?\\s*${AMOUNT_SRC}`, 'i')],
  // "30 quid", "fifty pounds", "a tenner"
  ['currency-word',
    new RegExp(`\\b${AMOUNT_SRC}\\s*(?:quid|pounds?|£)\\b`, 'i')],
  ['tenner', /\ba tenner\b/i],
  // "£30ish", "30 quid ish"
  ['approximate',
    new RegExp(`(?:£\\s*${AMOUNT_SRC}|${AMOUNT_SRC}\\s*(?:quid|pounds?))\\s*-?ish\\b`, 'i')],
  // "£30 or less", "£30 max", "£30 budget", "£30 tops"
  ['ceiling',
    new RegExp(`£\\s*${AMOUNT_SRC}\\s*(?:or less|or under|or below|budget|max(?:imum)?|tops)\\b`, 'i')],
  // "for £30", "budget of £30", "got £30 to spend", "i can spend 30"
  ['wallet',
    new RegExp(`\\b(?:for|budget of|spend(?:ing)?|got|have)\\s*(?:a\\s+)?£\\s*${AMOUNT_SRC}`, 'i')],
  ['wallet',
    new RegExp(`\\b(?:budget|spend|to spend)\\D{0,12}?£?\\s*${AMOUNT_SRC}\\b`, 'i')],
];

/**
 * The spending ceiling a question names, or null.
 *
 * @returns {{ maxGbp: number, marker: string } | null}
 */
export function parseBudget(text) {
  const c = String(text ?? '').toLowerCase();
  for (const [marker, re] of BUDGET_PATTERNS) {
    const m = c.match(re);
    if (!m) continue;
    // The approximate pattern has two alternative capture slots; take
    // whichever one filled.
    const value = amountValue(m.slice(1).find((g) => g != null));
    if (value !== null) return { maxGbp: value, marker };
  }
  return null;
}

/* ── who it is for ─────────────────────────────────────────────────────── */

/**
 * Recipients, in two groups.
 *
 * The nouns are matched bare, because English does not reliably put "for"
 * in front of one. The owner's own example is the case that proved it:
 * "find **a woman** a perfume under £30" is an indirect object with no
 * preposition anywhere, and a `for `-anchored pattern missed it entirely —
 * so the answer honoured the price and the scent and said nothing at all
 * about the constraint it had dropped. Caught by test/messyQuestions.test.js
 * before this pattern was widened.
 *
 * The pronouns still need "for". A bare "her" or "him" is far too common in
 * ordinary phrasing to read as a recipient.
 *
 * Matching loosely is the safe direction here, and only here: this feeds a
 * sentence saying the constraint cannot be honoured, so a false positive
 * costs one redundant true sentence. A false negative silently drops a
 * constraint the reader stated, which is the failure that mattered.
 *
 * "aftershave" is deliberately absent. It reads as masculine in British
 * usage, but that is an inference about a word, and inferring an audience
 * is the exact move this module refuses to make.
 */
const MASC_NOUNS = 'man|men|guy|guys|bloke|blokes|lad|lads|boy|boys|boyfriend|husband|dad|father|son|brother|uncle|grandad';
const FEM_NOUNS = 'woman|women|girl|girls|lady|ladies|girlfriend|wife|mum|mother|daughter|sister|auntie|aunt|nan|grandma';

const AUDIENCE_PATTERNS = [
  ['men', new RegExp(`\\b(?:${MASC_NOUNS}|men'?s|mens|masculine|male|for him)\\b`, 'i')],
  ['women', new RegExp(`\\b(?:${FEM_NOUNS}|women'?s|womens|feminine|female|for her)\\b`, 'i')],
];

/**
 * Whether a question asks for a man's or a woman's fragrance.
 *
 * Detected only so an answer can say plainly that it cannot honour it. The
 * catalogue has no gender, audience or "for him/for her" field — measured
 * against the live data, `Object.keys(DEMO_FRAGRANCES[0])` is
 * `id, brand, name, concentration, sizeMl, ean, tier, popularity, photoUrl,
 * notes` and nothing else. The two things that look like a substitute are
 * both far too thin to filter on:
 *
 *   - the product title. 705 of 10,379 entries say something masculine in
 *     the name, 465 something feminine, 9,209 say nothing at all — 11.3%
 *     coverage. Filtering "for a woman" on titles would hide 88.7% of the
 *     catalogue and silently reclassify every unisex bottle as unavailable.
 *   - the notes field, where some feeds put an audience word. Exactly 1 of
 *     the 3,430 fragrances that have notes carries one.
 *
 * (Both figures produced by counting over `demo/data.ts`'s own
 * DEMO_FRAGRANCES; the count is reproduced as a test in
 * test/messyQuestions.test.js so it fails rather than rots if a gender
 * field is ever added.)
 *
 * So there is no honest gender filter to write, and inferring one from a
 * note list — "florals are for women" — would be this codebase inventing a
 * fact about a product, which is the one thing it must never do. The
 * answer says so instead.
 */
export function detectAudience(text) {
  const c = String(text ?? '').toLowerCase();
  const hits = AUDIENCE_PATTERNS.filter(([, re]) => re.test(c)).map(([who]) => who);
  if (hits.length === 0) return null;
  return hits.length > 1 ? 'both' : hits[0];
}

/* ── how it is meant to perform ────────────────────────────────────────── */

// "lasts" and "lasting", never a bare "last": "what was the last price" is
// not a longevity question and must not pick up a longevity caveat.
const PERFORMANCE_RE =
  /\b(smelly|smells? bad|body odou?r|sweat|sweaty|lasts|lasting|longevity|projection|sillage|beast mode|potent|overpowering|strong(?:est|er)?|powerful|all day)\b/i;

/**
 * Whether a question is really about strength or longevity — "something
 * that lasts all day", and the owner's own "a perfume for a smelly man",
 * which is a longevity request phrased bluntly.
 *
 * Same reason as `detectAudience`: detected in order to decline it
 * honestly. Nothing in the catalogue records longevity, projection or
 * concentration strength as a measurement. Concentration (Eau de Toilette,
 * Eau de Parfum, Parfum) is a real field, but reading a ranking of how long
 * a bottle lasts out of its concentration label is general perfumery
 * knowledge, not something this site's data states — so an answer must not
 * present it as one.
 *
 * The wording that comes back is deliberately flat. "Smelly man" is a
 * request for something strong, not an insult to be corrected, and this
 * codebase is not the place for a lecture about it.
 */
export function detectPerformanceRequest(text) {
  return PERFORMANCE_RE.test(String(text ?? '').toLowerCase());
}

/* ── when and where it is meant to be worn ─────────────────────────────── */

// Nouns only, deliberately: "summery" is a scent descriptor (it reads as the
// fresh family above) and must keep doing that, so it is absent here. "date"
// alone is far too common ("up to date", "crawl date") — only the phrases
// that name an occasion count. "fall" is absent because "did the price fall"
// is a deals question.
const OCCASION_RE =
  /\b(summer|winter|autumn|springtime|spring|rainy day|hot weather|cold weather|wedding|office|interview|date night|night out|first date|clubbing|christmas|valentine'?s|special occasion|for (?:a |the )?(?:beach|gym|work|party|club|evening)s?)\b/i;

/**
 * Whether a question asks for a season or an occasion — "a summer fragrance",
 * "something for a wedding", "office safe".
 *
 * Same standing as `detectAudience` and `detectPerformanceRequest`: detected
 * so it can be declined honestly. The catalogue records nothing about when
 * or where a fragrance suits (a record is brand, name, concentration, size,
 * EAN, tier, popularity, photo, notes). Season words do appear inside some
 * harvested note lists ("Summer, Autumn, Summer, Autumn" — see
 * NON_NOTE_VOCABULARY in siteData.js), which is listing metadata this code
 * already refuses to read as a note; reading it as a season *filter* would
 * be the same invention twice. And mapping a season to notes — "summer means
 * citrus" — is general perfumery opinion, exactly what prompt rule 1 exists
 * to keep out of answers. So the honest move is the one the audience and
 * longevity constraints already make: say the data does not hold it, and
 * offer the filters that are real.
 */
export function detectOccasionRequest(text) {
  return OCCASION_RE.test(String(text ?? '').toLowerCase());
}

/* ── scent descriptors ─────────────────────────────────────────────────── */

/**
 * Everyday scent words, and the catalogue note names each one is read as.
 *
 * A person does not type "vanilla, tonka bean, caramel". They type "sweet".
 * Before this table, "sweet" reached `extractNotes` and matched the literal
 * catalogue note "Sweet", used by 8 fragrances out of 10,379 — technically
 * grounded, practically useless, and it made "something sweet under £30"
 * look like the catalogue held almost nothing.
 *
 * Every name below is a *candidate*. `siteData.js` keeps only the ones the
 * live NOTE_INDEX actually carries (see `noteFamilies` there), so this
 * table can never introduce a note the catalogue does not use: if a harvest
 * drops a note, the family shrinks rather than the answer lying. Names that
 * do not exist today are simply not carried — measured, "Marine Notes",
 * "Sea Notes", "Green Notes" and "Woody Notes" are all 0 in the current
 * index and are absent below for that reason.
 *
 * The honesty rule that makes this legitimate, and gender illegitimate: a
 * family expands a request into real note names, and the products that come
 * back genuinely list those notes. The reading of the English word is the
 * site's, and every answer built on one names the notes it used so a reader
 * can disagree with the reading. No claim is ever made about a product that
 * the product's own note list does not already say.
 */
export const NOTE_FAMILY_CANDIDATES = {
  sweet: {
    words: ['sweet', 'sweetness', 'sugary'],
    notes: ['Sweet', 'Vanilla', 'Tonka Bean', 'Caramel', 'Sugar', 'Honey', 'Praline', 'Toffee', 'Marshmallow', 'Cotton Candy', 'Chocolate', 'Benzoin', 'Coconut', 'Almond'],
  },
  gourmand: {
    words: ['gourmand', 'edible', 'dessert'],
    notes: ['Vanilla', 'Caramel', 'Chocolate', 'Coffee', 'Praline', 'Honey', 'Almond', 'Hazelnut', 'Milk', 'Whipped Cream'],
  },
  fresh: {
    words: ['fresh', 'clean', 'crisp', 'citrusy', 'zesty', 'aquatic', 'marine', 'watery', 'summery'],
    notes: ['Fresh', 'Bergamot', 'Lemon', 'Citrus', 'Mint', 'Grapefruit', 'Lime', 'Basil', 'Neroli', 'Petitgrain', 'Mandarin Orange', 'Aquatic'],
  },
  floral: {
    words: ['floral', 'flowery', 'flowers'],
    notes: ['Floral', 'Rose', 'Jasmine', 'Lily-of-the-Valley', 'Iris', 'Violet', 'Peony', 'Tuberose', 'Orange Blossom', 'Ylang-Ylang', 'Gardenia', 'Freesia', 'Magnolia'],
  },
  woody: {
    words: ['woody', 'woodsy', 'wood'],
    notes: ['Sandalwood', 'Cedar', 'Cedarwood', 'Vetiver', 'Patchouli', 'Oud', 'Guaiac Wood', 'Virginian Cedar', 'Papyrus'],
  },
  spicy: {
    words: ['spicy', 'spiced', 'warm spicy'],
    notes: ['Spicy', 'Pink Pepper', 'Black Pepper', 'Cinnamon', 'Cardamom', 'Nutmeg', 'Clove', 'Ginger', 'Saffron', 'Pepper', 'Coriander'],
  },
  fruity: {
    words: ['fruity', 'fruit'],
    notes: ['Apple', 'Pear', 'Peach', 'Raspberry', 'Blackcurrant', 'Pineapple', 'Strawberry', 'Plum', 'Blackberry', 'Cherry', 'Fig', 'Melon'],
  },
  musky: {
    words: ['musky', 'skin scent'],
    notes: ['Musk', 'White Musk'],
  },
  smoky: {
    words: ['smoky', 'smokey', 'smokiness'],
    notes: ['Smoky', 'Incense', 'Leather', 'Birch', 'Tobacco', 'Oud', 'Frankincense', 'Cade Oil', 'Styrax'],
  },
  powdery: {
    words: ['powdery', 'powder'],
    notes: ['Powdery', 'Iris', 'Orris Root', 'Heliotrope', 'Violet', 'Almond'],
  },
  green: {
    words: ['green', 'grassy', 'herbal'],
    notes: ['Grass', 'Vetiver', 'Galbanum', 'Basil', 'Fig Leaf', 'Tea'],
  },
  aromatic: {
    words: ['aromatic', 'lavender-ish', 'barbershop'],
    notes: ['Lavender', 'Rosemary', 'Sage', 'Thyme', 'Geranium', 'Clary Sage'],
  },
};

/** Every descriptor word any family answers to, longest first so "warm
 *  spicy" is read whole rather than as "spicy" with a stray word left. */
export const DESCRIPTOR_WORDS = Object.entries(NOTE_FAMILY_CANDIDATES)
  .flatMap(([family, { words }]) => words.map((word) => ({ word, family })))
  .sort((a, b) => b.word.length - a.word.length);

const DESCRIPTOR_RE = new RegExp(
  `\\b(${DESCRIPTOR_WORDS.map(({ word }) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

/** Whether a question uses any scent descriptor at all. Cheap, synchronous,
 *  and the only part of this table `intent.js` needs to route a question. */
export function mentionsDescriptor(text) {
  return DESCRIPTOR_RE.test(String(text ?? '').toLowerCase());
}

/** The descriptor families a question names, in the order they appear. */
export function descriptorsIn(text) {
  const c = ` ${String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const found = [];
  let haystack = c;
  for (const { word, family } of DESCRIPTOR_WORDS) {
    const padded = ` ${word} `;
    if (!haystack.includes(padded)) continue;
    haystack = haystack.split(padded).join('  ');
    if (!found.some((f) => f.family === family)) found.push({ word, family });
  }
  return found;
}
