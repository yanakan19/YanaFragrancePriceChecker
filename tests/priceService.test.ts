import { describe, expect, it } from 'vitest';
import {
  buildComparison,
  bestOffer,
  outOfStockOffers,
  purchasableOffers,
  presentOffer,
} from '../src/services/priceService.js';
import { getRetailer } from '../src/config/retailers.js';
import type { RawOffer, StockState } from '../src/types/offer.js';

const NOW = new Date('2026-08-01T12:00:00Z');

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
      [offer('manchester-ouds', 1), offer('boots', 90), offer('lookfantastic', 85)],
      { now: NOW },
    );

    expect(rows.map((r) => [r.retailer.id, r.deliveredPriceGbp])).toEqual([
      ['lookfantastic', 85],
      ['boots', 90],
      ['manchester-ouds', null],
    ]);
  });

  it('orders unpriced offers among themselves by item price', () => {
    // Between two shops that both state nothing, item price is the only thing
    // there is to go on, and it is a fair comparison — neither is being
    // credited with delivery it has not quoted.
    const rows = buildComparison(
      [offer('ibraq', 60), offer('manchester-ouds', 40)],
      { now: NOW },
    );
    expect(rows.map((r) => r.retailer.id)).toEqual(['manchester-ouds', 'ibraq']);
    expect(rows.every((r) => r.deliveredPriceGbp === null)).toBe(true);
  });

  it('leaves the item sort alone — item price is known for everyone', () => {
    // No demotion here: nothing being sorted on is unknown, so an
    // unknown-delivery shop with the cheapest bottle genuinely does have the
    // cheapest bottle.
    const rows = buildComparison(
      [offer('boots', 90), offer('manchester-ouds', 40)],
      { sortBy: 'item', now: NOW },
    );
    expect(rows.map((r) => r.retailer.id)).toEqual(['manchester-ouds', 'boots']);
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
    const tfc = getRetailer('manchester-ouds')!;
    const row = presentOffer(offer('manchester-ouds', 55), tfc, NOW);
    expect(row.itemPriceGbp).toBe(55);
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
      [offer('manchester-ouds', 10), offer('boots', 90)],
      { sortBy: 'item', now: NOW },
    );
    expect(mixed[0]!.retailer.id).toBe('manchester-ouds');
    expect(bestOffer(mixed)!.retailer.id).toBe('boots');
  });

  it('falls back to an unknown-delivery offer only when it is the only one', () => {
    // Naming the one shop that has it beats showing nothing, and the UI
    // labels it as delivery not stated rather than as a winning price.
    const only = buildComparison([offer('manchester-ouds', 55)], { now: NOW });
    const best = bestOffer(only)!;
    expect(best.retailer.id).toBe('manchester-ouds');
    expect(best.deliveredPriceGbp).toBeNull();
  });

  it('returns null when nothing is buyable', () => {
    const none = buildComparison([offer('boots', 20, 'outOfStock')], { now: NOW });
    expect(bestOffer(none)).toBeNull();
  });
});
