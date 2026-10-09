/**
 * Imaginary Authors (US) keeps 0 listings, on purpose (2026-10-09).
 *
 * Its titles end "- FRAGRANCE" and state no strength anywhere: not in the
 * title, `product_type` ("Perfume"), `tags`, variant titles (50ml, 14ml, 2ml),
 * the body text, the product pages' meta, or its FAQ. Six product pages were
 * read as PriceSniffsBot (robots.txt first, 2 second gaps) and none says "Eau
 * de Parfum" or any other strength. The shop also sells candles, soaps, body
 * oils and prints, so it is not a fragrance only shop either. Nothing is
 * guessed: these tests pin the rules, not the counts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { toRegionListings } from '../src/catalogue/regionHarvest.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import type { RawListing } from '../src/catalogue/types.js';

const NOW = '2026-10-09T12:00:00.000Z';
const ia = REGION_RETAILERS.US.find((s) => s.id === 'imaginary-authors')!;
const raw = parseShopifyProducts(
  readFileSync(join(REPO_ROOT, 'fixtures/regions/us/imaginary-authors.products.json'), 'utf8'),
  { origin: `https://${ia.domain}`, sectionId: 'shopify-products-json', currency: ia.currency },
);

describe('Imaginary Authors states no strength, so none is put on it', () => {
  it('is not marked as a fragrance only shop', () => {
    expect(ia.fragranceOnlyCatalogue).not.toBe(true);
  });

  it('reads priced listings but keeps none whose title states no strength', () => {
    const { listings, priced } = toRegionListings(raw, ia, NOW);
    expect(priced).toBeGreaterThan(0);
    expect(listings).toEqual([]);
  });

  it('keeps a listing of the same shop once a strength is stated', () => {
    const stated: RawListing[] = raw.slice(0, 1).map((l) => ({ ...l, rawTitle: 'SUNDRUNK Eau de Parfum 50ml' }));
    expect(toRegionListings(stated, ia, NOW).listings).toHaveLength(1);
  });

  it('still drops a no strength title at a shop of another kind', () => {
    const other = REGION_RETAILERS.US.find((s) => s.id === 'perfumania')!;
    const none: RawListing[] = raw.slice(0, 1).map((l) => ({ ...l, rawTitle: 'Some Brand SUNDRUNK 50ml' }));
    expect(toRegionListings(none, other, NOW).listings).toEqual([]);
  });
});
