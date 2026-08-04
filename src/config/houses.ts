/**
 * Fragrance houses we source directly from the house's own storefront.
 *
 * ── Why these are not in RETAILERS ───────────────────────────────────────────
 * `src/config/retailers.ts` models UK shops: sterling prices, UK delivery
 * thresholds, UK affiliate programmes. A house selling from Dubai or Sharjah
 * has none of those, and forcing one into that shape would mean inventing a
 * shipping rule and a currency. They are a different kind of source and get
 * their own registry.
 *
 * ── Why direct at all ────────────────────────────────────────────────────────
 * The Middle Eastern segment barely appears in the UK retailers this project
 * walks — the registry has a `mideast` tier precisely because that gap was
 * already known. The houses themselves publish their full range. Going to the
 * source is both better coverage and fewer hops.
 *
 * ── The honesty rules that apply here ────────────────────────────────────────
 * Every field below is either verified or explicitly marked unverified. In
 * particular:
 *
 *   - `origin` is the house's storefront as published by the house. Where that
 *     has not actually been confirmed the entry says so via `confidence`, and
 *     nothing downstream may present its prices as fact until it has been.
 *   - `currency` is never assumed. It is resolved at harvest time from the
 *     storefront itself (see `parseShopCurrency`), and a non-sterling price is
 *     recorded as such rather than converted.
 *   - No house below is claimed to be on Shopify. `route` records what we will
 *     *try*, in order; what actually worked is written back to the harvest
 *     report from a real run, not asserted here.
 *
 * These five were named as the priority set. They are the starting point, not
 * a finished list.
 */

/** How we will attempt to read a house's catalogue, cheapest first. */
export type HouseRoute =
  /**
   * Shopify's public `/products.json`. No key, no browser, structured, and it
   * carries product photography. Tried first wherever it might apply.
   */
  | 'shopify-products-json'
  /** The sitemap walk plus JSON-LD that the UK retailers already use. */
  | 'sitemap-jsonld';

export interface House {
  /** Stable internal key. */
  id: string;
  /** The house's name as it brands itself. */
  name: string;
  /**
   * Storefront origin, no trailing slash.
   *
   * `confidence: 'unverified'` means this domain has not been opened and
   * confirmed as the house's own storefront from this environment — the
   * sandbox this was written in has these domains blocked at the network
   * gateway, so none of them could be checked here. A run on a machine with
   * open egress is what promotes an entry to `confirmed`.
   */
  origin: string;
  confidence: 'confirmed' | 'unverified';
  /** Retrieval routes to try, in order. */
  routes: HouseRoute[];
  /** Whether the harvester attempts this house at all. */
  enabled: boolean;
  /**
   * What is still missing before this house's prices could be shown to a UK
   * buyer as a real offer. Non-empty means the listings are catalogue-only:
   * we know the product exists and what it looks like, not what it costs here.
   */
  blockers: string[];
}

export const HOUSES: readonly House[] = [
  {
    id: 'rasasi',
    name: 'Rasasi',
    origin: 'https://www.rasasi.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'afnan',
    name: 'Afnan Perfumes',
    origin: 'https://www.afnanperfumes.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'armaf',
    name: 'Armaf',
    origin: 'https://www.armaf.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'french-avenue',
    name: 'French Avenue',
    origin: 'https://www.frenchavenue.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'al-attaar',
    name: 'Al Attaar',
    origin: 'https://www.alttaffa.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'domain supplied as "alttaffa"; the house also trades as Al Attaar and Lattafa, which are different businesses — confirm which storefront this is before trusting its listings',
    ],
  },
];

export function houseById(id: string): House | null {
  return HOUSES.find((h) => h.id === id) ?? null;
}
