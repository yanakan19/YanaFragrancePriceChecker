import { describe, expect, it } from 'vitest';
import {
  emptyPriceIndex,
  indexShopifyPage,
  lookupLivePrice,
} from '../src/catalogue/shopifyPriceIndex.js';
import { repairFeedPrices } from '../src/catalogue/feedPriceRepair.js';
import type { StoredListing } from '../src/catalogue/types.js';

const ORIGIN = 'https://shop.example';

/** One page of `/products.json` as Shopify actually serves it. */
function productsPage(products: unknown[]): string {
  return JSON.stringify({ products });
}

const OBSESSION = {
  id: 8338186961033,
  handle: 'calvin-klein-obsession-for-men-edt-125ml',
  title: 'Calvin Klein Obsession For Men EDT 125ml',
  variants: [
    {
      id: 44927013650569,
      sku: 'CK-OBS-125',
      price: '20.49',
      compare_at_price: '77.99',
      available: true,
      title: 'Default Title',
    },
  ],
};

function listing(over: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerSku: 'shopify_GB_8338186961033_44927013650569',
    url: 'https://www.awin1.com/pclick.php?p=1&a=2&m=106925',
    rawTitle: 'Calvin Klein Obsession For Men EDT 125ml',
    rawBrand: 'Calvin Klein',
    ean: null,
    imageUrl: null,
    priceGbp: 77.99,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'awin-feed',
    retailerId: 'mybeauty-boutique',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-12T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  };
}

describe('shopifyPriceIndex', () => {
  it('keys a variant by every spelling the ingestion routes write', () => {
    const index = emptyPriceIndex();
    const result = indexShopifyPage(productsPage([OBSESSION]), ORIGIN, index);

    expect(result.isShopify).toBe(true);
    expect(result.products).toBe(1);
    expect(result.variants).toBe(1);

    for (const key of [
      '44927013650569',
      'CK-OBS-125',
      '8338186961033_44927013650569',
      'shopify_GB_8338186961033_44927013650569',
    ]) {
      expect(index.get(key)?.price, key).toBe(20.49);
    }
  });

  it('keeps compare_at_price only when it sits above the selling price', () => {
    const index = emptyPriceIndex();
    indexShopifyPage(
      productsPage([
        OBSESSION,
        {
          id: 1,
          handle: 'b',
          variants: [{ id: 2, sku: 'B', price: '30.00', compare_at_price: '25.00', available: true }],
        },
      ]),
      ORIGIN,
      index,
    );
    expect(index.get('CK-OBS-125')?.compareAt).toBe(77.99);
    expect(index.get('B')?.compareAt).toBeNull();
  });

  it('reports a non-Shopify payload rather than an empty catalogue', () => {
    const index = emptyPriceIndex();
    expect(indexShopifyPage('<html>nope</html>', ORIGIN, index).isShopify).toBe(false);
    expect(indexShopifyPage('{"collections":[]}', ORIGIN, index).isShopify).toBe(false);
  });

  it('never answers from a handle when the product has several sized variants', () => {
    const index = emptyPriceIndex();
    indexShopifyPage(
      productsPage([
        {
          id: 9,
          handle: 'joop-jump',
          variants: [
            { id: 91, sku: null, price: '97.00', available: true, title: '100ml' },
            { id: 92, sku: null, price: '45.00', available: true, title: '200ml' },
          ],
        },
      ]),
      ORIGIN,
      index,
    );
    // No `-Default Title` alias exists, so a url-only lookup finds nothing
    // rather than picking whichever size came first.
    expect(lookupLivePrice('unknown-sku', `${ORIGIN}/products/joop-jump`, index)).toBeNull();
    expect(lookupLivePrice('91', null, index)?.price).toBe(97);
  });
});

describe('repairFeedPrices', () => {
  const index = emptyPriceIndex();
  indexShopifyPage(productsPage([OBSESSION]), ORIGIN, index);

  it('replaces an overstated feed price with what the shop charges', () => {
    const r = repairFeedPrices([listing()], index, { clearUnkeyed: true });
    expect(r.corrected).toBe(1);
    expect(r.wasOverstated).toBe(1);
    expect(r.overstatementRemovedGbp).toBe(57.5);
    expect(r.listings[0]?.priceGbp).toBe(20.49);
    // The feed has no RRP column at all; the storefront does.
    expect(r.listings[0]?.wasPriceGbp).toBe(77.99);
  });

  it('leaves the Awin deeplink and the identity untouched', () => {
    const before = listing();
    const after = repairFeedPrices([before], index, { clearUnkeyed: true }).listings[0]!;
    expect(after.url).toBe(before.url);
    expect(after.retailerSku).toBe(before.retailerSku);
    expect(after.firstSeenAt).toBe(before.firstSeenAt);
    expect(after.status).toBe('active');
  });

  it('counts a price that already agreed rather than calling it a correction', () => {
    const r = repairFeedPrices([listing({ priceGbp: 20.49 })], index, { clearUnkeyed: true });
    expect(r.agreed).toBe(1);
    expect(r.corrected).toBe(0);
  });

  it('clears a price the storefront cannot corroborate, never keeps it', () => {
    const r = repairFeedPrices([listing({ retailerSku: 'shopify_GB_1_2' })], index, {
      clearUnkeyed: true,
    });
    expect(r.unkeyed).toBe(1);
    expect(r.cleared).toBe(1);
    expect(r.listings[0]?.priceGbp).toBeNull();
    expect(r.listings[0]?.wasPriceGbp).toBeNull();
  });

  it('leaves an unkeyed price alone when clearing is not asked for', () => {
    const r = repairFeedPrices([listing({ retailerSku: 'shopify_GB_1_2' })], index, {
      clearUnkeyed: false,
    });
    expect(r.unkeyed).toBe(1);
    expect(r.cleared).toBe(0);
    expect(r.listings[0]?.priceGbp).toBe(77.99);
  });

  it('does not rewrite a delisted row, which is history rather than an offer', () => {
    const gone = listing({ status: 'delisted', delistedAt: '2026-08-11T00:00:00.000Z' });
    const r = repairFeedPrices([gone], index, { clearUnkeyed: true });
    expect(r.listings[0]?.priceGbp).toBe(77.99);
    expect(r.corrected).toBe(0);
    expect(r.unkeyed).toBe(0);
  });

  it('records an understatement separately from an overstatement', () => {
    const r = repairFeedPrices([listing({ priceGbp: 10 })], index, { clearUnkeyed: true });
    expect(r.wasUnderstated).toBe(1);
    expect(r.wasOverstated).toBe(0);
    expect(r.overstatementRemovedGbp).toBe(0);
    expect(r.listings[0]?.priceGbp).toBe(20.49);
  });
});
