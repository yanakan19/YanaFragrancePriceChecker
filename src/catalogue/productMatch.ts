/**
 * Recognising one bottle sold by several shops when only some publish an EAN.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 * Products were keyed on EAN where a shop published one and on the shop's own
 * SKU where it did not. Two shops selling the identical bottle therefore became
 * two products whenever only one of them carried the barcode — Afnan Supremacy
 * In Extrait De Parfum, Oud, 100ml appeared twice, at £38.99 from Justmylook
 * and £50.00 from Beauty Base, side by side in the same list. That is the exact
 * failure a price comparison exists to prevent: the reader is shown two
 * products and no comparison, and the cheaper one looks like a different item.
 *
 * ── When two listings are the same bottle ────────────────────────────────────
 * Same house, same size, same concentration, and the same words in the name.
 * All four, or no merge.
 *
 * Word *set* rather than word order, because shops genuinely disagree about it
 * — "Supremacy Pour Homme Silver" and "Supremacy Silver Pour Homme" are one
 * bottle written two ways. Two different fragrances from one house sharing a
 * size, a concentration and an identical bag of words is not a thing that
 * happens; a house reordering its own modifiers is routine.
 *
 * ── Where it refuses ─────────────────────────────────────────────────────────
 * Two products that both carry a real barcode and disagree about it are left
 * alone, however alike they look. A barcode is the manufacturer stating these
 * are different articles, and that outranks our own name comparison. Silently
 * merging them would fold a 2024 reformulation into its predecessor and show
 * one price for two things.
 *
 * That refusal is load-bearing and stays exactly as strict as it was. Measured
 * against the live catalogue: Perfume Click sells Calvin Klein IN2U for Him
 * (0088300196890) and IN2U for Her (0088300196814) under the byte-identical
 * title "Calvin Klein IN2U Eau de Toilette 100ml Spray", and does the same for
 * CK One Shock and for FCUK's Him/Her pair. Two genuinely different fragrances
 * arrive with nothing but the barcode telling them apart, so relaxing this for
 * well-formed codes would publish one price for two different perfumes.
 *
 * ── What changed: only a real barcode gets to refuse ─────────────────────────
 * The rule above used to be applied to whatever a shop put in its `ean` field,
 * and not every shop puts a barcode there. Oud Arabian publishes its Shopify
 * internal item ids: 173 of its listings carry an `ean`, and only 16 of them
 * pass a GTIN check digit — 9.2%, which is exactly the rate random digits pass
 * at, and the tell that these were never barcodes. Every other shop in the
 * catalogue that publishes an `ean` sits between 85.7% and 100%.
 *
 * The damage was not confined to that shop. Those ids sat in the same match
 * bucket as a real manufacturer barcode from another shop, counted as a second
 * disagreeing "barcode", and blocked the merge — so Bujairami Chubby, Chic
 * Wood, Ghost, Madness and thirty-odd more were each published as two separate
 * products rather than one row comparing two shops, which is the failure this
 * file exists to prevent. That they turn out to agree on the price to the
 * penny (Chubby is £49.99 at both) is the clearest possible confirmation they
 * were one bottle all along. Nothing about a Shopify id is the manufacturer
 * saying anything, so it no longer gets a vote.
 *
 * ── What else does not get a vote: a barcode that vouches for two bottles ───
 * A code passing the two tests above is real GS1 format, but format is not
 * the whole question — it still has to be *one shop's honest statement about
 * one product*. Measured against data/catalogue/nicchia-luxury-uk.json: 18
 * distinct EAN strings are each printed on two (one, "8054036502115", on
 * three) genuinely different products in that one shop's own feed — Bois
 * 1920 "Cannabis Dolce" and "Cannabis Salata" share 8055277283900, Essential
 * Parfums "Divine Vanille" and "The Musc" share 3770010614098, Malbrum
 * "Safariyah" and "Tigre du Bengale" share 0635346315909. A 19th pair hides
 * behind normalizedEan rather than a shared string: Olaplex No. 5 and "No.
 * 5Fine" Bond Maintenance Conditioner are printed as "0850056933612" and
 * "850056933612" — the exact padded/unpadded split normalizedEan already
 * exists to collapse, so counting by raw string alone would have missed it.
 * Every one of the 19 passes the check digit — Nicchia's feed is otherwise
 * real barcodes almost throughout, so this is not the Oud Arabian problem of
 * a shop never publishing barcodes at all. It is a shop that mostly does,
 * mislabelling a few: a copy-paste from a sibling product's page, most
 * likely, not a random digit. A code cannot be both bottles' identity, so it
 * is neither shop's listing to trust.
 *
 * fragranceId() (fragranceId.ts) keys a listing on `ean-${ean}` before this
 * file's own matching ever runs, so an unfiltered collision here does not
 * wait for findDuplicateGroups to misjudge two barcodes as agreeing — it
 * fuses "Cannabis Dolce" and "Cannabis Salata" into one product the moment
 * the second listing is read, silently, with no name, size or concentration
 * check at all: the failure mode this whole file exists to prevent, arrived
 * at from the opposite direction, entirely within one shop's own feed.
 * untrustworthyEans and trustworthyEan below are what fragranceId() and the
 * demo-catalogue build consult to catch it before that fusion happens; see
 * their own comments for exactly what they revoke and why.
 *
 * Currently inert: nicchia-luxury-uk is `enabled: false` and every one of its
 * listings carries `priceGbp: null` (it is in CURRENCY_UNCONFIRMED — see
 * src/config/retailers.ts), so none of its listings reach isFragrance() or
 * fragranceId() in a live build today. This is hardening for the day both of
 * those clear, not a fix for a live symptom.
 */
import { brandKey, brandPrefixKeys } from './brandName.js';

/**
 * The literal value of CONCENTRATION_NOT_STATED in productName.ts, already
 * lowercased the same way matchKey lowercases every concentration before
 * keying on it.
 *
 * Not imported, deliberately: productName.ts imports fragranceId.ts, which
 * imports trustworthyEan from this very file, so importing productName.ts
 * from here would close that chain into a circular import. Confirmed by
 * trying it — every SIZE_TOKEN_RE-dependent test in the suite failed with
 * "Cannot read properties of undefined (reading 'source')", the classic
 * symptom of a module being used before its own top-level finished running
 * because two files were each waiting on the other to load first.
 *
 * A hand-copied constant is exactly the kind of drift this codebase's own
 * style warns against elsewhere, so it is not left as an untested guess:
 * tests/productMatch.test.ts imports CONCENTRATION_NOT_STATED from
 * productName.ts directly and asserts this equals its lowercased form, so
 * the two cannot silently disagree the way a bare copy-paste could.
 */
export const NOT_STATED_MATCH_KEY = 'not stated';

/**
 * A GTIN/EAN with its leading zeros removed, so a 13-digit code and the
 * 12-digit UPC-A it pads (GS1's own rule: EAN-13 is "0" + UPC-A) compare
 * equal, along with a barcode that lost a leading zero somewhere upstream —
 * checked against the live catalogue: "088300602513" (Calvin Klein
 * Contradiction 100ml, one feed) and "88300602513" (the identical bottle,
 * another feed) are nineteen such pairs, all confirmed the same by matching
 * brand, name, size and concentration as well as the barcode. Comparing raw
 * strings read them as two disagreeing barcodes and `findDuplicateGroups`
 * refused to merge on exactly the rule described below, splitting one real
 * bottle into two products with two prices.
 *
 * Exported because untrustworthyEans and trustworthyEan below need this same
 * normalisation to recognise a padded and unpadded copy of one shop's own
 * code as the same code, not two.
 */
export function normalizedEan(ean: string): string {
  return ean.replace(/^0+(?=\d)/, '');
}

/** The GTIN lengths a consumer barcode is actually printed at. */
const GTIN_LENGTHS = [8, 12, 13, 14] as const;

/**
 * Whether a code carries a valid GTIN check digit at some standard length.
 *
 * The check digit is GS1's own self-test: the last digit is fixed by the other
 * twelve, so a code that fails it is not a barcode that got mistyped — it is
 * not a barcode. That makes this the one test here that needs no judgement.
 *
 * Tried at every standard length after leading zeros are stripped, because
 * feeds pad inconsistently and the same code arrives 11, 12 and 13 digits wide
 * — "88300602513" is UPC-A "088300602513" with its leading zero lost upstream,
 * and validating the string as written would call a real barcode invalid. See
 * normalizedEan, which is the same problem answered for equality.
 *
 * It is a one-in-ten test, not a proof: a random 13-digit number passes it
 * about 10% of the time, and 16 of Oud Arabian's ids duly do. Those 16 keep
 * their vote rather than being guessed at. Two of them survive the GTIN-14
 * rule below as well, and it is luck rather than design that neither of those
 * two currently shares a bucket with a competing barcode — if one did, it
 * would still block that merge. A test that needs no judgement, applied
 * honestly, is worth more than a wider one that would also throw away real
 * barcodes: see the Louis Cardin codes, which sit in a GS1 range no perfume
 * house should be using and are nonetheless corroborated by two independent
 * shops publishing them for the same bottles.
 */
function hasGtinCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  const digits = normalizedEan(code);
  return GTIN_LENGTHS.some((length) => {
    if (digits.length > length) return false;
    const padded = digits.padStart(length, '0').split('').map(Number);
    const check = padded.pop()!;
    padded.reverse();
    let sum = 0;
    for (let i = 0; i < padded.length; i++) sum += padded[i]! * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === check;
  });
}

/**
 * Whether what a shop published in its `ean` field is a barcode on a bottle.
 *
 * Two tests, both of them GS1's rather than ours.
 *
 * The check digit, above. And the length: a GTIN-14 whose leading indicator
 * digit is not zero identifies a *packaging level* — a case of some number of
 * units — and never the consumer item inside it. A single 100ml bottle on a
 * shelf cannot be wearing one, so a 14-digit code that survives the check
 * digit by luck is still not the manufacturer identifying this bottle.
 * Measured across all 21,615 listings that carry an `ean`: exactly 14 pass the
 * check digit at 14 digits, all 14 are Oud Arabian Shopify ids, and the only
 * three other 14-digit codes in the catalogue already fail the check digit —
 * one of them, "84110611056752", being Carolina Herrera Good Girl Blush's real
 * barcode 8411061056752 with a digit typed twice.
 *
 * A code that fails either test is treated exactly as a missing one: the
 * listing can still be merged into a bottle identified by a real barcode, and
 * still cannot be used to argue that two bottles are different articles.
 *
 * Exported so untrustworthyEans below asks this exact question rather than a
 * second copy of it: a code with no valid GTIN format was never trustworthy
 * to begin with, so there is nothing for that function to revoke.
 */
export function isBarcode(code: string | null): code is string {
  if (code === null) return false;
  if (!hasGtinCheckDigit(code)) return false;
  return normalizedEan(code).length <= 13;
}

export interface MatchableProduct {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  /**
   * Null where the title states two conflicting sizes rather than one — see
   * sizeConflict in fragranceId.ts — and matchKey/looseMatchKey below never
   * let a null compare equal to anything, another null included. See
   * sizeKeyPart's own comment for why.
   */
  sizeMl: number | null;
  ean: string | null;
}

/**
 * Words lowercased, stripped of punctuation and sorted, so ordering and
 * hyphenation differences between feeds collapse while genuinely different
 * words never do.
 *
 * Factored out of matchKey so untrustworthyEans below can ask the identical
 * question of a raw, unprocessed title — see that function for why it needs
 * to, and why a second, slightly different word-normaliser there would
 * quietly stop agreeing with this one the first time either was edited.
 */
function wordSet(text: string): string {
  return titleWords(text).sort().join(' ');
}

/**
 * The same normalisation wordSet performs, stopped one step earlier: the
 * words themselves, unsorted and unjoined.
 *
 * Factored out for rawTitlesAgree below, which needs to ask whether one
 * title's words are a subset of another's — a question a joined string
 * cannot answer — and must ask it with exactly this normalisation or it
 * would be comparing different words from the ones every match in this file
 * is decided on.
 */
function titleWords(text: string): string[] {
  return text
    // An accent changes how a word looks, never which word it is: "Olympéa"
    // and "Olympea", "Hermès" and "Hermes". Left alone, the combining mark
    // split one word into two ("olymp", "a") and the two spellings of one
    // bottle never shared a key. Same fold as brandKey in brandName.ts.
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    // Apostrophes vanish rather than splitting the word around them: one feed
    // writes "Bade'e Al Oud" and another "Badee Al Oud", and treating the
    // apostrophe as a separator turns one word into two and the match fails.
    .replace(/['’`´ʼʻ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/**
 * Words that say nothing about which perfume a name is, dropped from the
 * identity two listings are compared on (never from the name a reader sees).
 *
 * Measured against the built catalogue (npm run duplicates): each of these was
 * the only difference between two listings of one bottle, in dozens of
 * products, and none of them separated two real products.
 *
 *   perfume   "Alien Perfume" and "Alien", "Meringue Perfume" and "Meringue":
 *             English for "this is perfume", filed under the concentration
 *             field already. It is not "parfum", which names a strength, and
 *             that stays a word.
 *   and, the  "Diamonds & Rubies" and "Diamonds and Rubies", "To Be The King"
 *             and "To Be King". An ampersand is dropped by titleWords, so the
 *             word it stands for goes too, or the two spellings differ.
 *   edp edt edc  A strength abbreviation left in a name after a shop's own
 *             claim lost the strength dispute ("Caffe Latte EDP" on an Extrait
 *             de Parfum). The strength is a key part of its own.
 */
const IDENTITY_NOISE: ReadonlySet<string> = new Set(['perfume', 'perfumes', 'and', 'the', 'edp', 'edt', 'edc']);

/** Words a dangling brand strip leaves at the end of a name: "Cabotine de Gres" loses "Gres". */
const ORPHAN_TAIL: ReadonlySet<string> = new Set(['de', 'by', 'of']);

/**
 * The words a name is compared on: titleWords, minus noise, minus the house's
 * own name where the title repeats it, minus the "Intense" of a Parfum Intense.
 *
 * The house's own name. "Boss Bottled" and "Bottled", "Mugler Alien" and
 * "Alien", "Guess Seductive" and "Seductive" are one bottle named with and
 * without its house, and the name a product ends up with depends on which
 * shop's title shape reached the brand strip first. Only a *leading* run of
 * words that spells the brand (or one of its known aliases, or a house mark
 * listed in brandName.ts) is dropped, once, and never when it would leave
 * nothing: "Juicy Couture" stays "Juicy Couture". A "by House" tail goes too,
 * "K By Dolce&Gabbana Intense" against "Dolce Gabbana K Intense".
 *
 * "Intense" after a Parfum. Rabanne writes the tier "Parfum Intense" and shops
 * file the second word in the name, or not, or before the strength
 * ("Invictus Victory Elixir Intense 200ml Parfum"). Measured over the
 * catalogue, no house sells both "X Parfum" and "X Intense Parfum" as two
 * things at one size; every "X" and "X Intense" pair at one size is an Eau de
 * Parfum, an Eau de Toilette or an Extrait (Alien Goddess, Libre, Acqua di Gio,
 * Si, K by Dolce and Gabbana), and those keep their word. So the word goes
 * only where the strength is exactly Parfum.
 */
function identityWords(p: MatchableProduct): string[] {
  const all = titleWords(p.name).filter((w) => w !== 'and');
  let words = all;
  const prefixes = brandPrefixKeys(p.brand);
  for (let k = 1; k <= 4 && k < words.length; k++) {
    if (prefixes.has(words.slice(0, k).join(''))) {
      words = words.slice(k);
      break;
    }
  }
  const byAt = words.indexOf('by');
  if (byAt >= 0) {
    for (let k = 1; byAt + k <= words.length && k <= 4; k++) {
      if (prefixes.has(words.slice(byAt + 1, byAt + 1 + k).join('')) && words.length > k + 1) {
        words = [...words.slice(0, byAt), ...words.slice(byAt + 1 + k)];
        break;
      }
    }
  }
  // The strength written into the name as well as into its own field:
  // "Gucci Guilty Eau de Toilette" on an Eau de Toilette, "Imperiale Eau de
  // Cologne" on an Eau de Cologne. Only the run that equals this product's own
  // strength goes, so "Charlie Blue Eau Fraiche" on an Eau de Toilette keeps
  // its "eau fraiche", which names a different bottle.
  const strengthWords = titleWords(p.concentration);
  if (strengthWords.length > 0 && words.length > strengthWords.length) {
    for (let i = 0; i + strengthWords.length <= words.length; i++) {
      if (strengthWords.every((w, j) => words[i + j] === w)) {
        words = [...words.slice(0, i), ...words.slice(i + strengthWords.length)];
        break;
      }
    }
  }
  const parfumIntense = p.concentration.toLowerCase().trim() === 'parfum';
  words = words.filter((w) => !IDENTITY_NOISE.has(w) && !(parfumIntense && w === 'intense'));
  // "Cacao Azteque Extrait" on an Extrait de Parfum. The shop wrote the strength
  // twice, once into its own field and once into the name, and a word that
  // restates the strength is not part of the fragrance's name: Nicchia's "Cacao
  // Aztèque" at the same size and strength is the same bottle. Only where the
  // strength really is Extrait de Parfum, and never when it would leave nothing.
  // An Eau de Parfum called "X Extrait" keeps its word (Maison Francis
  // Kurkdjian's Baccarat Rouge 540 Extrait is a different bottle from the Eau de
  // Parfum, and it is the strength field that says which is which).
  if (p.concentration.toLowerCase().trim() === 'extrait de parfum' && words.length > 1) {
    words = words.filter((w) => w !== 'extrait');
  }
  while (words.length > 1 && ORPHAN_TAIL.has(words[words.length - 1]!)) words = words.slice(0, -1);
  if (words.length > 1 && words[words.length - 1] === 'new') words = words.slice(0, -1);
  // "Edition" as a word of its own restates the name and says nothing more:
  // "Vulcan Black Friday" and "Vulcan Black Friday Edition", "Amber Oud Gold"
  // and "Amber Oud Gold Edition" (Al Haramain's own spelling, the shops drop it),
  // "Cocktail Edition For Her" and "For Her Cocktail". What names an edition is
  // the word beside it (Limited, Collector, Black Friday, 24K, a year) and that
  // stays in the key, so two different editions still differ; and two different
  // barcodes still keep a pair apart in findDuplicateGroups. Never when it would
  // leave nothing. Measured: 22 pairs in the catalogue, none a different bottle.
  if (words.length > 1 && words.includes('edition')) words = words.filter((w) => w !== 'edition');
  // Never reduce a name to nothing: the plain words are a worse key than none
  // at all, but an empty one would merge every such product with every other.
  return words.length > 0 ? words : titleWords(p.name);
}

function identityWordSet(p: MatchableProduct): string {
  return identityWords(p).sort().join(' ');
}

/**
 * The `sizeMl` component matchKey and looseMatchKey below actually compare
 * on: the bottle's size, printed plainly, where the title states one — or
 * this product's own id, where it does not.
 *
 * A null size is a real fact ("this listing's own title cannot be read as
 * one number" — see MatchableProduct.sizeMl and sizeConflict in
 * fragranceId.ts), not a value a bottle can share with another bottle. Two
 * products that both carry a null size are not thereby known to be the same
 * size, so letting them collide on a shared placeholder — the string
 * "null", say — would merge two listings on the one fact neither of them
 * actually states: that they agree. `p.id` is unique per product by
 * construction (every MatchableProduct comes from a fragranceId() call or an
 * equivalent), so keying an unknown size on it instead guarantees a
 * null-sized product's key can never equal any other product's key, sized or
 * not — it never merges with anything, exactly the "never merge with a
 * sized product as if equal" rule this file is asked to hold, extended to
 * the one case that rule alone does not cover: two unknowns are not
 * evidence they are the same unknown.
 *
 * The seven listings this exists for today (see sizeConflict's own comment)
 * are singly sold — no two of them share a brand, concentration and word
 * set — so this is hardening against a shape not yet seen in the live
 * catalogue rather than a fix for one already there; see
 * tests/productMatch.test.ts for the case constructed to prove it anyway.
 */
function sizeKeyPart(p: MatchableProduct): string {
  return p.sizeMl === null ? `unknown-size-${p.id}` : String(p.sizeMl);
}

/** The identity two listings must share to be the same bottle. */
export function matchKey(p: MatchableProduct): string {
  return [brandKey(p.brand), sizeKeyPart(p), p.concentration.toLowerCase().trim(), identityWordSet(p)].join('|');
}

/**
 * The same identity with the concentration component blanked: two products
 * share this key exactly when they would share a matchKey if only they agreed
 * about the strength. It is the question "is this the same bottle apart from
 * what the shops call its concentration?", and nothing else.
 *
 * Written as matchKey with one field emptied rather than as its own list of
 * components, so the two cannot drift: a future change to how brands, sizes or
 * names are compared reaches both at once, and there is no second copy of the
 * rule to forget.
 *
 * Deliberately *not* a merge key. Two shops disagreeing about the strength is
 * a real disagreement and this file leaves it alone; the one caller
 * (scripts/build-demo-catalogue.ts) uses it only to find the products a
 * fragrance house's own storefront has already answered the question for, and
 * a null size still keys on the product's own id via sizeKeyPart, so an
 * unsized listing can never be settled by another bottle's evidence.
 */
export function concentrationBlindKey(p: MatchableProduct): string {
  return matchKey({ ...p, concentration: '' });
}

/**
 * Whether one shop's own two raw titles are saying the same thing, one of
 * them possibly saying a little more: every word of the shorter appears in
 * the longer.
 *
 * The second test scripts/build-demo-catalogue.ts's same-shop collapse
 * applies, on top of matchKey equality, and it is not redundant with it.
 * matchKey compares the *displayed* name, and displayName can reduce a title
 * to nothing distinguishing when the shop's own brand field is where the
 * fragrance's name lives. Avon publishes exactly that: "Perceive Eau de
 * Parfum 30ml" with rawBrand "Perceive", "Incandessence Eau de Parfum - 30
 * ml" with rawBrand "Incandessence" and "Little Black Dress Eau de Parfum
 * 30ml" with rawBrand "Little Black Dress" all canonicalise to brand "Avon
 * Cosmetics", and all three used to reduce to a name with no fragrance in it,
 * so all three shared a matchKey and findDuplicateGroups merged them into one
 * product. They are three different perfumes. When this guard was written
 * that merge was live and was not the collapse's to fix — collapsing on
 * matchKey alone would have hidden two of the three behind the third and made
 * it very much harder to see, and their raw titles disagree outright, so this
 * declined and all three rows survived.
 *
 * 2026-09-02: the grouping itself is fixed — see emptiedNameFallback in
 * productName.ts, which distinguishes "the strip emptied the name because the
 * fragrance is named after its house" from "because the vendor field was the
 * fragrance's own name". The three Avon bottles now carry three different
 * names and never reach one bucket. This guard is unchanged and stays: it was
 * never only about Avon (see the Tom Ford case below, which is the shape it
 * was actually written for), and a second, independent reason to refuse a
 * collapse is worth keeping whether or not today's catalogue still needs it.
 *
 * Subset rather than equality, because the case the collapse exists for is a
 * shop's own two pages differing by a word carrying no product information:
 * The Beauty Store UK's "Tom Ford Black Orchid Eau de Parfum Spray 150ml"
 * and "Tom Ford Black Orchid Eau de Parfum 150ml", SKUs TBSUKDK2-15123 and
 * TBSUKDK2-40107, £139.99 and £152.59.
 *
 * Deliberately conservative in both directions. It declines pairs that are
 * genuine duplicates but word their titles differently — leaving a row that
 * could have been collapsed is the cheap failure. And a word that *does*
 * carry product information, "Unboxed" or "Tester", makes one title a strict
 * superset of the other, so a boxed listing could be collapsed into an
 * unboxed one on this test alone; matchKey is what stops that, since
 * displayName keeps those words in the name and the two keys differ. Both
 * tests have to pass.
 */
export function rawTitlesAgree(a: string, b: string): boolean {
  const aw = new Set(titleWords(a));
  const bw = new Set(titleWords(b));
  const [small, large] = aw.size <= bw.size ? [aw, bw] : [bw, aw];
  for (const word of small) if (!large.has(word)) return false;
  return true;
}

/**
 * matchKey with concentration left out — the identity two listings must
 * share before a missing concentration is even considered for a bridge. See
 * findDuplicateGroups' second pass for why this exists as its own function
 * rather than a string surgery on matchKey's own output: the two have to stay
 * in lockstep by construction (same brandKey, same sizeMl, same wordSet) or a
 * future edit to one silently stops agreeing with the other.
 */
function looseMatchKey(p: MatchableProduct): string {
  return [brandKey(p.brand), sizeKeyPart(p), identityWordSet({ ...p, concentration: '' })].join('|');
}

/**
 * KAYALI numbers every scent, and its shops do not agree on how much of that
 * to write: the house's own storefront titles "Eden Sparkling Lychee | 39",
 * "Oudgasm Vanilla Oud | 36 Intense" and "Vacay in a Bottle Maui in a Bottle
 * Sweet Banana | 37"; Cult Beauty titles the same bottles "Eden Sparkling
 * Lychee" (no number at all), "Oudgasm Vanilla Oud 36" (no "Intense") and "Maui
 * In A Bottle Sweet Banana 37" (no "Vacay in a Bottle"). Compared as the
 * ordinary word sets matchKey uses, none of those pairs is equal, so one
 * perfume at one size was two products and the reader was shown two prices
 * with no comparison (found 2026-10-04 in tests/kayaliCatalogue.test.ts, when
 * Cult Beauty's range arrived: 11 of its Kayali products were a second row for
 * a bottle the house's own storefront already listed, same size, same
 * strength).
 *
 * What identifies a Kayali scent, then, is its words with three things set
 * aside: the two digit number, the word "Intense" and the word "Vacay", each
 * of which a shop may or may not print. Checked over every Kayali name in the
 * catalogue when this was written: no two different scents shared those words
 * (the numbers stay a guard, below), and every group that did share them was
 * one scent written two ways.
 *
 * Narrow on purpose, and in three ways. It is Kayali's alone, because the
 * number is Kayali's own naming and the claim above was measured on Kayali:
 * another house's "Intense", or a trailing two digit number, can be the whole
 * difference between two perfumes ("Club De Nuit" and "Club De Nuit Intense").
 * It needs the number to be present on at least one side and to be the only
 * number anywhere in the group, so a scent can only be completed from a name
 * that carries its number, never guessed. And it keeps size and strength
 * exactly as matchKey does.
 */
const NUMBERED_SCENT_HOUSE = 'kayali';
const SCENT_NUMBER = /^\d{2}$/;
const SCENT_SHOP_WORDS: ReadonlySet<string> = new Set(['intense', 'vacay']);

function numberedScent(p: MatchableProduct): { key: string; number: string | null } | null {
  if (brandKey(p.brand) !== NUMBERED_SCENT_HOUSE || p.sizeMl === null) return null;
  const words = titleWords(p.name);
  const numbers = new Set(words.filter((w) => SCENT_NUMBER.test(w)));
  if (numbers.size > 1) return null;
  const rest = [...new Set(words.filter((w) => !SCENT_NUMBER.test(w) && !SCENT_SHOP_WORDS.has(w)))].sort();
  if (rest.length === 0) return null;
  return {
    key: [sizeKeyPart(p), p.concentration.toLowerCase().trim(), rest.join(' ')].join('|'),
    number: numbers.size === 1 ? [...numbers][0]! : null,
  };
}

/**
 * A listing carrying enough to ask untrustworthyEans' question: which shop,
 * what code, what it called the product. A subset of StoredListing (see
 * fragranceId.ts) so this file does not need to import that type just to
 * name three fields of it.
 */
export interface EanListing {
  retailerId: string;
  ean: string | null;
  rawTitle: string;
}

/** One retailer's own code, paired with the one product it is trusted to identify. */
function eanKey(retailerId: string, ean: string): string {
  return `${retailerId} ${normalizedEan(ean)}`;
}

/**
 * EANs a single retailer's own feed prints on two or more genuinely
 * different products — see this file's own header for the measured Nicchia
 * case this exists to catch (19 codes once padding is normalised, one shared
 * by three products) and why
 * it has to run ahead of fragranceId(), not inside findDuplicateGroups.
 *
 * Keyed per retailer, not globally: the same code can be a real barcode where
 * one shop publishes it correctly and simultaneously be misused in another
 * shop's feed, and revoking trust in the second must never touch the first.
 *
 * Compared on the whole raw title's word set (see wordSet) rather than a
 * cleaned, brand-and-size-stripped product name, because this has to answer
 * before a listing's brand, size or concentration have been read out of it at
 * all — fragranceId() needs the answer at the moment it decides a listing's
 * id, which is earlier than build-demo-catalogue.ts otherwise computes any of
 * those three. A rename or reordering of the very same bottle's own title
 * changes no word in the set, so a genuine repeat listing of one bottle under
 * one code is never flagged; two different fragrance names sharing a code
 * always are — exactly matchKey's own standard for "different", asked here of
 * a title matchKey has not been handed yet.
 *
 * Restricted to codes that already pass isBarcode: a Shopify-style internal
 * id was never trustworthy to begin with, so there is nothing here to revoke,
 * and measured across every catalogue file today, no shop other than Nicchia
 * has this problem at all — so this changes nothing for the other 23 feeds.
 */
export function untrustworthyEans(listings: readonly EanListing[]): ReadonlySet<string> {
  const wordsSeenByKey = new Map<string, Set<string>>();
  for (const l of listings) {
    if (!isBarcode(l.ean)) continue;
    const key = eanKey(l.retailerId, l.ean);
    const words = wordSet(l.rawTitle);
    const seen = wordsSeenByKey.get(key);
    if (seen) seen.add(words);
    else wordsSeenByKey.set(key, new Set([words]));
  }
  const untrustworthy = new Set<string>();
  for (const [key, words] of wordsSeenByKey) {
    if (words.size > 1) untrustworthy.add(key);
  }
  return untrustworthy;
}

/** A single bottle listing with a barcode, as settleBarcodeSizes reads it. */
export interface BarcodeSizeListing {
  retailerId: string;
  retailerSku: string;
  /** The listing's barcode, already through trustworthyEan. */
  ean: string;
  /** The size its own title states in millilitres. */
  sizeMl: number;
}

/** What settleBarcodeSizes decided. */
export interface BarcodeSizeSettlement {
  /**
   * Codes (in untrustworthyEans' own per shop form, for trustworthyEan to read)
   * that are no identity for this shop's listing: the shop's stated size
   * disagrees with the size the code is sold at, and nothing outvotes it.
   */
  revoked: Set<string>;
  /** `<retailerId>|<retailerSku>` to the size the code settles, for a listing outvoted on its size. */
  outvoted: Map<string, number>;
  /** One line per barcode whose shops disagreed, for the build log. */
  disagreements: string[];
}

/**
 * The size a barcode's product is, where the shops selling it state different
 * sizes.
 *
 * Until 2026-10-06 a barcode's product took the size of whichever shop the
 * build happened to read first, and every other shop's listing joined it
 * whatever size its own title stated. Two harms, measured that day:
 *
 * - Perfume Click's "Baldessarini Uomo Mare Eau de Toilette 30ml" at £25.80
 *   carries the barcode Parfumdreams sells as the 50ml at £50.66. Parfumdreams
 *   was read first, so a 30ml price was shown as a 50ml price, half what the
 *   50ml costs. One shop against one: nothing says which of them is right.
 * - Perfume Direct names a variant of Givenchy Irresistible Eau de Toilette
 *   "100ml" (£67.99). Its own product file (read 2026-10-06) titles the
 *   product "(50ml, 80ml)" and puts barcode 3274872419315 on that variant,
 *   the code Fragrance Click, Perfume Click and Lookfantastic all sell as the
 *   80ml, and the house makes no 100ml of it. The 80ml is right; but had Perfume
 *   Direct been read first, the product would have been a 100ml one.
 *
 * So a code's size is the one most shops state, each shop one vote, and a tie
 * goes to the size read first (the size the product already had, so its
 * address does not move). A shop alone in stating another size while at least
 * two others agree is outvoted: its listing stays on the code's product and is
 * read at the code's size (`outvoted`), as Perfume Direct's Givenchy is. Any
 * other shop stating another size (a one against one tie, or two shops agreeing
 * on a second size) keeps its own size, and the code is no identity for its
 * listing (`revoked`), so the listing is matched on its name and size like a
 * listing with no barcode. A price is never shown against a size its shop did
 * not state on the say of a single other shop.
 */
export function settleBarcodeSizes(listings: Iterable<BarcodeSizeListing>): BarcodeSizeSettlement {
  // Insertion ordered: the first size read for a code is the first key.
  const byCode = new Map<string, Map<number, BarcodeSizeListing[]>>();
  for (const l of listings) {
    const sizes = byCode.get(l.ean) ?? byCode.set(l.ean, new Map()).get(l.ean)!;
    (sizes.get(l.sizeMl) ?? sizes.set(l.sizeMl, []).get(l.sizeMl)!).push(l);
  }
  const revoked = new Set<string>();
  const outvoted = new Map<string, number>();
  const disagreements: string[] = [];
  const shops = (ls: readonly BarcodeSizeListing[]) => new Set(ls.map((l) => l.retailerId)).size;
  for (const [code, sizes] of byCode) {
    if (sizes.size < 2) continue;
    let settled: number | null = null;
    let most = 0;
    for (const [size, ls] of sizes) {
      const n = shops(ls);
      if (n > most) {
        most = n;
        settled = size;
      }
    }
    const parts: string[] = [];
    for (const [size, ls] of sizes) {
      parts.push(`${size}ml ${[...new Set(ls.map((l) => l.retailerId))].join(', ')}`);
      if (size === settled) continue;
      for (const l of ls) {
        if (most >= 2 && shops(ls) === 1) outvoted.set(`${l.retailerId}|${l.retailerSku}`, settled!);
        else revoked.add(eanKey(l.retailerId, l.ean));
      }
    }
    disagreements.push(`${code}: ${parts.join(' / ')} -> ${settled}ml`);
  }
  return { revoked, outvoted, disagreements };
}

/**
 * The ean a listing is safe to publish as its identity: the retailer's own
 * `ean` field, unless untrustworthyEans has already caught this exact shop
 * printing this exact code on more than one product — in which case this
 * returns null, the same answer as a shop that never published a code at
 * all. Every caller that would otherwise read `l.ean` directly — fragranceId()
 * and the product-record `ean` field build-demo-catalogue.ts writes — reads
 * it through here instead, so a revoked code cannot survive in one place and
 * leak back in through the other.
 *
 * A code that was never barcode-shaped (fails isBarcode) is untouched here
 * and keeps flowing through exactly as before: this only ever narrows an
 * already-trustworthy code, never widens or shrinks anything else.
 */
export function trustworthyEan(l: EanListing, untrustworthy: ReadonlySet<string>): string | null {
  if (l.ean === null) return null;
  if (isBarcode(l.ean) && untrustworthy.has(eanKey(l.retailerId, l.ean))) return null;
  return l.ean;
}

/**
 * One statement a fragrance house's own storefront made about a bottle: the
 * bottle's concentration-blind key (concentrationBlindKey) and the strength
 * that listing's own title or description names, "Not stated" included.
 */
export interface HouseStatement {
  key: string;
  stated: string;
}

/**
 * The strength a house has settled for each bottle, keyed by
 * concentrationBlindKey, from what its own storefront said.
 *
 * Three refusals, each measured rather than defensive (see the long comment
 * above "the house's own word on the strength" in
 * scripts/build-demo-catalogue.ts):
 *
 * - A house naming two different strengths for one bottle settles nothing.
 * - "Not stated" is not evidence for any strength.
 * - A house that lists a bottle with no strength AND the same name and size
 *   with a strength sells two different articles under one name, and the
 *   strength it states belongs to only one of them. Escentric Molecules lists
 *   "Escentric 02 100ml" and "Escentric 02 Extrait de Parfum 100ml". Applied
 *   to the whole key, the house's "Extrait de Parfum" relabelled every other
 *   shop's Eau de Toilette of the same name and size, and the two strengths
 *   were sold to the reader as one bottle. A silent listing beside a stated
 *   one is the house disagreeing with itself, so the key is left alone.
 *   A house with only one listing of a bottle, silent or not, is not affected.
 */
export function settleHouseConcentrations(statements: Iterable<HouseStatement>): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  const silent = new Set<string>();
  for (const { key, stated } of statements) {
    if (stated.toLowerCase().trim() === NOT_STATED_MATCH_KEY) {
      silent.add(key);
      continue;
    }
    const set = seen.get(key);
    if (set) set.add(stated);
    else seen.set(key, new Set([stated]));
  }
  const settled = new Map<string, string>();
  for (const [key, set] of seen) {
    if (set.size !== 1 || silent.has(key)) continue;
    settled.set(key, [...set][0]!);
  }
  return settled;
}

/**
 * Whether two barcodes, already stripped of leading zeros, are one code and the
 * same code with a check digit stuck on the end.
 *
 * A US shop's UPC-A is twelve digits (Tom Ford Black Orchid 50ml,
 * 888066000062) and another feed publishes it as 8880660000624: the twelve
 * digits, then the check digit of a thirteen digit EAN computed over them, as
 * if the UPC were an EAN with its last digit missing. Space NK does this to
 * every Tom Ford bottle and one Sol de Janeiro mist family does too. Read
 * strictly, 888066000062 and 8880660000624 are two barcodes, so each of 27
 * products had its listings from the other shops (cult beauty, justmylook,
 * lookfantastic, mybeauty boutique, nicchia, the beauty store) refused as a
 * barcode disagreement and left on a page of their own.
 *
 * Only this one shape counts, and only because the two listings already agree
 * on house, size, strength and name when it is asked: the longer code must be
 * a valid EAN-13, the shorter a valid UPC-A, and the longer must be exactly the
 * shorter with one digit added at the end. Two real articles do not have codes
 * that are one another's prefix.
 */
function isUpcWithCheckDigitAppended(shorter: string, longer: string): boolean {
  return (
    shorter.length === 12 &&
    longer.length === 13 &&
    longer.startsWith(shorter) &&
    hasGtinCheckDigit(shorter) &&
    hasGtinCheckDigit(longer)
  );
}

/** How many different articles a set of real barcodes names, once that shape is read as one. */
function distinctBarcodeCount(barcodes: Iterable<string>): number {
  const kept: string[] = [];
  for (const code of barcodes) {
    const same = kept.some((k) => k === code || isUpcWithCheckDigitAppended(k, code) || isUpcWithCheckDigitAppended(code, k));
    if (!same) kept.push(code);
  }
  return kept.length;
}

/** An id built from a SKU that carries a pre-order notice: see findDuplicateGroups. */
const PRE_ORDER_ID = /pre-?order/i;

/**
 * The record a bucket of one bottle keeps: the one with a real barcode, else
 * one whose id carries no pre-order notice, else the first. One rule for every
 * pass below, because the second pass bridges into "the" record the first pass
 * chose.
 */
function pickCanonical<T extends MatchableProduct>(bucket: readonly T[]): T {
  return bucket.find((p) => isBarcode(p.ean)) ?? bucket.find((p) => !PRE_ORDER_ID.test(p.id)) ?? bucket[0]!;
}

export interface MergeGroup<T extends MatchableProduct> {
  /** The record the merged product keeps — the barcode-bearing one where there is one. */
  canonical: T;
  /** Everything folded into it, canonical excluded. */
  absorbed: T[];
}

export interface FindDuplicateOptions<T> {
  /**
   * The shops (retailer ids) selling a product. Optional: without it every
   * barcode disagreement is a refusal, exactly as before. With it, two or more
   * barcodes on one bottle are read as editions of it when no shop sells two
   * of them; see barcodeEditionsNeverMeet.
   */
  shopsOf?: (product: T) => Iterable<string>;
}

/**
 * Whether the barcodes in a bucket never share a shop: no retailer sells two
 * of them. True means they read as editions of one article (a re-coded pack, a
 * market's own code), false means a shop has told us they are two articles.
 *
 * The refusal on disagreeing barcodes exists because two different articles can
 * carry one title: Calvin Klein IN2U for Him (0088300196890) and for Her
 * (0088300196814) at Perfume Click, FCUK Him and Her, Invictus Eau de Toilette
 * 100ml in two packs at one shop. In every one of those a single shop lists
 * both, which is the shop saying they differ. Where no shop lists two of the
 * codes (Mugler Alien 30ml: beautybase and perfume click carry one,
 * fragrance click the other; Rabanne Invictus Victory Elixir 50ml: beautybase
 * and perfume click, parfumdreams) nothing says they differ and everything
 * else (house, size, strength, name) says they do not. Measured over the built
 * catalogue: 276 groups where no shop sells two codes, 24 where one does, and
 * the 24 hold both gendered pairs found.
 *
 * Barcodes are compared as classes (see distinctBarcodeCount), so a UPC and
 * the same UPC padded to thirteen digits are one code, not two. Two codes that
 * are neighbours in the maker's numbering are refused too: see neighbouringItems.
 */
function barcodeEditionsNeverMeet<T extends MatchableProduct>(
  bucket: readonly T[],
  shopsOf: (product: T) => Iterable<string>,
): boolean {
  const classes: { code: string; shops: Set<string> }[] = [];
  for (const p of bucket) {
    if (!isBarcode(p.ean)) continue;
    const code = normalizedEan(p.ean);
    let cls = classes.find((c) => c.code === code || isUpcWithCheckDigitAppended(c.code, code) || isUpcWithCheckDigitAppended(code, c.code));
    if (!cls) {
      cls = { code, shops: new Set() };
      classes.push(cls);
    }
    for (const shop of shopsOf(p)) cls.shops.add(shop);
  }
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      for (const shop of classes[i]!.shops) if (classes[j]!.shops.has(shop)) return false;
      if (neighbouringItems(classes[i]!.code, classes[j]!.code)) return false;
    }
  }
  return true;
}

/** Item numbers this close on one company prefix are a maker's neighbouring articles. */
const NEIGHBOURING_ITEM_DISTANCE = 30;

/**
 * Whether two barcodes are next to each other in a maker's own numbering: the
 * thirteen digit form without its check digit, as a number, differing by 30 or
 * less. A maker numbers a pair of siblings one after the other (Calvin Klein
 * Truth 088300049479 and 088300049493, Euphoria 088300162505 and
 * 088300162512, Eternity Moment 088300139491 and 088300139507; One Man Show
 * 3355991000223 and 3355991000230), while a re-coded pack takes a new number
 * well away from the old (Rabanne Invictus 3349668515653, 3349668540532,
 * 3349668680993). Two shops carrying neighbouring codes under one title are
 * more likely the pair of siblings than one article twice, so they stay apart.
 */
function neighbouringItems(a: string, b: string): boolean {
  const item = (code: string) => Number(code.padStart(13, '0').slice(0, 12));
  return Math.abs(item(a) - item(b)) <= NEIGHBOURING_ITEM_DISTANCE;
}

/**
 * Group products that are the same bottle.
 *
 * Returns only groups where something actually merges, so a caller can both
 * apply the merges and report exactly what was folded together — this changes
 * what the reader sees, so it should never happen invisibly.
 *
 * Two passes. The first is matchKey's own exact rule, unchanged: same brand,
 * size, concentration and word set, or no merge. The second is new — see its
 * own comment below for why a missing concentration gets one narrow,
 * carefully bounded exception to that exactness rather than being left
 * exactly as strict as a genuine EDT/EDP disagreement.
 */
export function findDuplicateGroups<T extends MatchableProduct>(
  products: readonly T[],
  options: FindDuplicateOptions<T> = {},
): MergeGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const p of products) {
    const key = matchKey(p);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(p);
    else byKey.set(key, [p]);
  }

  const groups: MergeGroup<T>[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;

    // A disagreement between two published barcodes is the manufacturer
    // telling us these are different articles. Leave the whole group alone
    // rather than guessing which of them the barcode-less listings belong to.
    // Compared with leading zeros stripped (see normalizedEan) so the same
    // barcode padded to a different width by two different feeds is not
    // mistaken for two different barcodes, and counted over real barcodes
    // only (see isBarcode) so a shop's internal item id cannot cast a vote
    // the manufacturer never cast.
    const barcodes = new Set(bucket.filter((p) => isBarcode(p.ean)).map((p) => normalizedEan(p.ean!)));
    if (distinctBarcodeCount(barcodes) > 1 && options.shopsOf && barcodeEditionsNeverMeet(bucket, options.shopsOf)) {
      // Editions of one article: keep the barcoded page that already has the
      // most shops (its address is the one most links point at), and fold the
      // rest into it, barcode-less listings included.
      const shopsOf = options.shopsOf;
      const count = (p: T) => new Set(shopsOf(p)).size;
      const barcoded = bucket.filter((p) => isBarcode(p.ean));
      const keeper = barcoded.reduce((best, p) => (count(p) > count(best) ? p : best), barcoded[0]!);
      groups.push({ canonical: keeper, absorbed: bucket.filter((p) => p !== keeper) });
      continue;
    }
    if (distinctBarcodeCount(barcodes) > 1) {
      // The refusal stands for the barcoded products: they stay apart. But the
      // listings with no barcode at all are not part of that disagreement,
      // and one barcode edition per page was dragging all of them down with it.
      // Mugler Alien 30ml Eau de Parfum has two barcodes (beautybase and
      // perfume click carry one, fragrance click the other) and seven shops
      // that publish none: escentual, justmylook, lookfantastic, mybeauty
      // boutique, perfume market, scentstore, the beauty store. The seven
      // agree on house, size, strength and name, and nothing contradicts that,
      // so they are one page between them, as they would be in a bucket with
      // one barcode or none. They are not attached to either barcoded page:
      // which edition they are is exactly what nothing here says.
      const bare = bucket.filter((p) => !isBarcode(p.ean));
      if (bare.length >= 2) {
        const keeper = pickCanonical(bare);
        groups.push({ canonical: keeper, absorbed: bare.filter((p) => p !== keeper) });
      }
      continue;
    }

    // Prefer the record that carries a real barcode; it is the better-
    // identified one and keeping its id means existing links stay valid.
    // Failing that, one whose id does not carry a pre-order notice: Emirates
    // Oud's variant name ("PRE-ORDER: Estimated dispatch: 7th October") is in
    // its SKU and so in its id, with a date the shop changes every few days,
    // and an id that is going to change is a poor one to keep a page on.
    const canonical = pickCanonical(bucket);
    groups.push({ canonical, absorbed: bucket.filter((p) => p !== canonical) });
  }

  /**
   * A shop that names no concentration is not a shop that disagrees about
   * one — "Not stated" (see CONCENTRATION_NOT_STATED in productName.ts) is
   * an admission of silence, not a value in its own right, and matchKey
   * above treats it as an ordinary fourth value regardless: "Shaghaf Oud"
   * Eau de Parfum from four shops and Emirates Oud's own "Shaghaf Oud" with
   * no strength named stayed two products for exactly that reason — the
   * bug this whole change exists to fix. Checked against the live
   * catalogue (npx tsx, real data, see the commit message this sits beside
   * for the exact command): of the products that gained an exact sibling
   * once the trailing-brand fix above ran, only 6 were blocked purely by
   * this, and one of those six is genuinely ambiguous (see below) — this is
   * a narrow gap, not a rewrite of the matcher.
   *
   * The bridge only ever runs one way: a "Not stated" bucket may join a
   * bucket that names a real concentration, never the reverse, and only
   * when the loose identity — brand, size, and the exact same word set —
   * already matches. It is never applied when two *different* real
   * concentrations both share that identity: an EDT and an EDP of the same
   * name are genuinely different articles (see this file's own header,
   * "Where it refuses"), and "Not stated" must never be the tie-breaker
   * that silently decides which of them it secretly was. Measured: French
   * Avenue and Ahmed Al Maghribi both sell EDP and Extrait de Parfum
   * versions of several identically-named fragrances (16 pairs, checked by
   * hand) — none of those are touched, because loose-matching them finds
   * two stated concentrations, not one, and the ambiguous case is refused
   * exactly like a real barcode disagreement is above.
   *
   * The barcode check is asked again here, independently, rather than
   * inherited from the pass above — a "Not stated" listing carrying a real
   * barcode that disagrees with the stated bucket's own must still refuse,
   * for the identical reason the exact-match pass refuses one. And where
   * the exact-match pass above already refused to merge a bucket's own
   * internal duplicates over a barcode disagreement, this must refuse the
   * bridge too rather than pick one of the disputed records as an arbitrary
   * target — there is no "the" canonical to bridge into when the pass above
   * could not agree on one either.
   */
  const NOT_STATED_KEY = NOT_STATED_MATCH_KEY;
  const looseIndex = new Map<string, Map<string, string>>();
  for (const [key, bucket] of byKey) {
    const rep = bucket[0]!;
    const loose = looseMatchKey(rep);
    const byConcentration = looseIndex.get(loose) ?? new Map<string, string>();
    byConcentration.set(rep.concentration.toLowerCase().trim(), key);
    looseIndex.set(loose, byConcentration);
  }

  for (const [loose, byConcentration] of looseIndex) {
    const notStatedKey = byConcentration.get(NOT_STATED_KEY);
    if (!notStatedKey) continue;
    const statedEntries = [...byConcentration].filter(([c]) => c !== NOT_STATED_KEY);
    // Zero real siblings: nothing to bridge into. Two or more: which one
    // named the truth is exactly the question "Not stated" cannot answer —
    // see the ambiguous Afnan "Supremacy Not Only Intense" case (both Eau
    // de Parfum and Extrait de Parfum siblings exist) in the measurement
    // above. Refused, not guessed at.
    if (statedEntries.length !== 1) continue;
    const [, statedKey] = statedEntries[0]!;

    const notStatedBucket = byKey.get(notStatedKey)!;
    const statedBucket = byKey.get(statedKey)!;

    // Both sides' own internal barcodes must already agree with each other,
    // not just across the bridge — the same test the exact-match pass above
    // applies to a single bucket, applied here to the union of both.
    const barcodes = new Set(
      [...notStatedBucket, ...statedBucket].filter((p) => isBarcode(p.ean)).map((p) => normalizedEan(p.ean!)),
    );
    if (distinctBarcodeCount(barcodes) > 1) continue;

    // The same selection the exact-match pass above already made for each
    // bucket independently — reusing it rather than a fresh rule means the
    // record this bridges into is always the literal object that pass
    // already chose (and already finished merging any of its own exact
    // duplicates into) by the time a caller applies groups in order.
    const canonical = pickCanonical(statedBucket);
    const notStatedCanonical = pickCanonical(notStatedBucket);
    if (canonical === notStatedCanonical) continue;
    groups.push({ canonical, absorbed: [notStatedCanonical] });
  }

  // Third pass: one Kayali scent written with more or less of its number,
  // "Intense" and "Vacay" by different shops. See numberedScent for what is
  // compared and why it is Kayali's alone. Bridges the way the second pass
  // does, canonical into canonical, so every earlier merge is already in the
  // record that is folded in.
  const scents = new Map<string, { bucket: T[]; number: string | null }[]>();
  for (const bucket of byKey.values()) {
    const info = numberedScent(bucket[0]!);
    if (!info) continue;
    const list = scents.get(info.key) ?? [];
    list.push({ bucket, number: info.number });
    scents.set(info.key, list);
  }
  for (const list of scents.values()) {
    if (list.length < 2) continue;
    const numbers = new Set(list.map((e) => e.number).filter((n): n is string => n !== null));
    // One number, stated by at least one side and contradicted by none.
    if (numbers.size !== 1) continue;
    const barcodes = new Set(
      list.flatMap((e) => e.bucket).filter((p) => isBarcode(p.ean)).map((p) => normalizedEan(p.ean!)),
    );
    if (distinctBarcodeCount(barcodes) > 1) continue;
    const canonicals = list.map((e) => pickCanonical(e.bucket));
    // The page that stays is the one carrying the fullest name, which is the
    // house's own ("Vacay in a Bottle Maui in a Bottle Sweet Banana | 37"), so
    // the product keeps the address and the name the house's storefront gave it.
    const numbered = list.filter((e) => e.number !== null).map((e) => pickCanonical(e.bucket));
    // "Intense" is left out of the length: a reseller can add it to a title the
    // house does not carry it on, and that does not make its page the house's.
    const fullness = (p: T) => p.name.replace(/\bintense\b/gi, '').length;
    const keeper = numbered.reduce((best, p) => (fullness(p) > fullness(best) ? p : best), numbered[0]!);
    groups.push({ canonical: keeper, absorbed: canonicals.filter((c) => c !== keeper) });
  }

  return groups;
}
