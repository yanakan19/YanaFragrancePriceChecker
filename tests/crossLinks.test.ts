import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BY_POPULARITY, DEALS, DEMO_FRAGRANCES } from '../demo/data.js';
import { COUNTS, countKinds } from '../demo/counts.js';
import { isOil, isSet, productKind } from '../demo/productKind.js';
import { countsPhrase, intentOf, leadingKind, searchMatches, searchWords } from '../demo/searchIntent.js';
import { matchesSearch } from '../demo/listFilters.js';
import { marqueePhrases } from '../demo/marquee.js';

/**
 * Phase 8 of docs/GIFT-SETS-AND-OILS-PLAN.md: the counts, the search rule and the
 * Deals rule, held to the real catalogue. The pages themselves are in
 * tests/crossLinksBrowser.test.ts.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = (f: { brand: string; name: string; concentration: string }) => `${f.brand} ${f.name} ${f.concentration}`;

describe('COUNTS', () => {
  it('count every product once, and the three kinds add up to the total', () => {
    expect(COUNTS.products).toBe(DEMO_FRAGRANCES.length);
    expect(COUNTS.bottles + COUNTS.sets + COUNTS.oils).toBe(COUNTS.products);
    expect(COUNTS.bottles).toBe(DEMO_FRAGRANCES.filter((f) => productKind(f) === 'bottle').length);
    expect(COUNTS.sets).toBe(DEMO_FRAGRANCES.filter((f) => f.giftSet !== null).length);
    expect(COUNTS.oils).toBe(DEMO_FRAGRANCES.filter(isOil).length);
    expect(COUNTS.sets).toBeGreaterThan(2000);
    expect(COUNTS.oils).toBeGreaterThan(300);
  });

  it('counts a small list by kind', () => {
    const bottle = { concentration: 'Eau de Parfum', giftSet: null };
    const oil = { concentration: 'Perfume Oil', giftSet: null };
    const set = { concentration: 'Eau de Parfum', giftSet: { contents: null, title: 'x' } };
    expect(countKinds([bottle, bottle, oil, set])).toEqual({ products: 4, bottles: 2, sets: 1, oils: 1 });
  });

  it('is the only place that builds a count from the length of the whole catalogue', () => {
    // No page string says "N fragrances", "N sets" or "N oils" from DEMO_FRAGRANCES.length
    // itself: a count is read from COUNTS (demo/counts.ts), so no two pages can disagree.
    const offenders: string[] = [];
    const dir = resolve(root, 'demo');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.generated.ts') || file === 'counts.ts' || file === 'data.ts') continue;
      const src = readFileSync(resolve(dir, file), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (/DEMO_FRAGRANCES\.length/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) offenders.push(`demo/${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('is what the banner states, as Products', () => {
    const phrases = marqueePhrases(COUNTS.products, 'more than 30');
    expect(phrases[0]).toMatch(/^[\d,]+\+ Products Tracked$/);
    const stated = Number(phrases[0]!.replace(/[^\d]/g, ''));
    expect(stated).toBeLessThan(COUNTS.products);
    expect(COUNTS.products - stated).toBeLessThanOrEqual(1000);
  });
});

describe('what a search says it wants', () => {
  it('reads the words that name a kind of product', () => {
    expect(intentOf('yara')).toEqual({ oils: false, sets: false });
    for (const q of ['oil', 'rose oil', 'attar', 'musk attars', 'roll on', 'roll-on', 'rollon', 'amber roll on oil']) {
      expect(intentOf(q).oils, q).toBe(true);
    }
    for (const q of ['set', 'gift', 'invictus gift set', 'bundle', 'coffret', 'duo', 'trio']) {
      expect(intentOf(q).sets, q).toBe(true);
    }
    expect(intentOf('gift oil')).toEqual({ oils: true, sets: true });
    // A word that only contains one does not count.
    expect(intentOf('toilette')).toEqual({ oils: false, sets: false });
    expect(intentOf('settimo')).toEqual({ oils: false, sets: false });
  });

  it('puts the tab the words name first, and Sets otherwise', () => {
    expect(leadingKind(intentOf('oil'))).toBe('oils');
    expect(leadingKind(intentOf('gift set'))).toBe('sets');
    expect(leadingKind(intentOf('yara'))).toBe('sets');
    expect(leadingKind(intentOf('gift oil'))).toBe('sets');
  });

  it('matches a kind word as a whole word, never inside another', () => {
    expect(searchMatches('Ard Al Zaafaran Bint Hooran Perfume Oil', 'oil')).toBe(true);
    expect(searchMatches('Ard Al Zaafaran Bint Hooran Perfume Oil', 'oils')).toBe(true);
    expect(searchMatches('Dior Sauvage Eau de Toilette', 'oil')).toBe(false);
    expect(searchMatches('Rabanne Invictus Gift Set', 'set')).toBe(true);
    expect(searchMatches('Settimo Perfume Eau de Parfum', 'set')).toBe(false);
    expect(searchMatches('Amber Roll-On Perfume Oil', 'roll on')).toBe(true);
    expect(searchMatches('Amber Roll On Perfume Oil', 'roll-on')).toBe(true);
    expect(searchMatches('Rollerball Eau de Parfum', 'roll on')).toBe(false);
  });

  it('matches any other word anywhere in the text, in any order, as the search always has', () => {
    expect(searchMatches('Rabanne Invictus Gift Set', 'invictus rabanne')).toBe(true);
    expect(searchMatches('Dior Sauvage Eau de Toilette', 'sauv')).toBe(true);
    expect(searchMatches('Dior Sauvage Eau de Toilette', 'sauvage elixir')).toBe(false);
    expect(searchMatches('anything', '   ')).toBe(true);
    expect(searchWords('  Roll-On  Oil ')).toEqual(['roll', 'on', 'oil']);
    expect(matchesSearch).toBe(searchMatches);
  });

  it('says "oil" over the whole catalogue as words: no Toilette, and every perfume oil that names itself', () => {
    const hits = BY_POPULARITY.filter((f) => searchMatches(text(f), 'oil'));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(BY_POPULARITY.filter((f) => text(f).toLowerCase().includes('oil')).length / 5);
    expect(hits.filter((f) => /toilette/i.test(f.concentration) && !/\boil\b/i.test(`${f.brand} ${f.name}`))).toEqual([]);
    // Every oil has the strength Perfume Oil or Attar, so a search for "oil" finds all that say Oil.
    const oils = BY_POPULARITY.filter(isOil);
    expect(oils.filter((f) => /perfume oil/i.test(f.concentration)).every((f) => searchMatches(text(f), 'oil'))).toBe(true);
  });

  it('counts, for "yara", the bottles a search lists and the sets and oils it only points to', () => {
    const hits = BY_POPULARITY.filter((f) => searchMatches(text(f), 'yara'));
    const bottles = hits.filter((f) => !isSet(f) && !isOil(f));
    const sets = hits.filter(isSet);
    const oils = hits.filter(isOil);
    expect(bottles.length).toBeGreaterThan(0);
    expect(sets.length).toBeGreaterThan(0);
    expect(oils.length).toBeGreaterThan(0);
    expect(bottles.length + sets.length + oils.length).toBe(hits.length);
  });

  it('phrases the counts, the named tab first', () => {
    expect(countsPhrase(5, 8, 'sets')).toBe('5 Sets and 8 Oils');
    expect(countsPhrase(5, 8, 'oils')).toBe('8 Oils and 5 Sets');
    expect(countsPhrase(1, 1, 'sets')).toBe('1 Set and 1 Oil');
    expect(countsPhrase(0, 8, 'sets')).toBe('8 Oils');
    expect(countsPhrase(2548, 0, 'oils')).toBe('2,548 Sets');
  });
});

describe('Deals', () => {
  it('holds only bottles: no set and no oil is a deal', () => {
    expect(DEALS.length).toBeGreaterThan(100);
    expect(DEALS.filter((d) => productKind(d.fragrance) !== 'bottle').map((d) => `${d.fragrance.id} ${productKind(d.fragrance)}`)).toEqual([]);
  });

  it('is built by a rule that names the kind, not by the absence of a reference price', () => {
    const src = readFileSync(resolve(root, 'scripts/build-deals.ts'), 'utf8');
    expect(src).toMatch(/productKind\(fragrance\) !== 'bottle'/);
  });
});
