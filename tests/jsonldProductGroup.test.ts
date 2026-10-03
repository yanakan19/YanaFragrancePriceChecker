import { describe, expect, it } from 'vitest';
import { parseListings } from '../src/catalogue/jsonld.js';

/**
 * THG product pages (Cult Beauty, LOOKFANTASTIC) describe each size as a
 * variant inside a ProductGroup, and name every variant with the page's own
 * size. Shape taken from cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml
 * on 2026-10-03 (30ml £71, 50ml £98, 100ml £135, all named "50ml").
 */
function page(groupId: string): string {
  const variant = (sku: string, price: number) => ({
    '@type': 'Product',
    sku,
    name: 'Chloé Eau de Parfum For Her 50ml',
    offers: { '@type': 'Offer', sku, availability: 'https://schema.org/InStock', price, priceCurrency: 'GBP',
      url: `https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml/11079307/?variation=${sku}` },
  });
  const group = {
    '@type': 'ProductGroup',
    '@context': 'https://schema.org',
    productGroupID: groupId,
    name: 'Chloé Eau de Parfum For Her 50ml',
    hasVariant: [variant('11079176', 71), variant('11079307', 98), variant('13996128', 135)],
  };
  return `<html><head><script type="application/ld+json">${JSON.stringify(group)}</script></head></html>`;
}

describe('parseListings: ProductGroup pages', () => {
  it("reads only the page's own variant, so one size never gets three prices", () => {
    const got = parseListings(page('11079307'), { sectionId: 'sitemap', pageUrl: 'https://www.cultbeauty.co.uk/p/x/11079307/' });
    expect(got).toHaveLength(1);
    expect(got[0]!.priceGbp).toBe(98);
  });

  it('reads nothing when no variant is the group itself', () => {
    expect(parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: 'https://x/' })).toHaveLength(0);
  });
});
