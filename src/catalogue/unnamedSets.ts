import type { StoredListing } from './types.js';
import { foldTitle } from './fragranceId.js';

/**
 * Fragrance sets whose title carries no strength word
 * (docs/GIFT-SETS-AND-OILS-PLAN.md, 3.6; owner's answer to question 8, 6 Oct 2026).
 *
 * isGiftSet needs two things: the listing says it is a set, and it holds a fragrance,
 * which it reads from a strength word in the title ("EDP") or from a shop that sells
 * only fragrance. John Lewis's "Versace Pour Femme Miniature Fragrance Gift Set, 4 x
 * 5ml", Cult Beauty's "BYREDO La Sélection Nomade Discovery Set" and Emirates Oud's
 * "Lattafa Maahir Gift Set" say "set" and name no strength, and the shops sell
 * much besides fragrance, so none was kept (about 250 live listings, measured
 * 2026-10-06).
 *
 * Widening SET_TITLE or dropping the strength requirement would let candles, skincare
 * kits, body spray sets and empty bottle packs in. So this is a reviewed list instead:
 * each rule is one shop and the words that shop uses for a fragrance set, written after
 * reading every listing the shop has that says "set", "duo", "trio", "collection" or
 * "kit" and holds no strength word. A listing matching no rule stays out, whatever it
 * says. The titles each rule takes, and the ones it must refuse, are in
 * tests/unnamedSets.test.ts.
 *
 * Two refusals apply to every rule:
 *   - Things that are not fragrance: candles, home scents, soap, skincare, hair and body
 *     care, body and hair mists (Sol de Janeiro's "perfume mist" is a body mist), air
 *     fresheners, wellbeing pods and pillow sprays.
 *   - Sample vials. Owner's answer to question 8: discovery sets of vials stay out, miniature
 *     and travel sets count. A vial is 2.5ml or less, read from the size and count the
 *     title states ("10x1.5ml", "8 x 2ml", "2ml X 8"). A set of 3ml or more is a
 *     miniature set. A title that states no size is taken as stated: it is a set.
 *
 * Nothing here changes the id of anything already in the catalogue: a title with no
 * strength word is no bottle, and the build's kind guards would stop one that was.
 */

export interface UnnamedSetRule {
  /** The shop's registry id. */
  shop: string;
  /** The words that shop uses for a fragrance set. Run on the folded title. */
  title: RegExp;
  /** Where the shop's own category says it, instead of or as well as the title. */
  productType?: RegExp;
  /** A brand, in the shop's own spelling, that the rule applies to alone. */
  brand?: RegExp;
  /** Why, in a few words, for the next person to read. */
  note: string;
}

export const UNNAMED_SET_RULES: readonly UnnamedSetRule[] = [
  {
    shop: 'john-lewis',
    title: /\bfragrance gift set\b/i,
    note: 'its fragrance sets are all named "Fragrance Gift Set" (miniatures, discovery and travel sets)',
  },
  {
    shop: 'cult-beauty-global',
    title:
      /\bdiscovery (?:set|kit|box|collection)\b|\bminiatures? (?:fragrance )?(?:gift )?set\b|\bscent layering (?:gift )?set\b|\blayering (?:set|collection)\b|\bcologne (?:intense )?collection\b|\bfragrance (?:set|duo|trio|collection)\b|\btravel (?:collection|set)\b|\bmini (?:set|duo)\b|\b(?:duo|trio) (?:set|kit)\b|\b(?:ritual )?duo\b|\bbundle\b|\bgift set\b/i,
    note: 'discovery and layering sets, duos, trios and bundles of scents; no strength word is ever in a title',
  },
  {
    shop: 'lookfantastic',
    title:
      /\bdiscovery (?:set|wardrobe)\b|\bminiatures? gift set\b|\bscent layering gift set\b|\blayering collection\b|\btravel spray gift set\b|\bpen spray trio set\b|\bmini mist trio\b|\bbundle set\b/i,
    note: 'only the shapes that name fragrance; its bundle and kit words are mostly skincare and wellbeing',
  },
  {
    shop: 'justmylook',
    title: /\bfragrance (?:mini )?(?:discovery |gift )?set\b/i,
    note: 'Mini Fragrance Gift Set and Fragrance Mini Discovery Set',
  },
  {
    shop: 'avon',
    title: /\bgift set\b|\bduo\b/i,
    productType: /^fragrance$/i,
    note: 'only where its own category is Fragrance (its Face, Body and Home sets are not)',
  },
  {
    shop: 'emirates-oud',
    title: /\bgif{1,2}t set\b|\bbundle set of [2-9]\b|\b(?:duo|trio)\b|\bcollection set\b/i,
    note: 'its gift sets, bundles of two or three and collection sets; never its gift bags, air fresheners or samples',
  },
  {
    shop: 'armaf',
    title: /\bdiscovery set\b/i,
    note: "the house's own discovery sets",
  },
  {
    shop: 'al-haramain',
    title: /\bdiscovery set\b|\btravel pack\b|\btrio gift box\b/i,
    note: 'its Gift Sets and Bundles category and its trio box; never gift wrap or air fresheners',
  },
  {
    shop: 'ibraq',
    title: /\bwish set\b|\bcollection\b|\bset \(/i,
    brand: /\bibraq\b|al qurashi/i,
    note: "the house's own sets and collections of bottles and miniatures",
  },
  {
    shop: 'manchester-ouds',
    title: /\bwish set\b|\bcollection\b|\bset \(/i,
    brand: /\bibraq\b|al qurashi/i,
    note: 'IBRAQ sets and collections, the same words as the house uses itself',
  },
  {
    shop: 'nicchia-luxury-uk',
    title: /\bdiscovery (?:set|kit)\b|\btravel kit\b/i,
    productType: /^discovery set$/i,
    note: 'only where its own category is Discovery Set (its Beauty Kit and soap sets are not fragrance)',
  },
  {
    shop: 'les-senteurs',
    title: /\bdiscovery set\b|\bminiature set\b|\btravel set\b|\bgift set\b|\bcollection\b|\bbestseller set\b/i,
    productType: /^(?:discovery set|gift set|scented travel set|fragrance)$/i,
    note: 'its Discovery Set, Gift Set and Travel Set categories (sample vials are left out by the vial rule)',
  },
  {
    shop: 'escentric-molecules',
    title: /\b(?:scent|travel) & body gift set\b/i,
    note: 'a Molecule with body products; its Bath & Body sets and 2ml Sample Sets stay out',
  },
  {
    shop: 'the-fragrance-counter',
    title: /\bfragrance (?:discovery set|gift set|sampler gift set)\b|\bgift set\b|\bfragrance and .* duo\b/i,
    note: 'a fragrance shop: its Gift Set and Discovery Set titles',
  },
  {
    shop: 'fragrancehub',
    title: /\bgift set\b|\btrio bundle\b|\bcollection \(\d/i,
    note: 'its gift sets and bundles of fragrances; never its air freshener bundles',
  },
  {
    shop: 'scentstore',
    title: /\bgift set\b/i,
    note: 'a fragrance shop: a gift set with no strength word',
  },
  {
    shop: 'space-nk',
    title: /\bparfums?[- ]jardins collection\b/i,
    note: "Hermès's travel set",
  },
];

/**
 * What is never a fragrance set whatever the shop calls it, run on the brand and the
 * folded title. A set that holds a fragrance with a shower gel or a hair mist is still a
 * fragrance set (Lattafa's "Gift Set 100ml + 12ml + Shower Gel"), so those words are not
 * here; the words here name a product that is not fragrance, or a house whose "fragrance"
 * is a body mist or a home scent.
 */
const NOT_FRAGRANCE =
  /\b(?:candles?|wax|diffuser|reed|room|home|incense|bakhoor|bukhoor|soap|hand care|bath|skin|skincare|face|facial|cream|serum|mask|wellbeing|pillow|sleep|neom|white company|sol de janeiro|ouai|molton brown|jet set|nest new york|trudon|air fresh\w*|freshn?er|care collection|mario badescu|philip kingsley|l'occitane|this works|moroccanoil|body mist|perfume mist|evidens|discovery layering set)\b/i;

/**
 * Every size a title states as a count against a size ("10x1.5ml", "8 x 2ml", "2ml X 8",
 * "6x1.7 ml"), the single size in ml. Nothing where the title states no count against a
 * size.
 */
function countedSizesMl(title: string): number[] {
  const out: number[] = [];
  const countThenSize = /\b(\d{1,2})\s*[x×*]\s*(\d{1,3}(?:\.\d+)?)\s*ml\b/gi;
  const sizeThenCount = /\b(\d{1,3}(?:\.\d+)?)\s*ml\s*[x×*]\s*(\d{1,2})\b/gi;
  for (const m of title.matchAll(countThenSize)) out.push(Number(m[2]));
  for (const m of title.matchAll(sizeThenCount)) out.push(Number(m[1]));
  return out;
}

/** The largest a sample vial is, in ml: owner's answer to question 8 is that a set of vials is not a set. */
export const MAX_VIAL_ML = 2.5;

/** Whether the title's counted sizes are all vials. A title with none is not one. */
export function isVialSet(title: string): boolean {
  const sizes = countedSizesMl(title);
  return sizes.length > 0 && sizes.every((ml) => ml <= MAX_VIAL_ML);
}

/** Whether a reviewed rule takes this listing as a fragrance set. */
export function isReviewedUnnamedSet(l: Pick<StoredListing, 'rawTitle' | 'retailerId' | 'productType' | 'rawBrand'>): boolean {
  const rules = UNNAMED_SET_RULES.filter((r) => r.shop === l.retailerId);
  if (rules.length === 0) return false;
  const title = foldTitle(l.rawTitle);
  if (NOT_FRAGRANCE.test(`${l.rawBrand ?? ''} ${title}`) || isVialSet(title)) return false;
  return rules.some(
    (r) =>
      r.title.test(title) &&
      (!r.brand || r.brand.test(l.rawBrand ?? '')) &&
      (!r.productType || (l.productType !== null && l.productType !== undefined && r.productType.test(l.productType))),
  );
}
