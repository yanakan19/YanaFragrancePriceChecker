import { describe, expect, it } from 'vitest';
import { concentration, concentrationOfStoredListing, displayName } from '../src/catalogue/productName.js';
import { sizeMl } from '../src/catalogue/fragranceId.js';
import { nominalMlForOz, ouncesStated, resolveOunceListing, withoutAudienceLabel, type KnownSizes } from '../src/catalogue/ounceSizes.js';

/**
 * YSL naming (found by the photos agent, 2026-10-05). Every title is a stored
 * row from data/catalogue/<shop>.json read that day.
 */
const stored = (retailerId: string, rawTitle: string, productType: string | null = null) => ({ rawTitle, description: null, retailerId, productType, rawBrand: 'Yves Saint Laurent' });

describe('a shop category label is not the strength', () => {
  it("Perfume Direct's \"Men's Aftershave Spray\" does not make a Le Parfum an Aftershave", () => {
    const l = stored('perfume-direct', "YSL MYSLF Le Parfum Men's Aftershave Spray (60ml) 60ml", "Men's Aftershave");
    expect(concentration(l.rawTitle)).toBe('Aftershave');
    expect(concentrationOfStoredListing(l)).toBe('Not stated');
  });

  it('keeps the strength a title states beside the label', () => {
    expect(concentrationOfStoredListing(stored('perfume-direct', "Dolce & Gabbana Light Blue Pour Homme Eau de Toilette Men's Aftershave Spray (50ml) 50ml"))).toBe('Eau de Toilette');
  });

  it('keeps Aftershave where it is the product', () => {
    expect(concentrationOfStoredListing(stored('perfume-direct', "Joop! Homme Men's Aftershave Splash (75ml) 75ml"))).toBe('Aftershave');
    expect(concentrationOfStoredListing(stored('perfume-direct', 'Joop! Homme Aftershave Splash 75ml'))).toBe('Aftershave');
  });

  it("never reads another shop's words as a label", () => {
    expect(concentrationOfStoredListing(stored('mybeauty-boutique', "Davidoff Cool Water Man Men's Aftershave 75ml"))).toBe('Aftershave');
  });
});

describe('MYSLF is the name, "for Men" is a shop label', () => {
  const name = (title: string, brand = 'Yves Saint Laurent') => displayName(title, brand, 'Yves Saint Laurent');

  it.each([
    ['Yves Saint Laurent Myslf Eau De Parfum for Men 100ml'],
    ['Yves Saint Laurent Myslf For Men 100ml EDP Refillable Spray'],
    ['Yves Saint Laurent Myslf Eau De Parfum for Men Refill 150ml'],
  ])('%s is Myslf', (title) => {
    expect(name(title).toLowerCase()).toBe(title.includes('Refill 150') ? 'myslf refill' : 'myslf');
  });

  it('keeps "for Men" where it tells two bottles apart or is the house name', () => {
    expect(name('Calvin Klein Obsession For Men Eau de Toilette 125ml', 'Calvin Klein')).toMatch(/for men/i);
    expect(name('Yves Saint Laurent Y for Men Le Parfum 100ml')).toMatch(/for men/i);
    expect(name('Dior Sauvage For Men Eau de Parfum 100ml', 'Dior')).toMatch(/for men/i);
  });
});

describe('US ounce titles take the nominal size only on evidence', () => {
  const key = (n: string) => `ysl|${n.toLowerCase()}`;
  const known: KnownSizes = {
    byName: new Map([
      [key('Black Opium'), new Set([30, 50, 90])],
      [key('Y by Ysl'), new Set([60, 100, 200])],
      [key('Libre'), new Set([30, 50, 90])],
      [key('Obsession For Men'), new Set([125])],
    ]),
    byEan: new Map([['3614272648425', new Set([90])]]),
  };
  const resolve = (title: string, name: string, ean: string | null = null) => resolveOunceListing({ title, name, ean, nameKey: key, known });

  it('maps the standard ounce sizes', () => {
    expect([1, 1.7, 2, 3, 3.3, 3.4, 4.2, 5, 6.7].map((oz) => nominalMlForOz(oz))).toEqual([30, 50, 60, 90, 100, 100, 125, 150, 200]);
    expect(nominalMlForOz(0.34)).toBeNull();
    expect(nominalMlForOz(4)).toBeNull();
  });

  it('3 oz is the 90ml where the same product is sold at 90ml', () => {
    expect(sizeMl('Ysl Black Opium 3 Oz')).toBe(89);
    expect(resolve('Ysl Black Opium 3 Oz', 'Black Opium')).toMatchObject({ sizeMl: 90, name: 'Black Opium' });
  });

  it('takes the label off with it where the label free name is the product found', () => {
    expect(sizeMl('Y By Ysl 2 Oz For Men')).toBe(59);
    expect(resolve('Y By Ysl 2 Oz For Men', 'Y by Ysl For Men')).toMatchObject({ sizeMl: 60, name: 'Y by Ysl' });
    expect(resolve('Ysl Libre 1 Oz For Women', 'Libre For Women')).toMatchObject({ sizeMl: 30 });
  });

  it('keeps a name that is itself a product at that size', () => {
    expect(resolve('Calvin Klein Obsession 4.2 Oz For Men', 'Obsession For Men')).toMatchObject({ sizeMl: 125, name: 'Obsession For Men' });
    expect(resolve('Calvin Klein Obsession 125ml', 'Obsession For Men')).toBeNull();
  });

  it('keeps the converted size where the house does not sell the nominal one', () => {
    expect(resolve('Ysl Black Opium 2 Oz', 'Black Opium')).toBeNull();
    expect(resolve('Ysl Black Opium 5 Oz', 'Black Opium')).toBeNull();
  });

  it('keeps the converted size for a non standard ounce size and for a title that states ml', () => {
    expect(resolve('Ysl Black Opium 0.34 Oz', 'Black Opium')).toBeNull();
    expect(ouncesStated('Ysl Black Opium 90ml (3 oz)')).toBeNull();
  });

  it('uses a barcode where the listing has one', () => {
    expect(resolve('Ysl Libre Eau De Parfum 3 Oz', 'Libre Eau', '3614272648425')).toMatchObject({ sizeMl: 90, evidence: 'barcode' });
    expect(resolve('Ysl Libre Eau De Parfum 1 Oz', 'Libre Eau', '3614272648425')).toBeNull();
  });

  it('only a trailing For Men or For Women is a label', () => {
    expect(withoutAudienceLabel('Y by Ysl For Men')).toBe('Y by Ysl');
    expect(withoutAudienceLabel('For Her Cocktail')).toBeNull();
    expect(withoutAudienceLabel('Pour Homme')).toBeNull();
  });
});

describe('an ounce size is not part of the name, and is read whole', () => {
  it.each([
    ['Ysl Black Opium 3 Oz', 'Ysl Black Opium'],
    ['Y By Ysl 2 Oz For Men', 'Y By Ysl For Men'],
    ['Ysl Libre 1 Oz For Women', 'Ysl Libre For Women'],
  ])('%s', (title, expected) => {
    expect(displayName(title, 'Yves Saint Laurent', 'Yves Saint Laurent').replace(/^Ysl /i, 'Ysl ')).toBe(expected);
  });

  it('reads a decimal ounce size from its first digit, not from its tail', () => {
    expect(sizeMl('Dana Canoe 0.17oz Eau De Parfum')).toBe(5);
    expect(sizeMl('Some Scent 3.25oz Eau De Parfum')).toBe(96);
    expect(sizeMl('Some Scent 2.75oz Eau De Parfum')).toBe(81);
    expect(sizeMl('Ysl Libre 1.7 Oz')).toBe(50);
    expect(sizeMl('Ysl Libre 100ml')).toBe(100);
  });
});
