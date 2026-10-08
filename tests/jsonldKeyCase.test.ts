import { describe, expect, it } from 'vitest';
import { fixSchemaKeyCase, parseListings } from '../src/catalogue/jsonld.js';

/**
 * Direct Cosmetics writes its Product block with capitalised property names
 * ("Offers", "SKU", "Brand", "itemcondition"). JSON-LD property names are case
 * sensitive, so a reader looking for "offers" found no price on any of its pages.
 * The block below is that shop's own, cut down (read 2026-10-08).
 */
const PAGE = (block: string) =>
  `<html><head><script type="application/ld+json">${block}</script></head><body></body></html>`;

const DIRECT_COSMETICS = JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  name: "Azzaro Azzaro Pour Homme L'Eau Eau de Toilette Spray 100ml Azzaro",
  Brand: { '@type': 'Brand', name: 'Azzaro' },
  SKU: '79142',
  gtin13: '3351500996025',
  Offers: {
    '@type': 'Offer',
    priceCurrency: 'GBP',
    price: '23.99',
    itemcondition: 'http://schema.org/NewCondition',
    availability: 'https://schema.org/InStock',
    url: 'https://www.directcosmetics.com/azzaro-pour-homme-leau-eau-de-toilette-spray-100ml-azzaro-p8308',
  },
  url: 'https://www.directcosmetics.com/azzaro-pour-homme-leau-eau-de-toilette-spray-100ml-azzaro-p8308',
});

describe('JSON-LD with capitalised schema.org property names', () => {
  it('reads the price, the currency, the stock, the brand and the sku', () => {
    const [l] = parseListings(PAGE(DIRECT_COSMETICS), {
      sectionId: 'x',
      pageUrl: 'https://www.directcosmetics.com/azzaro-pour-homme-leau-eau-de-toilette-spray-100ml-azzaro-p8308',
      requireGbp: true,
    });
    expect(l).toBeDefined();
    expect(l!.rawTitle).toBe("Azzaro Azzaro Pour Homme L'Eau Eau de Toilette Spray 100ml Azzaro");
    expect(l!.priceGbp).toBe(23.99);
    expect(l!.inStock).toBe(true);
    expect(l!.rawBrand).toBe('Azzaro');
    expect(l!.retailerSku).toBe('79142');
  });

  it('still refuses a price the page does not label sterling', () => {
    const usd = DIRECT_COSMETICS.replace('"GBP"', '"USD"');
    const [l] = parseListings(PAGE(usd), { sectionId: 'x', pageUrl: 'https://shop.example/p', requireGbp: true });
    expect(l!.priceGbp).toBeNull();
  });

  it('renames only the listed keys, only when the right spelling is absent, at any depth', () => {
    expect(fixSchemaKeyCase({ Offers: { Price: 1 }, offers: 'kept', Other: 2 })).toEqual({
      Offers: { price: 1 },
      offers: 'kept',
      Other: 2,
    });
    expect(fixSchemaKeyCase([{ SKU: 'a' }, 3, null])).toEqual([{ sku: 'a' }, 3, null]);
  });

  it('leaves an ordinary block exactly as it was', () => {
    const ordinary = { '@type': 'Product', name: 'X', offers: { '@type': 'Offer', price: '5', priceCurrency: 'GBP' } };
    expect(fixSchemaKeyCase(ordinary)).toEqual(ordinary);
  });
});
