import { describe, expect, it } from 'vitest';
import { priceHistoryChart, shortDate, type PriceHistoryChartInput } from '../demo/priceHistoryChart.js';

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
    expect(panel).toContain('data-price="£42.50"');
    // No line to draw between one point and nothing.
    expect(linePath(panel)).toBe('');
    expect(html).toContain('One price recorded so far, so this is a single reading rather than a trend.');
    expect(html).toContain('Bottle prices, before delivery.');
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
    expect(panel.match(/data-price="£30.00"/g)?.length).toBe(1);
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
    expect(html).toContain('Older price: £28.99 at Perfumeo');
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
});
