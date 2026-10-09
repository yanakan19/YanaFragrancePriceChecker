/**
 * The US and Indian shops in the shape the page reads (`Retailer`), for the
 * region pages built since the public beta of 9 October 2026
 * (docs/INTERNATIONAL-PLAN.md, "Public beta, 9 October 2026: what shipped").
 *
 * The page code (demo/app.ts, src/services/priceService.ts and the rest) reads
 * one registry, `RETAILERS` from src/config/retailers.ts. The region builds
 * (scripts/bundle-region.ts) hand it the region's own shops instead, through a
 * small module scripts/build-region-data.ts writes from this function, so the
 * same code compares dollars between US shops and rupees between Indian shops
 * and never sees a UK shop. The UK registry and the UK pages are untouched.
 *
 * What is carried over from a region entry (src/types/regionRetailer.ts), and
 * what is left blank on purpose:
 *   - the shop's own standard delivery, in its own currency, under the UK
 *     field names (`standardGbp` holds dollars on the US page: the names are
 *     the UK's, the amounts are the shop's, and the money formatter writes the
 *     region's symbol). A delivery window the shop does not state is [0, 0],
 *     which demo/deliveryFacts.ts reads as "not stated" (no UK shop has it);
 *   - no affiliate programme (owner decision 6: none joined for now), so every
 *     link is the shop's own address with no tracking;
 *   - no `imageBasis`, no logo, no Trustpilot: D24 is pending for these
 *     countries (owner decision 5), so no shop photo is shown;
 *   - `catalogue: null`: the region crawl reads the region entry itself.
 */
import type { Retailer, ShippingRule } from '../types/retailer.js';
import type { RegionCode, RegionRetailer } from '../types/regionRetailer.js';
import { REGION_RETAILERS } from './regionRetailers.js';

/** The UK delivery shape, filled from a region shop's own delivery terms. */
export function regionShipping(shop: RegionRetailer): ShippingRule {
  const d = shop.delivery;
  return {
    standardGbp: d.standard,
    freeOverGbp: d.freeOver,
    estimatedDays: d.estimatedDays ?? [0, 0],
    ...(d.minimumOrder !== undefined ? { minimumOrderGbp: d.minimumOrder } : {}),
    verifiedAt: d.verifiedAt,
    confidence: d.confidence,
    ...(d.source ? { source: { url: d.source.url, quote: d.source.quote, readAt: d.source.readAt } } : {}),
    ...(d.notes !== undefined ? { notes: d.notes } : {}),
  };
}

/** One region shop as a page `Retailer`. */
export function regionShopAsRetailer(shop: RegionRetailer): Retailer {
  return {
    id: shop.id,
    name: shop.name,
    domain: shop.domain,
    homepage: shop.homepage,
    tiers: [...shop.tiers],
    ...(shop.singleBrandOnly ? { singleBrandOnly: shop.singleBrandOnly } : {}),
    ...(shop.fragranceOnlyCatalogue ? { fragranceOnlyCatalogue: true } : {}),
    enabled: shop.enabled,
    adapter: shop.route ? 'json-ld' : 'unknown',
    ...(shop.route?.kind === 'shopify' ? { shopifyStorefront: true } : {}),
    shipping: regionShipping(shop),
    affiliate: {
      network: null,
      verified: false,
      status: 'not-researched',
      publisherId: null,
      deeplinkTemplate: null,
      querySuffixTemplate: null,
      signupUrl: null,
    },
    catalogue: null,
    // The UK type's literal. The amounts on this page are the region's own
    // currency; nothing on the page reads this field to choose a symbol.
    currency: 'GBP',
    trustpilotBusinessId: null,
    trustpilotUrl: null,
  };
}

/** Every shop of a region, in registry order, as page `Retailer`s. */
export function regionShopsAsRetailers(region: RegionCode): Retailer[] {
  return REGION_RETAILERS[region].map(regionShopAsRetailer);
}

/** A region shop's cash on delivery fee, where it states one (India). */
export function regionCodFee(region: RegionCode, id: string): number | null {
  return REGION_RETAILERS[region].find((r) => r.id === id)?.delivery.codFee ?? null;
}
