import { describe, expect, it } from 'vitest';
import {
  plottedIncludesDelivery,
  plottedPrice,
  priceHistoryChart,
  shortDate,
  type PriceHistoryChartInput,
  type RetailerLookup,
} from '../demo/priceHistoryChart.js';
import type { Retailer } from '../src/types/retailer.js';

/**
 * Fixed delivery rules, so the delivered figures below do not move when a
 * real shop's rule changes in the registry:
 *   allbeauty      £2.99, free from £30
 *   perfume-click  £3.95, no free threshold
 *   perfumeo       always free
 *   manchester-ouds  delivery not stated
 *   fragrancehub   not stated, but free from £90
 */
const SHOPS: Record<string, { name: string; standardGbp: number | null; freeOverGbp: number | null }> = {
  allbeauty: { name: 'allbeauty', standardGbp: 2.99, freeOverGbp: 30 },
  'perfume-click': { name: 'Perfume Click', standardGbp: 3.95, freeOverGbp: null },
  perfumeo: { name: 'Perfumeo', standardGbp: 0, freeOverGbp: null },
  'manchester-ouds': { name: 'Manchester Ouds', standardGbp: null, freeOverGbp: null },
  fragrancehub: { name: 'FragranceHub', standardGbp: null, freeOverGbp: 90 },
};
const retailers: RetailerLookup = (id) => {
  const shop = SHOPS[id];
  if (!shop) return undefined;
  return {
    id,
    name: shop.name,
    enabled: true,
    shipping: {
      standardGbp: shop.standardGbp,
      freeOverGbp: shop.freeOverGbp,
      estimatedDays: [2, 4],
      verifiedAt: '2026-10-01',
      confidence: 'confirmed',
    },
  } as unknown as Retailer;
};

/**
 * The owner's rule (2026-10-03): every perfume product page shows the price
 * history graph, including one with a single observation, labelled honestly.
 */
const base: PriceHistoryChartInput = {
  line: [],
  lineSource: 'history',
  older: [],
  soldOut: [],
  siteLastDay: null,
  isCurrentlyPurchasable: true,
  retailers,
};

/** The active panel's markup (the one not hidden). */
function activePanel(html: string): string {
  const m = /<div class="history-panel" data-history-panel="(\w+)">([\s\S]*?)<\/div>\s*<div class="history-xaxis">/.exec(html);
  return m?.[2] ?? '';
}
const dots = (html: string, cls: string) => (html.match(new RegExp(`class="history-dot${cls}`, 'g')) ?? []).length;
const linePath = (html: string) => /class="history-line"/.test(html) ? /<path d="([^"]*)" class="history-line"/.exec(html)![1]! : '';

describe('price history graph', () => {
  it('draws a graph with one clear point for a product with a single observation', () => {
    const html = priceHistoryChart({
      ...base,
      line: [{ at: '2026-10-02T09:00:00Z', priceGbp: 42.5, retailerId: 'allbeauty' }],
      siteLastDay: '2026-10-02',
    });
    expect(html).toContain('data-history-chart');
    const panel = activePanel(html);
    // One dot, the reading itself, centred because the range is one day long.
    expect(dots(panel, '[ "]')).toBe(1);
    expect(panel).toContain('left:50.00%');
    // Over allbeauty's £30 threshold, so delivery is free and the figure stands.
    expect(panel).toContain('data-price="£42.50 with delivery"');
    // No line to draw between one point and nothing.
    expect(linePath(panel)).toBe('');
    expect(html).toContain('One price recorded so far, so this is a single reading rather than a trend.');
    expect(html).toContain("Each point is a bottle price plus that shop's delivery, worked out at today's delivery rates.");
    expect(html).not.toContain('before delivery');
  });

  it('carries a single observation on to today as "no change recorded", never as a new reading', () => {
    const html = priceHistoryChart({
      ...base,
      line: [{ at: '2026-09-28T09:00:00Z', priceGbp: 42.5, retailerId: 'allbeauty' }],
      siteLastDay: '2026-10-02',
    });
    const panel = activePanel(html);
    expect(panel).toContain(`data-date="${shortDate('2026-09-28T09:00:00Z')}"`);
    expect(panel.match(/data-date="no change recorded since/g)?.length).toBe(4);
    expect(linePath(panel)).not.toBe('');
  });

  it('never carries a lone reading whose end is not on record, and opens on the range that shows it', () => {
    const html = priceHistoryChart({
      ...base,
      carryForward: false,
      line: [{ at: '2026-08-10T09:00:00Z', priceGbp: 30, retailerId: 'allbeauty' }],
      siteLastDay: '2026-10-02',
    });
    expect(html).toContain('data-history-panel="year">');
    const panel = activePanel(html);
    expect(panel).not.toContain('no change recorded');
    expect(panel).not.toContain('history-dot-live');
    // £30 is allbeauty's threshold, met at or above, so free delivery.
    expect(panel.match(/data-price="£30.00 with delivery"/g)?.length).toBe(1);
    expect(html).toContain('data-history-scope="week"\n        aria-pressed="false"\n        disabled');
  });

  it('draws the line through many observations', () => {
    const html = priceHistoryChart({
      ...base,
      line: [
        { at: '2026-09-01T09:00:00Z', priceGbp: 40, retailerId: 'allbeauty' },
        { at: '2026-09-10T09:00:00Z', priceGbp: 38, retailerId: 'perfume-click' },
        { at: '2026-09-20T09:00:00Z', priceGbp: null, retailerId: null },
        { at: '2026-09-25T09:00:00Z', priceGbp: 41, retailerId: 'allbeauty' },
        { at: '2026-10-01T09:00:00Z', priceGbp: 39.5, retailerId: 'perfume-click' },
      ],
      siteLastDay: '2026-10-02',
    });
    expect(html).toContain('data-history-chart');
    // This month is the shortest range holding two readings.
    expect(html).toContain('data-history-panel="month">');
    const panel = activePanel(html);
    expect(linePath(panel).split('M').length - 1).toBe(2); // broken once, across the gap
    expect(panel.match(/history-dot-nodata"/g)?.length ?? 0).toBeGreaterThan(0);
    expect(panel).toContain('history-dot-live');
    expect(html).not.toContain('single reading');
  });

  it('plots older prices as hollow points and says what they are', () => {
    const html = priceHistoryChart({
      ...base,
      line: [{ at: '2026-10-01T09:00:00Z', priceGbp: 32.5, retailerId: 'perfume-click' }],
      older: [{ at: '2026-09-16T09:00:00Z', priceGbp: 28.99, retailerId: 'perfumeo' }],
      siteLastDay: '2026-10-02',
    });
    expect(html).toContain('history-dot-older');
    // Perfumeo always ships free; Perfume Click adds £3.95 to £32.50.
    expect(html).toContain('Older price: £28.99 with delivery at Perfumeo');
    expect(html).toContain('data-price="£36.45 with delivery"');
    expect(html).toContain('Hollow points are older prices, not checked in the last 10 days.');
  });

  it('shows a product nobody can buy as grey sold out points, never as a payable price', () => {
    const html = priceHistoryChart({
      ...base,
      soldOut: [{ at: '2026-10-01T09:00:00Z', priceGbp: 22.99, retailerId: 'manchester-ouds' }],
      siteLastDay: '2026-10-02',
      isCurrentlyPurchasable: false,
    });
    expect(html).toContain('data-history-chart');
    expect(html).toContain('history-dot-soldout');
    expect(html).not.toContain('history-dot-live');
    expect(html).toContain('No price that could be paid has been recorded for this yet.');
  });

  it('names the page as the source when the history has not reached a product yet', () => {
    const html = priceHistoryChart({
      ...base,
      lineSource: 'page',
      line: [{ at: '2026-10-02T09:00:00Z', priceGbp: 19.95, retailerId: 'allbeauty' }],
      siteLastDay: '2026-10-01',
    });
    expect(html).toContain('data-history-chart');
    expect(html).toContain('No earlier price is on record for this yet');
  });

  it('offers an All range once a record is longer than a year, so nothing falls off with age', () => {
    const short = priceHistoryChart({ ...base, line: [{ at: '2026-09-01T09:00:00Z', priceGbp: 40, retailerId: 'allbeauty' }], siteLastDay: '2026-10-02' });
    expect(short).not.toContain('data-history-scope="all"');
    const long = priceHistoryChart({
      ...base,
      line: [
        { at: '2025-06-01T09:00:00Z', priceGbp: 40, retailerId: 'allbeauty' },
        { at: '2026-09-01T09:00:00Z', priceGbp: 38, retailerId: 'allbeauty' },
      ],
      siteLastDay: '2026-10-02',
    });
    expect(long).toContain('data-history-scope="all"');
  });

  it('keeps reader facing text free of hyphens and dashes', () => {
    const html = priceHistoryChart({
      ...base,
      line: [{ at: '2026-10-01T09:00:00Z', priceGbp: 32.5, retailerId: 'perfume-click' }],
      older: [{ at: '2026-09-16T09:00:00Z', priceGbp: 28.99, retailerId: 'perfumeo' }],
      soldOut: [],
      siteLastDay: '2026-10-02',
    });
    const text = html.replace(/<[^>]*>/g, ' ');
    const attrs = [...html.matchAll(/(?:aria-label|data-date|title)="([^"]*)"/g)].map((m) => m[1]).join(' ');
    expect(`${text} ${attrs}`).not.toMatch(/[‐-―-]/);
  });

  it('adds each shop\'s delivery to every point, below its free threshold only', () => {
    const html = priceHistoryChart({
      ...base,
      line: [
        { at: '2026-09-20T09:00:00Z', priceGbp: 25, retailerId: 'allbeauty' },
        { at: '2026-09-25T09:00:00Z', priceGbp: 31, retailerId: 'allbeauty' },
      ],
      siteLastDay: '2026-09-25',
    });
    const panel = activePanel(html);
    expect(panel).toContain('data-price="£27.99 with delivery"');
    expect(panel).toContain('data-price="£31.00 with delivery"');
    expect(panel).not.toContain('history-dot-itemonly');
    expect(html).not.toContain('Square points');
  });

  it('plots an item price where delivery is not stated, as a square point, never as delivered', () => {
    const html = priceHistoryChart({
      ...base,
      line: [
        { at: '2026-09-20T09:00:00Z', priceGbp: 25, retailerId: 'allbeauty' },
        { at: '2026-09-25T09:00:00Z', priceGbp: 24, retailerId: 'manchester-ouds' },
      ],
      siteLastDay: '2026-09-26',
    });
    const panel = activePanel(html);
    expect(panel).toContain('data-price="£24.00, delivery not stated"');
    // The carried day after it is the same item price, so it is square too.
    expect(panel.match(/history-dot-itemonly/g)?.length).toBe(2);
    expect(panel).not.toContain('£24.00 with delivery');
    expect(html).toContain('Square points are item prices only, as that shop does not state its delivery cost.');
  });

  it('says so when no point on the graph includes delivery', () => {
    const html = priceHistoryChart({
      ...base,
      line: [{ at: '2026-09-25T09:00:00Z', priceGbp: 24, retailerId: 'manchester-ouds' }],
      siteLastDay: '2026-09-25',
    });
    expect(html).toContain('No shop here states its delivery cost, so these are bottle prices before delivery.');
    expect(html).not.toContain('worked out at today');
  });

  it('treats a shop with only a free threshold as free above it and unstated below it', () => {
    expect(plottedPrice('fragrancehub', 95, retailers)).toEqual({ priceGbp: 95, deliveryStated: true });
    expect(plottedPrice('fragrancehub', 80, retailers)).toEqual({ priceGbp: 80, deliveryStated: false });
    expect(plottedIncludesDelivery('fragrancehub', 95, retailers)).toBe(true);
    expect(plottedIncludesDelivery('fragrancehub', 80, retailers)).toBe(false);
    // Asking again with a delivered figure gives the same answer as with the item price.
    expect(plottedIncludesDelivery('allbeauty', 27.99, retailers)).toBe(true);
    expect(plottedPrice('not-a-shop', 10, retailers)).toEqual({ priceGbp: 10, deliveryStated: false });
  });

  it('says a gift set graph is of set prices', () => {
    const html = priceHistoryChart({
      ...base,
      isGiftSet: true,
      line: [{ at: '2026-09-25T09:00:00Z', priceGbp: 40, retailerId: 'allbeauty' }],
      siteLastDay: '2026-09-25',
    });
    expect(html).toContain('Each point is a set price plus');
  });
});
