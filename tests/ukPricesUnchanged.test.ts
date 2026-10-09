import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_REGION } from '../src/config/regions.js';
import { formatGbp, formatMoney, formatMoneyFine, formatMoneyShort, roundPence } from '../src/services/money.js';
import { RETAILERS } from '../src/config/retailers.js';

/**
 * Every UK price prints exactly as it did before the region config
 * (docs/INTERNATIONAL-PLAN.md, Phase 0: "the UK site must look and behave
 * exactly the same"). The old code wrote prices by hand; these are those
 * exact expressions, kept here as the reference, and every price the site
 * holds is run through both:
 *
 * - every price and was price in the catalogue, the deals and the price
 *   history (demo/*.generated.ts, read as text so the test stays light);
 * - every one of those plus every delivery charge in the registry, as the
 *   delivered totals the rows print;
 * - every amount in the registry's delivery terms, as the sentences print them;
 * - every penny from £0.00 to £2,000.00, and the awkward floats.
 *
 * The built page half (a sample of pages rendered before and after, compared
 * byte for byte) is recorded in docs/INTERNATIONAL-PLAN.md, Phase 0, and the
 * page test tests/ukPricesBrowser.test.ts checks every price shown on a set
 * of UK pages still has the old shape.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What src/services/money.ts formatGbp returned before the region config. */
const legacyFormatGbp = (gbp: number): string => `£${roundPence(gbp).toFixed(2)}`;
/** What demo/legal.ts and demo/deliveryFacts.ts wrote for an amount in a sentence. */
const legacyShort = (v: number): string => (Number.isInteger(v) ? `£${v}` : `£${v.toFixed(2)}`);
/** What demo/tabFacets.ts wrote for a price per ml. */
const legacyPerMl = (perMl: number): string => `£${perMl.toFixed(perMl < 0.1 ? 3 : 2)}`;

function pricesIn(file: string, keys: string): number[] {
  const text = readFileSync(resolve(root, file), 'utf8');
  const re = new RegExp(`"(?:${keys})":\\s*(-?[0-9]+(?:\\.[0-9]+)?)`, 'g');
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

/** Every number under a key ending in Gbp in a retailer's shipping terms. */
function gbpAmounts(value: unknown, out: number[] = []): number[] {
  if (Array.isArray(value)) value.forEach((v) => gbpAmounts(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/Gbp$/.test(k) && typeof v === 'number') out.push(v);
      else gbpAmounts(v, out);
    }
  }
  return out;
}

const catalogue = pricesIn('demo/catalogue.generated.ts', 'price|wasPrice');
const deals = pricesIn('demo/deals.generated.ts', 'price|wasPrice');
const history = pricesIn('demo/priceHistory.generated.ts', 'priceGbp');
const delivery = [...new Set(RETAILERS.flatMap((r) => gbpAmounts(r.shipping)))];

describe('UK prices print exactly as before', () => {
  it('reads the prices it checks', () => {
    expect(catalogue.length).toBeGreaterThan(10_000);
    expect(deals.length).toBeGreaterThan(100);
    expect(history.length).toBeGreaterThan(1_000);
    expect(delivery.length).toBeGreaterThan(5);
  });

  it('every catalogue, deal and price history price', () => {
    const bad: string[] = [];
    for (const p of new Set([...catalogue, ...deals, ...history])) {
      const now = formatMoney(p);
      if (now !== legacyFormatGbp(p)) bad.push(`${p}: ${now} was ${legacyFormatGbp(p)}`);
      if (formatMoney(p, DEFAULT_REGION) !== now || formatGbp(p) !== now) bad.push(`${p}: regions disagree`);
    }
    expect(bad).toEqual([]);
  });

  it('every delivered total: each price plus each delivery charge in the registry', () => {
    const prices = [...new Set([...catalogue, ...deals])];
    let checked = 0;
    const bad: string[] = [];
    for (const p of prices) {
      for (const d of delivery) {
        const total = roundPence(p + d);
        if (formatMoney(total) !== legacyFormatGbp(total)) bad.push(`${p} + ${d}`);
        checked++;
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  });

  it('every delivery amount in a sentence ("free over £50", "£3.95")', () => {
    for (const d of delivery) expect(formatMoneyShort(d), String(d)).toBe(legacyShort(d));
  });

  it('every penny from £0.00 to £2000.00, and the awkward floats', () => {
    const bad: number[] = [];
    for (let pence = 0; pence <= 200_000; pence++) {
      const v = pence / 100;
      if (formatMoney(v) !== legacyFormatGbp(v)) bad.push(v);
      if (formatMoneyShort(v) !== legacyShort(v)) bad.push(v);
    }
    for (const v of [62.949999999999996, 0.1 + 0.2, 29.55 + 2.95, 1.005, 2.675, 1e-9, -0, -0.004, -4, 12345.678, 99999.995]) {
      if (formatMoney(v) !== legacyFormatGbp(v)) bad.push(v);
    }
    expect(bad).toEqual([]);
  });

  it('the price band labels and the alert threshold', () => {
    expect([25, 50, 100, 200].map((v) => formatMoneyShort(v))).toEqual(['£25', '£50', '£100', '£200']);
    expect(formatMoneyShort(2)).toBe('£2');
    expect(formatMoney(82.5)).toBe('£82.50');
  });

  it('every price per ml', () => {
    const bad: number[] = [];
    for (let i = 1; i <= 50_000; i++) {
      const perMl = i / 7919;
      if (`${formatMoneyFine(perMl, perMl < 0.1 ? 3 : 2)}` !== legacyPerMl(perMl)) bad.push(perMl);
    }
    expect(bad).toEqual([]);
  });
});
