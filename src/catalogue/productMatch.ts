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
import { brandKey } from './brandName.js';

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
  return text
    .toLowerCase()
    // Apostrophes vanish rather than splitting the word around them: one feed
    // writes "Bade'e Al Oud" and another "Badee Al Oud", and treating the
    // apostrophe as a separator turns one word into two and the match fails.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
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
  return [brandKey(p.brand), sizeKeyPart(p), p.concentration.toLowerCase().trim(), wordSet(p.name)].join('|');
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
  return [brandKey(p.brand), sizeKeyPart(p), wordSet(p.name)].join('|');
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

export interface MergeGroup<T extends MatchableProduct> {
  /** The record the merged product keeps — the barcode-bearing one where there is one. */
  canonical: T;
  /** Everything folded into it, canonical excluded. */
  absorbed: T[];
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
export function findDuplicateGroups<T extends MatchableProduct>(products: readonly T[]): MergeGroup<T>[] {
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
    if (barcodes.size > 1) continue;

    // Prefer the record that carries a real barcode; it is the better-
    // identified one and keeping its id means existing links stay valid.
    const canonical = bucket.find((p) => isBarcode(p.ean)) ?? bucket[0]!;
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
    if (barcodes.size > 1) continue;

    // The same selection the exact-match pass above already made for each
    // bucket independently — reusing it rather than a fresh rule means the
    // record this bridges into is always the literal object that pass
    // already chose (and already finished merging any of its own exact
    // duplicates into) by the time a caller applies groups in order.
    const canonical = statedBucket.find((p) => isBarcode(p.ean)) ?? statedBucket[0]!;
    const notStatedCanonical = notStatedBucket.find((p) => isBarcode(p.ean)) ?? notStatedBucket[0]!;
    if (canonical === notStatedCanonical) continue;
    groups.push({ canonical, absorbed: [notStatedCanonical] });
  }

  return groups;
}
