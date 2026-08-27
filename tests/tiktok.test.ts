import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TIKTOK_BETA_CONFIG,
  TIKTOK_SELLERS,
  visibleTikTokSellers,
} from '../src/config/tiktokSellers.js';
import { RETAILERS } from '../src/config/retailers.js';
import {
  crossCheckTikTokCapture,
  mapTikTokCapture,
  titleSizeKey,
  type SiteListingForCrossCheck,
  type TikTokCaptureRow,
} from '../src/catalogue/tiktokShop.js';
import { isBarcode, normalizedEan } from '../src/catalogue/productMatch.js';

describe('TikTok Shop beta', () => {
  it('is off by default', () => {
    expect(TIKTOK_BETA_CONFIG.enabled).toBe(false);
    expect(visibleTikTokSellers()).toEqual([]);
  });

  it('excludes untrusted sellers rather than badging them', () => {
    expect(TIKTOK_BETA_CONFIG.showUntrustedSellers).toBe(false);
  });

  it('carries a mandatory authenticity disclaimer', () => {
    expect(TIKTOK_BETA_CONFIG.authenticityDisclaimer.length).toBeGreaterThan(40);
  });

  it('stays out of the retailer registry entirely', () => {
    // Isolation is the point: when TikTok breaks, core comparison must not.
    expect(RETAILERS.some((r) => r.domain.includes('tiktok'))).toBe(false);
  });
});

describe('TikTok seller registry', () => {
  it('every entry documents itself', () => {
    const ids = new Set<string>();
    for (const s of TIKTOK_SELLERS) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      // Handles are stored bare; a leading @ would break URL construction.
      expect(s.handle.startsWith('@')).toBe(false);
      expect(s.handle.length).toBeGreaterThan(0);
      // A trust call nobody can revisit is a trust call nobody made.
      expect(s.notes.length).toBeGreaterThan(40);
      expect(s.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('same-business linkage points at a real registry retailer', () => {
    // The trust basis for the current entries is "same company as a retailer
    // this site already compares" — that claim only holds if the retailer id
    // actually exists.
    const retailerIds = new Set(RETAILERS.map((r) => r.id));
    for (const s of TIKTOK_SELLERS) {
      if (s.retailerId !== undefined) {
        expect(retailerIds.has(s.retailerId)).toBe(true);
      }
    }
  });

  it('the pilot seller is Beauty Base, linked to its own-site catalogue', () => {
    const pilot = TIKTOK_SELLERS.find((s) => s.id === 'tiktok-beautybase');
    expect(pilot).toBeDefined();
    expect(pilot!.retailerId).toBe('beautybase');
  });
});

function row(overrides: Partial<TikTokCaptureRow>): TikTokCaptureRow {
  // A neutral, complete fixture row; tests override what they are testing.
  return {
    productId: '1729000000000000001',
    skuId: null,
    title: 'Test Fragrance Eau De Parfum 100ml',
    price: { amount: '49.99', currency: 'GBP' },
    listPrice: null,
    dealEndsAt: null,
    inStock: true,
    url: 'https://example.invalid/product/1729000000000000001',
    imageUrl: null,
    ean: null,
    capturedAt: '2026-08-27T00:00:00Z',
    ...overrides,
  };
}

describe('mapTikTokCapture', () => {
  it('maps a GBP row and SKU-qualifies the id when a SKU exists', () => {
    const { listings, skipped } = mapTikTokCapture([
      row({ skuId: 'sku-7' }),
      row({ productId: '1729000000000000002' }),
    ]);
    expect(listings).toHaveLength(2);
    expect(listings[0]!.retailerSku).toBe('1729000000000000001:sku-7');
    expect(listings[1]!.retailerSku).toBe('1729000000000000002');
    expect(listings[0]!.priceGbp).toBe(49.99);
    expect(listings[0]!.sectionId).toBe('tiktok-shop');
    expect(Object.values(skipped).every((n) => n === 0)).toBe(true);
  });

  it('never converts a non-GBP price — it becomes nativePrice, not priceGbp', () => {
    const { listings } = mapTikTokCapture([row({ price: { amount: '55.00', currency: 'USD' } })]);
    expect(listings[0]!.priceGbp).toBeNull();
    expect(listings[0]!.nativePrice).toEqual({ amount: 55, currency: 'USD' });
  });

  it('keeps a list price only when genuinely above the selling price, in GBP', () => {
    const above = mapTikTokCapture([row({ listPrice: { amount: '60.00', currency: 'GBP' } })]);
    expect(above.listings[0]!.wasPriceGbp).toBe(60);

    const equal = mapTikTokCapture([row({ listPrice: { amount: '49.99', currency: 'GBP' } })]);
    expect(equal.listings[0]!.wasPriceGbp).toBeNull();

    // A strikethrough in another currency cannot be compared to a sterling
    // price — never cross-currency (commit c9fc2b14's rule).
    const foreign = mapTikTokCapture([row({ listPrice: { amount: '80.00', currency: 'USD' } })]);
    expect(foreign.listings[0]!.wasPriceGbp).toBeNull();
  });

  it('passes through a published deal end and refuses an unparseable one', () => {
    const good = mapTikTokCapture([row({ dealEndsAt: '2026-09-01T18:00:00Z' })]);
    expect(good.listings[0]!.promoEndsAt).toBe('2026-09-01T18:00:00Z');

    const bad = mapTikTokCapture([row({ dealEndsAt: 'ends soon!!' })]);
    expect(bad.listings[0]!.promoEndsAt).toBeNull();
  });

  it('skips and counts rows it cannot honestly represent', () => {
    const { listings, skipped } = mapTikTokCapture([
      row({ url: null }),
      row({ price: null }),
      row({ price: { amount: 'call us', currency: 'GBP' } }),
      row({ title: '   ' }),
      row({ productId: '' }),
    ]);
    expect(listings).toHaveLength(0);
    expect(skipped['no-url']).toBe(1);
    expect(skipped['no-price']).toBe(1);
    expect(skipped['unparseable-price']).toBe(1);
    expect(skipped['no-title']).toBe(1);
    expect(skipped['no-product-id']).toBe(1);
  });
});

describe('titleSizeKey', () => {
  it('refuses a title with no readable size', () => {
    expect(titleSizeKey('Dior Sauvage Eau De Toilette')).toBeNull();
  });

  it('separates the same words at different sizes', () => {
    const k50 = titleSizeKey('Dior Sauvage Eau De Toilette 50ml Spray');
    const k100 = titleSizeKey('Dior Sauvage Eau De Toilette 100ml Spray');
    expect(k50).not.toBeNull();
    expect(k100).not.toBeNull();
    expect(k50).not.toBe(k100);
  });
});

describe('crossCheckTikTokCapture — the BeautyBase pilot harness', () => {
  // The pilot's whole point: a TikTok capture from @beautybase is checked
  // against the same company's own-website catalogue this project already
  // holds. The site side of this test is the real beautybase.json snapshot,
  // not a fixture — the same bottles the live cross-check will use.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const catalogue = JSON.parse(
    readFileSync(join(root, 'data', 'catalogue', 'beautybase.json'), 'utf8'),
  ) as { retailerId: string; listings: SiteListingForCrossCheck[] };

  /**
   * The cross-check's lookup maps are first-writer-wins, so an anchor drawn
   * from the real snapshot must itself be the first listing carrying its key
   * — otherwise the harness would (correctly) match some earlier duplicate
   * and the assertion would be testing snapshot ordering, not the harness.
   */
  function firstWriterByEan(): SiteListingForCrossCheck {
    const seen = new Set<string>();
    for (const l of catalogue.listings) {
      if (!isBarcode(l.ean)) continue;
      const key = normalizedEan(l.ean);
      const first = !seen.has(key);
      seen.add(key);
      if (first && l.priceGbp !== null) return l;
    }
    throw new Error('beautybase.json holds no barcoded, priced listing');
  }

  function firstWriterByTitleSize(): SiteListingForCrossCheck {
    const seen = new Set<string>();
    for (const l of catalogue.listings) {
      const k = titleSizeKey(l.rawTitle);
      if (k === null) continue;
      const first = !seen.has(k);
      seen.add(k);
      // Barcodeless on the TikTok side is the scenario, but the anchor must
      // not be matchable by EAN first — the fixture below clears its ean.
      if (first && l.priceGbp !== null) return l;
    }
    throw new Error('beautybase.json holds no listing with a sized title and a price');
  }

  it('the site snapshot is fit to cross-check against', () => {
    expect(catalogue.retailerId).toBe('beautybase');
    const usable = catalogue.listings.filter((l) => isBarcode(l.ean) && l.priceGbp !== null);
    // 3,100+ at the time of writing; the floor only asserts there is enough
    // signal for an EAN-first match to mean something.
    expect(usable.length).toBeGreaterThan(500);
  });

  it('matches a captured row to the website bottle by EAN and reports the delta', () => {
    const anchor = firstWriterByEan();
    // Synthesise the TikTok side FROM the real site listing: same barcode,
    // a price £2 dearer. Only the price is invented, and only in a test.
    const { listings } = mapTikTokCapture([
      row({
        ean: anchor.ean,
        title: anchor.rawTitle,
        price: { amount: String((anchor.priceGbp! + 2).toFixed(2)), currency: 'GBP' },
      }),
    ]);
    const report = crossCheckTikTokCapture(listings, catalogue.listings);
    expect(report.matchedByEan).toBe(1);
    expect(report.matches).toHaveLength(1);
    expect(report.matches[0]!.siteSku).toBe(anchor.retailerSku);
    expect(report.matches[0]!.deltaGbp).toBeCloseTo(2, 2);
    expect(report.siteCheaper).toBe(1);
  });

  it('falls back to title+size when the capture carries no barcode', () => {
    // A real title with a parseable size, drawn from the snapshot itself.
    const anchor = firstWriterByTitleSize();
    const { listings } = mapTikTokCapture([
      row({
        ean: null,
        title: anchor.rawTitle,
        price: { amount: String(anchor.priceGbp!), currency: 'GBP' },
      }),
    ]);
    const report = crossCheckTikTokCapture(listings, catalogue.listings);
    expect(report.matchedByEan).toBe(0);
    expect(report.matchedByTitleSize).toBe(1);
    // Identical price both sides — the delta must say so, not round it away.
    const matched = report.matches[0]!;
    expect(matched.tiktokPriceGbp).toBe(matched.sitePriceGbp);
    expect(report.samePrice).toBe(1);
  });

  it('reports an unmatched TikTok-only listing instead of forcing a match', () => {
    const { listings } = mapTikTokCapture([
      row({ title: 'Some TikTok Exclusive Oud 100ml', ean: null }),
    ]);
    const report = crossCheckTikTokCapture(listings, catalogue.listings);
    expect(report.matches).toHaveLength(0);
    expect(report.unmatchedTikTok).toBe(1);
  });

  it('a non-GBP capture is incomparable, never converted for comparison', () => {
    const anchor = firstWriterByEan();
    const { listings } = mapTikTokCapture([
      row({
        ean: anchor.ean,
        title: anchor.rawTitle,
        price: { amount: '55.00', currency: 'USD' },
      }),
    ]);
    const report = crossCheckTikTokCapture(listings, catalogue.listings);
    expect(report.matchedByEan).toBe(1);
    expect(report.incomparable).toBe(1);
    expect(report.matches).toHaveLength(0);
  });
});
