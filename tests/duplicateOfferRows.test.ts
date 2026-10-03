import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { matchKey, rawTitlesAgree } from '../src/catalogue/productMatch.js';
import { concentration } from '../src/catalogue/productName.js';
import { sizeMl } from '../src/catalogue/fragranceId.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

  /* Audit, 2026-10-03: ten products carried the same shop's same page at the
     same price twice, one row in stock and one out, read weeks apart.
     Emirates Oud's Odyssey Aqua showed a buyable £22.50 row last seen
     2026-08-16 beside the shop's 2026-10-02 "out of stock". Only the newest
     reading is what the shop says today. */
  it('never shows an older stock reading of the same page and price beside a newer one', () => {
    const offenders: string[] = [];
    for (const [fragranceId, offers] of Object.entries(CRAWLED)) {
      const groups = new Map<string, string[]>();
      for (const o of offers) {
        const key = [o.retailerId, o.url, o.price, o.wasPrice].join('|');
        groups.set(key, [...(groups.get(key) ?? []), o.fetchedAt]);
      }
      for (const [key, readAt] of groups) {
        if (new Set(readAt).size > 1) offenders.push(`${fragranceId}: ${key}`);
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
 *   TBSUKDK2-15123  "Tom Ford Black Orchid Eau de Parfum Spray 150ml"
 *                   /products/tom-ford-black-orchid-edp-spray-150ml
 *   TBSUKDK2-40107  "Tom Ford Black Orchid Eau de Parfum 150ml"
 *                   /products/tom-ford-black-orchid-eau-de-parfum-150ml
 *
 * Neither carries an EAN, same size, same concentration. So the fix is a
 * second collapse in scripts/build-demo-catalogue.ts: one shop, the same
 * bottle on two of its own pages, keep the cheaper page. 29 rows across the
 * catalogue on the day it landed (mybeauty-boutique 10, the-beauty-store-uk 8,
 * perfumeo 8, emirates-oud 2, oud-arabian 1), every one of them checked back
 * to the shop's own two titles.
 *
 * Nothing below names that bottle any more, or any price: pinning a price
 * turned the daily crawl red every time the shop repriced, and pinning the
 * product turned it red the day the row stopped being shown.
 */
interface FeedListing {
  rawTitle: string;
  url: string;
  status: string;
}

/*
 * Checked as a rule over whatever the catalogue holds today, not through one
 * named bottle. This used to pin Tom Ford Black Orchid 150ml at The Beauty
 * Store UK; when that row stopped being shown (2026-10-03) the test went red
 * for a reason that had nothing to do with the rule. A live product cannot be
 * a fixture: the catalogue moves every three hours.
 *
 * The rule, from the collapse in scripts/build-demo-catalogue.ts: where one
 * shop shows a product on two or more of its own pages, the cheapest page is
 * kept, and any other page whose own title agrees with the cheapest one's
 * (rawTitlesAgree, at the same size and concentration, which is what the
 * build's matchKey adds) is the same bottle and must have been dropped. So every
 * extra page still shown must carry a title that disagrees with the cheapest
 * page's. Titles come from the shop's own feed in data/catalogue/; a page the
 * feed no longer lists cannot be judged and is left out. When no product shows
 * one shop on two pages there is nothing to check, and the block skips.
 */
const shownTwice = Object.entries(CRAWLED).flatMap(([fragranceId, offers]) => {
  const byShop = new Map<string, typeof offers>();
  for (const o of offers) byShop.set(o.retailerId, [...(byShop.get(o.retailerId) ?? []), o]);
  return [...byShop]
    .filter(([, rows]) => new Set(rows.map((r) => r.url)).size > 1)
    .map(([retailerId, rows]) => ({ fragranceId, retailerId, rows }));
});

const titlesByUrl = new Map<string, string>();
for (const retailerId of new Set(shownTwice.map((g) => g.retailerId))) {
  const file = resolve(root, `data/catalogue/${retailerId}.json`);
  if (!existsSync(file)) continue;
  const { listings } = JSON.parse(readFileSync(file, 'utf8')) as { listings: FeedListing[] };
  for (const l of listings) if (l.status === 'active') titlesByUrl.set(`${retailerId} ${l.url}`, l.rawTitle);
}

describe.skipIf(shownTwice.length === 0)('no product lists one shop twice for the same bottle', () => {
  it('keeps a second page of one shop only when its own title names a different bottle', () => {
    const offenders: string[] = [];
    for (const { fragranceId, retailerId, rows } of shownTwice) {
      const cheapest = rows.reduce((a, b) => (b.price < a.price ? b : a));
      const cheapestTitle = titlesByUrl.get(`${retailerId} ${cheapest.url}`);
      if (cheapestTitle === undefined) continue;
      for (const url of new Set(rows.map((r) => r.url))) {
        if (url === cheapest.url) continue;
        const title = titlesByUrl.get(`${retailerId} ${url}`);
        if (title === undefined) continue;
        // The build's own test is matchKey (same size and concentration) and
        // rawTitlesAgree together; a page naming a different strength, such
        // as an Extrait beside a plain listing, is a different bottle.
        const sameBottle =
          rawTitlesAgree(cheapestTitle, title) &&
          concentration(title) === concentration(cheapestTitle) &&
          sizeMl(title) === sizeMl(cheapestTitle);
        if (sameBottle) {
          offenders.push(`${fragranceId} at ${retailerId}: "${title}" is the same bottle as "${cheapestTitle}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
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
