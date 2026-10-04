import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { duplicateKey, nameCore } from '../src/catalogue/duplicateKey.js';

const k = (brand: string, name: string, concentration: string, sizeMl: number | null) => duplicateKey({ brand, name, concentration, sizeMl });

describe('duplicateKey, the yardstick scripts/find-duplicates.ts measures with', () => {
  it('puts the brand rename, case, accents and punctuation into one key', () => {
    expect(k('Paco Rabanne', 'Olympéa', 'Eau de Parfum', 50)).toBe(k('Rabanne', 'OLYMPEA', 'Eau de Parfum', 50));
    expect(k('Calvin Klein', "CK One", 'Eau de Toilette', 100)).toBe(k('Calvin Klein', 'CK-One', 'Eau de Toilette', 100));
  });

  it('removes "by Brand", the repeated house name, strength words and word order noise', () => {
    expect(nameCore('K By Dolce&Gabbana Intense', 'Dolce & Gabbana')).toBe(nameCore('Intense K', 'Dolce & Gabbana'));
    expect(nameCore('Mugler Alien Eau de Parfum', 'Mugler')).toBe('alien');
    expect(nameCore('Alien Perfume EDP', 'Mugler')).toBe('alien');
    expect(nameCore('Supremacy Pour Homme Silver', 'Afnan')).toBe(nameCore('Supremacy Silver Pour Homme', 'Afnan'));
  });

  it('keeps size and strength in the key, so neither is ever folded', () => {
    expect(k('Mugler', 'Alien', 'Eau de Parfum', 60)).not.toBe(k('Mugler', 'Alien', 'Eau de Parfum', 90));
    expect(k('Mugler', 'Alien', 'Eau de Parfum', 60)).not.toBe(k('Mugler', 'Alien', 'Eau de Toilette', 60));
    expect(k('Mugler', 'Alien', 'Eau de Parfum', null)).toBeNull();
  });

  it('keeps flankers, testers, sets and refills as different names', () => {
    const ks = [
      'Invictus', 'Invictus Victory', 'Invictus Victory Elixir', 'Invictus Victory Extreme', 'Invictus Victory Absolu',
      'Invictus Tester', 'Invictus Refill', 'Invictus Travel Set', 'Invictus Gift Set',
    ].map((n) => k('Rabanne', n, 'Eau de Parfum', 100));
    expect(new Set(ks).size).toBe(ks.length);
  });

  it('does not take a word that is part of a name for a strength: Aventus Cologne, Daisy Eau So Fresh, Pour Homme Eau Fraiche', () => {
    expect(nameCore('Aventus Cologne', 'Creed')).not.toBe(nameCore('Aventus', 'Creed'));
    expect(nameCore('Daisy Eau So Fresh', 'Marc Jacobs')).not.toBe(nameCore('Daisy So Fresh', 'Marc Jacobs'));
    expect(nameCore('Pour Homme Eau Fraiche', 'Versace')).not.toBe(nameCore('Pour Homme', 'Versace'));
  });
});

describe('the built catalogue', () => {
  const rabanne = CATALOGUE.filter((p) => p.brand === 'Rabanne');
  const at = (name: string, conc: string, size: number) => rabanne.filter((p) => p.name === name && p.concentration === conc && p.sizeMl === size);

  it('has few products left that share brand, name, size and strength', () => {
    const groups = new Map<string, number>();
    for (const p of CATALOGUE) {
      const key = duplicateKey(p);
      if (key !== null) groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const split = [...groups.values()].filter((n) => n > 1).length;
    // 891 before the matcher rules in productMatch.ts; 39 after, all of them
    // barcode siblings or flankers the matcher refuses on purpose. The bound
    // leaves room for the next crawl and fails on a return to hundreds.
    expect(split).toBeLessThan(150);
  });

  it('keeps Invictus, Invictus Victory and Invictus Victory Elixir as separate products at 100ml', () => {
    const invictus = at('Invictus', 'Eau de Toilette', 100);
    const victory = at('Invictus Victory', 'Eau de Parfum', 100);
    const elixir = at('Invictus Victory Elixir Intense', 'Parfum', 100);
    expect(invictus.length).toBeGreaterThan(0);
    expect(victory.length).toBeGreaterThan(0);
    expect(elixir.length).toBeGreaterThan(0);
    const ids = [...invictus, ...victory, ...elixir].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows Invictus Victory Elixir Intense 50ml on at most two pages (a barcode edition apart), not five', () => {
    expect(at('Invictus Victory Elixir Intense', 'Parfum', 50).length).toBeLessThanOrEqual(2);
    expect(at('Invictus Victory Elixir', 'Eau de Parfum', 50)).toHaveLength(0);
  });
});
