import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { matchKey, rawTitlesAgree } from '../src/catalogue/productMatch.js';

/**
 * Owner report, 2026-08-26: Emirates Oud is listed twice on Armaf Club De Nuit
 * Intense Man EDT 105ml (ean-6085010044712), both rows £26.99 was £40, both
 * linking to the same page. One shop cannot be two entries in a price
 * comparison — a reader counting shops counts wrong, and the "8 shops" on that
 * product was 7.
 *
 * The cause was not a matching mistake. Emirates Oud's feed carries three
 * variants of Shopify product 9369918832989 — "Default Title", "105ml" and
 * "Unboxed: 105ml" — and the first two describe the same bottle at the same
 * price, one of them Shopify's placeholder variant. scripts/build-demo-
 * catalogue.ts collapses rows a reader could not tell apart; see its comment
 * for why the key is every visible field rather than the URL alone, and for the
 * Al Haramain multi-size case that would break a URL-only rule.
 *
 * Measured over the shipped catalogue: 42 such rows across 42 products before,
 * all Emirates Oud's; 0 after.
 */
describe('no product lists one shop twice with the same row', () => {
  it('is checking a real catalogue', () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
  });

  it('has no two offers a reader could not tell apart', () => {
    const offenders: string[] = [];
    for (const [fragranceId, offers] of Object.entries(CRAWLED)) {
      const seen = new Set<string>();
      for (const o of offers) {
        const key = [o.retailerId, o.url, o.price, o.wasPrice, o.stock].join('|');
        if (seen.has(key)) offenders.push(`${fragranceId}: ${key}`);
        seen.add(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('counts shops on the product record as offers actually shipped', () => {
    /* `shops` is written as offers.length, so a collapsed row has to leave it
       consistent or the count on the page goes back to overstating. */
    const wrong = CATALOGUE.filter((p) => p.shops !== (CRAWLED[p.id] ?? []).length);
    expect(wrong.map((p) => `${p.id}: says ${p.shops}`)).toEqual([]);
  });
});

/**
 * Layout report, 2026-09-01: Tom Ford Black Orchid Eau de Parfum 150ml
 * (ean-888066124287) showed two "The Beauty Store UK" rows, £139.99 and
 * £152.59.
 *
 * The pass the tests above guard cannot see them: its key is every field a
 * reader can see, and these differ in the link and the price, which is
 * exactly what that key is for. Established from the shop's own feed
 * (data/catalogue/the-beauty-store-uk.json) that this is not two variants of
 * one page, and not a mis-grouping either — it is two whole Shopify products
 * for one bottle:
 *
 *   TBSUKDK2-15123  £139.99  "Tom Ford Black Orchid Eau de Parfum Spray 150ml"
 *                            /products/tom-ford-black-orchid-edp-spray-150ml
 *   TBSUKDK2-40107  £152.59  "Tom Ford Black Orchid Eau de Parfum 150ml"
 *                            /products/tom-ford-black-orchid-eau-de-parfum-150ml
 *
 * Neither carries an EAN, both in stock, same size, same concentration. So
 * the fix is a second collapse in scripts/build-demo-catalogue.ts: one shop,
 * the same bottle on two of its own pages, keep the cheaper page. 29 rows
 * across the catalogue on the day it landed (mybeauty-boutique 10,
 * the-beauty-store-uk 8, perfumeo 8, emirates-oud 2, oud-arabian 1), every
 * one of them checked back to the shop's own two titles.
 */
describe('no product lists one shop twice for the same bottle', () => {
  it('shows Tom Ford Black Orchid 150ml at The Beauty Store UK once, at the cheaper of its two pages', () => {
    const offers = (CRAWLED['ean-888066124287'] ?? []).filter(
      (o) => o.retailerId === 'the-beauty-store-uk',
    );
    expect(offers.map((o) => o.price)).toEqual([139.99]);
    expect(offers[0]?.url).toBe(
      'https://thebeautystore.com/products/tom-ford-black-orchid-edp-spray-150ml',
    );
  });

  it('still shows the other shops on that bottle, so the collapse took rows from one shop only', () => {
    const shops = new Set((CRAWLED['ean-888066124287'] ?? []).map((o) => o.retailerId));
    expect(shops.size).toBeGreaterThan(1);
    expect(shops.has('the-beauty-store-uk')).toBe(true);
  });
});

/**
 * The two tests that collapse applies, pinned as rules rather than through
 * the snapshot — a snapshot moves every three hours, and what must not drift
 * is when two of one shop's listings count as one bottle.
 *
 * Both have to pass. Neither is sufficient alone, and every pair of titles
 * below is real, from data/catalogue/.
 */
describe('when one shop’s two listings are the same bottle', () => {
  const key = (brand: string, name: string, concentration: string, sizeMl: number | null) =>
    matchKey({ id: `${brand}/${name}/${sizeMl}`, brand, name, concentration, sizeMl, ean: null });

  it('accepts titles that differ only by a word carrying no product information', () => {
    /* The reported case. "Spray" is the whole difference. */
    expect(
      rawTitlesAgree(
        'Tom Ford Black Orchid Eau de Parfum Spray 150ml',
        'Tom Ford Black Orchid Eau de Parfum 150ml',
      ),
    ).toBe(true);
  });

  it('refuses three different Avon perfumes whose displayed names have all collapsed to one', () => {
    /* Avon puts the fragrance's name in its brand field: rawBrand "Perceive",
       "Incandessence", "Little Black Dress". All three canonicalise to brand
       "Avon Cosmetics" with nothing left in the name, so matchKey cannot tell
       them apart — findDuplicateGroups has already merged them into one
       product, which is a defect of its own. The raw titles are what stops the
       collapse hiding two real perfumes behind the third. */
    expect(key('Avon Cosmetics', 'Avon Cosmetics', 'Eau de Parfum', 30)).toBe(
      key('Avon Cosmetics', 'Avon Cosmetics', 'Eau de Parfum', 30),
    );
    expect(
      rawTitlesAgree('Perceive Eau de Parfum 30ml', 'Incandessence Eau de Parfum - 30 ml'),
    ).toBe(false);
    expect(
      rawTitlesAgree('Perceive Eau de Parfum 30ml', 'Little Black Dress Eau de Parfum 30ml'),
    ).toBe(false);
  });

  it('refuses a boxed bottle and an unboxed one, which the title test alone would accept', () => {
    /* "Unboxed" makes one title a strict superset of the other, so
       rawTitlesAgree says yes and matchKey is what has to say no — the word
       survives into the displayed name. Both real at The Beauty Store UK:
       TOM-117646-X is the unboxed 100ml at £69.99, TBSUKDK2-00266 the boxed
       one at £112.99. Collapsing them would put an unboxed price on a boxed
       listing. */
    expect(
      rawTitlesAgree(
        'Tom Ford Black Orchid Eau de Parfum Spray 100ml',
        'Tom Ford Black Orchid Eau de Parfum Spray 100ml Unboxed',
      ),
    ).toBe(true);
    expect(key('Tom Ford', 'Black Orchid', 'Eau de Parfum', 100)).not.toBe(
      key('Tom Ford', 'Black Orchid Unboxed', 'Eau de Parfum', 100),
    );
  });

  it('is not so loose that a different size or concentration slips through', () => {
    expect(key('Tom Ford', 'Black Orchid', 'Eau de Parfum', 150)).not.toBe(
      key('Tom Ford', 'Black Orchid', 'Eau de Parfum', 100),
    );
    expect(key('Tom Ford', 'Black Orchid', 'Eau de Parfum', 100)).not.toBe(
      key('Tom Ford', 'Black Orchid', 'Eau de Toilette', 100),
    );
  });
});
