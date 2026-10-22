import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import {
  KEEP_APART_AUDIENCE,
  SAME_FRAGRANCE_AUDIENCE,
  audienceFamilyKey,
  audienceFreeKey,
  audiencesOf,
  findAudienceDuplicates,
  findSameBottleGroups,
  readAudienceName,
} from '../src/catalogue/audienceNames.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { KEPT_APART_UNPROVEN, KEEP_APART_REVIEWED, SAME_FRAGRANCE_REVIEWED } from '../src/catalogue/audienceReviewed.js';
import { matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';
import { regionMatchName } from '../src/catalogue/regionCatalogue.js';
import { displayName, stripShopTitleLabel } from '../src/catalogue/productName.js';

/**
 * The same fragrance is one product (12 Oct 2026). "Vulcan Feu" and "Vulcan Feu
 * for Unisex", "Hawas" and "Hawas For Him": a shop's marketing words are not a
 * name, and the bottle was listed twice with two prices and no comparison.
 *
 * The words cannot just be dropped from every name, because a house also sells
 * two different bottles under one name and the words tell them apart (Gucci
 * Guilty Pour Homme and Pour Femme, Calvin Klein IN2U for Him and for Her), so
 * this checks the rule on both sides: what must merge, what must not, and that
 * the catalogues as built have nothing the rule would still merge.
 */

const product = (over: Partial<MatchableProduct> & { id: string; name: string }): MatchableProduct => ({
  brand: 'Test House',
  concentration: 'Eau de Parfum',
  sizeMl: 100,
  ean: null,
  ...over,
});

describe('reading who a name is for', () => {
  const read = (name: string) => {
    const r = readAudienceName(name);
    return { rest: r.rest, audiences: audiencesOf(r).sort() };
  };

  it('cuts the audience words and says which they were', () => {
    expect(read('Vulcan Feu for Unisex')).toEqual({ rest: 'Vulcan Feu', audiences: ['u'] });
    expect(read('Afnan 9pm Rebel (Unisex)').audiences).toEqual(['u']);
    expect(read('Hawas For Him')).toEqual({ rest: 'Hawas', audiences: ['m'] });
    expect(read('Eros Pour Homme').audiences).toEqual(['m']);
    expect(read('Black XS Her').audiences).toEqual(['f']);
    expect(read('Funny Femme for Her').audiences).toEqual(['f']);
    expect(read('Obsession for Men and Women').audiences).toEqual(['u']);
    expect(read('Alien').audiences).toEqual([]);
  });

  it('keeps the words that are the fragrance\'s own', () => {
    expect(read("Rose Of No Man's Land").audiences).toEqual([]);
    expect(read('Portrait of a Lady').audiences).toEqual([]);
    expect(read('Donna Karan Cashmere Mist').audiences).toEqual([]);
  });

  it('gives "Vulcan Feu" and "Hawas" the same key with and without the words', () => {
    const key = (name: string, brand: string) => audienceFreeKey(product({ id: name, name, brand }));
    expect(key('Vulcan Feu for Unisex', 'French Avenue')).toBe(key('Vulcan Feu', 'French Avenue'));
    expect(key('Vulcan Feu (Unisex)', 'French Avenue')).toBe(key('Vulcan Feu', 'French Avenue'));
    expect(key('Hawas For Him', 'Rasasi')).toBe(key('Hawas', 'Rasasi'));
  });

  it('never makes a key that joins different concentrations or sizes', () => {
    const edp = product({ id: 'a', name: 'Hawas For Him' });
    expect(audienceFreeKey(edp)).not.toBe(audienceFreeKey({ ...edp, concentration: 'Eau de Toilette' }));
    expect(audienceFreeKey(edp)).not.toBe(audienceFreeKey({ ...edp, sizeMl: 50 }));
    expect(audienceFamilyKey(edp)).toBe(audienceFamilyKey({ ...edp, concentration: 'Eau de Toilette', sizeMl: 50 }));
  });
});

describe('what is merged, and on what evidence', () => {
  const groups = (list: MatchableProduct[]) => findAudienceDuplicates(list);

  it('merges "Unisex" with the plain name when nothing says the plain name is for one sex', () => {
    const found = groups([product({ id: 'a', name: 'Vulcan Feu' }), product({ id: 'b', name: 'Vulcan Feu for Unisex' })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.evidence).toBe('unisex');
    expect(found[0]!.name).toBe('Vulcan Feu');
  });

  it('merges one audience written two ways', () => {
    const found = groups([product({ id: 'a', name: 'Black XS Her' }), product({ id: 'b', name: 'Black XS For Her' }), product({ id: 'c', name: 'Black XS Pour Femme' })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.absorbed).toHaveLength(2);
  });

  it('merges a plain name with its "for Him" name on a shared barcode, and on nothing weaker', () => {
    const plain = product({ id: 'a', name: 'Hawas', brand: 'Other House', ean: '0614514331026' });
    const him = product({ id: 'b', name: 'Hawas For Him', brand: 'Other House', ean: '614514331026' });
    expect(groups([plain, him])).toHaveLength(1);
    expect(groups([{ ...plain, ean: null }, { ...him, ean: null }])).toHaveLength(0);
  });

  it('merges a plain name with a labelled one when the plain name\'s own shops say the same', () => {
    const plain = product({ id: 'a', name: 'Libre' });
    const her = product({ id: 'b', name: 'Libre For Her' });
    const found = findAudienceDuplicates([plain, her], { statedAudience: (p) => (p.id === 'a' ? 'f' : null) });
    expect(found).toHaveLength(1);
    expect(found[0]!.evidence).toBe('shops say so');
    const wrongWay = findAudienceDuplicates([plain, her], { statedAudience: (p) => (p.id === 'a' ? 'm' : null) });
    expect(wrongWay).toHaveLength(0);
  });

  it('merges the reviewed Rasasi Hawas names without a barcode', () => {
    const found = groups([product({ id: 'a', name: 'Hawas Ice', brand: 'Rasasi' }), product({ id: 'b', name: 'Hawas Ice For Him', brand: 'Rasasi' })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.evidence).toBe('reviewed');
    // The same words at a house nobody reviewed are left alone.
    expect(groups([product({ id: 'a', name: 'Hawas Ice' }), product({ id: 'b', name: 'Hawas Ice For Him' })])).toHaveLength(0);
  });

  it('keeps Gucci Guilty Pour Homme and Pour Femme two products', () => {
    // A made-up house with the Guilty pattern, so the rule is tested without the reviewed list (Gucci Guilty is in it).
    const homme = product({ id: 'a', brand: 'Testa', name: 'Guilty Pour Homme', concentration: 'Eau de Toilette', sizeMl: 90 });
    const femme = product({ id: 'b', brand: 'Testa', name: 'Guilty Pour Femme', concentration: 'Eau de Toilette', sizeMl: 90 });
    const plain = product({ id: 'c', brand: 'Testa', name: 'Guilty', concentration: 'Eau de Toilette', sizeMl: 90 });
    expect(groups([homme, femme])).toHaveLength(0);
    // The plain name is the women's bottle, so it does not join "Pour Homme" on the words.
    expect(groups([homme, plain])).toHaveLength(0);
    expect(groups([homme, femme, plain])).toHaveLength(0);
    // Even with the shops saying the plain name is the women's: it joins Pour Femme, never Pour Homme.
    const found = findAudienceDuplicates([homme, femme, plain], { statedAudience: (p) => (p.id === 'c' ? 'f' : null) });
    expect(found).toHaveLength(1);
    expect(found[0]!.absorbed.concat(found[0]!.canonical).map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('keeps a pair apart when their barcodes differ and a shop sells both', () => {
    const him = product({ id: 'a', brand: 'Calvin Klein', name: 'IN2U For Him', ean: '0088300196890' });
    const her = product({ id: 'b', brand: 'Calvin Klein', name: 'IN2U For Her', ean: '0088300196814' });
    expect(groups([him, her])).toHaveLength(0);
    const unisexA = product({ id: 'c', name: 'Musk', ean: '6291100130153' });
    const unisexB = product({ id: 'd', name: 'Musk Unisex', ean: '6291100130177' });
    expect(findAudienceDuplicates([unisexA, unisexB], { shopsOf: () => ['one-shop'] })).toHaveLength(0);
  });

  it('keeps a men\'s and a women\'s bottle of one name apart whatever the plain name is', () => {
    const list = [
      product({ id: 'plain', name: 'Weekend' }),
      product({ id: 'men', name: 'Weekend For Men' }),
      product({ id: 'women', name: 'Weekend For Women' }),
    ];
    expect(groups(list)).toHaveLength(0);
    // Unisex never joins a plain name that has men's and women's siblings.
    expect(groups([...list, product({ id: 'uni', name: 'Weekend Unisex' })])).toHaveLength(0);
  });

  it('never joins a different size or strength', () => {
    const base = product({ id: 'a', name: 'Vulcan Feu' });
    expect(groups([base, product({ id: 'b', name: 'Vulcan Feu Unisex', sizeMl: 50 })])).toHaveLength(0);
    expect(groups([base, product({ id: 'c', name: 'Vulcan Feu Unisex', concentration: 'Eau de Toilette' })])).toHaveLength(0);
  });

  it('finds the same groups when asked through the one call both catalogues use', () => {
    const list = [product({ id: 'a', name: 'Vulcan Feu' }), product({ id: 'b', name: 'Vulcan Feu for Unisex' })];
    const found = findSameBottleGroups(list);
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('Vulcan Feu');
  });

  it('changes nothing about how two names match when no audience word is involved', () => {
    const a = product({ id: 'a', name: 'Aventus' });
    const b = product({ id: 'b', name: 'Aventus Cologne' });
    expect(matchKey(a)).not.toBe(matchKey(b));
    expect(groups([a, b])).toHaveLength(0);
  });

  it('keeps the reviewed tables well formed', () => {
    for (const e of SAME_FRAGRANCE_AUDIENCE) {
      expect(e.evidence.length, `${e.brand} ${e.name}`).toBeGreaterThan(20);
      expect(audiencesOf(readAudienceName(e.name)), `${e.name} is the plain name`).toEqual([]);
    }
    for (const e of KEEP_APART_AUDIENCE) expect(e.reason.length).toBeGreaterThan(20);
    const keys = SAME_FRAGRANCE_AUDIENCE.map((e) => `${brandKey(e.brand)}|${audienceFamilyKey(product({ id: 'k', brand: e.brand, name: e.name }))}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the name pairs reviewed on 13 Oct 2026', () => {
  const key = (brand: string, name: string) => `${brandKey(brand)}|${audienceFamilyKey(product({ id: 'k', brand, name }))}`;
  const word = { m: 'for Men', f: 'for Women', u: 'Unisex' } as const;
  const other = { m: 'for Women', f: 'for Men', u: 'for Men' } as const;

  it('keeps all three lists well formed: evidence on every line, a plain name, nobody in two lists', () => {
    for (const e of SAME_FRAGRANCE_REVIEWED) {
      expect(['m', 'f', 'u']).toContain(e.is);
      expect(e.evidence.length, `${e.brand} ${e.name}`).toBeGreaterThan(30);
      expect(audiencesOf(readAudienceName(e.name)), `${e.name} is the plain spelling`).toEqual([]);
    }
    for (const e of [...KEEP_APART_REVIEWED, ...KEPT_APART_UNPROVEN]) {
      expect(e.reason.length, `${e.brand} ${e.name}`).toBeGreaterThan(30);
      expect(audiencesOf(readAudienceName(e.name)), `${e.name} is the plain spelling`).toEqual([]);
    }
    const merged = new Set(SAME_FRAGRANCE_AUDIENCE.map((e) => key(e.brand, e.name)));
    const apart = [...KEEP_APART_REVIEWED, ...KEPT_APART_UNPROVEN].map((e) => key(e.brand, e.name));
    expect(new Set(apart).size, 'a family is listed once as kept apart').toBe(apart.length);
    expect(apart.filter((k) => merged.has(k)), 'a family is never both merged and kept apart').toEqual([]);
  });

  it('joins the plain name to the labelled name of the audience it is for, at every size, and to no other', () => {
    for (const e of SAME_FRAGRANCE_REVIEWED) {
      const plain = product({ id: 'p', brand: e.brand, name: e.name });
      const right = product({ id: 'r', brand: e.brand, name: `${e.name} ${word[e.is]}` });
      const wrong = product({ id: 'w', brand: e.brand, name: `${e.name} ${other[e.is]}` });
      expect(findAudienceDuplicates([plain, right]).length, `${e.name} ${word[e.is]}`).toBe(1);
      if (e.is !== 'u') expect(findAudienceDuplicates([plain, wrong]), `${e.name} ${other[e.is]}`).toEqual([]);
      const big = { ...right, id: 'r2', sizeMl: 50 };
      expect(findAudienceDuplicates([plain, big]), 'a different size is another product').toEqual([]);
    }
  });

  it('keeps a family on the keep apart list from being joined by the weaker rules, but a shared barcode still joins it', () => {
    for (const e of KEEP_APART_REVIEWED) {
      const plain = product({ id: 'p', brand: e.brand, name: e.name });
      const unisex = product({ id: 'u', brand: e.brand, name: `${e.name} Unisex` });
      expect(findAudienceDuplicates([plain, unisex]), `${e.brand} ${e.name}`).toEqual([]);
      const a = { ...plain, ean: '5012345678900' };
      const b = { ...unisex, ean: '5012345678900' };
      expect(findAudienceDuplicates([a, b]).length, `${e.brand} ${e.name} with one barcode`).toBe(1);
    }
  });

  it('never joins two different barcodes by a reviewed entry, however sure the words are', () => {
    for (const e of SAME_FRAGRANCE_REVIEWED) {
      const plain = product({ id: 'p', brand: e.brand, name: e.name, ean: '5012345678900' });
      const right = product({ id: 'r', brand: e.brand, name: `${e.name} ${word[e.is]}`, ean: '5012345678917' });
      expect(findAudienceDuplicates([plain, right], { shopsOf: () => ['a', 'b'] }), `${e.brand} ${e.name}`).toEqual([]);
    }
  });
});

describe("Scent Warehouse's closing label", () => {
  it('comes off the title and is kept as the audience', () => {
    expect(stripShopTitleLabel('French Avenue Vulcan Feu 100ml Eau de Parfum Spray for Unisex', 'scent-warehouse')).toEqual({
      title: 'French Avenue Vulcan Feu 100ml Eau de Parfum Spray',
      audience: 'unisex',
    });
    expect(stripShopTitleLabel('Mugler Alien 60ml Eau De Parfum Refillable Spray for Her', 'scent-warehouse').audience).toBe('womens');
    expect(stripShopTitleLabel('Rasasi Hawas Black 100ml Eau de Parfum Spray For Him', 'scent-warehouse').audience).toBe('mens');
  });

  it('leaves the words that are part of the name, and every other shop, alone', () => {
    const own = stripShopTitleLabel('Replay True For Him 30ml Eau De Toilette Spray for Him', 'scent-warehouse');
    expect(displayName(own.title, 'Replay', 'Replay')).toMatch(/True For Him$/i);
    const untouched = 'Dior Sauvage Eau de Parfum Spray for Him';
    expect(stripShopTitleLabel(untouched, 'some-other-shop')).toEqual({ title: untouched, audience: null });
    expect(stripShopTitleLabel('Some Serum 30ml', 'scent-warehouse')).toEqual({ title: 'Some Serum 30ml', audience: null });
  });
});

interface Named extends MatchableProduct { offers?: { shopId: string }[] }
const region = (folder: 'us' | 'in' | 'ca'): Named[] =>
  (JSON.parse(readFileSync(new URL(`../data/regions/${folder}/catalogue.json`, import.meta.url), 'utf8')) as { products: Named[] }).products.filter(
    (p) => (p as { kind?: string }).kind !== 'set',
  );

describe('the catalogues as built', () => {
  const uk = (CATALOGUE as unknown as MatchableProduct[]).map((p) => ({ ...p }));
  const ukShops = (p: MatchableProduct) => (CRAWLED[p.id] ?? []).map((o) => o.retailerId);

  it('have no two products of one house, strength and size that differ only by an audience word the rule merges (UK)', () => {
    const left = findAudienceDuplicates(uk, { shopsOf: ukShops });
    expect(left.map((g) => [g.canonical, ...g.absorbed].map((p) => `${p.brand} | ${p.name} ${p.concentration} ${p.sizeMl}`))).toEqual([]);
  });

  for (const [label, folder] of [['US', 'us'], ['India', 'in'], ['Canada', 'ca']] as const) {
    it(`have none in the ${label} catalogue either`, () => {
      const proxies = region(folder)
        .filter((p) => p.brand !== '')
        .map((p) => ({ ...p, name: regionMatchName(p.name) }));
      const left = findAudienceDuplicates(proxies, { shopsOf: (p) => (p as Named).offers?.map((o) => o.shopId) ?? [] });
      expect(left.map((g) => [g.canonical, ...g.absorbed].map((p) => `${p.brand} | ${p.name} ${p.concentration} ${p.sizeMl}`))).toEqual([]);
    });
  }

  it('list no "Unisex" name beside the same name without it (UK)', () => {
    const family = new Map<string, Set<string>>();
    for (const p of uk) {
      const k = audienceFamilyKey(p);
      if (k === null) continue;
      const set = family.get(`${brandKey(p.brand)}|${k}`) ?? new Set<string>();
      for (const a of audiencesOf(readAudienceName(p.name))) set.add(a);
      family.set(`${brandKey(p.brand)}|${k}`, set);
    }
    const byKey = new Map<string, MatchableProduct[]>();
    for (const p of uk) {
      const k = audienceFreeKey(p);
      if (k !== null) byKey.set(k, [...(byKey.get(k) ?? []), p]);
    }
    const pairs: string[] = [];
    for (const list of byKey.values()) {
      const plain = list.filter((p) => audiencesOf(readAudienceName(p.name)).length === 0);
      const unisex = list.filter((p) => audiencesOf(readAudienceName(p.name)).join('') === 'u');
      for (const u of unisex) {
        const fam = family.get(`${brandKey(u.brand)}|${audienceFamilyKey(u)}`)!;
        const gendered = [...fam].some((a) => a !== 'u');
        // Two or more plain products with different barcodes (a re-coded pack beside the old one)
        // leave a barcode-less "Unisex" name with no one product to join, so it joins none.
        const codes = new Set(plain.map((p) => p.ean).filter((c) => c !== null));
        const conflicting = (u.ean !== null && plain.some((p) => p.ean !== null && p.ean !== u.ean)) || codes.size > 1;
        if (!gendered && plain.length > 0 && !conflicting && matchKey(u) !== matchKey(plain[0]!)) {
          pairs.push(`${u.brand} | ${u.name} | ${plain[0]!.name}`);
        }
      }
    }
    expect(pairs).toEqual([]);
  });

  it('list Vulcan Feu once at each size and strength', () => {
    const feu = uk.filter((p) => brandKey(p.brand) === 'frenchavenue' && /^vulcan feu\b/i.test(readAudienceName(p.name).rest) && !/bundle|set|duo/i.test(p.name));
    const seen = new Map<string, string[]>();
    for (const p of feu) seen.set(`${p.concentration}|${p.sizeMl}`, [...(seen.get(`${p.concentration}|${p.sizeMl}`) ?? []), p.name]);
    expect([...seen].filter(([, names]) => names.length > 1)).toEqual([]);
  });

  it('list Rasasi Hawas and Hawas For Him as one scent at each size and strength, and keep Hawas For Her apart', () => {
    const hawas = uk.filter((p) => brandKey(p.brand) === 'rasasi' && audienceFreeKey(p) === audienceFreeKey({ ...p, name: 'Hawas' }));
    const men = new Map<string, string[]>();
    for (const p of hawas) {
      const claims = audiencesOf(readAudienceName(p.name));
      if (claims.includes('f')) continue;
      const k = `${p.concentration}|${p.sizeMl}`;
      men.set(k, [...(men.get(k) ?? []), p.name]);
    }
    expect([...men].filter(([, names]) => names.length > 1)).toEqual([]);
    const forHer = hawas.filter((p) => audiencesOf(readAudienceName(p.name)).includes('f'));
    for (const her of forHer) {
      const same = hawas.filter((p) => p.concentration === her.concentration && p.sizeMl === her.sizeMl && !audiencesOf(readAudienceName(p.name)).includes('f'));
      for (const p of same) expect(p.id).not.toBe(her.id);
    }
  });

  it('keep a house\'s "Pour Homme" and "Pour Femme" of one name as two products', () => {
    const pair = new Map<string, Set<string>>();
    for (const p of uk) {
      const a = audiencesOf(readAudienceName(p.name));
      if (a.length !== 1 || (a[0] !== 'm' && a[0] !== 'f') || p.sizeMl === null) continue;
      const k = `${audienceFreeKey(p)}`;
      pair.set(k, new Set([...(pair.get(k) ?? []), `${a[0]}:${p.id}`]));
    }
    // Wherever a name has both a men's and a women's version, they are different products.
    for (const ids of pair.values()) {
      const m = [...ids].filter((s) => s.startsWith('m:')).map((s) => s.slice(2));
      const f = [...ids].filter((s) => s.startsWith('f:')).map((s) => s.slice(2));
      for (const id of m) expect(f).not.toContain(id);
    }
  });
});
