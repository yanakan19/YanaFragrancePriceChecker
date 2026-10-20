import { describe, expect, it } from 'vitest';
import { NAME_KEPT, NAME_REORDERED, NAME_UNRESOLVED, NAME_VERIFIED, OWNER_DECISION_SOURCE, isReorderOnly, ownerSeriesName, putPrideFirstOnPlainTwins } from '../src/catalogue/nameReviewed.js';
import { knownAlias } from '../src/catalogue/brandName.js';
import { displayName } from '../src/catalogue/productName.js';

const words = (s: string): string[] =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
const domain = (u: string): string => {
  const parts = new URL(u).hostname.split('.');
  return parts.slice(/^(?:co|com|org|ac)$/.test(parts[parts.length - 2]!) ? -3 : -2).join('.');
};
const isSubsequence = (small: string[], big: string[]): boolean => {
  let i = 0;
  for (const w of big) if (i < small.length && small[i] === w) i++;
  return i === small.length;
};
const AUDIENCE = /\b(?:for|pour)\s+(?:men|women|him|her|man|woman|homme|femme|unisex)\b/i;

describe('reviewed names (nameReviewed.ts)', () => {
  it('only ever deletes words, never adds or respells', () => {
    for (const e of NAME_VERIFIED) {
      expect(e.to.length, e.from).toBeGreaterThan(1);
      expect(words(e.to).length, e.from).toBeLessThan(words(e.from).length);
      expect(isSubsequence(words(e.to), words(e.from)), `${e.from} -> ${e.to}`).toBe(true);
    }
  });
  it('has two sources on different domains for every rename, except one the owner decided', () => {
    for (const e of NAME_VERIFIED) {
      if (e.decision) { expect(e.sources, e.from).toEqual([OWNER_DECISION_SOURCE]); continue; }
      expect(e.sources.length, e.from).toBeGreaterThanOrEqual(2);
      expect(new Set(e.sources.map(domain)).size, e.from).toBeGreaterThanOrEqual(2);
      expect(e.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('never strips a line or series prefix or an audience label', () => {
    const PREFIX = /^(?:lattafa pride|club de nuit|emporio armani|pride|sweet tooth|flower by|miss dior|terre d|mon guerlain|my burberry|pasha de)\b/;
    for (const e of NAME_VERIFIED) {
      const from = words(e.from).join(' ');
      if (PREFIX.test(from)) expect(words(e.to).join(' '), e.from).toMatch(PREFIX);
      const aud = e.from.match(AUDIENCE);
      if (aud) expect(e.to.toLowerCase(), e.from).toContain(aud[0].toLowerCase());
      // Pour Homme / Femme as the word itself, e.g. "Heavenly Petals Femme", stays.
      for (const w of ['homme', 'femme']) if (words(e.from).includes(w)) expect(words(e.to), e.from).toContain(w);
    }
  });
  it('lists a family once, and a verified name is not also kept or unresolved', () => {
    const key = (b: string, n: string) => `${words(b).join(' ')}|${words(n).join(' ')}`;
    const seen = new Set<string>();
    for (const e of [...NAME_VERIFIED, ...NAME_REORDERED]) { const k = key(e.brand, e.from); expect(seen.has(k), k).toBe(false); seen.add(k); }
    for (const e of [...NAME_KEPT, ...NAME_UNRESOLVED]) { const k = key(e.brand, e.name); expect(seen.has(k), k).toBe(false); seen.add(k); }
    for (const e of NAME_KEPT) {
      // A family the owner settled needs no source; every other kept name has one.
      if (e.decision) expect(e.decision, e.name).toMatch(/owner, \d{1,2} \w+ \d{4}/);
      else expect(e.sources.length, e.name).toBeGreaterThanOrEqual(1);
    }
  });
  it('is applied by displayName, and the shorter name is stable', () => {
    for (const e of NAME_VERIFIED) {
      // The name a shop title gives, run through displayName, is the verified one.
      expect(displayName(`${e.from} Eau de Parfum 100ml`, e.brand, e.brand), e.from).toBe(e.to);
      expect(displayName(`${e.to} Eau de Parfum 100ml`, e.brand, e.brand), e.to).toBe(e.to);
    }
  });
});

describe('a name only Direct Cosmetics gives is not evidence (owner decision, 19 Oct 2026)', () => {
  it('settles those families as kept, each with the owner decision recorded', () => {
    const settled = NAME_KEPT.filter((e) => e.decision);
    expect(settled.length).toBeGreaterThan(0);
    for (const e of settled) expect(e.evidence, e.name).toContain('only Direct Cosmetics differs');
  });
  it('leaves no unresolved family whose only difference is Direct Cosmetics, except where three shops or more write the shorter name', () => {
    // Those few stay with the owner: the long name is Direct Cosmetics only and other shops agree on a shorter one.
    for (const e of NAME_UNRESOLVED.filter((u) => u.why.startsWith('only Direct Cosmetics gives this name'))) {
      expect(['Instinct David Beckham', 'Chantal Thomass Pink', 'Cabotine de Gres', 'Lacoste L.12.12 Rose Eau Fraiche', 'Florence Roberto Cavalli', 'Paco Rabanne'], e.name).toContain(e.name);
    }
  });
});

describe('reordered names (NAME_REORDERED): the same words, moved', () => {
  it('accepts words moved, with the house dropped only when the old name repeats it', () => {
    expect(isReorderOnly('La African Drummer Lattafa Pride', 'Pride La African Drummer', 'Lattafa')).toBe(true);
    expect(isReorderOnly('Nebras Pride', 'Pride Nebras', 'Lattafa')).toBe(true);
  });
  it('refuses a name that adds a word, drops another word, or only respells', () => {
    // Adds "An" and drops "Perfume": a deletion or an addition, not a move.
    expect(isReorderOnly('Della Equestrian Series Perfume', 'An Equestrian Series Della', 'French Avenue')).toBe(false);
    expect(isReorderOnly('Nebras Perfume Lattafa Pride', 'Pride Nebras', 'Lattafa')).toBe(false);
    expect(isReorderOnly('Nebras Pride', 'Nebras Pride', 'Lattafa')).toBe(false);
    expect(isReorderOnly('Nebras Pride', 'Pride Nebras Elixir', 'Lattafa')).toBe(false);
  });
  it('holds every entry to the rule, with two sources on different domains', () => {
    for (const e of NAME_REORDERED) {
      if (e.decision) continue; // the owner's decisions are held to their own rule below
      expect(isReorderOnly(e.from, e.to, e.brand), `${e.from} -> ${e.to}`).toBe(true);
      expect(e.sources.length, e.from).toBeGreaterThanOrEqual(2);
      expect(new Set(e.sources.map(domain)).size, e.from).toBeGreaterThanOrEqual(2);
      expect(displayName(`${e.from} Eau de Parfum 100ml`, e.brand, e.brand), e.from).toBe(e.to);
    }
  });
});

describe('the owner decisions of 20 Oct 2026: the Lattafa Pride line and the French Avenue Equestrian Series', () => {
  const sorted = (s: string) => [...words(s)].sort();
  const isSubMultiset = (small: string[], big: string[]): boolean => {
    const left = [...big];
    for (const w of small) { const at = left.indexOf(w); if (at < 0) return false; left.splice(at, 1); }
    return true;
  };
  it('lets an entry stand on the owner decision alone, and says so in the entry', () => {
    const decided = [...NAME_VERIFIED, ...NAME_REORDERED].filter((e) => e.decision);
    expect(decided.length).toBeGreaterThan(0);
    for (const e of decided) {
      expect(e.sources, e.from).toEqual([OWNER_DECISION_SOURCE]);
      expect(e.decision, e.from).toMatch(/owner, \d{1,2} \w+ \d{4}/);
      expect(e.on, e.from).toBe('2026-10-20');
    }
  });
  it('a Pride entry keeps or moves words, puts Pride first, and adds none', () => {
    const pride = NAME_REORDERED.filter((e) => e.decision);
    expect(pride.length).toBeGreaterThanOrEqual(5);
    for (const e of pride) {
      expect(words(e.to)[0], e.to).toBe('pride');
      expect(isSubMultiset(words(e.to), words(e.from)), `${e.from} -> ${e.to} adds a word`).toBe(true);
      // Only "Perfume" and the house go.
      const gone = sorted(e.from).filter((w) => !sorted(e.to).includes(w) || false);
      for (const w of gone) expect(['perfume', 'lattafa', 'by'], `${e.from} loses ${w}`).toContain(w);
    }
  });
  it('a Della entry only deletes words', () => {
    const bare = NAME_VERIFIED.filter((e) => e.decision);
    expect(bare.map((e) => e.to).sort()).toEqual(['Della', 'Haydan', 'Olena', 'Pierce']);
    for (const e of bare) expect(isSubsequence(words(e.to), words(e.from)), `${e.from} -> ${e.to}`).toBe(true);
  });
  it('puts Pride first for every Lattafa Pride shape, whatever the shop writes', () => {
    const same = (from: string, to: string) => expect(ownerSeriesName(from, 'Lattafa'), from).toBe(to);
    same('Nebras Perfume Lattafa Pride', 'Pride Nebras');
    same('Affection Perfume Lattafa Pride', 'Pride Affection');
    same('Al Areeq Gold Perfume By Lattafa Pride', 'Pride Al Areeq Gold');
    same('Queen of Arabia Perfume Lattafa Pride', 'Pride Queen of Arabia');
    same('Vintage Radio By Lattafa Pride', 'Pride Vintage Radio');
    same('Al Ameed Silver Perfume - Lattafa Pride', 'Pride Al Ameed Silver');
    same('Eternal Oud - Lattafa Pride Elite Collection', 'Pride Eternal Oud');
    same('Wajood - Lattafa Pride Elite Collection - Woody, Pepper, Sweet', 'Pride Wajood');
    same('Tharwah Gold by Lattafa Pride Collection', 'Pride Tharwah Gold');
    same('Lattafa Pride La Collection D\'antiquites 1886', 'Pride La Collection D\'antiquites 1886');
    same('Affection 3 Piece Gift Set Lattafa Pride', 'Pride Affection 3 Piece Gift Set');
    same('Queen Of Roses Pride', 'Pride Queen Of Roses');
  });
  it('leaves a name that is already Pride first, "Pride of Lattafa", other Lattafa lines and other houses alone', () => {
    const keep = (name: string, house = 'Lattafa') => expect(ownerSeriesName(name, house), name).toBe(name);
    keep('Pride Kashan');
    expect(ownerSeriesName('Pride No.1 Gift Set 5X20ml EDP Lattafa', 'Lattafa')).toBe('Pride No.1 Gift Set 5X20ml EDP');
    keep('Fakhar Lattafa (Pride of Lattafa) Black');
    keep('Khamrah');
    keep('Bade\'e Al Oud Noble Blush');
    keep('The Pride of Armaf', 'Armaf');
    keep('Nebras Perfume Lattafa Pride', 'Armaf');
  });
  it('gives the Equestrian Series the fragrance name alone, and leaves other French Avenue names alone', () => {
    const f = (n: string) => ownerSeriesName(n, 'French Avenue');
    expect(['An Equestrian Series Della', 'Della Equestrian Series Perfume', 'Della Equestrian Series'].map(f)).toEqual(['Della', 'Della', 'Della']);
    expect(f('An Equestrian Series Pierce')).toBe('Pierce');
    expect(f('Liquid Brun')).toBe('Liquid Brun');
    expect(ownerSeriesName('Della Equestrian Series', 'Lattafa')).toBe('Della Equestrian Series');
  });
  it('joins listings written with and without the series: every shape ends in the same displayed name', () => {
    const shown = (title: string) => displayName(title, 'Lattafa', 'Lattafa');
    expect(new Set(['Nebras Lattafa Pride Eau de Parfum 100ml', 'Lattafa Pride Nebras Eau de Parfum 100ml', 'Nebras Perfume Lattafa Pride 100ml EDP'].map(shown))).toEqual(new Set(['Pride Nebras']));
    // A name no listing writes with the series is left alone; one that does is taken by its plain twin.
    const products = [
      { brand: 'Lattafa', name: 'Pride Nebras' }, { brand: 'Lattafa', name: 'Nebras' }, { brand: 'Lattafa', name: 'nebras' },
      { brand: 'Lattafa', name: 'Khamrah' }, { brand: 'Armaf', name: 'Nebras' }, { brand: 'Lattafa', name: 'Pride Oud' },
    ];
    const renamed = putPrideFirstOnPlainTwins(products);
    expect(renamed.length).toBe(2);
    expect(products.map((p) => p.name)).toEqual(['Pride Nebras', 'Pride Nebras', 'Pride Nebras', 'Khamrah', 'Nebras', 'Pride Oud']);
    const fa = (title: string) => displayName(title, 'French Avenue', 'French Avenue');
    expect(new Set(['An Equestrian Series Della Eau de Parfum 100ml', 'Della Equestrian Series Perfume 100ml EDP', 'French Avenue Della Eau de Parfum 100ml'].map(fa))).toEqual(new Set(['Della']));
  });
});

describe('a shop that files "Lattafa Pride" as the brand (owner decision, 20 Oct 2026)', () => {
  it('drops the shelf label from a Pride name when the house sells the name without it', () => {
    const products = [
      { brand: 'Lattafa', name: 'Pride Nebras' }, { brand: 'Lattafa', name: 'Pride Nebras For Women' },
      { brand: 'Lattafa', name: 'Pride Taureau De Combat For Men' }, { brand: 'Lattafa', name: 'Taureau De Combat' },
      { brand: 'Lattafa', name: 'Pride Oud For Men' },
    ];
    putPrideFirstOnPlainTwins(products);
    expect(products.map((p) => p.name)).toEqual(['Pride Nebras', 'Pride Nebras', 'Pride Taureau De Combat For Men', 'Taureau De Combat', 'Pride Oud For Men']);
  });
  it('shows the house Lattafa and the series name first', () => {
    expect(knownAlias('Lattafa Pride')).toBe('Lattafa');
    expect(displayName('Nebras Elixir Perfume 100ml EDP for Unisex', 'Lattafa Pride', 'Lattafa')).toBe('Pride Nebras Elixir For Unisex');
    expect(displayName('Lattafa Pride Eternal Oud Eau De Parfum 100ml', 'Lattafa Pride', 'Lattafa')).toBe('Pride Eternal Oud');
  });
  it('leaves names that already carry the series, Pride of Lattafa and other houses alone', () => {
    expect(displayName('Pride Art of Universe 100ml Eau de Parfum for Men', 'Lattafa Pride', 'Lattafa')).toBe('Pride Art of Universe For Men');
    expect(displayName('Fakhar Lattafa (Pride of Lattafa) Black Eau de Parfum 100ml', 'Lattafa', 'Lattafa')).toBe('Fakhar Lattafa (Pride of Lattafa) Black');
    expect(displayName('Nebras Eau de Parfum 100ml', 'Lattafa', 'Lattafa')).toBe('Nebras');
  });
});
