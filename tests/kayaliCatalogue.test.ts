import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';

/**
 * Kayali as the built catalogue shows it (the thing a reader is shown), from
 * the stored data/catalogue/kayali.json. Checks the shape, not live prices:
 * every size of a perfume is one perfume's size, a mini is never the full
 * size, a set of minis is a gift set, and the strength is the one the shop's
 * own pages state.
 */
const kayali = CATALOGUE.filter((p) => p.brand === 'Kayali');
const bottles = kayali.filter((p) => !p.giftSet);
const sets = kayali.filter((p) => p.giftSet);

describe('Kayali in the built catalogue', () => {
  it('has bottles and sets to check', () => {
    expect(bottles.length).toBeGreaterThan(100);
    expect(sets.length).toBeGreaterThan(20);
  });

  it('names no size label: a miniature or travel spray is a size of its perfume, not part of its name', () => {
    for (const p of bottles) expect(p.name, p.id).not.toMatch(/\b(miniature|mini|travel)\b/i);
  });

  it('states a strength for every bottle, the one its own page prints', () => {
    for (const p of bottles) expect(['Eau de Parfum'], `${p.id} ${p.name}`).toContain(p.concentration);
  });

  it('keeps "Oud" in the names that have it, and "Intense" where the page says Eau de Parfum Intense', () => {
    const names = new Set(bottles.map((p) => p.name));
    expect(names.has('Oudgasm Café Oud | 19 Intense')).toBe(true);
    expect(names.has('Dapper Daddy Saffron Oud')).toBe(true);
    expect(names.has('Vanilla | 28')).toBe(true);
  });

  it('groups every size of a perfume under one name and one strength, each size its own product', () => {
    const families = new Map<string, typeof bottles>();
    for (const p of bottles) {
      const key = `${p.name}|${p.concentration}`;
      families.set(key, [...(families.get(key) ?? []), p]);
    }
    // One name per perfume, however many perfumes Kayali (and a reseller of
    // Kayali) list today: a count here was a pin on the live range ("35
    // perfumes", then 47 when Cult Beauty's arrived), and it said nothing about
    // whether a perfume was split. The rule is that no two families are one
    // scent written two ways. Kayali's scents are told apart by their words
    // with three things a shop may or may not print set aside: the two digit
    // number, "Intense" and "Vacay" (the house's Vacay in a Bottle line, which
    // Cult Beauty titles without it). Accents and punctuation do not count.
    const scentOf = (name: string) =>
      [
        ...new Set(
          (name.normalize('NFKD').replace(/\p{Mn}/gu, '').toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
            (w) => !/^\d{2}$/.test(w) && w !== 'intense' && w !== 'vacay',
          ),
        ),
      ]
        .sort()
        .join(' ');
    const namesOfScent = new Map<string, Set<string>>();
    for (const key of families.keys()) {
      // The name itself carries pipes ("Vanilla | 28"); the strength is after the last.
      const scent = scentOf(key.slice(0, key.lastIndexOf('|')));
      namesOfScent.set(scent, (namesOfScent.get(scent) ?? new Set()).add(key));
    }
    for (const [scent, keys] of namesOfScent) expect([...keys], `one scent, several names: ${scent}`).toHaveLength(1);
    for (const [key, products] of families) {
      const sizes = products.map((p) => p.sizeMl);
      expect(new Set(sizes).size, `${key}: ${sizes.join(', ')}`).toBe(sizes.length);
      expect(sizes.every((s) => typeof s === 'number'), key).toBe(true);
    }
  });

  it('has a 10ml mini beside the full size of a perfume, never merged into it', () => {
    const vanilla = bottles.filter((p) => p.name === 'Vanilla | 28');
    expect(vanilla.map((p) => p.sizeMl).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1.5, 10, 50, 100]);
    expect(new Set(vanilla.map((p) => p.id)).size).toBe(4);
  });

  it('files every set of minis as a gift set with no size, never as a bottle', () => {
    for (const p of kayali.filter((x) => /\b(set|duo|wardrobe)\b|\d\s*x\s*\d|\bfull serving\b|\bsweet fix\b|\bwhipped\b|\bfruit crush\b/i.test(x.name))) {
      expect(p.giftSet, p.name).not.toBeNull();
      expect(p.sizeMl, p.name).toBeNull();
      expect(p.id.startsWith('set-'), p.id).toBe(true);
    }
    for (const p of sets) expect(p.id.startsWith('set-'), p.id).toBe(true);
  });
});
