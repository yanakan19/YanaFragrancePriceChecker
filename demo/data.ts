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
function tierFor(id: string): RetailerTier {
  const prices = (CRAWLED[id] ?? []).map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  return lowest >= 150 ? 'niche' : 'designer';
}

export const DEMO_FRAGRANCES: DemoFragrance[] = CATALOGUE.map((entry) => ({
  id: entry.id,
  brand: entry.brand,
  name: entry.name,
  concentration: entry.concentration,
  sizeMl: entry.sizeMl,
  ean: entry.ean,
  tier: tierFor(entry.id),
  popularity: entry.shops,
  photoUrl: entry.image,
}));

/**
 * Ordered for the rail.
 *
 * Products carried by several shops come first, because a comparison across
 * five shops is worth more than a single listing. Cheapest breaks the tie so
 * the front page is not led by a £300 bottle.
 */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort((a, b) => {
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;
  const lowest = (f: DemoFragrance) => Math.min(...(CRAWLED[f.id] ?? []).map((o) => o.price), Infinity);
  return lowest(a) - lowest(b);
});
