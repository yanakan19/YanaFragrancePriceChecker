import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { getRetailer } from '../src/config/retailers.js';
import { resolveDelivery } from '../src/services/shipping.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The six UK shops added on 2026-10-09 (docs/RETAILER-CANDIDATES-2026-10-08.md, "Round 2, UK"), all
 * read from their own Shopify `/products.json` as PriceSniffsBot.
 *
 * Each fixture in tests/fixtures/new-shops-2026-10-09/ is a redacted cut of what that shop answered
 * on 2026-10-09: titles, handles, vendors, product types, options and variants (sku, size, price,
 * compare-at price, stock). No descriptions, images, tags or dates. They were picked to hold the cases
 * that matter for that shop: a bottle, a sold out bottle, a size variant, and the things its feed
 * carries that are not a bottle.
 */

const fixture = (id: string): string =>
  readFileSync(new URL(`./fixtures/new-shops-2026-10-09/${id}.json`, import.meta.url), 'utf8');

/** What the harvest reads from the fixture, and whether the catalogue then keeps it. */
function read(id: string) {
  const shop = getRetailer(id)!;
  const listings = parseShopifyProducts(fixture(id), {
    origin: shop.homepage,
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
    return {
      sku: l.retailerSku,
      title: l.rawTitle,
      price: l.priceGbp,
      was: l.wasPriceGbp,
      inStock: l.inStock,
      inCatalogue: isCatalogueListing(stored),
    };
  });
}

const IDS = ['rowlands-pharmacy', 'lloyds-pharmacy', 'beaute-boulevard', 'scent-warehouse', 'roullier-white', 'scented-glasgow'];

describe('every shop added on 2026-10-09', () => {
  it.each(IDS)('%s is on the Shopify route, in sterling, read as the bot, with delivery read from its own page that day', (id) => {
    const shop = getRetailer(id)!;
    expect(shop).toBeDefined();
    expect(shop.enabled).toBe(true);
    expect(shop.currency).toBe('GBP');
    expect(shop.shopifyStorefront).toBe(true);
    expect(shop.adapter).toBe('unknown');
    expect(shop.shipping.verifiedAt).toBe('2026-10-09');
    expect(shop.shipping.confidence).toBe('confirmed');
    expect(shop.shipping.source?.url.startsWith('https://')).toBe(true);
    expect(shop.shipping.source?.readAt).toBe('2026-10-09');
    expect(shop.catalogue?.sections.length).toBeGreaterThan(0);
    for (const section of shop.catalogue!.sections) {
      expect(section.urlTemplate.includes(shop.domain) || section.urlTemplate.includes(new URL(shop.homepage).host)).toBe(true);
    }
  });

  it.each(IDS)('%s shows no photos until the owner extends the photo decision (D24) to it', (id) => {
    expect(getRetailer(id)!.affiliate.imageBasis).toBeUndefined();
  });

  it('none of them takes an affiliate link before an application is approved', () => {
    for (const id of IDS) expect(getRetailer(id)!.affiliate.status).not.toBe('active');
  });
});

describe('Rowlands Pharmacy', () => {
  it('keeps only the shop\'s Fragrance type of a whole pharmacy', () => {
    expect(getRetailer('rowlands-pharmacy')!.shopifyVariantRule?.productTypes).toEqual(['Fragrance']);
    expect(read('rowlands-pharmacy')).toEqual([
      { sku: '6873848', title: 'Paco Rabanne 1 Million Eau de Toilette 50ml', price: 49.99, was: null, inStock: true, inCatalogue: true },
      { sku: '6873830', title: 'Montblanc Legend Eau de Toilette 50ml', price: 24.99, was: null, inStock: true, inCatalogue: true },
      { sku: '6876452', title: 'Marc Jacobs Dot Eau de Parfum 100ml', price: 28.99, was: null, inStock: false, inCatalogue: true },
    ]);
  });

  it('charges £3.50 for standard delivery, free from £30, from its shipping policy page', () => {
    const shop = getRetailer('rowlands-pharmacy')!;
    expect(shop.shipping.standardGbp).toBe(3.5);
    expect(shop.shipping.freeOverGbp).toBe(30);
    expect(shop.shipping.source?.quote).toMatch(/3-5 working days, charged at £3\.50/);
    expect(resolveDelivery(shop, 20).costGbp).toBe(3.5);
    expect(resolveDelivery(shop, 49.99).costGbp).toBe(0);
  });
});

describe('LloydsPharmacy', () => {
  it('keeps the Fragrance, Aftershave and Perfume types, and leaves the gift sets and shampoo of a pharmacy', () => {
    expect(getRetailer('lloyds-pharmacy')!.shopifyVariantRule?.productTypes).toEqual(['Fragrance', 'Aftershave', 'Perfume']);
    expect(read('lloyds-pharmacy')).toEqual([
      { sku: '0167715', title: 'Tom Ford Black Orchid EDP Spray 100ml', price: 155, was: null, inStock: true, inCatalogue: true },
      { sku: '0167502', title: 'Yves Saint Laurent Libre Eau de Parfum Spray 50ml', price: 76.43, was: 97, inStock: true, inCatalogue: true },
      { sku: '0167498', title: 'Burberry Goddess Eau de Parfum Spray 100ml', price: 150, was: null, inStock: false, inCatalogue: true },
    ]);
  });

  it('charges the Evri standard £2.99, free from £30, not the dearer Royal Mail standard beside it', () => {
    const shop = getRetailer('lloyds-pharmacy')!;
    expect(shop.shipping.standardGbp).toBe(2.99);
    expect(shop.shipping.freeOverGbp).toBe(30);
    expect(shop.shipping.source?.quote).toMatch(/EVRI UK Standard delivery £2\.99/);
    expect(resolveDelivery(shop, 76.43).costGbp).toBe(0);
    expect(resolveDelivery(shop, 12).costGbp).toBe(2.99);
  });
});

describe('Beauté Boulevard', () => {
  it('reads a size per variant with its was price, and the catalogue drops skincare', () => {
    expect(read('beaute-boulevard')).toEqual([
      { sku: 'R286214', title: 'Montale Black Aoud Eau de Parfum 100ml Spray Eau de Parfum 100ml Spray', price: 85.99, was: 110, inStock: true, inCatalogue: true },
      { sku: 'J547181', title: 'Montale Black Aoud Eau de Parfum 100ml Spray Eau de Parfum 50ml Spray', price: 61.99, was: 70, inStock: false, inCatalogue: true },
      { sku: 'P917221', title: 'Creed Viking Cologne Eau de Parfum 50ml', price: 105.99, was: 128.99, inStock: false, inCatalogue: true },
      { sku: 'F061851', title: 'Creed Viking Cologne Eau de Parfum 100ml', price: 215.99, was: 310, inStock: true, inCatalogue: true },
      { sku: 'T329268', title: 'Escada Santorini Sunrise Eau de Toilette 50ml Spray', price: 24.99, was: 50, inStock: false, inCatalogue: true },
      { sku: 'J366581', title: 'Escada Santorini Sunrise Eau de Toilette 30ml Spray', price: 30.99, was: 37.99, inStock: false, inCatalogue: true },
      { sku: 'F365751', title: 'Escada Santorini Sunrise Eau de Toilette 100ml Spray', price: 44.99, was: 57, inStock: true, inCatalogue: true },
      { sku: 'C681159', title: 'Tiziana Terenzi White Fire Eau de Parfum 100ml Spray', price: 138.99, was: 200, inStock: true, inCatalogue: true },
      { sku: 'D806887', title: 'Elemis Pro-Collagen Hydrating Night Cream 50ml', price: 94.99, was: 115, inStock: true, inCatalogue: false },
    ]);
  });

  it('delivers free on every UK order, with the sentence it was read from', () => {
    const shop = getRetailer('beaute-boulevard')!;
    expect(shop.shipping.standardGbp).toBe(0);
    expect(shop.shipping.freeOverGbp).toBe(0);
    expect(shop.shipping.source?.quote).toMatch(/no minimum spend/);
    expect(resolveDelivery(shop, 12).costGbp).toBe(0);
  });

  it('is a confirmed Awin merchant we have not applied to, with its programme id from Awin', () => {
    const a = getRetailer('beaute-boulevard')!.affiliate;
    expect(a.network).toBe('awin');
    expect(a.status).toBe('not-applied');
    expect(a.signupUrl).toBe('https://ui.awin.com/merchant-profile/126643');
    expect(a.deeplinkTemplate).toBeNull();
  });

  it('is answered at its hyphenated domain, the one the unhyphenated address redirects to', () => {
    const shop = getRetailer('beaute-boulevard')!;
    expect(shop.domain).toBe('beaute-boulevard.co.uk');
    expect(shop.homepage).toBe('https://beaute-boulevard.co.uk');
  });
});

describe('Scent Warehouse', () => {
  it('reads bottles of a shop with no product types, and keeps a gift set as one', () => {
    expect(read('scent-warehouse')).toEqual([
      { sku: '10010925', title: 'Calvin Klein Ck One Gold 100ml Eau de Toilette Spray for Unisex', price: 55, was: null, inStock: true, inCatalogue: true },
      { sku: '10014316', title: 'Burberry Weekend For Men 30ml Eau de Toilette Spray for Him', price: 17.16, was: 26, inStock: true, inCatalogue: true },
      { sku: '10057099', title: 'Disney Princess Aurora 100ml  Eau de Toilette Spray for Her', price: 12.56, was: null, inStock: true, inCatalogue: true },
      { sku: '10025942', title: 'Escentric Molecules Molecule 01 100ml Eau De Toilette Spray for Unisex', price: 95, was: null, inStock: false, inCatalogue: true },
      { sku: '10038264', title: 'Lamborghini Sportivo 125ml  Eau De Toilette Gift Set 100ml Shower Gel, 100ml Aftershave Balm for Him', price: 11.77, was: 65, inStock: true, inCatalogue: true },
    ]);
  });

  it('charges £2.99 for the Evri standard below £20 and nothing from £20, though its banner names £30 for the tracked service', () => {
    const shop = getRetailer('scent-warehouse')!;
    expect(shop.shipping.standardGbp).toBe(2.99);
    expect(shop.shipping.freeOverGbp).toBe(20);
    expect(shop.shipping.source?.quote).toMatch(/free for orders over £20\.00/);
    expect(resolveDelivery(shop, 12.56).costGbp).toBe(2.99);
    expect(resolveDelivery(shop, 55).costGbp).toBe(0);
  });
});

describe('Roullier White', () => {
  it('keeps the Perfume type, names the 50ml bottle, and leaves the 2ml sample, home fragrance and cookware', () => {
    expect(getRetailer('roullier-white')!.shopifyVariantRule).toEqual({
      productTypes: ['Perfume'],
      sizeOption: { name: 'Size', minMl: 5 },
    });
    expect(read('roullier-white')).toEqual([
      { sku: '10067120357703-50ml', title: 'Tocca - Bianca (EdP) 50ml', price: 85, was: null, inStock: true, inCatalogue: true },
      { sku: '11167713591623-50ml', title: 'Wolf Brothers - GOAT (EdP) 50ml', price: 120, was: null, inStock: true, inCatalogue: true },
    ]);
  });

  it('charges £6.75 for mainland delivery in 1 to 2 working days, free over £175', () => {
    const shop = getRetailer('roullier-white')!;
    expect(shop.shipping.standardGbp).toBe(6.75);
    expect(shop.shipping.freeOverGbp).toBe(175);
    expect(shop.shipping.estimatedDays).toEqual([1, 2]);
    expect(resolveDelivery(shop, 85).costGbp).toBe(6.75);
    expect(resolveDelivery(shop, 180).costGbp).toBe(0);
  });
});

describe('Scented', () => {
  it('reads each bottle size by its option, and leaves the refill, the discovery set of 2ml vials and the candles', () => {
    expect(read('scented-glasgow')).toEqual([
      { sku: '9888056279369-100ml', title: 'Orange X Santal 100ml', price: 86, was: null, inStock: true, inCatalogue: true },
      { sku: '9888056279369-10ml', title: 'Orange X Santal 10ml', price: 20, was: null, inStock: false, inCatalogue: true },
      { sku: '10362089013577-30ml', title: 'KOT 30ml', price: 115, was: null, inStock: false, inCatalogue: true },
    ]);
  });

  it('is fragrance only because its perfume titles are scent names with no strength word, and the type rule lets nothing else through', () => {
    const shop = getRetailer('scented-glasgow')!;
    expect(shop.fragranceOnlyCatalogue).toBe(true);
    expect(shop.shopifyVariantRule?.productTypes).toEqual(['Perfume']);
  });

  it('charges £5 under £50 and nothing from £50, Royal Mail 48 tracked in 2 to 4 days', () => {
    const shop = getRetailer('scented-glasgow')!;
    expect(shop.shipping.standardGbp).toBe(5);
    expect(shop.shipping.freeOverGbp).toBe(50);
    expect(shop.shipping.estimatedDays).toEqual([2, 4]);
    expect(shop.shipping.source?.quote).toMatch(/Orders under £50 incur a £5\.00 shipping fee/);
    expect(resolveDelivery(shop, 20).costGbp).toBe(5);
    expect(resolveDelivery(shop, 86).costGbp).toBe(0);
  });
});
