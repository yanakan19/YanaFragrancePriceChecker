import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { getRetailer, RETAILERS } from '../src/config/retailers.js';
import { resolveDelivery } from '../src/services/shipping.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The six shops added on 2026-10-08 (docs/RETAILER-CANDIDATES-2026-10-08.md), all read
 * from their own Shopify `/products.json` as PriceSniffsBot.
 *
 * Each fixture in tests/fixtures/new-shops-2026-10-08/ is a redacted cut of what that shop
 * answered on 2026-10-08: titles, handles, vendors, product types, options and variants
 * (sku, size, price, compare-at price, stock). No descriptions, images, tags or dates.
 * They were picked to hold the cases that matter for that shop: a bottle, a sold out
 * bottle, a size variant, and the things its feed carries that are not a bottle.
 */

const fixture = (id: string): string =>
  readFileSync(new URL(`./fixtures/new-shops-2026-10-08/${id}.json`, import.meta.url), 'utf8');

/** What the harvest reads from the fixture, and whether the catalogue then keeps it. */
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
      firstSeenAt: '2026-10-08T00:00:00.000Z',
      lastSeenAt: '2026-10-08T00:00:00.000Z',
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

describe('every shop added on 2026-10-08', () => {
  const IDS = ['opulensi', 'perfume-closet', 'perfumoi', 'saad-fragrance', 'sainte-cellier', 'fenwick'];

  it.each(IDS)('%s is on the Shopify route, in sterling, read as the bot, with delivery checked that day', (id) => {
    const shop = getRetailer(id)!;
    expect(shop).toBeDefined();
    expect(shop.enabled).toBe(true);
    expect(shop.currency).toBe('GBP');
    expect(shop.shopifyStorefront).toBe(true);
    expect(shop.adapter).toBe('unknown');
    expect(shop.shipping.verifiedAt).toBe('2026-10-08');
    expect(shop.catalogue?.sections.length).toBeGreaterThan(0);
    for (const section of shop.catalogue!.sections) {
      expect(section.urlTemplate.startsWith(`https://${shop.homepage.replace(/^https:\/\//, '')}`) || section.urlTemplate.includes(shop.domain)).toBe(true);
    }
  });

  it.each(IDS)('%s shows no photos until the owner extends the photo decision (D24) to it', (id) => {
    expect(getRetailer(id)!.affiliate.imageBasis).toBeUndefined();
  });

  it('none of them takes an affiliate link before an application is approved', () => {
    for (const id of IDS) expect(['active']).not.toContain(getRetailer(id)!.affiliate.status);
  });

  it('keeps every id and domain unique in the registry', () => {
    expect(new Set(RETAILERS.map((r) => r.id)).size).toBe(RETAILERS.length);
    expect(new Set(RETAILERS.map((r) => r.domain)).size).toBe(RETAILERS.length);
  });
});

describe('Opulensi', () => {
  it('reads the bottle, its was price and its stock, and the catalogue drops what is not a bottle', () => {
    expect(read('opulensi')).toEqual([
      { sku: '10440662778175-Default Title', title: 'Lattafa Khamrah Waha Unisex Eau De Parfum 100ml', price: 34.99, was: 39.99, inStock: true, inCatalogue: true },
      { sku: '10440631648575-Default Title', title: 'Reef Arabs of Obaiah Eau de Parfum 100ml', price: 44.99, was: 48.99, inStock: false, inCatalogue: true },
      { sku: 'OP-RUTBAHOIL-ADYAN', title: 'Adyan Rutbah 12ml Concentrated Perfume Oil (Khamrah)', price: 14.99, was: null, inStock: true, inCatalogue: true },
      { sku: '10244145676607-Default Title', title: 'Lattafa Oud Mood Deodorant Perfumed Spray 6.7 oz', price: 8.99, was: null, inStock: true, inCatalogue: false },
      { sku: 'OP-ASAD5th-Annivasary', title: 'Asad & Asad Zanzibar Eau De Parfum Sprays 100ML 5th Anniversary Edition Gift Set', price: 39.99, was: null, inStock: false, inCatalogue: true },
      { sku: 'op-Abiyedh-white', title: 'Ana Abiyedh (I am White) Air Freshener 300ml by Lattafa 1', price: 4.99, was: null, inStock: false, inCatalogue: false },
      { sku: 'op-Abiyedh-white-2', title: 'Ana Abiyedh (I am White) Air Freshener 300ml by Lattafa 2', price: 6.99, was: 8, inStock: false, inCatalogue: false },
      { sku: 'op-Abiyedh-white-3', title: 'Ana Abiyedh (I am White) Air Freshener 300ml by Lattafa 3', price: 8.5, was: 12, inStock: false, inCatalogue: false },
      { sku: 'OP-LIBERTY-BACKPACK-GREY', title: 'Riseicon Liberty 1 Travel laptop backpack Anti-theft USB charging waterproof - Grey', price: 32.99, was: 35.99, inStock: true, inCatalogue: false },
      { sku: 'OP-MUGH-FORT-LT', title: 'Mughal Fort 100ml EDP by Niche Emarati Perfumes Unisex 100ml', price: 52.99, was: 79.99, inStock: false, inCatalogue: true },
      { sku: 'OP-MUGH-FORT-LT-20ml', title: 'Mughal Fort 100ml EDP by Niche Emarati Perfumes Unisex 20ml with Atomizer', price: 12.99, was: 19.99, inStock: false, inCatalogue: true },
      { sku: 'OP-Kayaan', title: 'Kayaan Gold Black EDP Perfume By Al Wataniah Elite 100 ml Fragrance 100ml', price: 29.09, was: 45, inStock: false, inCatalogue: true },
      { sku: 'OP-Kayaan-Sample', title: 'Kayaan Gold Black EDP Perfume By Al Wataniah Elite 100 ml Fragrance 3ml Sample', price: 2.99, was: null, inStock: false, inCatalogue: false },
    ]);
  });

  it('states a free threshold and no flat rate, so the delivery cost stays unknown and the shop can never rank cheapest on it', () => {
    const shop = getRetailer('opulensi')!;
    expect(shop.shipping.standardGbp).toBeNull();
    expect(shop.shipping.freeOverGbp).toBe(30);
    expect(shop.shipping.standardRateNotPublished).toBe(true);
    expect(shop.shipping.source?.quote).toMatch(/over £30/);
    expect(resolveDelivery(shop, 20).costGbp).toBeNull();
    expect(resolveDelivery(shop, 45).costGbp).toBe(0);
  });

  it('is a confirmed Awin merchant we have not applied to, with its programme id from Awin', () => {
    const a = getRetailer('opulensi')!.affiliate;
    expect(a.network).toBe('awin');
    expect(a.status).toBe('not-applied');
    expect(a.signupUrl).toBe('https://ui.awin.com/merchant-profile/123248');
    expect(a.deeplinkTemplate).toBeNull();
  });
});

describe('The Perfume Closet', () => {
  it('reads a size per variant and keeps the shop as vendor, and drops an air freshener', () => {
    expect(read('perfume-closet')).toEqual([
      { sku: '15742564139348-Default Title', title: 'Reef 27 Perfume 100ml edp', price: 65, was: 79.99, inStock: true, inCatalogue: true },
      { sku: '12031043862868-100 ml', title: 'VALENTINO UOMO CORAL FANTASY EDT For Him 100 ml', price: 76, was: null, inStock: false, inCatalogue: true },
      { sku: '12031043862868-50 ml', title: 'VALENTINO UOMO CORAL FANTASY EDT For Him 50 ml', price: 56, was: null, inStock: false, inCatalogue: true },
      { sku: '12031032492372-40 ml', title: 'ACQUA DI GIÒ ABSOLU EDP For Him 40 ml', price: 60, was: null, inStock: false, inCatalogue: true },
      { sku: '12031032492372-75 ml', title: 'ACQUA DI GIÒ ABSOLU EDP For Him 75 ml', price: 82, was: null, inStock: false, inCatalogue: true },
      { sku: '11958285271380-Default Title', title: 'LATTAFA OUD MOOD AIR FRESHENER 300ML', price: 4.99, was: null, inStock: true, inCatalogue: false },
      { sku: '11958285009236-Default Title', title: 'YVES SAINT LAURENT MON PARIS 50ml EDP GIFT SET', price: 39.99, was: 78, inStock: false, inCatalogue: true },
      { sku: '15641676448084-Default Title', title: 'Moroccan Dust 12ml parfum oil', price: 24.99, was: 38, inStock: true, inCatalogue: true },
    ]);
  });

  it('prints no delivery price, so none is invented', () => {
    const s = getRetailer('perfume-closet')!.shipping;
    expect(s.standardGbp).toBeNull();
    expect(s.freeOverGbp).toBeNull();
    expect(s.standardRateNotPublished).toBe(true);
    expect(s.source?.url).toBe('https://theperfumecloset.co.uk/pages/delivery-and-returns');
  });
});

describe('Perfumoi', () => {
  it('reads the strength-typed products and drops the lotions and body sprays', () => {
    expect(read('perfumoi')).toEqual([
      { sku: 'PPEP0527S', title: 'Paco Rabanne Pure XS For Her Eau De Parfum Spray 50ml', price: 36.99, was: null, inStock: true, inCatalogue: true },
      { sku: 'PLEL0501S', title: 'Lanvin A Girl In Capri Eau de Toilette 90ml', price: 22.99, was: null, inStock: false, inCatalogue: true },
      { sku: 'PDED0384S', title: 'Davidoff Cool Water for Men All Over Body Spray 150ml', price: 14.99, was: null, inStock: true, inCatalogue: false },
      { sku: 'PCBC0745S', title: 'Carolina Herrera Good Girl Body Lotion 200ml', price: 27.99, was: null, inStock: false, inCatalogue: false },
      { sku: 'PPEP0651S', title: 'Paco Rabanne Invictus Aftershave 100ml', price: 39.99, was: null, inStock: false, inCatalogue: true },
      { sku: 'PV5EV0758S', title: 'Versace Crystal Noir Eau De Toilette Spray 50ml', price: 44.99, was: null, inStock: false, inCatalogue: true },
      { sku: 'PV3EV0759S', title: 'Versace Crystal Noir Eau De Toilette Spray 30ml', price: 36.99, was: null, inStock: false, inCatalogue: true },
      { sku: 'PMET0519S', title: 'Mugler Alien Refillable Eau de Parfum 60ml', price: 69, was: null, inStock: false, inCatalogue: true },
      { sku: 'PMET051930', title: 'Mugler Alien Refillable Eau de Parfum 30ml', price: 44.99, was: null, inStock: false, inCatalogue: true },
    ]);
  });

  it('delivers free on every UK order, with the sentence it was read from', () => {
    const shop = getRetailer('perfumoi')!;
    expect(shop.shipping.standardGbp).toBe(0);
    expect(shop.shipping.source?.quote).toMatch(/free next-day shipping on all UK orders/);
    expect(resolveDelivery(shop, 12).costGbp).toBe(0);
  });
});

describe('Saad Fragrance', () => {
  it('keeps a bottle that names its strength and size, and drops a title with neither, a combo and a lotion', () => {
    expect(read('saad-fragrance')).toEqual([
      { sku: '15427499852099-Default Title', title: 'Riiffs momento 100ml Extrait de Parfum', price: 26.99, was: 34.99, inStock: true, inCatalogue: true },
      { sku: '14928873128259-Default Title', title: 'Eclair lattafa perfumes for women 100ml', price: 29.99, was: 39.99, inStock: false, inCatalogue: false },
      { sku: '15417793380675-Default Title', title: 'Azhrance passion and enhance combo', price: 69.99, was: 73.98, inStock: true, inCatalogue: false },
      { sku: '14948564042051-Default Title', title: 'Maryam body lotion', price: 12.99, was: 19.99, inStock: false, inCatalogue: false },
      { sku: '9161661579587-75ML', title: 'Rose Noir 75ml Eau De Parfum by Ahmed Al Maghribi for women 75ML', price: 35.99, was: 44.99, inStock: false, inCatalogue: true },
    ]);
  });

  it('delivers free on every order', () => {
    const shop = getRetailer('saad-fragrance')!;
    expect(shop.shipping.standardGbp).toBe(0);
    expect(shop.shipping.freeOverGbp).toBe(0);
    expect(shop.fragranceOnlyCatalogue).toBeUndefined();
  });
});

describe('Sainte Cellier', () => {
  it('keeps perfume by product type, reads the full size and drops the 2ml sample, the discovery set, the sample set, incense, the voucher and the event', () => {
    expect(read('sainte-cellier')).toEqual([
      { sku: 'SCODE22', title: 'LE CARROUSEL 30ml | 1oz', price: 80, was: null, inStock: true, inCatalogue: true },
      { sku: 'SCIND15', title: 'CUIR DE CHINE Full Size 50ml | 1.7oz', price: 195, was: null, inStock: false, inCatalogue: true },
      { sku: 'SCSTO9', title: 'PINE Full Size 30ml | 1oz', price: 130, was: null, inStock: true, inCatalogue: true },
      { sku: '15009515503991-30ml | 1oz', title: 'EDGE EFFECTS 30ml | 1oz', price: 190, was: null, inStock: false, inCatalogue: true },
    ]);
  });

  it('is fragrance only, because its titles are scent names with no strength word', () => {
    expect(getRetailer('sainte-cellier')!.fragranceOnlyCatalogue).toBe(true);
  });

  it('has read no delivery price and says so', () => {
    const s = getRetailer('sainte-cellier')!.shipping;
    expect(s.standardGbp).toBeNull();
    expect(s.confidence).toBe('unverified');
    expect(s.source).toBeUndefined();
  });
});

describe('Fenwick', () => {
  it('keeps the shop\'s perfume types only, names each size, and the catalogue drops refills and hair perfume', () => {
    expect(read('fenwick')).toEqual([
      { sku: 'F-01775547', title: 'Ombré Leather Reserve Eau De Parfum 100ml', price: 189, was: null, inStock: true, inCatalogue: true },
      { sku: 'F-01775546', title: 'Ombré Leather Reserve Eau De Parfum 50ml', price: 135, was: null, inStock: true, inCatalogue: true },
      { sku: 'F-01775545', title: 'Ombré Leather Reserve Eau De Parfum 10ml', price: 46, was: null, inStock: false, inCatalogue: true },
      { sku: 'F-01579610', title: 'Michael Kors Pour Femme Absolu Eau De Parfum 100ml 100ml', price: 91.8, was: 108, inStock: true, inCatalogue: true },
      { sku: 'F-01771043', title: 'Hibiscus Mahajad Extrait De Parfum 100ml', price: 360, was: null, inStock: true, inCatalogue: true },
      { sku: 'F-01771041', title: 'Hibiscus Mahajad Extrait De Parfum 50ml', price: 205, was: null, inStock: true, inCatalogue: true },
      { sku: 'F-01267741', title: 'HUILE DOUCE Les Exclusifs de CHANEL Gentle Oil Hair and Body 250ml 250ml', price: 175, was: null, inStock: true, inCatalogue: false },
      { sku: 'F-01569532', title: 'Paradigme Eau de Parfum Refill 150ml 150ml', price: 112, was: 140, inStock: false, inCatalogue: false },
    ]);
  });

  it('asks for its four perfume product types and nothing else, so 25,000 products do not become 25,000 rows', () => {
    expect(getRetailer('fenwick')!.shopifyVariantRule?.productTypes).toEqual([
      "Women's Fragrances", 'Unisex Fragrance', "Men's Fragrances", 'Fragrance',
    ]);
  });

  it('charges £5 for standard delivery, free over £100, from the product page panel', () => {
    const shop = getRetailer('fenwick')!;
    expect(shop.shipping.standardGbp).toBe(5);
    expect(shop.shipping.freeOverGbp).toBe(100);
    expect(shop.shipping.source?.quote).toMatch(/Standard Delivery £5, or FREE on orders over £100/);
    expect(resolveDelivery(shop, 50).costGbp).toBe(5);
    expect(resolveDelivery(shop, 189).costGbp).toBe(0);
  });
});
