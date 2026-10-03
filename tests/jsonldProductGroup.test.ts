import { describe, expect, it } from 'vitest';
import { parseListings } from '../src/catalogue/jsonld.js';

const ld = (node: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head></html>`;

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
  return ld(group);
}

const CULT_BEAUTY_PAGE = 'https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml/11079307/';

describe('parseListings: ProductGroup pages (Cult Beauty)', () => {
  it("reads only the page's own variant, so one size never gets three prices", () => {
    const got = parseListings(page('11079307'), { sectionId: 'sitemap', pageUrl: CULT_BEAUTY_PAGE });
    expect(got).toHaveLength(1);
    expect(got[0]!.priceGbp).toBe(98);
  });

  it('reads nothing when no variant is the group itself', () => {
    expect(parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: 'https://x/' })).toHaveLength(0);
    // Nor on its real address: its variants carry no url of their own, and all
    // three share one name, so neither fallback applies.
    expect(parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: CULT_BEAUTY_PAGE })).toHaveLength(0);
  });
});

/**
 * Space NK, read 2026-10-03 from
 * https://www.spacenk.com/uk/young-rose-eau-de-parfum-UK200033403.html and
 * the group's own page. The group id is MUK200031967, which no variant's sku
 * is; brand sits on the group only; each variant has a url of its own, and the
 * 50ml's is the page above.
 */
const SPACE_NK_VARIANT_PAGE = 'https://www.spacenk.com/uk/young-rose-eau-de-parfum-UK200033403.html';
const SPACE_NK_GROUP_PAGE =
  'https://www.spacenk.com/uk/fragrance/personal-fragrance/fragrance/young-rose-eau-de-parfum-MUK200031967.html';

function spaceNk(): string {
  const variant = (sku: string, size: string, price: string, url: string) => ({
    '@type': 'Product',
    name: `Byredo Young Rose Eau de Parfum ${size}`,
    sku,
    url,
    image: `https://www.spacenk.com/img/${sku}.jpg`,
    offers: { '@type': 'Offer', url, priceCurrency: 'GBP', price, availability: 'http://schema.org/InStock' },
  });
  return ld({
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    productGroupID: 'MUK200031967',
    name: 'Young Rose Eau de Parfum',
    url: SPACE_NK_GROUP_PAGE,
    brand: { '@type': 'Brand', name: 'Byredo' },
    image: 'https://www.spacenk.com/img/MUK200031967.jpg',
    hasVariant: [
      variant('UK200031967', '100ml', '225.00',
        'https://www.spacenk.com/uk/fragrance/personal-fragrance/fragrance/young-rose-eau-de-parfum-UK200031967.html'),
      variant('UK200033403', '50ml', '155.00', SPACE_NK_VARIANT_PAGE),
    ],
  });
}

describe('parseListings: ProductGroup pages (Space NK)', () => {
  it('reads the one variant published at the page address, with the group brand', () => {
    const got = parseListings(spaceNk(), { sectionId: 'sitemap', pageUrl: SPACE_NK_VARIANT_PAGE, requireGbp: true });
    expect(got.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand, l.url])).toEqual([
      ['UK200033403', 'Byredo Young Rose Eau de Parfum 50ml', 155, 'Byredo', SPACE_NK_VARIANT_PAGE],
    ]);
    expect(got[0]!.inStock).toBe(true);
  });

  it('matches the address whether the page was asked for with a trailing slash or not', () => {
    const got = parseListings(spaceNk(), { sectionId: 'sitemap', pageUrl: `${SPACE_NK_VARIANT_PAGE}/` });
    expect(got.map((l) => l.retailerSku)).toEqual(['UK200033403']);
  });

  it("reads every size on the group's own page, where no variant is the page", () => {
    const got = parseListings(spaceNk(), { sectionId: 'sitemap', pageUrl: SPACE_NK_GROUP_PAGE, requireGbp: true });
    expect(got.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand])).toEqual([
      ['UK200031967', 'Byredo Young Rose Eau de Parfum 100ml', 225, 'Byredo'],
      ['UK200033403', 'Byredo Young Rose Eau de Parfum 50ml', 155, 'Byredo'],
    ]);
  });
});

/**
 * Parfumdreams UK, read 2026-10-03 from
 * https://www.parfumdreams.co.uk/Gucci/Womens-fragrances/Gucci-Bloom/Eau-de-Parfum-Spray/index_122330.aspx.
 * The group id is 122330, which no variant's sku is; each variant names its
 * own size and its url is the page plus "#variation=...".
 */
const PARFUMDREAMS_PAGE =
  'https://www.parfumdreams.co.uk/Gucci/Womens-fragrances/Gucci-Bloom/Eau-de-Parfum-Spray/index_122330.aspx';

function parfumdreams(names: (size: string) => string = (s) => `Gucci Gucci Bloom Eau de Parfum Spray Intense ${s}`): string {
  const variant = (sku: string, variation: string, size: string, price: number) => ({
    '@type': 'Product',
    sku,
    name: names(size),
    url: `${PARFUMDREAMS_PAGE}#variation=${variation}`,
    image: `https://cdn.parfumdreams.de/${sku}.jpg`,
    offers: { '@type': 'Offer', url: `${PARFUMDREAMS_PAGE}#variation=${variation}`, price, priceCurrency: 'GBP',
      availability: 'https://schema.org/InStock' },
  });
  return ld({
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    productGroupID: '122330',
    name: 'Gucci Gucci Bloom Eau de Parfum Spray Intense',
    url: PARFUMDREAMS_PAGE,
    brand: { '@type': 'Brand', name: 'Gucci' },
    hasVariant: [
      variant('1087866', '194519', '30 ml', 54.95),
      variant('1087867', '194518', '50 ml', 73.65),
      variant('1087868', '194517', '100 ml', 115.5),
    ],
  });
}

describe('parseListings: ProductGroup pages (Parfumdreams)', () => {
  it('reads every size when each variant names its own, none being the page itself', () => {
    const got = parseListings(parfumdreams(), { sectionId: 'sitemap', pageUrl: PARFUMDREAMS_PAGE, requireGbp: true });
    expect(got.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand])).toEqual([
      ['1087866', 'Gucci Gucci Bloom Eau de Parfum Spray Intense 30 ml', 54.95, 'Gucci'],
      ['1087867', 'Gucci Gucci Bloom Eau de Parfum Spray Intense 50 ml', 73.65, 'Gucci'],
      ['1087868', 'Gucci Gucci Bloom Eau de Parfum Spray Intense 100 ml', 115.5, 'Gucci'],
    ]);
    expect(got[1]!.url).toBe(`${PARFUMDREAMS_PAGE}#variation=194518`);
  });

  it('tells the sizes apart by their "#variation=" fragment', () => {
    // Asked for with one variation's fragment, that one variant is the page.
    const at = `${PARFUMDREAMS_PAGE}#variation=194518`;
    expect(parseListings(parfumdreams(), { sectionId: 'sitemap', pageUrl: at }).map((l) => l.retailerSku)).toEqual([
      '1087867',
    ]);
  });

  it("reads a single-size product's one variant", () => {
    // Charlotte Meentzen Silk & Pure, index_126791.aspx, read 2026-10-03.
    const at = 'https://www.parfumdreams.co.uk/Charlotte-Meentzen/Womens-fragrances/Silk-Pure/Eau-de-Toilette-Spray/index_126791.aspx';
    const html = ld({
      '@type': 'ProductGroup',
      productGroupID: '126791',
      name: 'Charlotte Meentzen Silk & Pure Eau de Toilette Spray',
      url: at,
      brand: { '@type': 'Brand', name: 'Charlotte Meentzen' },
      hasVariant: [{
        '@type': 'Product', sku: '1158814', name: 'Charlotte Meentzen Silk & Pure Eau de Toilette Spray 50 ml',
        url: `${at}#variation=202250`,
        offers: { '@type': 'Offer', price: 27.2, priceCurrency: 'GBP', availability: 'https://schema.org/InStock' },
      }],
    });
    const got = parseListings(html, { sectionId: 'sitemap', pageUrl: at, requireGbp: true });
    expect(got.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand])).toEqual([
      ['1158814', 'Charlotte Meentzen Silk & Pure Eau de Toilette Spray 50 ml', 27.2, 'Charlotte Meentzen'],
    ]);
  });

  it('reads nothing when the variants share one name, the Cult Beauty hazard', () => {
    const got = parseListings(parfumdreams(() => 'Gucci Gucci Bloom Eau de Parfum Spray Intense'), {
      sectionId: 'sitemap',
      pageUrl: PARFUMDREAMS_PAGE,
    });
    expect(got).toEqual([]);
  });

  it('singles out no variant when two claim the page address', () => {
    const html = parfumdreams().replaceAll('#variation=194519', '').replaceAll('#variation=194518', '');
    // Both now sit at the page address, so neither is singled out; their names
    // still differ, so every size is read instead.
    const got = parseListings(html, { sectionId: 'sitemap', pageUrl: PARFUMDREAMS_PAGE });
    expect(got.map((l) => l.retailerSku)).toEqual(['1087866', '1087867', '1087868']);
  });
});
