import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEALS, DEMO_FRAGRANCES } from '../demo/data.js';
import { offersFor } from '../demo/catalogue.generated.js';
import { buildComparison, bestOffer } from '../src/services/priceService.js';
import { cannotCarryBrand } from '../src/config/retailers.js';
import { msrpComparison, rrpSavingFor, shownPrice } from '../demo/msrpComparison.js';
import type { PresentedOffer } from '../src/types/offer.js';

/**
 * Every product in the built catalogue, every offer row and the headline
 * boxes: no label may call a displayed price "below" (or "off") a reference
 * it is actually at or above, and every percentage must be the one the two
 * printed figures give. The 3 Oct 2026 report (French Avenue Azzure Aoud,
 * £32.50 delivered labelled "1% below MSRP" against £30) is the failure this
 * guards, checked across the whole catalogue rather than one fixture.
 *
 * The figure a row prints is recomputed here from the raw fields, the same
 * expression offerRow prints (`deliveredPriceGbp ?? itemPriceGbp`), rather
 * than taken from `shownPrice`, so the check is not the code marking its own
 * homework; the percentages are recomputed in whole pence independently too.
 */

/** offerRow's printed figure, worked out independently of shownPrice. */
const printed = (r: PresentedOffer) => (r.deliveredPriceGbp !== null ? r.deliveredPriceGbp : r.itemPriceGbp);
const pence = (gbp: number) => Math.round(gbp * 100);
const floorPercent = (gap: number, of: number) => Math.floor((pence(gap) * 100) / pence(of));

interface RowLabel {
  kind: 'msrp' | 'rrp';
  direction: 'below' | 'above';
  percent: number;
  reference: number;
}

/** What the product page labels one row with — the same decision offerRow makes. */
function labelFor(row: PresentedOffer, houseCeiling: number | null, brand: string, mayNameMsrp: boolean): RowLabel | null {
  const isHouseRow = Boolean(row.retailer.singleBrandOnly) && !cannotCarryBrand(row.retailer, brand);
  const m = mayNameMsrp && houseCeiling !== null && !isHouseRow ? msrpComparison(shownPrice(row).amountGbp, houseCeiling) : null;
  if (m) return { kind: 'msrp', direction: m.direction, percent: m.percent, reference: houseCeiling! };
  const d = rrpSavingFor(row);
  return d ? { kind: 'rrp', direction: 'below', percent: d.percentOff, reference: d.wasPrice } : null;
}

describe('every reference comparison in the built catalogue', () => {
  const offenders: string[] = [];
  let labelled = 0;
  let above = 0;
  let headlineChecked = 0;
  const rowsById = new Map<string, PresentedOffer[]>();

  for (const f of DEMO_FRAGRANCES) {
    const rows = buildComparison(offersFor(f.id), { sortBy: 'delivered' });
    rowsById.set(f.id, rows);
    const best = bestOffer(rows);
    for (const row of rows) {
      const label = labelFor(row, f.houseCeiling, f.brand, best !== null);
      if (!label) continue;
      labelled++;
      const shown = printed(row);
      const where = `${f.id} @ ${row.retailer.id}: shows ${shown} vs ${label.kind} ${label.reference}`;
      if (label.direction === 'below') {
        if (!(pence(shown) < pence(label.reference))) offenders.push(`${where} labelled ${label.percent}% below`);
        else if (label.percent !== floorPercent(label.reference - shown, label.reference))
          offenders.push(`${where} labelled ${label.percent}%, figures give ${floorPercent(label.reference - shown, label.reference)}%`);
      } else {
        above++;
        if (label.kind !== 'msrp') offenders.push(`${where} an RRP is never stated as above`);
        if (!(pence(shown) > pence(label.reference))) offenders.push(`${where} labelled ${label.percent}% above`);
        else if (label.percent !== floorPercent(shown - label.reference, label.reference))
          offenders.push(`${where} labelled ${label.percent}% above, figures give ${floorPercent(shown - label.reference, label.reference)}%`);
      }
      if (label.percent < 1) offenders.push(`${where} labelled 0%`);
      // The cheapest box prints the best row's figure under the MSRP box; if
      // that row says "below", the box's figure must really be below.
      if (row === best && label.kind === 'msrp') {
        headlineChecked++;
        const boxFigure = best.deliveredPriceGbp ?? best.itemPriceGbp;
        if (label.direction === 'below' && !(boxFigure < label.reference))
          offenders.push(`${f.id}: cheapest box ${boxFigure} is not below MSRP ${label.reference}`);
      }
    }
  }

  it('has real comparisons to check, in both directions', () => {
    expect(labelled).toBeGreaterThan(1000);
    expect(above).toBeGreaterThan(0);
    expect(headlineChecked).toBeGreaterThan(0);
  });

  it('never labels a displayed price below a reference it is at or above', () => {
    expect(offenders).toEqual([]);
  });

  it('states every deal on the figure its product page row prints', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const d of DEALS) {
      if (!(d.price < d.wasPrice)) bad.push(`${d.fragrance.id}: deal ${d.price} not below ${d.wasPrice}`);
      if (d.percentOff < 1 || d.percentOff !== floorPercent(d.wasPrice - d.price, d.wasPrice))
        bad.push(`${d.fragrance.id}: ${d.percentOff}% from ${d.price} vs ${d.wasPrice}`);
      const row = (rowsById.get(d.fragrance.id) ?? []).find((r) => r.retailer.id === d.retailerId && pence(printed(r)) === pence(d.price));
      // A row can have moved off the page since the snapshot (too old to
      // show); everything still on it must agree with the deal.
      if (!row) continue;
      checked++;
      if (d.delivered !== (row.deliveredPriceGbp !== null)) bad.push(`${d.fragrance.id}: delivered flag disagrees with the row`);
      const label = labelFor(row, d.fragrance.houseCeiling, d.fragrance.brand, true);
      if (d.kind === 'house' && !(label?.kind === 'msrp' && label.direction === 'below' && label.percent === d.percentOff))
        bad.push(`${d.fragrance.id} @ ${d.retailerId}: deal ${d.percentOff}% below house, row says ${JSON.stringify(label)}`);
      if (d.kind === 'retailer' && label?.kind === 'rrp' && label.percent !== d.percentOff)
        bad.push(`${d.fragrance.id} @ ${d.retailerId}: deal ${d.percentOff}% off, row says ${label.percent}%`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('is the decision demo/app.ts actually renders with', () => {
    // app.ts cannot be imported in Node (it calls init() on load), so this
    // pins the two call sites the sweep above stands in for.
    const app = readFileSync(new URL('../demo/app.ts', import.meta.url), 'utf8');
    expect(app).toContain('msrpComparison(shownPrice(row).amountGbp, frag.houseCeiling)');
    expect(app).toContain('const d = msrp ? null : rrpSavingFor(row);');
    expect(app).not.toMatch(/msrpComparison\(row\.itemPriceGbp/);
  });
});
