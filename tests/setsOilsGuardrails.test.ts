import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { BY_POPULARITY, DEALS, DEMO_FRAGRANCES, type DemoFragrance } from '../demo/data.js';
import { rankedInMostStocked } from '../demo/mostStocked.js';
import { eligibleForBottlePosts, isOil, isSet, productKind } from '../demo/productKind.js';
import { dealFor } from '../scripts/social-deal-of-day.js';
import {
  barcodeViolations,
  listingViolations,
  namespaceViolations,
  type KindedProduct,
} from '../src/catalogue/kindGuards.js';
import { matchKey } from '../src/catalogue/productMatch.js';
import { isOilStrength } from '../src/catalogue/perfumeOil.js';

const root = resolve(import.meta.dirname, '..');

/**
 * docs/GIFT-SETS-AND-OILS-PLAN.md, section 4.1: no set or oil ever merges with a
 * bottle. Each guard is held on the real catalogue and, so that a guard that
 * cannot fail is not mistaken for one that holds, on a deliberately broken
 * fixture as well.
 */

const kinded = (f: DemoFragrance): KindedProduct => ({ id: f.id, ean: f.ean, concentration: f.concentration, giftSet: f.giftSet });
const all = DEMO_FRAGRANCES.map(kinded);

const bottle: KindedProduct = { id: 'ean-111', ean: '111', concentration: 'Eau de Parfum', giftSet: null };
const aSet: KindedProduct = { id: 'set-ean-222', ean: '222', concentration: 'Eau de Parfum', giftSet: { contents: null, title: 'x' } };
const anOil: KindedProduct = { id: 'ean-333', ean: '333', concentration: 'Perfume Oil', giftSet: null };

describe('the three kinds of product', () => {
  it('are told apart by one function, and every product is exactly one kind', () => {
    const counts = { bottle: 0, set: 0, oil: 0 };
    for (const f of DEMO_FRAGRANCES) counts[productKind(f)] += 1;
    expect(counts.bottle + counts.set + counts.oil).toBe(DEMO_FRAGRANCES.length);
    expect(counts.set).toBe(DEMO_FRAGRANCES.filter((f) => f.giftSet !== null).length);
    expect(counts.oil).toBe(DEMO_FRAGRANCES.filter((f) => f.giftSet === null && isOilStrength(f.concentration)).length);
    expect(counts.set).toBeGreaterThan(1000);
    expect(counts.oil).toBeGreaterThan(100);
    expect(counts.bottle).toBeGreaterThan(10000);
  });

  it('call a set that holds an oil a set, never both', () => {
    const both = DEMO_FRAGRANCES.filter((f) => f.giftSet !== null && f.concentration === 'Perfume Oil');
    for (const f of both) {
      expect(isSet(f)).toBe(true);
      expect(isOil(f)).toBe(false);
    }
  });
});

describe('an attar', () => {
  it('is an oil everywhere an oil is: its kind, Most Stocked and the bottle posts', () => {
    const attar = { concentration: 'Attar', giftSet: null };
    expect(productKind(attar)).toBe('oil');
    expect(isOil(attar)).toBe(true);
    expect(rankedInMostStocked(attar)).toBe(false);
    expect(eligibleForBottlePosts(attar)).toBe(false);
  });
});

describe('guard 1: the set namespace', () => {
  it('holds on the real catalogue: every set has a set- id, every set- id is a set, no id twice', () => {
    expect(namespaceViolations(all)).toEqual([]);
  });

  it('holds in the shipped file itself, not only in what the page derives from it', () => {
    const setIds = CATALOGUE.filter((c) => c.giftSet).map((c) => c.id);
    expect(setIds.length).toBeGreaterThan(1000);
    expect(setIds.every((id) => id.startsWith('set-'))).toBe(true);
    expect(CATALOGUE.filter((c) => c.id.startsWith('set-')).length).toBe(setIds.length);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
  });

  it('fails when a set is given a bottle id, or a bottle a set id, or an id is used twice', () => {
    expect(namespaceViolations([bottle, { ...aSet, id: 'ean-222' }])).toHaveLength(1);
    expect(namespaceViolations([{ ...bottle, id: 'set-ean-111' }])).toHaveLength(1);
    expect(namespaceViolations([bottle, { ...bottle }])).toHaveLength(1);
    expect(namespaceViolations([bottle, aSet, anOil])).toEqual([]);
  });
});

describe('guard 2: barcodes', () => {
  it('holds on the real catalogue: no barcode is on a set and another kind, or on an oil and a bottle', () => {
    expect(barcodeViolations(all)).toEqual([]);
  });

  it('fails when a set carries a bottle barcode, or an oil does', () => {
    expect(barcodeViolations([bottle, { ...aSet, ean: '111' }])).toHaveLength(1);
    expect(barcodeViolations([bottle, { ...anOil, ean: '111' }])).toHaveLength(1);
    expect(barcodeViolations([aSet, { ...anOil, ean: '222' }])).toHaveLength(1);
  });

  it('lets two products of one kind share a barcode: that is the matcher business, not this rule', () => {
    expect(barcodeViolations([bottle, { ...bottle, id: 'ean-111b' }])).toEqual([]);
  });
});

describe('guard 3: the strength keeps an oil apart from a bottle', () => {
  const base = { id: 'x', brand: 'Lattafa', name: 'Yara', sizeMl: 12, ean: null };

  it('is in the match key: an oil and a spray of the same name and size never share one', () => {
    expect(matchKey({ ...base, concentration: 'Perfume Oil' })).not.toBe(matchKey({ ...base, concentration: 'Eau de Parfum' }));
    expect(matchKey({ ...base, concentration: 'Perfume Oil' })).toBe(matchKey({ ...base, concentration: 'perfume oil' }));
  });

  it('keeps a set with no size from sharing a key with anything else', () => {
    const a = matchKey({ ...base, id: 'set-a', sizeMl: null, concentration: 'Eau de Parfum' });
    const b = matchKey({ ...base, id: 'set-b', sizeMl: null, concentration: 'Eau de Parfum' });
    expect(a).not.toBe(b);
  });

  it('holds on the real catalogue: no bottle carries the oil strength and no oil carries a set record', () => {
    expect(DEMO_FRAGRANCES.filter((f) => productKind(f) === 'bottle' && isOilStrength(f.concentration))).toEqual([]);
    expect(DEMO_FRAGRANCES.filter((f) => productKind(f) === 'oil' && f.giftSet !== null)).toEqual([]);
  });
});

describe('guard 4: no stored listing feeds two products', () => {
  const offer = (retailerId: string, listingSku: string) => ({ retailerId, listingSku });

  it('fails on a listing in two products, and not on one product with a bottle and a set at one shop', () => {
    expect(listingViolations([{ id: 'a', offers: [offer('s', '1')] }, { id: 'b', offers: [offer('s', '1')] }])).toHaveLength(1);
    // The Nicchia shape: two listings of one shop, one a bottle and one a set, are two products.
    expect(listingViolations([{ id: 'a', offers: [offer('nicchia', '1')] }, { id: 'set-b', offers: [offer('nicchia', '2')] }])).toEqual([]);
    // The same SKU at two shops is two listings.
    expect(listingViolations([{ id: 'a', offers: [offer('s', '1')] }, { id: 'b', offers: [offer('t', '1')] }])).toEqual([]);
  });

  it('is checked by the build, which refuses to write a catalogue that breaks it', () => {
    const build = readFileSync(resolve(root, 'scripts/build-demo-catalogue.ts'), 'utf8');
    expect(build).toContain('listingViolations(ordered)');
    expect(build).toContain('namespaceViolations(ordered)');
    expect(build).toContain('listingSku: l.retailerSku');
    // The SKU is a build internal: it is dropped before the offers are written.
    expect(build).toContain('listingSku: _sku');
    expect(CATALOGUE.length).toBeGreaterThan(0);
  });
});

describe('Most Stocked', () => {
  it('ranks no set and no oil, and nothing else is left out', () => {
    const ranked = DEMO_FRAGRANCES.filter((f) => rankedInMostStocked(f));
    const sets = DEMO_FRAGRANCES.filter(isSet).length;
    const oils = DEMO_FRAGRANCES.filter(isOil).length;
    // A set that holds an oil is one set, left out once.
    expect(ranked.length).toBe(DEMO_FRAGRANCES.length - sets - oils);
    for (const f of ranked) expect(productKind(f)).toBe('bottle');
  });

  it('turns a set and an oil away, and takes a bottle', () => {
    expect(rankedInMostStocked({ concentration: 'Eau de Parfum', giftSet: { contents: null, title: 'x' } })).toBe(false);
    expect(rankedInMostStocked({ concentration: 'Perfume Oil', giftSet: null })).toBe(false);
    expect(rankedInMostStocked({ concentration: 'Eau de Parfum', giftSet: null })).toBe(true);
  });
});

describe('Deals', () => {
  it('holds no set', () => {
    expect(DEALS.length).toBeGreaterThan(100);
    expect(DEALS.filter((d) => isSet(d.fragrance)).map((d) => d.fragrance.id)).toEqual([]);
  });
});

describe('the social posts', () => {
  it('share one rule: only a bottle may be the subject of a post about one bottle price', () => {
    const set = { concentration: 'Eau de Parfum', giftSet: { contents: null, title: 'x' } };
    expect(eligibleForBottlePosts({ concentration: 'Eau de Parfum', giftSet: null })).toBe(true);
    expect(eligibleForBottlePosts(set)).toBe(false);
    expect(eligibleForBottlePosts({ concentration: 'Perfume Oil', giftSet: null })).toBe(false);
  });

  it('keeps the deal of the day away from a set and an oil, with a real deal as the control', () => {
    const real = BY_POPULARITY.find((f) => productKind(f) === 'bottle' && dealFor(f) !== null);
    // A day with no qualifying deal at all would leave nothing to prove: say so loudly.
    expect(real, 'no bottle qualifies for the deal post on this data, so the rule cannot be shown').toBeDefined();
    expect(dealFor(real!)).not.toBeNull();
    expect(dealFor({ ...real!, giftSet: { contents: null, title: 'x' } })).toBeNull();
    expect(dealFor({ ...real!, concentration: 'Perfume Oil' })).toBeNull();
  });

  it('keeps the savings post away from a set and an oil by the same rule', () => {
    // The savings script runs when it is imported, so its source is what a test can read.
    const src = readFileSync(resolve(root, 'scripts/social-savings.ts'), 'utf8');
    expect(src).toContain("import { eligibleForBottlePosts } from '../demo/productKind.js';");
    expect(src).toContain('!eligibleForBottlePosts(frag)');
    expect(src).not.toContain("frag.concentration === 'Perfume Oil'");
    const deal = readFileSync(resolve(root, 'scripts/social-deal-of-day.ts'), 'utf8');
    expect(deal).toContain('!eligibleForBottlePosts(frag)');
    expect(deal).not.toContain("frag.concentration === 'Perfume Oil'");
  });
});
