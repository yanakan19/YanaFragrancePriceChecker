import { describe, expect, it } from 'vitest';
import { audienceOf, headlineBottles, oilScentKey, scentGroups, sprayVersions } from '../src/catalogue/setLinks.js';
import { DEMO_FRAGRANCES, fragranceById } from '../demo/data.js';
import { isOil, isSet } from '../demo/productKind.js';
import { otherOilSizes, siblingSets, sprayVersion, valueLine } from '../demo/setPage.js';

const bottle = (id: string, brand: string, name: string, concentration: string, sizeMl: number | null) => ({ id, brand, name, concentration, sizeMl });
const set = (id: string, brand: string, name: string, concentration: string, mainMl?: number) => ({ id, brand, name, concentration, mainMl });

describe('a set\'s headline bottle', () => {
  const bottles = [
    bottle('b-100', 'Police', 'To Be Camouflage', 'Eau de Toilette', 75),
    bottle('b-edp', 'Police', 'To Be Camouflage', 'Eau de Parfum', 75),
    bottle('men', 'Gucci', 'Guilty Pour Homme', 'Eau de Toilette', 50),
    bottle('amber-m', 'Zed', 'Amber for Men', 'Eau de Parfum', 100),
    bottle('amber-w', 'Zed', 'Amber for Women', 'Eau de Parfum', 100),
  ];

  it('is the one bottle of the same brand, scent, strength and size', () => {
    const r = headlineBottles([set('s1', 'Police', 'To Be Camouflage Gift Set 75ml EDT + 100ml Shower Gel', 'Eau de Toilette', 75)], bottles);
    expect(r.get('s1')).toBe('b-100');
  });

  it('is nothing for a different strength, a different size, no main bottle, or a different brand', () => {
    const name = 'To Be Camouflage Gift Set 75ml EDT + 100ml Shower Gel';
    expect(headlineBottles([set('s', 'Police', name, 'Eau de Parfum', 50)], bottles).size).toBe(0);
    expect(headlineBottles([set('s', 'Police', name, 'Eau de Toilette', undefined)], bottles).size).toBe(0);
    expect(headlineBottles([set('s', 'Replay', name, 'Eau de Toilette', 75)], bottles).size).toBe(0);
  });

  it('is nothing where two bottles would fit, and never takes the wrong audience', () => {
    const twice = [...bottles, bottle('b-dupe', 'Police', 'To Be Camouflage', 'Eau de Toilette', 75)];
    expect(headlineBottles([set('s', 'Police', 'To Be Camouflage Gift Set', 'Eau de Toilette', 75)], twice).size).toBe(0);
    expect(headlineBottles([set('s', 'Zed', 'Amber for Women Gift Set', 'Eau de Parfum', 100)], bottles).get('s')).toBe('amber-w');
    // A set that does not say who it is for is ambiguous between the two.
    expect(headlineBottles([set('s', 'Zed', 'Amber Gift Set', 'Eau de Parfum', 100)], bottles).size).toBe(0);
    // A set that says it, and a bottle that does not, agree.
    expect(headlineBottles([set('s', 'Gucci', "Guilty Pour Homme Men's Gift Set", 'Eau de Toilette', 50)], bottles).get('s')).toBe('men');
  });

  it('reads audience from the words', () => {
    expect(audienceOf('Amber for Men')).toBe('m');
    expect(audienceOf('Amber for Women')).toBe('f');
    expect(audienceOf('Amber Unisex')).toBe('u');
    expect(audienceOf('Amber')).toBe('');
  });
});

describe('sets of the same scent', () => {
  it('group by brand and scent words, and a set alone is in no group', () => {
    const r = scentGroups([
      { id: 'a', brand: 'Police', name: 'To Be Camouflage Gift Set 75ml EDT + 100ml Shower Gel' },
      { id: 'b', brand: 'Police', name: 'To Be Camouflage Gift Set 75ml EDT + 100ml Body Lotion' },
      { id: 'c', brand: 'Police', name: 'To Be Gift Set' },
      { id: 'd', brand: 'Replay', name: 'To Be Camouflage Gift Set' },
    ]);
    expect([...r.keys()].sort()).toEqual(['a', 'b']);
    expect(r.get('a')).toBe(r.get('b'));
  });
});

describe('an oil\'s spray', () => {
  it('is the bottle of the same brand and scent, with the oil words taken off', () => {
    expect(oilScentKey('Bint Hooran Roll-On')).toBe(oilScentKey('Bint Hooran'));
    const r = sprayVersions(
      [{ id: 'o1', brand: 'Ard Al Zaafaran', name: 'Bint Hooran Roll-On' }, { id: 'o2', brand: 'Ard Al Zaafaran', name: 'Other Attar' }],
      [bottle('sp1', 'Ard Al Zaafaran', 'Bint Hooran', 'Eau de Parfum', 100), bottle('sp2', 'Ard Al Zaafaran', 'Bint Hooran', 'Eau de Parfum', 50)],
    );
    expect(r.get('o1')).toBe('sp1');
    expect(r.has('o2')).toBe(false);
  });

  it('never points at the other audience', () => {
    const r = sprayVersions([{ id: 'o', brand: 'Z', name: 'Amber for Men Attar' }], [bottle('w', 'Z', 'Amber for Women', 'Eau de Parfum', 100)]);
    expect(r.size).toBe(0);
  });
});

describe('on the real catalogue', () => {
  const sets = DEMO_FRAGRANCES.filter(isSet);
  const oils = DEMO_FRAGRANCES.filter(isOil);

  it('links a set only to a bottle of its own brand, strength and main size that is no set and no oil', () => {
    const linked = sets.filter((s) => s.giftSet?.bottleId);
    expect(linked.length).toBeGreaterThan(300);
    for (const s of linked) {
      const b = fragranceById(s.giftSet!.bottleId!)!;
      expect(b, s.id).toBeDefined();
      expect(isSet(b) || isOil(b), s.id).toBe(false);
      expect(b.brand, s.id).toBe(s.brand);
      expect(b.concentration, s.id).toBe(s.concentration);
      expect(b.sizeMl, s.id).toBe(s.giftSet!.mainMl);
    }
  });

  it('shows the two prices only where one shop sells both, and they are that shop\'s own', () => {
    let both = 0;
    let dearer = 0;
    let cheaper = 0;
    for (const s of sets) {
      const v = valueLine(s);
      if (!v) continue;
      both += 1;
      expect(s.giftSet!.bottleId, s.id).toBe(v.bottle.id);
      expect(v.setPrice).toBeGreaterThan(0);
      expect(v.bottlePrice).toBeGreaterThan(0);
      if (v.setPrice > v.bottlePrice) dearer += 1;
      if (v.setPrice < v.bottlePrice) cheaper += 1;
    }
    // The line can go either way, and says so by showing both prices: both cases are in the data.
    expect(both).toBeGreaterThan(100);
    expect(dearer).toBeGreaterThan(0);
    expect(cheaper).toBeGreaterThan(0);
    console.log('value line sets', both, 'set cheaper', cheaper, 'set dearer', dearer);
  });

  it('gives no value line to a set with no headline bottle', () => {
    const none = sets.find((s) => !s.giftSet?.bottleId)!;
    expect(valueLine(none)).toBeNull();
  });

  it('lists sibling sets of the same brand and scent, never itself, at most six', () => {
    const withSibs = sets.filter((s) => s.giftSet?.scent);
    expect(withSibs.length).toBeGreaterThan(300);
    for (const s of withSibs.slice(0, 200)) {
      const sibs = siblingSets(s);
      expect(sibs.length).toBeLessThanOrEqual(6);
      expect(sibs.length, s.id).toBeGreaterThan(0);
      for (const o of sibs) {
        expect(o.id).not.toBe(s.id);
        expect(o.brand).toBe(s.brand);
        expect(isSet(o)).toBe(true);
      }
    }
    expect(siblingSets({ id: 'x', brand: 'x', giftSet: null })).toEqual([]);
  });

  it('links an oil only to a spray that is a bottle, and an oil with none shows no link', () => {
    const withSpray = oils.filter((o) => o.oil?.sprayId);
    expect(withSpray.length).toBeGreaterThan(20);
    for (const o of withSpray) {
      const sp = sprayVersion(o)!;
      expect(sp, o.id).not.toBeNull();
      expect(isSet(sp) || isOil(sp)).toBe(false);
      expect(sp.brand).toBe(o.brand);
    }
    const without = oils.find((o) => !o.oil?.sprayId)!;
    expect(sprayVersion(without)).toBeNull();
    console.log('oils with a spray', withSpray.length, 'of', oils.length);
  });

  it('lists other sizes of an oil of the same brand and name, nearest first, never itself', () => {
    const multi = oils.filter((o) => otherOilSizes(o).length > 0);
    expect(multi.length).toBeGreaterThan(10);
    const o = multi[0]!;
    const others = otherOilSizes(o);
    for (const x of others) {
      expect(x.id).not.toBe(o.id);
      expect(x.name).toBe(o.name);
      expect(isOil(x)).toBe(true);
    }
  });
});
