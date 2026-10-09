import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseListings } from '../src/catalogue/jsonld.js';
import { withTitleParts } from '../src/catalogue/sitemapCrawl.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { getRetailer } from '../src/config/retailers.js';
import { resolveDelivery } from '../src/services/shipping.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The four shops added on 2026-10-08 that are read through their sitemap and the
 * schema.org Product on each page (docs/RETAILER-CANDIDATES-2026-10-08.md):
 * PerfumeUK, Liberty London, Rasasi UK Store and Direct Cosmetics.
 *
 * The fixtures in tests/fixtures/new-shops-2026-10-08/ hold only the Product block of
 * one real page of each shop, read on 2026-10-08, without descriptions, images,
 * reviews or properties lists. The addresses below are real addresses from each
 * shop's sitemap that the pinned route must keep, and ones it must not.
 */

const page = (name: string): string =>
  readFileSync(new URL(`./fixtures/new-shops-2026-10-08/${name}-product.html`, import.meta.url), 'utf8');

function route(id: string) {
  const r = getRetailer(id)!.sitemapRoute!;
  return {
    wants: (url: string) =>
      new RegExp(r.product, 'i').test(url) && !(r.exclude && new RegExp(r.exclude, 'i').test(url)),
    follows: (url: string) => (r.follow ? new RegExp(r.follow, 'i').test(url) : true),
  };
}

function read(id: string, name: string, url: string) {
  const shop = getRetailer(id)!;
  const html = page(name);
  const listings = parseListings(html, { sectionId: 'sitemap', pageUrl: url, requireGbp: shop.sitemapRoute?.requireGbp === true });
  expect(listings).toHaveLength(1);
  const l = listings[0]!;
  const title = shop.sitemapRoute?.titleParts ? withTitleParts(l.rawTitle, html, shop.sitemapRoute.titleParts) : l.rawTitle;
  const stored: StoredListing = {
    ...l, rawTitle: title, retailerId: id,
    firstSeenAt: '2026-10-08T00:00:00.000Z', lastSeenAt: '2026-10-08T00:00:00.000Z',
    status: 'active', delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null,
  };
  return { title, price: l.priceGbp, inStock: l.inStock, brand: l.rawBrand, sku: l.retailerSku, inCatalogue: isCatalogueListing(stored) };
}

describe.each(['perfumeuk', 'liberty-london', 'rasasi-uk-store', 'direct-cosmetics'])('%s', (id) => {
  it('is enabled on a pinned sitemap route that keeps only a price labelled sterling, as the bot, with delivery checked that day', () => {
    const shop = getRetailer(id)!;
    expect(shop.enabled).toBe(true);
    expect(shop.currency).toBe('GBP');
    expect(shop.sitemapRoute?.requireGbp).toBe(true);
    expect(shop.shopifyStorefront).toBeUndefined();
    expect(shop.shipping.verifiedAt).toBe('2026-10-08');
    expect(shop.shipping.confidence).toBe('confirmed');
    expect(shop.shipping.source?.url.startsWith('https://')).toBe(true);
  });

  it('shows photos only on a recorded basis: unset, or the owner\'s D24 hot-link answer', () => {
    // D24 was answered on 9 Oct 2026 (after these shops were added), so photos now show.
    // The rule: imageBasis is unset (placeholder) or the one value the owner allowed for a
    // shop read only through its sitemap (no affiliate terms, not a brand storefront).
    const basis = getRetailer(id)!.affiliate.imageBasis;
    expect([undefined, 'hotlink-unlicensed']).toContain(basis);
  });
});

describe('PerfumeUK', () => {
  const { wants } = route('perfumeuk');
  it('keeps perfume addresses that end in a size, gift sets included, and drops pages, brands and body products', () => {
    for (const u of [
      'https://www.perfumeuk.co.uk/dolce-gabbana-k-edt-50ml',
      'https://www.perfumeuk.co.uk/giorgio-armani-si-edp-50ml-gift-set',
      'https://www.perfumeuk.co.uk/abercrombie-fitch-authentic-for-men-edt-100ml',
    ]) expect(wants(u), u).toBe(true);
    for (const u of [
      'https://www.perfumeuk.co.uk/contact',
      'https://www.perfumeuk.co.uk/dolce-gabbana',
      'https://www.perfumeuk.co.uk/blog/new-prada-female-fragrance-prada-virtual-flower-eau-de-parfum',
      'https://www.perfumeuk.co.uk/carolina-herrera-good-girl-hair-mist-30ml',
      'https://www.perfumeuk.co.uk/carolina-herrera-la-bomba-body-cream-200ml',
      'https://www.perfumeuk.co.uk/guy-laroche-drakkar-noir-deodorant-spray-150ml',
      'https://www.perfumeuk.co.uk/dkny-for-women-energizing-fragrance-mist-250ml',
    ]) expect(wants(u), u).toBe(false);
  });

  it('reads the page: name with strength and size, sterling price, stock, brand, sku', () => {
    expect(read('perfumeuk', 'perfumeuk', 'https://www.perfumeuk.co.uk/dolce-gabbana-k-edt-50ml')).toEqual({
      title: 'Dolce & Gabbana K EDT 50ml', price: 42, inStock: true, brand: 'Dolce & Gabbana', sku: 'SKU352', inCatalogue: true,
    });
  });

  it('delivers free in 2 to 4 working days, with the sentence it was read from', () => {
    const shop = getRetailer('perfumeuk')!;
    expect(shop.shipping.standardGbp).toBe(0);
    expect(shop.shipping.source?.quote).toMatch(/no postage and packing charges/);
    expect(resolveDelivery(shop, 20).costGbp).toBe(0);
  });
});

describe('Liberty London', () => {
  const { wants, follows } = route('liberty-london');
  it('opens the product sitemap and not the image ones', () => {
    expect(follows('https://www.libertylondon.com/sitemap_0-product.xml')).toBe(true);
    expect(follows('https://www.libertylondon.com/sitemap_1-image.xml')).toBe(false);
    expect(follows('https://www.libertylondon.com/sitemap_6-category.xml')).toBe(false);
  });

  it('keeps UK perfume pages and drops the US copy, candles, bath, hair and samples', () => {
    for (const u of [
      'https://www.libertylondon.com/uk/odeur-53-eau-de-toilette-200ml-72631.html',
      'https://www.libertylondon.com/uk/tears-from-the-moon-eau-de-parfum-100ml-000808345.html',
    ]) expect(wants(u), u).toBe(true);
    for (const u of [
      'https://www.libertylondon.com/us/odeur-53-eau-de-toilette-200ml-72631.html',
      'https://www.libertylondon.com/uk/sapin-limited-edition-scented-candle-1500g-000826429.html',
      'https://www.libertylondon.com/uk/do-son-eau-de-parfum-discovery-set-000800001.html',
      'https://www.libertylondon.com/uk/miracle-balm-palette-i-2g-000821250.html',
    ]) expect(wants(u), u).toBe(false);
  });

  it('reads the page in pounds', () => {
    expect(read('liberty-london', 'liberty-london', 'https://www.libertylondon.com/uk/odeur-53-eau-de-toilette-200ml-1000224234.html')).toEqual({
      title: 'Odeur 53 Eau de Toilette 200ml', price: 135, inStock: true, brand: 'Comme Des Garçons', sku: '5063267593796', inCatalogue: true,
    });
  });

  it('charges £5.95 under £100 and nothing from £100, from the product page panel', () => {
    const shop = getRetailer('liberty-london')!;
    expect(resolveDelivery(shop, 60).costGbp).toBe(5.95);
    expect(resolveDelivery(shop, 135).costGbp).toBe(0);
  });

  it('is a Partnerize programme by the shop\'s own page, not applied to', () => {
    const a = getRetailer('liberty-london')!.affiliate;
    expect(a.network).toBe('partnerize');
    expect(a.status).toBe('not-applied');
    expect(a.deeplinkTemplate).toBeNull();
  });
});

describe('Rasasi UK Store', () => {
  const { wants } = route('rasasi-uk-store');
  it('keeps the product pages and nothing else', () => {
    expect(wants('https://www.rasasistore.co.uk/product/hawas-ice')).toBe(true);
    expect(wants('https://www.rasasistore.co.uk/product/hawas-fire-gift-set')).toBe(true);
    for (const u of [
      'https://www.rasasistore.co.uk/collections/hawas',
      'https://www.rasasistore.co.uk/journal/oud-explained',
      'https://www.rasasistore.co.uk/shipping-returns',
    ]) expect(wants(u), u).toBe(false);
  });

  it('takes the strength and size from the page title, because the structured data names the scent alone', () => {
    expect(read('rasasi-uk-store', 'rasasi-uk-store', 'https://www.rasasistore.co.uk/product/hawas-ice')).toEqual({
      title: 'Hawas Ice Eau De Parfum 100ml', price: 29.99, inStock: true, brand: 'Rasasi', sku: 'hawas-ice', inCatalogue: true,
    });
  });

  it('does not lend a size from anywhere but the title', () => {
    const html = '<html><head><title>Rasasi Ward Noir | Rasasi UK</title></head><body>Hawas Ice 100ml EDP</body></html>';
    expect(withTitleParts('Ward Noir', html, getRetailer('rasasi-uk-store')!.sitemapRoute!.titleParts!)).toBe('Ward Noir');
  });

  it('is a single brand storefront that sells only fragrance, and delivers free', () => {
    const shop = getRetailer('rasasi-uk-store')!;
    expect(shop.singleBrandOnly).toBe('Rasasi');
    expect(shop.fragranceOnlyCatalogue).toBe(true);
    expect(shop.shipping.standardGbp).toBe(0);
  });
});

describe('Direct Cosmetics', () => {
  const { wants, follows } = route('direct-cosmetics');
  it('opens the six fragrance product sitemaps and no other department', () => {
    for (let i = 1; i <= 6; i++) expect(follows(`https://www.directcosmetics.com/sitemap-products_fragrances-c35-${i}.xml`)).toBe(true);
    expect(follows('https://www.directcosmetics.com/sitemap-products_make-up-c42-1.xml')).toBe(false);
    expect(follows('https://www.directcosmetics.com/sitemap-categories.xml')).toBe(false);
  });

  it('keeps product addresses (ending -p<id>) and nothing else', () => {
    expect(wants('https://www.directcosmetics.com/azzaro-pour-homme-leau-eau-de-toilette-spray-100ml-azzaro-p8308')).toBe(true);
    expect(wants('https://www.directcosmetics.com/fragrances-c35/for-men-c38/eau-de-toilette-c45/azzaro-m75')).toBe(false);
  });

  it('reads the Product block the shop spells with capital letters', () => {
    expect(read('direct-cosmetics', 'direct-cosmetics', 'https://www.directcosmetics.com/azzaro-pour-homme-leau-eau-de-toilette-spray-100ml-azzaro-p8308')).toEqual({
      title: "Azzaro Azzaro Pour Homme L'Eau Eau de Toilette Spray 100ml Azzaro", price: 23.99, inStock: true, brand: 'Azzaro', sku: '79142', inCatalogue: true,
    });
  });

  it('prices every basket at £2.95, because the free delivery needs a code and excludes sale items', () => {
    const shop = getRetailer('direct-cosmetics')!;
    expect(shop.shipping.standardGbp).toBe(2.95);
    expect(shop.shipping.freeOverGbp).toBeNull();
    expect(resolveDelivery(shop, 80).costGbp).toBe(2.95);
    expect(shop.shipping.notes).toMatch(/FREESHIP35/);
  });
});
