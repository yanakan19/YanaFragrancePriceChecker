import type { RetailerTier } from '../src/types/retailer.js';
import type { BottleArt, BottleShape } from './art.js';
import { CATALOGUE, CRAWLED, type CatalogueEntry } from './catalogue.generated.js';

/**
 * The app's product list, derived entirely from harvested listings.
 *
 * There is no hand written catalogue any more. Every entry here exists because
 * a shop was selling it when the harvest ran, and every price attached to it
 * came off that shop's own page.
 *
 * Artwork is generated from the product's own name, since real photography
 * needs a licence we do not have. Same reasoning as before, applied to a
 * catalogue we no longer know in advance.
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
  art: BottleArt;
}

/** Stable small hash, so a product always draws the same bottle. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const SHAPES: BottleShape[] = ['classic', 'flat', 'ingot', 'pebble', 'ornate', 'column', 'crest'];

/**
 * Give each product a bottle.
 *
 * Concentration picks the palette family, because an Eau de Toilette really
 * does tend to look lighter on a shelf than an Extrait, and the brand name
 * picks the exact hue so two products from one house look related.
 */
function artFor(entry: CatalogueEntry): BottleArt {
  const h = hash(`${entry.brand}|${entry.name}`);
  const hue = h % 360;
  const shape = SHAPES[h % SHAPES.length]!;

  const deep = /parfum|extrait|elixir/i.test(entry.concentration) && !/eau de/i.test(entry.concentration);
  const light = /toilette|cologne|fraiche/i.test(entry.concentration);

  const sat = deep ? 42 : light ? 30 : 36;
  const top = deep ? 46 : light ? 66 : 58;
  const bottom = deep ? 18 : light ? 34 : 26;

  return {
    shape,
    glass: [`hsl(${hue} ${sat}% ${top}%)`, `hsl(${hue} ${sat + 8}% ${bottom}%)`],
    cap: `hsl(${hue} ${sat}% ${Math.max(10, bottom - 10)}%)`,
    label: `hsl(${hue} 18% 92%)`,
  };
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
  art: artFor(entry),
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
