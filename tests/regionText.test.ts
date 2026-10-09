import { describe, expect, it } from 'vitest';
import { regionById } from '../src/config/regions.js';
import { formatMoney, formatMoneyShort } from '../src/services/money.js';
import {
  betaLine, codFootnote, fluidOunces, formatSize, freshnessLine, localWords, priceTaxNote, regionDate, totalTaxLabel,
} from '../src/services/regionText.js';
import { menuName } from '../src/services/regions.js';
import { regionShipping, regionShopAsRetailer, regionShopsAsRetailers } from '../src/config/regionShops.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { deliveryLines } from '../demo/deliveryFacts.js';

/**
 * Money, sizes and words per region (docs/INTERNATIONAL-PLAN.md sections 4
 * and 6; owner decision 7: British English with US terms where the meaning
 * changes). The UK's text must come back exactly as it always was.
 */

const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;

describe('money strings', () => {
  it('writes dollars with a thousands separator, rupees whole with Indian grouping, pounds as always', () => {
    expect(formatMoney(1299, US)).toBe('$1,299.00');
    expect(formatMoney(46.94, US)).toBe('$46.94');
    expect(formatMoney(4293, IN)).toBe('₹4,293');
    expect(formatMoney(123450, IN)).toBe('₹1,23,450');
    expect(formatMoney(1299, GB)).toBe('£1299.00');
    expect(formatMoneyShort(59, US)).toBe('$59');
    expect(formatMoneyShort(499, IN)).toBe('₹499');
  });
});

describe('sizes', () => {
  it('writes US sizes as fluid ounces beside millilitres, the nominal bottle label, and the UK and India in ml', () => {
    expect(formatSize(100, US)).toBe('3.4 fl oz (100 ml)');
    expect(formatSize(75, US)).toBe('2.5 fl oz (75 ml)');
    expect(formatSize(50, US)).toBe('1.7 fl oz (50 ml)');
    expect(formatSize(30, US)).toBe('1 fl oz (30 ml)');
    expect(formatSize(10, US)).toBe('0.33 fl oz (10 ml)');
    expect(formatSize(100, GB)).toBe('100ml');
    expect(formatSize(100, IN)).toBe('100ml');
    expect(formatSize(7.5, GB)).toBe('7.5ml');
  });

  it('converts a size with no nominal label exactly, to one place, or two under an ounce', () => {
    expect(fluidOunces(250)).toBe('8.5');
    expect(fluidOunces(25)).toBe('0.85');
    expect(fluidOunces(40)).toBe('1.4');
  });
});

describe('words', () => {
  it('leaves every UK sentence untouched', () => {
    for (const s of ['Delivery Not Stated', 'Incl. £3.99 delivery', 'RRP £50.00', 'from £20.00 delivered', 'Standard delivery £3.95', 'More Than 50 UK Shops']) {
      expect(localWords(s, GB)).toBe(s);
    }
  });

  it('says shipping, shipped and MSRP in the US, and US shops', () => {
    expect(localWords('Delivery Not Stated', US)).toBe('Shipping Not Stated');
    expect(localWords('Incl. est. $4.99 delivery', US)).toBe('Incl. est. $4.99 shipping');
    expect(localWords('from $20.00 delivered', US)).toBe('from $20.00 shipped');
    expect(localWords('RRP $50.00', US)).toBe('MSRP $50.00');
    expect(localWords('across more than 10 UK shops, delivery included', US)).toBe('across more than 10 US shops, shipping included');
    expect(localWords('Enter your postcode', US)).toBe('Enter your ZIP code');
  });

  it('keeps delivery in India, with MRP, PIN code and Indian shops', () => {
    expect(localWords('Delivery Not Stated', IN)).toBe('Delivery Not Stated');
    expect(localWords('RRP ₹2,500', IN)).toBe('MRP ₹2,500');
    expect(localWords('Postcode', IN)).toBe('PIN code');
    expect(localWords('More Than 10 UK Shops', IN)).toBe('More Than 10 Indian Shops');
  });

  it('notes what the price includes: before sales tax in the US, GST and MRP in India, nothing in the UK', () => {
    expect(priceTaxNote(US)).toBe('Prices are before sales tax. Sales tax is added at checkout and depends on your state and ZIP code.');
    expect(priceTaxNote(IN)).toContain('Prices include GST.');
    expect(priceTaxNote(IN)).toContain('MRP');
    expect(priceTaxNote(GB)).toBeNull();
    expect(totalTaxLabel(US)).toBe('before sales tax');
    expect(totalTaxLabel(IN)).toBe('incl. GST');
    expect(totalTaxLabel(GB)).toBe('');
    expect(codFootnote(IN)).toContain('Cash on delivery');
    expect(codFootnote(US)).toBeNull();
    expect(codFootnote(GB)).toBeNull();
  });

  it('marks the beta regions, in the menu and in a line under the header, and dates each region\'s way', () => {
    expect(betaLine(US)).toBe('US prices are in beta: fewer shops than the UK site for now.');
    expect(betaLine(IN)).toBe('Indian prices are in beta: fewer shops than the UK site for now.');
    expect(betaLine(GB)).toBeNull();
    expect([GB, US, IN].map(menuName)).toEqual(['United Kingdom', 'United States (Beta)', 'India (Beta)']);
    expect(regionDate('2026-10-09T06:27:43.741Z', US)).toBe('Oct 9, 2026');
    expect(regionDate('2026-10-09', IN)).toBe('9 Oct 2026');
    expect(freshnessLine('2026-10-09T06:27:43.741Z', US)).toBe('Prices checked daily. Last checked Oct 9, 2026.');
    // The site's copy rule: no hyphens or dashes in what a reader sees.
    for (const s of [betaLine(US)!, betaLine(IN)!, priceTaxNote(US)!, priceTaxNote(IN)!, codFootnote(IN)!]) expect(s).not.toMatch(/[-‐-―−]/);
  });
});

describe('the region shops as the page reads them (src/config/regionShops.ts)', () => {
  it('carry no affiliate programme, a hot-linked photo basis (D24, answered 9 Oct 2026) and no logo', () => {
    for (const region of ['US', 'IN'] as const) {
      const shops = regionShopsAsRetailers(region);
      expect(shops.length).toBe(REGION_RETAILERS[region].length);
      for (const r of shops) {
        expect(r.affiliate.network, r.id).toBeNull();
        expect(r.affiliate.deeplinkTemplate, r.id).toBeNull();
        expect(r.affiliate.imageBasis, r.id).toBe('hotlink-unlicensed');
        expect(r.logo, r.id).toBeUndefined();
      }
    }
  });

  it('carry the shop\'s own delivery in its own currency, and a window it does not state as not stated', () => {
    const perfumania = REGION_RETAILERS.US.find((r) => r.id === 'perfumania')!;
    expect(regionShipping(perfumania)).toMatchObject({ standardGbp: 6.95, freeOverGbp: 59, estimatedDays: [4, 8], confidence: 'confirmed' });
    const unstated = REGION_RETAILERS.US.find((r) => r.delivery.estimatedDays === null)!;
    const shop = regionShopAsRetailer(unstated);
    expect(shop.shipping.estimatedDays).toEqual([0, 0]);
    expect(deliveryLines(shop).some((l) => l.startsWith('Arrives in'))).toBe(false);
  });
});
