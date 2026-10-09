/**
 * The words, sizes and notes that differ between the UK, the US and India
 * (docs/INTERNATIONAL-PLAN.md sections 4 and 6; owner decision 7 of 9 October
 * 2026: British English everywhere, with US terms only where the meaning
 * changes). Every function here returns exactly what the UK site has always
 * printed when the region is the UK, so no UK page changes by a byte.
 *
 *   - sizes: "100ml" in the UK and India; "3.4 fl oz (100 ml)" in the US,
 *     using the nominal bottle table for the ounces (3.4, not 3.38);
 *   - words: shipping for delivery, "shipped" for a delivered total, MSRP or
 *     MRP for RRP, ZIP code or PIN code for postcode;
 *   - notes: "before sales tax" in the US, GST included and MRP in India, and
 *     India's cash on delivery footnote (a fee never priced in);
 *   - the beta line and the freshness line a beta region's home page shows.
 *
 * Free of the DOM and the catalogue, so the page, the build scripts and the
 * tests read the same words (tests/regionPages.test.ts).
 */
import { activeRegion, type RegionConfig } from '../config/regions.js';

/**
 * US fluid ounces for the bottle sizes US shops label, nominal rather than
 * exact (owner's list of 2026-10-05 in src/catalogue/ounceSizes.ts, read the
 * other way round, plus the small sizes): 100 ml is sold as 3.4 fl oz, not
 * 3.38.
 */
const NOMINAL_OZ_FOR_ML: ReadonlyMap<number, string> = new Map([
  [5, '0.17'],
  [7.5, '0.25'],
  [10, '0.33'],
  [15, '0.5'],
  [30, '1'],
  [35, '1.2'],
  [50, '1.7'],
  [60, '2'],
  [75, '2.5'],
  [80, '2.7'],
  [90, '3'],
  [100, '3.4'],
  [120, '4'],
  [125, '4.2'],
  [150, '5'],
  [200, '6.7'],
]);

/** The US fluid ounce in millilitres (src/catalogue/fragranceId.ts OZ_TO_ML). */
const ML_PER_US_FL_OZ = 29.5735;

/** "3.4" for 100 ml: the nominal label where there is one, else the conversion, two places under an ounce. */
export function fluidOunces(ml: number): string {
  const nominal = NOMINAL_OZ_FOR_ML.get(ml);
  if (nominal) return nominal;
  const oz = ml / ML_PER_US_FL_OZ;
  return String(Number(oz.toFixed(oz < 1 ? 2 : 1)));
}

/** A bottle size as the region writes it: "100ml" (UK, India), "3.4 fl oz (100 ml)" (US). */
export function formatSize(ml: number, region: RegionConfig = activeRegion()): string {
  if (region.units === 'floz-and-ml') return `${fluidOunces(ml)} fl oz (${ml} ml)`;
  return `${ml}ml`;
}

/**
 * A sentence the page prints, with the words that change meaning in this
 * region swapped (owner decision 7). The UK's text comes back untouched.
 * Only for words a reader sees: never run it over markup, where a class name
 * or an address could hold one of these words.
 */
export function localWords(text: string, region: RegionConfig = activeRegion()): string {
  if (region.id === 'GB') return text;
  let t = text;
  if (region.delivery.word === 'shipping') {
    t = t
      .replace(/\bDelivery\b/g, 'Shipping')
      .replace(/\bdelivery\b/g, 'shipping')
      .replace(/\bDelivered\b/g, 'Shipped')
      .replace(/\bdelivered\b/g, 'shipped');
  }
  if (region.referencePriceName !== 'RRP') t = t.replace(/\bRRP\b/g, region.referencePriceName);
  if (region.delivery.postcodeWord !== 'postcode') {
    t = t.replace(/\bpostcode\b/g, region.delivery.postcodeWord).replace(/\bPostcode\b/g, region.delivery.postcodeWord.replace(/^./, (c) => c.toUpperCase()));
  }
  return t.replace(/\bUK shops\b/g, `${region.shopsAdjective} shops`).replace(/\bUK Shops\b/g, `${region.shopsAdjective} Shops`);
}

/**
 * The line under a region's prices: what the shelf price includes (plan
 * section 4). Null for the UK, whose prices include VAT as every UK shelf
 * price does and whose pages have never carried such a line.
 */
export function priceTaxNote(region: RegionConfig = activeRegion()): string | null {
  switch (region.taxModel) {
    case 'sales-tax-at-checkout':
      return 'Prices are before sales tax. Sales tax is added at checkout and depends on your state and ZIP code.';
    case 'gst-included-mrp':
      return 'Prices include GST. MRP is the maximum retail price printed on the pack, and no shop may charge more.';
    case 'vat-included':
      return null;
  }
}

/** The short label beside a total: "before sales tax" in the US, "incl. GST" in India, nothing in the UK. */
export function totalTaxLabel(region: RegionConfig = activeRegion()): string {
  switch (region.taxModel) {
    case 'sales-tax-at-checkout':
      return 'before sales tax';
    case 'gst-included-mrp':
      return 'incl. GST';
    case 'vat-included':
      return '';
  }
}

/** India: a cash on delivery fee is a footnote, never priced in (plan section 4). Null elsewhere. */
export function codFootnote(region: RegionConfig = activeRegion()): string | null {
  return region.delivery.codFootnote ? 'Cash on delivery fees, where a shop charges one, are not included in these prices.' : null;
}

/** The line a beta region's pages carry under the header. Null for a region that is not in beta. */
export function betaLine(region: RegionConfig = activeRegion()): string | null {
  return region.beta ? `${region.shopsAdjective} prices are in beta: fewer shops than the UK site for now.` : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A day as the region writes it: "9 Oct 2026" in the UK and India, "Oct 9,
 * 2026" in the US (plan section 6). Read from the ISO date's own digits, so
 * the day never shifts with the reader's time zone.
 */
export function regionDate(iso: string, region: RegionConfig = activeRegion()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return iso;
  const day = Number(m[3]);
  return region.locale === 'en-US' ? `${month} ${day}, ${m[1]}` : `${day} ${month} ${m[1]}`;
}

/** The home page's freshness line for a region, read from the time its prices were last read. */
export function freshnessLine(crawledAt: string, region: RegionConfig = activeRegion()): string {
  return `Prices checked daily. Last checked ${regionDate(crawledAt, region)}.`;
}
