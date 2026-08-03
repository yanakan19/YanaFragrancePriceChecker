import type { RetailerTier } from '../src/types/retailer.js';
import { CATALOGUE, CRAWLED } from './catalogue.generated.js';

/**
 * The app's product list, derived entirely from harvested listings.
 *
 * There is no hand written catalogue any more. Every entry here exists because
 * a shop was selling it when the harvest ran, and every price attached to it
 * came off that shop's own page.
 *
 * `photoUrl` is only ever set when scripts/build-demo-catalogue.ts found an
 * offer from a retailer whose affiliate programme has confirmed we may use
 * its images — see demo/photo.ts. Everything else renders a plain grey
 * placeholder rather than a stand-in illustration: a picture we are not
 * licensed to show and a picture we made up are the same kind of dishonest.
 */

export interface DemoFragrance {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  tier: RetailerTier;
  /** How many shops stock it. Doubles as the popularity signal for now. */
  popularity: number;
  photoUrl: string | null;
}

/**
 * Rough tier, used only to skip shops that cannot plausibly stock something.
 *
 * Price is the honest proxy available today. A real tier belongs on the
 * fragrance record once the matcher and a brand table exist.
 */
function priceTierFor(id: string): RetailerTier {
  const prices = (CRAWLED[id] ?? []).map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  return lowest >= 150 ? 'niche' : 'designer';
}

/**
 * Real, well known Middle Eastern and Arabic perfume houses. This is a named
 * fact about who makes the fragrance, the same kind of thing a brand's own
 * "About" page states, not a guess or an invented category. Lowercased for a
 * case insensitive match.
 *
 * None of the four shops this app currently harvests from (Allbeauty,
 * Justmylook, Beautybase, LOOKFANTASTIC) are Middle Eastern specialists, so
 * the Middle Eastern filter on the Brands page may genuinely show nothing
 * yet. That is an honest reflection of today's shop mix, not a bug — it will
 * populate as soon as a matching retailer's listings are harvested.
 */
const MIDEAST_HOUSES = new Set([
  'lattafa', 'rasasi', 'ajmal', 'swiss arabian', 'al haramain', 'nabeel',
  'armaf', 'afnan', 'al rehab', 'nusuk', 'amouage', 'khalis', 'surrati',
  'arabian oud', 'junaid jamshed', 'my perfumes', 'lattafa pride',
]);

/** Per fragrance tier, price based, per priceTierFor above. */
export const DEMO_FRAGRANCES: DemoFragrance[] = CATALOGUE.map((entry) => ({
  id: entry.id,
  brand: entry.brand,
  name: entry.name,
  concentration: entry.concentration,
  sizeMl: entry.sizeMl,
  ean: entry.ean,
  tier: priceTierFor(entry.id),
  popularity: entry.shops,
  photoUrl: entry.image,
}));

/**
 * Per brand tier, for the Brands page filter. A brand is Middle Eastern when
 * it is a named house from that market, whatever it happens to be priced at
 * today. Otherwise it takes whichever of designer or niche most of its own
 * fragrances in the current catalogue fall under.
 */
export function brandTierFor(brand: string): RetailerTier {
  if (MIDEAST_HOUSES.has(brand.toLowerCase())) return 'mideast';
  const tiers = DEMO_FRAGRANCES.filter((f) => f.brand === brand).map((f) => f.tier);
  const niche = tiers.filter((t) => t === 'niche').length;
  return niche * 2 > tiers.length ? 'niche' : 'designer';
}

/**
 * Ordered for the rail.
 *
 * Products carried by several shops come first, because a comparison across
 * five shops is worth more than a single listing. Cheapest breaks the tie so
 * the front page is not led by a £300 bottle.
 */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort((a, b) => {
  // Different sizes of the same perfume get separate entries (different EAN),
  // so without this a 50ml and a 100ml of the same bottle could land in
  // either order depending on price alone. Where it is genuinely the same
  // brand and name, the larger size leads.
  if (a.brand === b.brand && a.name === b.name && a.sizeMl !== b.sizeMl) {
    return b.sizeMl - a.sizeMl;
  }
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;
  const lowest = (f: DemoFragrance) => Math.min(...(CRAWLED[f.id] ?? []).map((o) => o.price), Infinity);
  return lowest(a) - lowest(b);
});
