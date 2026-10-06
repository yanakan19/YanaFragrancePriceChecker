import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { DORMANT_PRODUCTS, ID_ALIASES, SLUG_ALIASES } from '../demo/dormant.generated.js';
import { movedTo } from '../demo/dormantStore.js';
import { SPREAD_MAX, contentsSignature, matchSets, scentKey, type SetCandidate } from '../src/catalogue/setMatch.js';
import { readManifest, policyOf } from '../scripts/generatedFiles.js';

/**
 * The third tier of set matching (docs/GIFT-SETS-AND-OILS-PLAN.md, section 3.3,
 * phase 4): rules on small real cases, the pinned fixture of what the matcher
 * decided on the real catalogue the day it was written, and the invariants that
 * must hold of every build's own report.
 */
const root = resolve(import.meta.dirname, '..');

const set = (over: Partial<SetCandidate> & Pick<SetCandidate, 'id'>): SetCandidate => ({
  brand: 'Police',
  name: 'To Be Camouflage Gift Set 75ml EDT + 100ml Shower Gel',
  concentration: 'Eau de Toilette',
  ean: null,
  contents: ['75ml Eau de Toilette', '100ml Shower Gel'],
  shops: ['a'],
  price: 13,
  ...over,
});

describe('the scent of a set', () => {
  it('is its name less set words, strength words, item words and sizes, with every number kept', () => {
    expect(scentKey('Paco Rabanne Invictus Gift Set 100ml EDT + 10ml EDT')).toBe(scentKey('Paco Rabanne Invictus 2 Piece Gift Set: Eau de Toilette 100ml - Eau de Toilette 10ml'));
    expect(scentKey('Mini Collection 1 Eau De Parfum 5 x 10ml Gift Set')).not.toBe(scentKey('Mini Collection 2 Eau De Parfum 5 x 10ml Gift Set'));
    expect(scentKey('No. 5 Gift Set')).not.toBe(scentKey('No. 3 Gift Set'));
    expect(scentKey('Armani Code Men\'s Gift Set (50ml EDT + 75ml Shower Gel)')).toBe(scentKey('Armani Code Gift Set 50ml EDT + 75ml Shower Gel'));
    expect(scentKey('Light Blue Pour Homme Gift Set')).not.toBe(scentKey('Light Blue Gift Set'));
  });
});

describe('the contents signature', () => {
  it('is every item\'s count, size and kind, in any order', () => {
    expect(contentsSignature(['100ml Eau de Parfum', '10ml Eau de Parfum'])).toBe(contentsSignature(['10ml Eau de Parfum', '100ml Eau de Parfum']));
    expect(contentsSignature(['50ml Eau de Parfum', '10ml Eau de Parfum'])).toBe(contentsSignature(['50ml Eau de Parfum', '10ml Eau de Parfum']));
  });

  it('tells a travel spray from a second bottle, and counts, sizes and companions apart', () => {
    expect(contentsSignature(['50ml Eau de Parfum', '10ml Eau de Parfum'])).not.toBe(contentsSignature(['50ml Eau de Parfum', '10ml Travel Spray']));
    expect(contentsSignature(['100ml Eau de Toilette', '75ml Shower Gel'])).not.toBe(contentsSignature(['100ml Eau de Toilette', '75ml Body Lotion']));
    expect(contentsSignature(['3 x 10ml Eau de Parfum'])).not.toBe(contentsSignature(['10ml Eau de Parfum']));
  });

  it('is nothing where the contents are not known well enough to compare', () => {
    expect(contentsSignature(null)).toBeNull();
    expect(contentsSignature([])).toBeNull();
    expect(contentsSignature(['Eau de Parfum', 'Body Lotion'])).toBeNull();
  });
});

describe('which sets are the same set', () => {
  it('joins the same set at two shops, on any order of its words and any wording of its items', () => {
    const r = matchSets([
      set({ id: 'set-ean-1', ean: '1', shops: ['perfume-click'], price: 14 }),
      set({ id: 'set-b', name: 'To Be Camouflage 2 Piece Gift Set: Eau de Toilette 75ml - Shower Gel 100ml', shops: ['mybeauty-boutique'], price: 18 }),
    ]);
    expect(r.refused).toEqual([]);
    expect(r.groups).toEqual([{ canonical: 'set-ean-1', absorbed: ['set-b'] }]);
  });

  it('keeps the set with a barcode, then the one at more shops, as the survivor', () => {
    const r = matchSets([set({ id: 'set-z', shops: ['a', 'b'] }), set({ id: 'set-a', shops: ['c'] }), set({ id: 'set-ean-9', ean: '9', shops: ['d'] })]);
    expect(r.groups[0]!.canonical).toBe('set-ean-9');
  });

  it('never joins two sets with a different number in the name', () => {
    const r = matchSets([
      set({ id: 'a', name: 'Mini Collection 1 Gift Set' }),
      set({ id: 'b', name: 'Mini Collection 2 Gift Set', shops: ['b'] }),
    ]);
    expect(r.groups).toEqual([]);
  });

  it('never joins sets whose contents differ, or that name none', () => {
    expect(matchSets([set({ id: 'a' }), set({ id: 'b', shops: ['b'], contents: ['75ml Eau de Toilette', '100ml Body Lotion'] })]).groups).toEqual([]);
    expect(matchSets([set({ id: 'a', contents: null }), set({ id: 'b', shops: ['b'], contents: null })]).groups).toEqual([]);
  });

  it('never joins a set of one brand to another, or any set of no brand', () => {
    expect(matchSets([set({ id: 'a' }), set({ id: 'b', shops: ['b'], brand: 'Replay' })]).groups).toEqual([]);
    expect(matchSets([set({ id: 'a', brand: 'Unbranded' }), set({ id: 'b', shops: ['b'], brand: 'Unbranded' })]).groups).toEqual([]);
  });

  it('refuses a group whose strengths differ, and takes "not stated" as no claim', () => {
    const r = matchSets([set({ id: 'a' }), set({ id: 'b', shops: ['b'], concentration: 'Eau de Parfum' })]);
    expect(r.groups).toEqual([]);
    expect(r.refused[0]!.reasons.join()).toMatch(/strengths differ/);
    expect(matchSets([set({ id: 'a' }), set({ id: 'b', shops: ['b'], concentration: 'Not stated' })]).groups).toHaveLength(1);
  });

  it('refuses a group with two different barcodes, and treats a barcode with and without its leading zero as one', () => {
    const two = matchSets([set({ id: 'set-ean-1', ean: '1111', shops: ['a'] }), set({ id: 'set-ean-2', ean: '2222', shops: ['b'] })]);
    expect(two.groups).toEqual([]);
    expect(two.refused[0]!.reasons.join()).toMatch(/two different barcodes/);
    const same = matchSets([set({ id: 'set-ean-0783', ean: '0783', shops: ['a'] }), set({ id: 'set-ean-783', ean: '783', shops: ['b'] })]);
    expect(same.groups).toHaveLength(1);
  });

  it('refuses a group in which one shop lists two', () => {
    const r = matchSets([set({ id: 'a', shops: ['x'] }), set({ id: 'b', shops: ['x'] })]);
    expect(r.groups).toEqual([]);
    expect(r.refused[0]!.reasons.join()).toMatch(/a shop lists more than one/);
  });

  it('refuses a group whose prices are further apart than the bound, and joins one that is not', () => {
    expect(SPREAD_MAX).toBeGreaterThan(1.33);
    expect(SPREAD_MAX).toBeLessThan(2.31);
    const apart = matchSets([set({ id: 'a', price: 10 }), set({ id: 'b', shops: ['b'], price: 10 * (SPREAD_MAX + 0.1) })]);
    expect(apart.groups).toEqual([]);
    expect(apart.refused[0]!.reasons.join()).toMatch(/price spread/);
    expect(matchSets([set({ id: 'a', price: 10 }), set({ id: 'b', shops: ['b'], price: 10 * (SPREAD_MAX - 0.1) })]).groups).toHaveLength(1);
  });
});

describe('what the matcher decided on the real catalogue the day it was written', () => {
  const file = resolve(root, 'tests/fixtures/set-match.json');
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as {
    candidates: SetCandidate[];
    expected: { groups: { canonical: string; absorbed: string[] }[]; refused: { ids: string[]; reasons: string[] }[] };
  };

  it('is still what it decides: the groups it joined and the groups it refused, both pinned', () => {
    const r = matchSets(fixture.candidates);
    expect(r.groups).toEqual(fixture.expected.groups);
    expect(r.refused).toEqual(fixture.expected.refused);
    expect(r.groups.length).toBeGreaterThan(100);
    expect(r.refused.length).toBeGreaterThan(30);
  });

  it('joined, in the thirty two groups read by hand, the same set at each shop', () => {
    const reviewed = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/set-match-reviewed.json'), 'utf8')) as { reviewed: string[][] };
    expect(reviewed.reviewed).toHaveLength(32);
    const decided = new Map(fixture.expected.groups.map((g) => [g.canonical, g.absorbed]));
    for (const [canonical, ...absorbed] of reviewed.reviewed) expect(decided.get(canonical!), canonical).toEqual([...absorbed].sort());
  });

  it('never put a bottle or an oil in a group: every candidate is a set', () => {
    expect(fixture.candidates.every((c) => c.id.startsWith('set-'))).toBe(true);
  });

  it('joined no group with two barcodes, two strengths, two prices past the bound or one shop twice', () => {
    const byId = new Map(fixture.candidates.map((c) => [c.id, c]));
    for (const g of fixture.expected.groups) {
      const members = [g.canonical, ...g.absorbed].map((id) => byId.get(id)!);
      expect(new Set(members.map((m) => m.ean?.replace(/^0+/, '')).filter(Boolean)).size, g.canonical).toBeLessThanOrEqual(1);
      expect(new Set(members.map((m) => m.concentration).filter((c) => c !== 'Not stated' && c !== 'Disputed')).size, g.canonical).toBeLessThanOrEqual(1);
      expect(new Set(members.map((m) => contentsSignature(m.contents))).size, g.canonical).toBe(1);
      expect(new Set(members.map((m) => scentKey(m.name))).size, g.canonical).toBe(1);
      const shops = members.flatMap((m) => m.shops);
      expect(new Set(shops).size, g.canonical).toBe(shops.length);
      const prices = members.map((m) => m.price).filter((p): p is number => p !== null);
      expect(Math.max(...prices) / Math.min(...prices), g.canonical).toBeLessThanOrEqual(SPREAD_MAX);
    }
  });
});

describe('this build\'s own report', () => {
  const file = resolve(root, 'data/set-match-report.json');
  const report = JSON.parse(readFileSync(file, 'utf8')) as {
    folded: number;
    groups: { canonical: string; absorbed: string[]; members: { id: string; brand: string; concentration: string; ean: string | null; scent: string; signature: string | null; shops: string[] }[] }[];
    refused: { reasons: string[]; members: { id: string }[] }[];
  };

  it('is a generated file the crawl commits, listed in the manifest', () => {
    expect(existsSync(file)).toBe(true);
    expect(policyOf('data/set-match-report.json', readManifest())).toBe('rebuild');
  });

  it('folded sets only: no id in it is anything but a set', () => {
    for (const g of report.groups) for (const id of [g.canonical, ...g.absorbed]) expect(id, id).toMatch(/^set-/);
    for (const r of report.refused) for (const m of r.members) expect(m.id, m.id).toMatch(/^set-/);
  });

  it('folded no group with two different barcodes, main sizes, numbers in the name or contents', () => {
    expect(report.folded).toBe(report.groups.reduce((n, g) => n + g.absorbed.length, 0));
    for (const g of report.groups) {
      expect(new Set(g.members.map((m) => m.ean?.replace(/^0+/, '')).filter(Boolean)).size, g.canonical).toBeLessThanOrEqual(1);
      expect(new Set(g.members.map((m) => m.signature)).size, g.canonical).toBe(1);
      expect(new Set(g.members.map((m) => m.scent)).size, g.canonical).toBe(1);
      expect(g.members.every((m) => m.signature !== null), g.canonical).toBe(true);
      expect(new Set(g.members.map((m) => m.brand)).size, g.canonical).toBe(1);
      const shops = g.members.flatMap((m) => m.shops);
      expect(new Set(shops).size, g.canonical).toBe(shops.length);
    }
  });

  it('reports a refused group with its reasons, and its members are still on the site', () => {
    const ids = new Set(CATALOGUE.map((c) => c.id));
    for (const r of report.refused) {
      expect(r.reasons.length).toBeGreaterThan(0);
      for (const m of r.members) expect(ids.has(m.id) || m.id in DORMANT_PRODUCTS, m.id).toBe(true);
    }
  });

  it('answers every retired id: the old address opens the set that holds it now', () => {
    const live = new Set(CATALOGUE.map((c) => c.id));
    const data = { products: DORMANT_PRODUCTS, aliases: ID_ALIASES, slugAliases: SLUG_ALIASES };
    // An id that was never a page needs no address to answer: a set first seen in the same
    // build that folded it into another has no link anyone could hold (src/catalogue/idAliases.ts).
    // Every page address ever published has a slug in data/product-slugs.json, append only.
    const everAPage = new Set(Object.keys((JSON.parse(readFileSync(resolve(root, 'data/product-slugs.json'), 'utf8')) as { slugs: Record<string, string> }).slugs));
    let answered = 0;
    for (const g of report.groups) {
      expect(live.has(g.canonical), g.canonical).toBe(true);
      for (const old of g.absorbed) {
        expect(live.has(old), `${old} is gone`).toBe(false);
        if (!everAPage.has(old)) continue;
        expect(movedTo(data, old, (id) => live.has(id)), old).toBe(g.canonical);
        answered++;
      }
    }
    expect(answered).toBeGreaterThan(100);
  });

  it('left a set at two shops or more for what it folded, and none of them with a bottle or an oil', () => {
    const sets = CATALOGUE.filter((c) => c.giftSet);
    const atTwo = sets.filter((c) => new Set((CRAWLED[c.id] ?? []).map((o) => o.retailerId)).size >= 2).length;
    // Before this tier 107 of 2,690 sets were at two shops or more; after it 285 of 2,470 were.
    expect(atTwo).toBeGreaterThan(250);
    for (const c of sets) expect(c.id).toMatch(/^set-/);
  });
});
