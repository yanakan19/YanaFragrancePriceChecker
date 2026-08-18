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
 */
import { brandKey } from './brandName.js';

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
 */
function normalizedEan(ean: string): string {
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
 */
function isBarcode(code: string | null): code is string {
  if (code === null) return false;
  if (!hasGtinCheckDigit(code)) return false;
  return normalizedEan(code).length <= 13;
}

export interface MatchableProduct {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
}

/**
 * The identity two listings must share to be the same bottle.
 *
 * Name words are lowercased, stripped of punctuation and sorted, so ordering
 * and hyphenation differences between feeds collapse while genuinely different
 * words never do.
 */
export function matchKey(p: MatchableProduct): string {
  const words = p.name
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
  return [brandKey(p.brand), p.sizeMl, p.concentration.toLowerCase().trim(), words].join('|');
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
  return groups;
}
