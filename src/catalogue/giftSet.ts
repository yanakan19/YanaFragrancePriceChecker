import type { StoredListing } from './types.js';
import {
  BARBER,
  CONCENTRATION,
  DESCRIBED_AS_WASH_GIFT_SET,
  ML_SIZE_RE,
  PET_PRODUCT,
  foldTitle,
  sellsOnlyFragrance,
  statedMl,
} from './fragranceId.js';
import { trustworthyEan } from './productMatch.js';
import { brandAliasKey, nameCore } from './duplicateKey.js';
import { displayContents, itemsFromTitle, readGiftSet } from './giftSetItems.js';

/**
 * Gift sets, as their own category (owner's decision, 2026-10-03).
 *
 * Before this, a gift set was either thrown away (NOT_A_FRAGRANCE dropped
 * "gift set", "set of", "bundle" and "N pcs" titles; MULTI_PACK and
 * MULTI_ITEM dropped multi packs; Kayali's "Bundles" product type and its
 * "wardrobe" boxes were dropped) or, worse, kept as though it were the single
 * bottle its title names first: 78 kept titles carried "Set" as a product
 * word, 43 of them Fragrance Click's ("Guerlain Shalimar 50ml Eau de Parfum
 * Set", "Paco Rabanne Invictus 100ml Eau de Toilette + 20ml Set"), and each
 * was priced against, and could be the "cheapest" for, a lone bottle of that
 * size. The owner wants sets kept, shown as their own option under the Volume
 * filter, never matched or compared with a single bottle, and left out of the
 * home page's Most stocked list.
 *
 * ── What counts as a gift set ────────────────────────────────────────────────
 * Two things, both required:
 *
 *   1. The listing says it is a set: its title (gift set, coffret, set as a
 *      product word, "N pcs"/"N pieces", a count against a size such as
 *      "3x10ml" or "5 * 5 Ml", "pack of 2", a bundle or Kayali's "wardrobe",
 *      or a fragrance joined to a companion product, "EDT & Bodywash",
 *      "& Ankle Socks", "+ Deo Spray"), the shop's own category (Kayali's
 *      "Bundles", The Beauty Store's "Gift Set"), or its own description
 *      calling it a gift set with a body wash in it (DESCRIBED_AS_WASH_GIFT_SET).
 *   2. It contains a fragrance: a concentration word in the title, or a shop
 *      that sells only fragrance (Retailer.fragranceOnlyCatalogue).
 *
 * ── What stays out, whatever it says ─────────────────────────────────────────
 * Every non perfume isFragrance already refuses stays refused here too
 * (NEVER_IN_A_SET): empty bottles, Travalo and other refill atomisers, pet
 * colognes, candles and home scent, testers, samples and decants, unscented
 * and skincare products, barber ranges. A set with no concentration word is a
 * body spray, wash or makeup set, not a fragrance one, and stays out.
 *
 * Two titles that read as sets and are not, both measured:
 *   - "set sail": Tommy Bahama Set Sail is one 100ml bottle whose name has
 *     the word in it.
 *   - "with coffret": Kilian's "Voulez-Vous Coucher Avec Moi With Coffret
 *     Refillable Eau de Parfum 50ml" is one bottle sold in its presentation
 *     box, not a set of items.
 */

/** A title saying the listing is a set of several things. Run on folded text. */
const SET_TITLE =
  /\bgift ?sets?\b|\bcoffret\b|\bsets?\b|\bwardrobe\b|\bbundles?\b|\b\d+\s*(?:pcs|pc|ps|pieces?)\b|\bpack of [2-9]\b|\b(?:[2-9]|[1-9]\d)\s*[x×*]\s*\d{1,4}(?:\.\d)?\s*(?:ml|oz)\b|\bdiscovery (?:collection|kit)\b|\b(?:duo|trio|quartet)s?\b|\b(?:twin|dual) ?pack\b|\btravel ?set\b|\b\d{1,4}(?:\.\d)?\s*(?:ml|oz)\s*[x×*]\s*(?:[2-9]|[1-9]\d)\b/i;

/**
 * Two sizes joined by "+": a bottle and its travel size or mini in one box,
 * priced as both. "Versace Dylan Blue 100ml EDT Spray +10ml EDT Mini + Trousse",
 * "Issey Miyake Fusion d'Issey IGO EDT 80ml Spray + 20ml Cap To Go", "Tommy
 * Hilfiger Impact Spark EDT 100ml + 4 ml", Nicchia's "Birdwatcher EDP 50+10 ml",
 * "Guilty Pour Femme EDP 50Ml + Bl 50Ml Gs". Read as the first size alone it
 * was priced against, and could be the "cheapest" for, a lone bottle of that
 * size. One size and a "+" (the Escentric Molecules "Molecule 01 + Ginger
 * 100ml", Blood Concept's "+MA 60ml") is a name, not a set, and never matches.
 */
const SIZE_PLUS_SIZE =
  /\b\d{1,4}(?:\.\d)?\s*ml\b[^+]{0,60}\+[^+]{0,40}?\b\d{1,4}(?:\.\d)?\s*ml\b|\b\d{1,4}\s*\+\s*\d{1,4}(?:\.\d)?\s*ml\b/i;

/**
 * SIZE_PLUS_SIZE, less the two shapes that are one bottle:
 *   - a "+ FREE" extra: Armaf's "Club De Nuit Sillage EDP 250ml + FREE Refillable
 *     5ml" is the 250ml bottle with an empty atomiser given away, at the bottle's
 *     own price;
 *   - a list of the sizes a product comes in, then the size this row is: Al
 *     Haramain's "Sultan Perfume Oil 3ml + 6ml + 12ml 24ml" (25 rows, one product
 *     in up to five sizes, each priced alone).
 */
function sizePlusSize(t: string): boolean {
  const joined = t.replace(/\+\s*free\b[^+]*/gi, ' ');
  if (!SIZE_PLUS_SIZE.test(joined)) return false;
  // Two or more "+" between sizes, then one more size with no "+" before it.
  if (/\d\s*ml\s*\+\s*\d[\d.]*\s*ml\s*\+\s*\d[\d.]*\s*ml\s+\d[\d.]*\s*ml\s*$/i.test(joined.trim())) return false;
  return true;
}

/** Phrases containing a set word that do not mean a set. */
const NOT_A_SET = /\bset sail\b|\bwith coffret\b/gi;

/**
 * A fragrance sold with a companion product named after "&", "+" or "with".
 * The companion alone is never a fragrance; the pair is a set.
 */
const WITH_COMPANION =
  /(?:&|\+|\bwith\b|\band\b)\s*(?:an?\s+)?(?:\d{1,4}(?:\.\d)?\s*ml\s+)?(?:body ?wash|shower ?gel|shower cream|body lotion|lotion|deodorant|deo(?:dorant)? (?:spray|stick)|deo|body spray|body mist|aftershave balm|after shave balm|balm|body cream|socks?|sg)\b/i;

/**
 * Two or more KAYALI scents joined by "+": Cult Beauty's duos and trios,
 * "Warm Apple Pie a la Mode 50ml (Eden Juicy Apple | 01 + Vanilla | 28)" and
 * "Fresh Fruit Tart 10ml ((Yum Boujee Marshmallow | 81 + Eden Juicy Apple | 01 +
 * Capri in a Bottle Lemon Sugar | 14)". Each scent is named with its own two
 * digit number after a pipe, so "| 39 + Vanilla Candy Rock Sugar | 42" is two
 * bottles in one box whatever the title says about size: the "50ml" is each
 * bottle's, and the price (£146 for the 50ml duo) is for both. Read as a single
 * 50ml bottle it was priced against, and could be
 * the "cheapest" for, a lone bottle of that size (found 2026-10-04 in
 * tests/kayaliCatalogue.test.ts: 5 live products). The numbers are the lock:
 * a title with one scent in brackets, or a "+" between words, is not this.
 * No concentration word is needed: the scents are the fragrance.
 */
const SCENT_PAIR = /\|\s*\d{2}\b[^|()]*\+[^|()]*\|\s*\d{2}\b/;

/** Any stated size: the catalogue gate drops a title with none, which is what houseBundle relies on. */
const SIZE_STATED = /\b\d{1,4}(?:\.\d+)?\s*(?:ml|cl|l|oz|fl\.? ?oz|g)\b/i;

/** The shop's own category for a set. */
const SET_PRODUCT_TYPE = /^\s*(?:bundles?|gift ?sets?|sets?)\s*$/i;

/**
 * Never a fragrance gift set, whatever the title says: the parts of
 * NOT_A_FRAGRANCE that name a thing which is not a perfume and cannot become
 * one by being boxed with another product. What NOT_A_FRAGRANCE excludes but
 * this does not are exactly the set words and the companions a perfume is
 * boxed with (gift set, set of, bundle, N pcs, body wash, shower gel,
 * deodorant, lotion, balm, body cream, body spray, body mist, socks, travel
 * spray).
 */
const NEVER_IN_A_SET =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|shampoo|conditioner|candles?|diffuser|reed|tester|samples?|refill|decant|hand wash|moisturis|scrub|talc|hair|serum|air ?freshener|room spray|lamp fragrance|home spray|refillable perfume spray|pet care|empty (?:perfume )?bottles?|travalo|atomi[sz]er|rechargeable perfume|bakhoor|bukhoor|incense|burner|makeup|lipstick|mascara|eyeshadow|nail)\b/i;

/**
 * Two products of one house named in one title, with no size and no word that
 * says "set": French Avenue's own storefront sells "Liquid Brun & Cocoa Morado",
 * "Aether & Atlantis" and "Physical Touch - Royal Blend Sequoia & Liquid Brun"
 * (10 listings, £37.50 to £77), each two full bottles at one price. Each name is
 * a known single bottle of that house, so the joined title is a bundle.
 *
 * "Known" is the house's own single bottles as the build reads them (names of
 * the listings that are single bottles at any shop), handed in once by the build
 * with registerKnownHouseProducts. Until it is, nothing is known and this rule
 * says nothing, so a process that never registers (a test, the price history)
 * classifies exactly as before. It only ever applies to a title that states no
 * size, which the catalogue gate drops as not a fragrance: a listing already kept
 * as a bottle is never moved by it, so no product id changes because of it.
 * Escentric Molecules' "Molecule 01 + Clary Sage" (one bottle, a name with a "+"
 * in it) states its size and so is never asked.
 */
export type KnownHouseProducts = ReadonlyMap<string, ReadonlySet<string>>;

let knownHouseProducts: KnownHouseProducts | null = null;

/** Hand over the house's single bottle names (build-demo-catalogue.ts). Null clears them. */
export function registerKnownHouseProducts(index: KnownHouseProducts | null): void {
  knownHouseProducts = index;
}

/** The index from (brand spellings, displayed name) pairs, one per single bottle listing. */
export function buildKnownHouseProducts(entries: Iterable<{ brands: readonly (string | null | undefined)[]; name: string }>): KnownHouseProducts {
  const out = new Map<string, Set<string>>();
  for (const { brands, name } of entries) {
    const brand = brands.find((b): b is string => Boolean(b));
    if (!brand) continue;
    const core = nameCore(name, brand, null);
    if (core.length < 3) continue;
    for (const b of brands) {
      if (!b) continue;
      const key = brandAliasKey(b);
      const set = out.get(key) ?? out.set(key, new Set()).get(key)!;
      set.add(core);
    }
  }
  return out;
}

const NAME_JOINER = /\s+(?:&|and|\+)\s+|\s*,\s*/i;

/** Whether the title joins two or more of the house's own known single bottles. */
export function namesTwoKnownProducts(rawTitle: string, rawBrand: string | null | undefined): boolean {
  if (!knownHouseProducts || !rawBrand) return false;
  const known = knownHouseProducts.get(brandAliasKey(rawBrand));
  if (!known) return false;
  const title = rawTitle.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // A product that is itself called "A & B" is one bottle, whatever its parts are.
  if (known.has(nameCore(title, rawBrand, null))) return false;
  const parts = title.split(NAME_JOINER).filter((p) => p.trim().length > 0);
  if (parts.length < 2) return false;
  return parts.every((part) => {
    // "The Extrovert x Introvert - Liquid Brun": the collection's name goes before the dash.
    const candidate = part.split(/\s[-–]\s/).pop()!;
    const core = nameCore(candidate, rawBrand, null);
    return core.length >= 3 && known.has(core);
  });
}

export function isGiftSet(l: Pick<StoredListing, 'rawTitle' | 'retailerId' | 'productType' | 'description' | 'rawBrand'>): boolean {
  const t = foldTitle(l.rawTitle);
  if (NEVER_IN_A_SET.test(t)) return false;
  if (BARBER.test(t) || (l.rawBrand && BARBER.test(l.rawBrand))) return false;
  if (l.description && PET_PRODUCT.test(l.description)) return false;

  const scentPair = SCENT_PAIR.test(t);
  const houseBundle = !SIZE_STATED.test(t) && namesTwoKnownProducts(l.rawTitle, l.rawBrand);
  const titleSaysSet =
    SET_TITLE.test(t.replace(NOT_A_SET, ' ')) || WITH_COMPANION.test(t) || sizePlusSize(t) || scentPair || houseBundle;
  const shopSaysSet = Boolean(l.productType && SET_PRODUCT_TYPE.test(l.productType));
  const copySaysSet = Boolean(l.description && DESCRIBED_AS_WASH_GIFT_SET.test(l.description));
  if (!titleSaysSet && !shopSaysSet && !copySaysSet) return false;

  // "Perfume mist" is a body or hair mist (Sol de Janeiro's Cheirosa sets),
  // so it is no evidence of a fragrance on its own.
  const named = scentPair || houseBundle || CONCENTRATION.test(t.replace(/\bperfume mists?\b/gi, ' '));
  if (named) return true;
  // A shop that sells only fragrance does not have to name one, unless the
  // title says the set is bath and body products (Escentric Molecules'
  // "Escentric 01 Bath & Body Gift Set"), which is no fragrance at all.
  return sellsOnlyFragrance(l.retailerId) && !/\b(bath|body|shower|lotion|wash)\b/i.test(t);
}

/**
 * A gift set's identity across shops: its barcode, or else its exact title
 * once normalised (case, accents, punctuation and spacing). Never a single
 * bottle's id: the "set-" prefix keeps a set carrying the same barcode as its
 * headline bottle (a shop reusing one) from ever being folded into that
 * bottle's product, and a set's unknown size keeps productMatch.ts's
 * findDuplicateGroups from ever matching it to anything (sizeKeyPart keys an
 * unknown size on the product's own id).
 */
export function giftSetId(l: Pick<StoredListing, 'rawTitle' | 'ean'>, untrustworthy?: ReadonlySet<string>): string {
  const ean = untrustworthy ? trustworthyEan(l as StoredListing, untrustworthy) : l.ean;
  if (ean) return `set-ean-${ean}`;
  return `set-${normalisedSetTitle(l.rawTitle)}`;
}

/** Lower case, accents folded, every run of non alphanumerics one hyphen. */
export function normalisedSetTitle(title: string): string {
  return foldTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The name a gift set is shown under: the shop's own title, less the brand
 * where the title opens with it (the brand is shown beside it already).
 * Deliberately not productName.ts's displayName, which removes sizes and
 * concentrations because a single bottle shows those in their own places: on
 * a set they are its contents, and removing them left "Burberry Her + Set" and
 * "Man Rain Essence Men's Gift Set ( + )".
 */
export function giftSetName(title: string, brand: string | null): string {
  let name = title.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  // A shop's trailing " | ..." label is its layout, not the set's name (Scent
  // Store's "Gift Set | NEW 2025", "Gift Set | 2025"). Kept when it opens on a
  // two digit number: that is how KAYALI numbers its own scents on its own
  // storefront ("Yum Boujee Marshmallow | 81 Sweet Fix"), see
  // tests/productNameNoise.test.ts.
  name = name.replace(/\s+\|\s+(?!\d{2}\b)[^|]*$/, '').trim();
  // A pipe with nothing after it is a label that was never filled in: Scent
  // Store's "Guerlain Aqua Allegoria Florabloom Forte Eau de Parfum 75ml Gift
  // Set |" (1 live set, 2026-10-04). Nothing follows it, so nothing can be
  // KAYALI's number, and nothing is lost.
  name = name.replace(/\s*\|\s*$/, '').trim();
  if (brand) {
    const lead = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    const stripped = name.replace(lead, '');
    if (stripped.length > 0) name = stripped;
  }
  return name;
}

/**
 * What a set's title says is in it, where that can be read plainly: each part of
 * the title between "+", "&", ",", " - ", ":" or "with" that states a size
 * ("100ml Eau de Toilette", "Body Wash 150ml"), a count against a size ("4 x 10ml
 * Eau de Parfum"), or else a stated piece count ("3 pieces", "Trio"). Null when
 * the title does not spell its contents out, in which case the page shows the
 * shop's own title rather than a guess. The reading is in giftSetItems.ts, which
 * also reads a shop's own description, the main bottle and whether a set is a
 * bundle (readGiftSet).
 */
export function giftSetContents(title: string): string[] | null {
  return displayContents(itemsFromTitle(title));
}

export { readGiftSet, type GiftSetFacts } from './giftSetItems.js';

/**
 * A set's record in the catalogue. `contents` is what the title (or, where the
 * title says less, the shop's own description) spells out, or null, and `title` is
 * the shop title the page shows in its place. `mainMl` is the largest fragrance
 * bottle in it where one is stated, `bundle` is set only on a bundle (the shop's
 * category or the title says so, or it holds two full size fragrances that
 * differ), and `from` is set only where the contents came from the description.
 * All three are omitted where they say nothing, so the file grows by what is known.
 */
export interface GiftSetRecord {
  contents: string[] | null;
  title: string;
  mainMl?: number;
  bundle?: true;
  from?: 'description';
}

export function giftSetRecord(l: { rawTitle: string; description?: string | null; productType?: string | null }): GiftSetRecord {
  const f = readGiftSet(l);
  return {
    contents: f.contents,
    title: l.rawTitle,
    ...(f.mainMl !== null ? { mainMl: f.mainMl } : {}),
    ...(f.bundle ? { bundle: true as const } : {}),
    ...(f.from === 'description' && f.contents ? { from: 'description' as const } : {}),
  };
}

/**
 * The record of a set sold by two shops: the first shop's, filled in by a later
 * one where the first said less. A later shop's contents replace a first one that
 * had none (with the title they were read from); a main bottle and a bundle flag
 * are kept from whichever shop had them.
 */
export function mergeGiftSetRecords(existing: GiftSetRecord, incoming: GiftSetRecord): GiftSetRecord {
  const fill = existing.contents === null && incoming.contents !== null;
  const base: GiftSetRecord = fill
    ? { contents: incoming.contents, title: incoming.title, ...(incoming.from ? { from: incoming.from } : {}) }
    : { contents: existing.contents, title: existing.title, ...(existing.from ? { from: existing.from } : {}) };
  const mainMl = existing.mainMl ?? incoming.mainMl;
  if (mainMl !== undefined) base.mainMl = mainMl;
  if (existing.bundle || incoming.bundle) base.bundle = true;
  return base;
}
