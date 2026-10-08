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

  it('reads nothing when no variant is the group itself and the address names none', () => {
    expect(parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: 'https://x/' })).toHaveLength(0);
    // Nor on a multi size page of its own: its variants carry no url, their
    // offers' urls carry "?variation=", the address holds no variant's sku,
    // and all three share one name, so neither fallback applies.
    const groupPage = 'https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her/13319981/';
    expect(parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: groupPage })).toHaveLength(0);
  });

  it('reads the one variant whose sku the address holds, even among variants that share a name', () => {
    const got = parseListings(page('99999999'), { sectionId: 'sitemap', pageUrl: CULT_BEAUTY_PAGE });
    expect(got.map((l) => [l.retailerSku, l.priceGbp])).toEqual([['11079307', 98]]);
  });

  it("reads the one variant whose offer's url is the page, asked for at that size", () => {
    const got = parseListings(page('99999999'), {
      sectionId: 'sitemap',
      pageUrl: 'https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml/11079307/?variation=13996128',
    });
    expect(got.map((l) => [l.retailerSku, l.priceGbp])).toEqual([['13996128', 135]]);
  });
});

/**
 * When no variant is the group itself: every variant when each names its own
 * size; otherwise the one variant the page address names, matched by its own
 * url, then an offer's url, then a sku standing as a whole part of the
 * address. Each address step needs exactly one variant, else the next step.
 * The variants here share one name, so only the address can pick one.
 */
describe('parseListings: which variant the page address names', () => {
  const PAGE = 'https://shop.test/p/rose-eau-de-parfum-ABC12345.html';
  const variant = (sku: string, price: number, extra: Record<string, unknown> = {}) => ({
    '@type': 'Product', sku, name: 'Rose Eau de Parfum',
    offers: { '@type': 'Offer', price, priceCurrency: 'GBP' },
    ...extra,
  });
  const group = (...variants: unknown[]) => ld({ '@type': 'ProductGroup', productGroupID: 'G1', name: 'Rose', hasVariant: variants });
  const skus = (html: string, pageUrl = PAGE) => parseListings(html, { sectionId: 'sitemap', pageUrl }).map((l) => l.retailerSku);
  const offerAt = (url: string, price: number) => ({ offers: { '@type': 'Offer', url, price, priceCurrency: 'GBP' } });

  it("takes the variant's own url before an offer's url or a sku in the address", () => {
    const html = group(variant('ABC12345', 30), variant('X2', 50, offerAt(PAGE, 50)), variant('X3', 100, { url: PAGE }));
    expect(skus(html)).toEqual(['X3']);
  });

  it('matches the url whether the page was asked for with a trailing slash or not, fragment included', () => {
    const html = group(variant('X1', 30, { url: `${PAGE}#variation=1` }), variant('X2', 50, { url: `${PAGE}#variation=2` }));
    expect(skus(html, `${PAGE}#variation=2`)).toEqual(['X2']);
    expect(skus(html, PAGE)).toEqual([]);
    const slashed = group(variant('X1', 30, { url: 'https://shop.test/p/a/' }), variant('X2', 50, { url: 'https://shop.test/p/b/' }));
    expect(skus(slashed, 'https://shop.test/p/b')).toEqual(['X2']);
  });

  it("takes an offer's url before a sku in the address", () => {
    expect(skus(group(variant('ABC12345', 30), variant('X2', 50, offerAt(PAGE, 50))))).toEqual(['X2']);
  });

  it('takes a sku in the address when no url names the page', () => {
    expect(skus(group(variant('ABC12345', 30), variant('X2', 50)))).toEqual(['ABC12345']);
  });

  it('moves on to the next step when two variants claim the page at one step', () => {
    const html = group(variant('ABC12345', 30, { url: PAGE }), variant('X2', 50, { url: PAGE }), variant('X3', 100));
    // Two own urls are the page, so the sku in the address decides.
    expect(skus(html)).toEqual(['ABC12345']);
  });

  it('finds a sku only as a whole part of the address, and only a long one', () => {
    // "BC1234" sits inside "ABC12345", and "30" is too short to count.
    expect(skus(group(variant('BC1234', 30), variant('X2', 50)))).toEqual([]);
    expect(skus(group(variant('30', 30), variant('X2', 50)), 'https://shop.test/p/rose-30/x.html')).toEqual([]);
    // Space NK's group page names the group, not its 100ml.
    const spaceNkGroup = 'https://www.spacenk.com/uk/young-rose-eau-de-parfum-MUK200031967.html';
    expect(skus(group(variant('UK200031967', 225), variant('UK200033403', 155)), spaceNkGroup)).toEqual([]);
  });

  it('reads every size when each names its own, even where the address names one of them', () => {
    const html = group(
      { ...variant('ABC12345', 30, { url: PAGE }), name: 'Rose Eau de Parfum 30ml' },
      { ...variant('X2', 50), name: 'Rose Eau de Parfum 50ml' },
    );
    expect(skus(html)).toEqual(['ABC12345', 'X2']);
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
  it("reads every size on a variant's own page too, each at its own address, with the group brand", () => {
    // Space NK's sitemap lists the group page for most products and a
    // variant's page for some; the other size is often on no page the walk
    // reads, so a variant's page keeps every size.
    const got = parseListings(spaceNk(), { sectionId: 'sitemap', pageUrl: SPACE_NK_VARIANT_PAGE, requireGbp: true });
    expect(got.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand, l.url])).toEqual([
      ['UK200031967', 'Byredo Young Rose Eau de Parfum 100ml', 225, 'Byredo',
        'https://www.spacenk.com/uk/fragrance/personal-fragrance/fragrance/young-rose-eau-de-parfum-UK200031967.html'],
      ['UK200033403', 'Byredo Young Rose Eau de Parfum 50ml', 155, 'Byredo', SPACE_NK_VARIANT_PAGE],
    ]);
    expect(got[1]!.inStock).toBe(true);
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

  it('tells the sizes apart by their "#variation=" fragment when their names do not', () => {
    // Asked for with one variation's fragment, that one variant is the page.
    const alike = parfumdreams(() => 'Gucci Gucci Bloom Eau de Parfum Spray Intense');
    const at = `${PARFUMDREAMS_PAGE}#variation=194518`;
    expect(parseListings(alike, { sectionId: 'sitemap', pageUrl: at }).map((l) => l.retailerSku)).toEqual(['1087867']);
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
    const html = parfumdreams(() => 'Gucci Gucci Bloom Eau de Parfum Spray Intense')
      .replaceAll('#variation=194519', '')
      .replaceAll('#variation=194518', '');
    // Two variants now sit at the page address and the names are alike, so
    // nothing is read rather than a guess.
    expect(parseListings(html, { sectionId: 'sitemap', pageUrl: PARFUMDREAMS_PAGE })).toEqual([]);
  });
});
