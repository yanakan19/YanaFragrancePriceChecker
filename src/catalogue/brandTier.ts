import type { RetailerTier } from '../types/retailer.js';

/**
 * Real, well known Middle Eastern and Arabic perfume houses. This is a named
 * fact about who makes the fragrance, the same kind of thing a brand's own
 * "About" page states, not a guess or an invented category. Lowercased for a
 * case insensitive match.
 */
const MIDEAST_HOUSES = new Set([
  'lattafa', 'rasasi', 'ajmal', 'swiss arabian', 'al haramain', 'nabeel',
  'armaf', 'afnan', 'al rehab', 'nusuk', 'khalis', 'surrati',
  'arabian oud', 'junaid jamshed', 'my perfumes', 'lattafa pride',
  'french avenue', 'street origins', 'maison asrar', 'mykonos',

  // Added 2026-08-12: this list predated Emirates Oud's ~2,500-listing
  // catalogue going live, and most of what it actually carries was missing
  // from it — every offer from a brand not in this set falls through to the
  // price-derived designer/niche split, which does not match Emirates Oud's
  // own tiers: ['mideast'], so buildComparison's `tier` filter (see
  // priceService.ts) silently dropped the offer from every tier-filtered
  // view. For a fragrance Emirates Oud is the only seller of, that meant it
  // read as sold out everywhere despite being genuinely in stock — reported
  // directly for 'Fragrance World'; checked the rest of Emirates Oud's own
  // top brands against this set and found eighteen more of the same gap.
  'fragrance world', 'maison alhambra', 'ard al zaafaran', 'paris corner',
  'khadlaj', 'bujairami', 'rayhaan', 'reef perfumes', 'riiffs',
  'pendora scents', 'dkhoon emirates', 'ahmed al maghribi', 'zimaya',
  'gulf orchid', 'arabiyat', 'ibraheem al qurashi', 'risala', 'risala elite',
  'assaf', 'privee couture collection',
]);

/**
 * Named exceptions to the price-derived designer/niche split below, for
 * brands the algorithm would otherwise get wrong.
 *
 * Amouage is a Middle Eastern *company* but sits squarely in the world niche
 * market rather than the dupe/attar segment this tier otherwise groups —
 * showing it under "Middle Eastern / Dupe Houses" understates it and misleads
 * a reader comparing it against Lattafa or Afnan. Kayali is priced high enough
 * that the majority-vote split below can tip it into "niche" on a given
 * catalogue snapshot, when it is a mainstream designer-adjacent brand every
 * other classification here treats as designer.
 */
const TIER_OVERRIDE: Partial<Record<string, RetailerTier>> = {
  amouage: 'niche',
  kayali: 'designer',
};

/**
 * Per brand tier, for the Brands page filter. A brand is Middle Eastern when
 * it is a named house from that market, whatever it happens to be priced at
 * today. Otherwise it takes whichever of designer or niche most of its own
 * fragrances in the current catalogue fall under — `tiers` is that brand's
 * own fragrances' price-derived tiers, supplied by the caller so this stays a
 * pure function of its inputs rather than reaching into the catalogue itself.
 */
export function brandTierForName(brand: string, tiers: RetailerTier[]): RetailerTier {
  const lower = brand.toLowerCase();
  const override = TIER_OVERRIDE[lower];
  if (override) return override;
  if (MIDEAST_HOUSES.has(lower)) return 'mideast';
  const niche = tiers.filter((t) => t === 'niche').length;
  return niche * 2 > tiers.length ? 'niche' : 'designer';
}
