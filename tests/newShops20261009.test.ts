import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { getRetailer, RETAILERS } from '../src/config/retailers.js';
import { resolveDelivery } from '../src/services/shipping.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The shop added on 2026-10-09 by the USA and India search
 * (docs/RETAILER-CANDIDATES-USA-INDIA-2026-10-09.md): Glossier's own UK storefront, read from its
 * Shopify `/products.json` as PriceSniffsBot.
 *
 * The fixture is a redacted cut of what the shop answered that day: titles, handles, vendors, product
 * types, options and variants (sku, size, price, compare-at price, stock). No descriptions, images,
 * tags or dates. It holds every fragrance-typed product (bottles, a discovery kit, candles, body
 * mists, a solid) and one balm, to show what the shop's own "Fragrance" type holds besides bottles.
 */

const fixture = (id: string): string =>
  readFileSync(new URL(`./fixtures/new-shops-2026-10-09/${id}.json`, import.meta.url), 'utf8');

function read(id: string) {
  const shop = getRetailer(id)!;
  const listings = parseShopifyProducts(fixture(id), {
    origin: `https://${shop.domain}`,
    sectionId: 'shopify-products-json',
    currency: 'GBP',
    ...(shop.shopifyVariantRule ? { variantRule: shop.shopifyVariantRule } : {}),
  });
  return listings.map((l) => {
    const stored: StoredListing = {
      ...l,
      retailerId: id,
      firstSeenAt: '2026-10-09T00:00:00.000Z',
      lastSeenAt: '2026-10-09T00:00:00.000Z',
      status: 'active',
      delistedAt: null,
      relistedAt: null,
      eligibleForNewBadge: false,
      variantId: null,
    };
    return { sku: l.retailerSku, title: l.rawTitle, price: l.priceGbp, was: l.wasPriceGbp, inStock: l.inStock, inCatalogue: isCatalogueListing(stored) };
  });
}

describe('Glossier UK', () => {
  const shop = getRetailer('glossier-uk')!;

  it('is on its own UK storefront, on the Shopify route, in sterling, with delivery read on the day it was added', () => {
    expect(shop).toBeDefined();
    expect(shop.domain).toBe('uk.glossier.com');
    expect(shop.enabled).toBe(true);
    expect(shop.currency).toBe('GBP');
    expect(shop.shopifyStorefront).toBe(true);
    expect(shop.adapter).toBe('unknown');
    expect(shop.shipping.verifiedAt).toBe('2026-10-09');
    expect(shop.shipping.source?.url).toBe('https://helpuk.glossier.com/en-US');
    for (const s of shop.catalogue!.sections) expect(s.urlTemplate.startsWith('https://uk.glossier.com/')).toBe(true);
  });

  it('keeps every id and domain unique in the registry', () => {
    expect(new Set(RETAILERS.map((r) => r.id)).size).toBe(RETAILERS.length);
    expect(new Set(RETAILERS.map((r) => r.domain)).size).toBe(RETAILERS.length);
  });

  it('reads only the shop\'s Fragrance type, and the catalogue keeps the bottles of Eau de Parfum and nothing else', () => {
    const rows = read('glossier-uk');
    expect(rows.every((r) => r.price !== null && r.price > 0)).toBe(true);
    expect(rows.filter((r) => r.title === 'Balm Dotcom')).toEqual([]);
    const kept = rows.filter((r) => r.inCatalogue).map((r) => [r.title, r.price]);
    expect(kept).toEqual([
      ['Glossier You Soie 50 ml', 70],
      ['Glossier You Soie 8 ml', 32],
      ['Glossier You Fleur 50 ml', 70],
      ['Glossier You Fleur 8 ml', 32],
      ['Glossier You Doux 50 ml', 70],
      ['Glossier You Doux 100 ml', 112],
      ['Glossier You Doux 8 ml', 32],
      ['Glossier You Rêve 50 ml', 70],
      ['Glossier You Rêve 8 ml', 32],
      ['Glossier You 50 ml', 70],
      ['Glossier You 100 ml', 112],
      ['Glossier You 8 ml', 32],
    ]);
    const dropped = rows.filter((r) => !r.inCatalogue).map((r) => r.title);
    for (const t of ['Birthday Cake Candle', 'Glossier Candles Sandstone', 'Body Spritz Sandstone', 'Glossier You Solid', 'Glossier You Discovery Kit']) {
      expect(dropped).toContain(t);
    }
  });

  it('reads a strength from the shop\'s own type only for its own Fragrance products', () => {
    expect(shop.fragranceTypeIsEauDeParfum).toBe(true);
    expect(shop.fragranceOnlyCatalogue).toBeUndefined();
    expect(shop.singleBrandOnly).toBe('Glossier');
  });

  it('states £4 below £30 and free over it, from the help centre, with the duties wording kept in the notes', () => {
    expect(shop.shipping.standardGbp).toBe(4);
    expect(shop.shipping.freeOverGbp).toBe(30);
    expect(shop.shipping.estimatedDays).toEqual([3, 5]);
    expect(shop.shipping.confidence).toBe('confirmed');
    expect(shop.shipping.source?.quote).toBe('Standard: (£4 or free for orders over £30, after promotions) 3-5 business days');
    expect(resolveDelivery(shop, 20).costGbp).toBe(4);
    expect(resolveDelivery(shop, 70).costGbp).toBe(0);
    expect(shop.shipping.notes).toMatch(/duties and taxes/);
    expect(shop.shipping.notes).toMatch(/does not say whether the sterling price includes VAT/);
  });

  it('shows photos only on the decided basis (D24, extended 9 Oct 2026) and takes no affiliate link until approved', () => {
    expect([undefined, 'hotlink-unlicensed']).toContain(shop.affiliate.imageBasis);
    expect(shop.affiliate.status).not.toBe('active');
  });
});
