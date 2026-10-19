import { describe, expect, it } from 'vitest';
import { NAME_KEPT, NAME_UNRESOLVED, NAME_VERIFIED } from '../src/catalogue/nameReviewed.js';
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
  it('has two sources on different domains for every rename', () => {
    for (const e of NAME_VERIFIED) {
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
    for (const e of NAME_VERIFIED) { const k = key(e.brand, e.from); expect(seen.has(k), k).toBe(false); seen.add(k); }
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
