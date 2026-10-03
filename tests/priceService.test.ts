import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildComparison,
  bestOffer,
  outOfStockOffers,
  purchasableOffers,
  presentOffer,
  isStaleFetch,
  isTooOldToShow,
  showableListingCount,
  HIDE_OFFER_AFTER_DAYS,
  STALE_OFFER_DAYS,
} from '../src/services/priceService.js';
import { getRetailer } from '../src/config/retailers.js';
import type { RawOffer, StockState } from '../src/types/offer.js';

const NOW = new Date('2026-08-01T12:00:00Z');

// Every enabled shop now has a stated delivery cost (2026-10-03), so the
// "delivery not stated" behaviour is exercised on two registry shops that
// genuinely state none, switched on for this file only.
const UNSTATED_FOR_TEST = ['cosmetify', 'carethy'];
beforeAll(() => {
  for (const id of UNSTATED_FOR_TEST) (getRetailer(id) as { enabled: boolean }).enabled = true;
});
afterAll(() => {
  for (const id of UNSTATED_FOR_TEST) (getRetailer(id) as { enabled: boolean }).enabled = false;
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** `fetchedAt` exactly `days` before NOW, as an ISO string. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function offer(
  retailerId: string,
  price: number,
  stock: StockState = 'inStock',
  over: Partial<RawOffer> = {},
): RawOffer {
  return {
    retailerId,
    variantId: 'sauvage-edp-100',
    price,
    currency: 'GBP',
    stock,
    url: `https://${getRetailer(retailerId)?.domain ?? 'example.com'}/p/1`,
    fetchedAt: '2026-08-01T11:55:00Z',
    ...over,
  };
}

describe('buildComparison ordering', () => {
  it('puts explicitly out-of-stock rows at the bottom, however cheap', () => {
    const rows = buildComparison(
      [
        offer('boots', 20, 'outOfStock'),
        offer('john-lewis', 90, 'inStock'),
        offer('lookfantastic', 85, 'inStock'),
      ],
      { now: NOW },
    );

    expect(rows.map((r) => r.retailer.id)).toEqual(['lookfantastic', 'john-lewis', 'boots']);
    expect(rows.at(-1)!.isPurchasable).toBe(false);
  });

  it('ranks unknown stock below confirmed availability but above out-of-stock', () => {
    // A page we could not parse is not evidence the product is gone.
    const rows = buildComparison(
      [
        offer('boots', 100, 'outOfStock'),
        offer('john-lewis', 100, 'unknown'),
        offer('lookfantastic', 100, 'lowStock'),
        offer('superdrug', 100, 'inStock'),
      ],
      { now: NOW },
    );

    expect(rows.map((r) => r.stock)).toEqual(['lowStock', 'inStock', 'unknown', 'outOfStock']);
  });

  it('lets a cheaper low-stock listing beat a dearer in-stock one', () => {
    // Low stock is still stock. Ranking it as a separate tier below inStock
    // buried the cheaper offer and made the table look broken.
    const rows = buildComparison(
      [offer('john-lewis', 108, 'inStock'), offer('boots', 105, 'lowStock')],
      { now: NOW },
    );

    expect(rows.map((r) => [r.retailer.id, r.deliveredPriceGbp])).toEqual([
      ['boots', 105],
      ['john-lewis', 108],
    ]);
  });

  it('sorts by delivered price by default, not item price', () => {
    // The case that justifies the whole delivered-price model: Boots has the
    // cheapest item price at £24.99 but misses its £25 free-delivery threshold
    // by a penny, so it lands £2.95 dearer than the nominally pricier
    // LOOKFANTASTIC listing — and ends up last, not first.
    const rows = buildComparison(
      [offer('boots', 24.99), offer('lookfantastic', 26), offer('superdrug', 25.5)],
      { now: NOW },
    );

    expect(rows.map((r) => [r.retailer.id, r.deliveredPriceGbp])).toEqual([
      ['superdrug', 25.5],
      ['lookfantastic', 26],
      ['boots', 28.94],
    ]);
  });

  it('sorts by item price when asked, ignoring delivery', () => {
    const rows = buildComparison(
      [offer('boots', 24.99), offer('lookfantastic', 26), offer('superdrug', 25.5)],
      { sortBy: 'item', now: NOW },
    );

    expect(rows.map((r) => r.retailer.id)).toEqual(['boots', 'superdrug', 'lookfantastic']);
  });

  it('ranks every priced offer above every unpriced one, however cheap', () => {
    // The Fragrance Counter states no standard delivery cost, so it has no
    // delivered price to compare. Listing it at £1 is the extreme form of the
    // failure this rule exists to prevent: treating "we don't know" as £0
    // would make it the cheapest row in the table.
    const rows = buildComparison(
      [offer('cosmetify', 1), offer('boots', 90), offer('lookfantastic', 85)],
      { now: NOW },
    );

    expect(rows.map((r) => [r.retailer.id, r.deliveredPriceGbp])).toEqual([
      ['lookfantastic', 85],
      ['boots', 90],
      ['cosmetify', null],
    ]);
  });

  it('orders unpriced offers among themselves by item price', () => {
    // Between two shops that both state nothing, item price is the only thing
    // there is to go on, and it is a fair comparison — neither is being
    // credited with delivery it has not quoted.
    const rows = buildComparison(
      [offer('carethy', 45), offer('cosmetify', 30)],
      { now: NOW },
    );
    expect(rows.map((r) => r.retailer.id)).toEqual(['cosmetify', 'carethy']);
    expect(rows.every((r) => r.deliveredPriceGbp === null)).toBe(true);
  });

  it('leaves the item sort alone — item price is known for everyone', () => {
    // No demotion here: nothing being sorted on is unknown, so an
    // unknown-delivery shop with the cheapest bottle genuinely does have the
    // cheapest bottle.
    const rows = buildComparison(
      [offer('boots', 90), offer('cosmetify', 40)],
      { sortBy: 'item', now: NOW },
    );
    expect(rows.map((r) => r.retailer.id)).toEqual(['cosmetify', 'boots']);
  });

  it('breaks ties deterministically by retailer name', () => {
    const a = buildComparison([offer('boots', 30), offer('superdrug', 30)], { now: NOW });
    const b = buildComparison([offer('superdrug', 30), offer('boots', 30)], { now: NOW });
    expect(a.map((r) => r.retailer.id)).toEqual(b.map((r) => r.retailer.id));
  });
});

describe('buildComparison filtering', () => {
  it('drops offers from retailers not in the registry', () => {
    // Rendering a row with no shipping rules would undercut every honest row.
    const rows = buildComparison([offer('mystery-shop', 10), offer('boots', 90)], { now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.retailer.id).toBe('boots');
  });

  it('filters to retailers that stock the requested tier', () => {
    const rows = buildComparison([offer('boots', 90), offer('selfridges', 95)], {
      tier: 'niche',
      now: NOW,
    });
    expect(rows.map((r) => r.retailer.id)).toEqual(['selfridges']);
  });

  it('can hide out-of-stock rows entirely', () => {
    const rows = buildComparison([offer('boots', 20, 'outOfStock'), offer('john-lewis', 90)], {
      hideOutOfStock: true,
      now: NOW,
    });
    expect(rows.map((r) => r.retailer.id)).toEqual(['john-lewis']);
  });

  it('returns an empty table for no input', () => {
    expect(buildComparison([], { now: NOW })).toEqual([]);
  });
});

describe('presentOffer', () => {
  const boots = getRetailer('boots')!;

  it('computes delivered price and the free-delivery shortfall', () => {
    const row = presentOffer(offer('boots', 20), boots, NOW);
    expect(row.itemPriceGbp).toBe(20);
    expect(row.deliveredPriceGbp).toBe(23.95);
    expect(row.delivery.spendMoreForFreeGbp).toBe(5);
  });

  it('attaches the retailer discount when there is one', () => {
    const row = presentOffer(offer('boots', 80, 'inStock', { wasPrice: 100 }), boots, NOW);
    expect(row.discount?.percentOff).toBe(20);
  });

  it('falls back to the direct URL while no affiliate programme is live', () => {
    const row = presentOffer(offer('boots', 80), boots, NOW);
    expect(row.isAffiliateLink).toBe(false);
    expect(row.outboundUrl).toBe('https://boots.com/p/1');
  });

  it('never turns an unstated delivery cost into a delivered price', () => {
    const tfc = getRetailer('cosmetify')!;
    // Cosmetify has no standard rate recorded and no threshold, so no figure is stated.
    const row = presentOffer(offer('cosmetify', 45), tfc, NOW);
    expect(row.itemPriceGbp).toBe(45);
    expect(row.deliveredPriceGbp).toBeNull();
    expect(row.delivery.costGbp).toBeNull();
    expect(row.delivery.isFree).toBe(false);
  });

  it('reports price age for the staleness label', () => {
    expect(presentOffer(offer('boots', 80), boots, NOW).ageSeconds).toBe(300);
  });

  it('does not report a negative age for a clock skew', () => {
    const future = offer('boots', 80, 'inStock', { fetchedAt: '2026-08-01T12:05:00Z' });
    expect(presentOffer(future, boots, NOW).ageSeconds).toBe(0);
  });

  // This retailer's own published rating, carried through from RawOffer to
  // PresentedOffer unchanged — the same "read off this offer, attributed to
  // this offer" shape as the discount and delivery fields above, never
  // computed or borrowed from a different retailer's rating of the same
  // fragrance. jsonld.ts is what actually reads the rating off a real page;
  // this proves the value it produces survives the presentation step.
  it('carries a retailer-published rating through unchanged', () => {
    const withRating = offer('boots', 80, 'inStock', { rating: { value: 4.6, count: 128 } });
    expect(presentOffer(withRating, boots, NOW).rating).toEqual({ value: 4.6, count: 128 });
  });

  it('is null, never invented, when the offer carries no rating', () => {
    expect(presentOffer(offer('boots', 80), boots, NOW).rating).toBeNull();
  });
});

describe('result grouping', () => {
  const rows = buildComparison(
    [offer('boots', 20, 'outOfStock'), offer('john-lewis', 90), offer('lookfantastic', 85)],
    { now: NOW },
  );

  it('splits buyable from unavailable', () => {
    expect(purchasableOffers(rows).map((r) => r.retailer.id)).toEqual([
      'lookfantastic',
      'john-lewis',
    ]);
    expect(outOfStockOffers(rows).map((r) => r.retailer.id)).toEqual(['boots']);
  });

  it('never headlines a price nobody can pay', () => {
    expect(bestOffer(rows)!.retailer.id).toBe('lookfantastic');
  });

  it('never headlines an offer whose delivery cost is unknown', () => {
    // Enforced in bestOffer itself, not left to the sort, so it holds even
    // when the caller ordered the rows some other way.
    const mixed = buildComparison(
      [offer('cosmetify', 10), offer('boots', 90)],
      { sortBy: 'item', now: NOW },
    );
    expect(mixed[0]!.retailer.id).toBe('cosmetify');
    expect(bestOffer(mixed)!.retailer.id).toBe('boots');
  });

  it('falls back to an unknown-delivery offer only when it is the only one', () => {
    // Naming the one shop that has it beats showing nothing, and the UI
    // labels it as delivery not stated rather than as a winning price.
    const only = buildComparison([offer('cosmetify', 45)], { now: NOW });
    const best = bestOffer(only)!;
    expect(best.retailer.id).toBe('cosmetify');
    expect(best.deliveredPriceGbp).toBeNull();
  });

  it('returns null when nothing is buyable', () => {
    const none = buildComparison([offer('boots', 20, 'outOfStock')], { now: NOW });
    expect(bestOffer(none)).toBeNull();
  });
});

describe('isStaleFetch', () => {
  it('is not stale exactly at the boundary — only strictly past it counts', () => {
    expect(isStaleFetch(daysAgo(STALE_OFFER_DAYS), NOW)).toBe(false);
  });

  it('is stale one second past the boundary', () => {
    const justOver = new Date(NOW.getTime() - STALE_OFFER_DAYS * DAY_MS - 1000).toISOString();
    expect(isStaleFetch(justOver, NOW)).toBe(true);
  });

  it('is not stale one second inside the boundary', () => {
    const justUnder = new Date(NOW.getTime() - STALE_OFFER_DAYS * DAY_MS + 1000).toISOString();
    expect(isStaleFetch(justUnder, NOW)).toBe(false);
  });

  it('is never stale for the ordinary case: a healthy shop simply visited a few days ago', () => {
    // The rotating least-recently-checked queue means a healthy shop can
    // legitimately go several days between visits — that must never read as
    // "broken". See STALE_OFFER_DAYS's own comment for the measured spread
    // this threshold is chosen against.
    expect(isStaleFetch(daysAgo(3), NOW)).toBe(false);
    expect(isStaleFetch(daysAgo(7), NOW)).toBe(false);
  });

  it('does not treat an unparseable timestamp as stale', () => {
    expect(isStaleFetch('not-a-date', NOW)).toBe(false);
  });
});

/**
 * Owner's decision, 2026-10-03: the age of a listed offer no longer decides
 * which row is the cheapest. Every listed buyable row competes on price and
 * says its own age; too old to trust is not listed (HIDE_OFFER_AFTER_DAYS).
 */
describe('an older listed offer competes on price like any other', () => {
  it('picks a cheaper older row over a fresh, costlier one', () => {
    const rows = buildComparison(
      [
        offer('boots', 50, 'inStock', { fetchedAt: daysAgo(1) }),
        offer('john-lewis', 30, 'inStock', { fetchedAt: daysAgo(STALE_OFFER_DAYS + 1) }),
      ],
      { now: NOW },
    );
    const best = bestOffer(rows)!;
    expect(best.retailer.id).toBe('john-lewis');
    expect(best.stale).toBe(true);
    // And it is the first row, so nothing cheaper sits above it.
    expect(rows[0]).toBe(best);
  });

  it('names a lone older offer as the best', () => {
    const rows = buildComparison(
      [offer('john-lewis', 30, 'inStock', { fetchedAt: daysAgo(STALE_OFFER_DAYS + 1) })],
      { now: NOW },
    );
    const best = bestOffer(rows)!;
    expect(best.retailer.id).toBe('john-lewis');
    expect(best.stale).toBe(true);
  });

  it('leaves a fresh, healthy-shop-visited-a-few-days-ago row alone', () => {
    // The exact case the threshold must not fire on: one shop, visited a
    // handful of days ago, still healthy.
    const rows = buildComparison([offer('boots', 40, 'inStock', { fetchedAt: daysAgo(5) })], {
      now: NOW,
    });
    expect(bestOffer(rows)!.stale).toBe(false);
  });

  it('never removes a stale offer from the row set itself while it is under HIDE_OFFER_AFTER_DAYS', () => {
    const rows = buildComparison(
      [
        offer('boots', 50, 'inStock', { fetchedAt: daysAgo(1) }),
        offer('john-lewis', 30, 'inStock', { fetchedAt: daysAgo(STALE_OFFER_DAYS + 1) }),
      ],
      { now: NOW },
    );
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.retailer.id === 'john-lewis' && r.stale)).toBe(true);
  });
});

describe('HIDE_OFFER_AFTER_DAYS: offers too old to show at all', () => {
  it('is 21 days, the owner\'s rule of 2026-10-03', () => {
    expect(HIDE_OFFER_AFTER_DAYS).toBe(21);
  });

  it('hides an offer last confirmed 22 days ago and shows one from 20 days ago', () => {
    const rows = buildComparison(
      [
        offer('boots', 30, 'inStock', { fetchedAt: daysAgo(22) }),
        offer('john-lewis', 50, 'inStock', { fetchedAt: daysAgo(20) }),
      ],
      { now: NOW },
    );
    expect(rows.map((r) => r.retailer.id)).toEqual(['john-lewis']);
    // The 20 day row is still listed, and is the best offer on it.
    expect(rows[0]!.stale).toBe(true);
    expect(bestOffer(rows)).toBe(rows[0]);
  });

  it('never lets a hidden offer be the cheapest, even when it is the only one', () => {
    const rows = buildComparison([offer('boots', 10, 'inStock', { fetchedAt: daysAgo(22) })], { now: NOW });
    expect(rows).toEqual([]);
    expect(bestOffer(rows)).toBeNull();
  });

  it('draws the line at exactly 21 days', () => {
    expect(isTooOldToShow(daysAgo(HIDE_OFFER_AFTER_DAYS), NOW)).toBe(false);
    expect(isTooOldToShow(new Date(NOW.getTime() - HIDE_OFFER_AFTER_DAYS * DAY_MS - 1000).toISOString(), NOW)).toBe(true);
    expect(isTooOldToShow('not-a-date', NOW)).toBe(false);
  });

  it('gives a shop whose every offer is too old a listing count of 0', () => {
    const catalogue = {
      a: [
        { retailerId: 'superdrug', fetchedAt: daysAgo(43) },
        { retailerId: 'boots', fetchedAt: daysAgo(1) },
      ],
      b: [{ retailerId: 'superdrug', fetchedAt: daysAgo(22) }],
      c: [{ retailerId: 'boots', fetchedAt: daysAgo(30) }],
    };
    expect(showableListingCount(catalogue, 'superdrug', NOW)).toBe(0);
    // A shop with some fresh and some old offers counts only the fresh ones.
    expect(showableListingCount(catalogue, 'boots', NOW)).toBe(1);
  });

  it('counts a product once however many showable offers the shop has on it', () => {
    const catalogue = {
      a: [
        { retailerId: 'john-lewis', fetchedAt: daysAgo(14) },
        { retailerId: 'john-lewis', fetchedAt: daysAgo(2) },
      ],
    };
    expect(showableListingCount(catalogue, 'john-lewis', NOW)).toBe(1);
  });
});

// The three delivery charges the owner read off each shop's own basket on
// 2026-10-03: Selfridges £6.95 with no non-member threshold, Emirates Oud
// £3.99 free from £50, Riiffs a flat £3.95 with no threshold at all (it still
// charged £3.95 on a £105 basket). Pinned through buildComparison and
// bestOffer, the path every product page takes, so a later registry edit that
// drifts from what the baskets showed fails here rather than on the site.
describe('basket-confirmed delivery (2026-10-03)', () => {
  const at = (rows: ReturnType<typeof buildComparison>, id: string) =>
    rows.find((r) => r.retailer.id === id)!;

  it('adds each shop’s confirmed charge and ranks on the delivered total', () => {
    const rows = buildComparison(
      [offer('selfridges', 40), offer('emirates-oud', 41), offer('riiffs', 42)],
      { now: NOW },
    );
    expect(at(rows, 'selfridges').deliveredPriceGbp).toBe(46.95);
    expect(at(rows, 'emirates-oud').deliveredPriceGbp).toBe(44.99);
    expect(at(rows, 'riiffs').deliveredPriceGbp).toBe(45.95);
    // Cheapest bottle, dearest delivered: the item price order is reversed.
    expect(rows.map((r) => r.retailer.id)).toEqual(['emirates-oud', 'riiffs', 'selfridges']);
    expect(bestOffer(rows)!.retailer.id).toBe('emirates-oud');
    expect(rows.every((r) => r.delivery.confirmed)).toBe(true);
  });

  it('applies only the thresholds a non-member gets', () => {
    const rows = buildComparison(
      [offer('selfridges', 120), offer('emirates-oud', 50), offer('riiffs', 105)],
      { now: NOW },
    );
    // Selfridges' £100 and £150 thresholds are Selfridges+ and Unlocked perks.
    expect(at(rows, 'selfridges').deliveredPriceGbp).toBe(126.95);
    expect(at(rows, 'selfridges').delivery.membershipNote).toContain('Selfridges+');
    // Emirates Oud ships free from £50.
    expect(at(rows, 'emirates-oud').deliveredPriceGbp).toBe(50);
    expect(at(rows, 'emirates-oud').delivery.isFree).toBe(true);
    // Riiffs charged £3.95 on a £105 basket: no threshold.
    expect(at(rows, 'riiffs').deliveredPriceGbp).toBe(108.95);
    expect(at(rows, 'riiffs').delivery.spendMoreForFreeGbp).toBeNull();
  });
});
