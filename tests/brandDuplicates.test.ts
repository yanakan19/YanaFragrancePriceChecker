import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, HOUSE_PRODUCTS } from '../demo/catalogue.generated.js';
import {
  BRAND_LEGACY_ADDRESSES, BRAND_MERGES, KNOWN_ALIASES, brandGroupKey, brandKey, buildBrandCanon, knownAlias, pickBrandName, tidyBrandSpelling,
} from '../src/catalogue/brandName.js';
import { hasHtmlEntity } from '../src/catalogue/htmlEntities.js';
import { BRAND_ALIAS_SLUGS, matchRoute, slugify } from '../demo/router.js';

/**
 * Every house is one brand (11 Oct 2026). The Brands list, a brand page, the
 * filters, a product tile and the sitemap all read the brand's display name off
 * the catalogue, so the rule is checked on the catalogues as built: the UK's,
 * and the US and India region files committed beside them.
 *
 * The cause was a feed's spelling, not a different house: "Dolce &amp; Gabbana"
 * (a shop's markup, entity and all) beside "Dolce & Gabbana", "Dkny" beside
 * "DKNY", "Dolce and Gabbana", "Hermes" beside "Hermès", "AMOUAGE" beside
 * "Amouage" in the US.
 */

interface Named { brand: string; name: string }
const region = (folder: 'us' | 'in'): Named[] =>
  (JSON.parse(readFileSync(new URL(`../data/regions/${folder}/catalogue.json`, import.meta.url), 'utf8')) as { products: Named[] }).products;

const CATALOGUES: Record<string, Named[]> = {
  UK: CATALOGUE,
  US: region('us'),
  India: region('in'),
};

describe('brandGroupKey', () => {
  const same = (...spellings: string[]) => {
    const keys = new Set(spellings.map(brandGroupKey));
    expect([...keys], spellings.join(' | ')).toHaveLength(1);
  };
  const apart = (a: string, b: string) => expect(brandGroupKey(a), `${a} | ${b}`).not.toBe(brandGroupKey(b));

  it('makes one key of every spelling of Dolce & Gabbana the shops use', () => {
    same('Dolce & Gabbana', 'Dolce &amp; Gabbana', 'DOLCE & GABBANA', 'Dolce&Gabbana', 'Dolce and Gabbana', 'dolce  &  gabbana ', 'DOLCE GABBANA');
  });

  it('decodes an HTML entity before it compares', () => {
    same("L'Occitane", 'L&#039;Occitane', 'L&#39;Occitane', 'L&apos;Occitane', 'LOccitane', 'L’Occitane');
    same('Viktor & Rolf', 'Viktor &amp; Rolf', 'Viktor&Rolf', 'VIKTOR & ROLF');
    same('Tiffany & Co', 'Tiffany &amp; Co', 'Tiffany & Co.', 'TIFFANY & CO');
    same('Zadig & Voltaire', 'Zadig &amp; Voltaire', 'Zadig and Voltaire');
    same('Abercrombie & Fitch', 'Abercrombie &amp; Fitch', 'ABERCROMBIE & FITCH');
  });

  it('drops an accent, and the letters that have no accent to drop', () => {
    same('Hermès', 'Hermes', 'HERMES', 'Herm&egrave;s');
    same('Beyoncé', 'Beyonce', 'BEYONCE');
    same('Comme des Garçons', 'Comme des Garcons', 'COMME DES GARÇONS');
    same('Neela Vermeire Créations', 'Neela Vermeire Creations');
    same('Mäurer & Wirtz', 'Maurer & Wirtz', 'Maurer and Wirtz', 'M&auml;urer &amp; Wirtz');
    same('Kanøn', 'Kanon');
    same('Straße', 'Strasse');
  });

  it('reads "&", "+" and the word "and" between two words as one thing', () => {
    same('Malin + Goetz', 'Malin and Goetz', 'Malin & Goetz', 'Malin+Goetz');
    same('D.S. & Durga', 'D.S. and Durga', 'DS & Durga', 'D.S & Durga', 'DS & DURGA');
    same('Marmol & Son', 'Marmol and Son');
    same('Scotch & Soda', 'Scotch and Soda');
  });

  it('drops an apostrophe rather than splitting the word at it', () => {
    same("Penhaligon's", 'Penhaligons', "PENHALIGON'S", 'Penhaligon’s');
    same("Perfumer's Workshop", 'Perfumers Workshop', 'Perfumer’s Workshop');
  });

  it('drops a trailing legal form, and only that', () => {
    same('Assaf Trading LLC', 'Assaf Trading');
    same('Foo Ltd', 'Foo Limited', 'Foo', 'Foo Pvt. Ltd.', 'FOO LTD.');
    same('Acme Inc', 'Acme');
    same('Acme GmbH', 'Acme');
    apart('Ltd', 'Limited');
    apart('Foo Ltd Bar', 'Foo Bar');
  });

  it('leaves a leading or trailing "and" in place, so no house becomes another', () => {
    apart('And Fragrance', 'Fragrance');
    apart('And Fragrance', 'Fragrance World');
    apart('Rock and', 'Rock');
  });

  it('keeps genuinely different houses apart', () => {
    apart('Rare', 'Rare Beauty');
    apart('Essential Parfums', 'Essential Perfumes');
    apart('Armaf', 'Armaf Online Shop');
    apart('Orchid', 'Gulf Orchid');
    apart('Lamborghini', 'Tonino Lamborghini');
    apart('Maison Margiela', 'Margiela');
    apart('Al Haramain', 'Al Rehab');
    apart('Dolce & Gabbana', 'Dolce Donna');
    apart('Baron', 'The Baron');
    apart('Paris', 'Paris Perfumes');
    apart('Tom Ford', 'Ford');
  });

  it('is not defeated by what brandKey keeps: the two agree wherever brandKey says two spellings are one', () => {
    for (const [a, b] of [['Hermès', 'Hermes'], ['Chloé', 'Chloe'], ["L'Occitane", 'LOccitane'], ['Mont Blanc', 'Montblanc'], ['Dolce&Gabbana', 'Dolce & Gabbana']] as const) {
      expect(brandKey(a)).toBe(brandKey(b));
      expect(brandGroupKey(a)).toBe(brandGroupKey(b));
    }
  });
});

describe('brandKey and entities', () => {
  it('decodes an entity before it compares, so a title that slipped through still groups', () => {
    expect(brandKey('Dolce &amp; Gabbana')).toBe(brandKey('Dolce & Gabbana'));
    expect(brandKey('L&#039;Occitane')).toBe(brandKey("L'Occitane"));
  });

  it('moves no key of a string without an entity (the link and alias files are keyed on them)', () => {
    expect(brandKey('Scotch and Soda')).toBe('scotchandsoda');
    expect(brandKey('Black and White')).toBe('blackandwhite');
    expect(brandKey('Dolce & Gabbana')).toBe('dolcegabbana');
    expect(brandKey('Assaf Trading LLC')).toBe('assaftradingllc');
    expect(brandKey('Kanøn')).toBe('kann');
  });
});

describe('tidyBrandSpelling', () => {
  it('decodes, joins words by one space and trims', () => {
    expect(tidyBrandSpelling('Dolce &amp; Gabbana')).toBe('Dolce & Gabbana');
    expect(tidyBrandSpelling('  Hugo   Boss ')).toBe('Hugo Boss');
    expect(tidyBrandSpelling('Hugo Boss')).toBe('Hugo Boss');
    expect(tidyBrandSpelling('Hugo&nbsp;Boss')).toBe('Hugo Boss');
  });

  it('composes an accent written as a letter and a combining mark', () => {
    expect(tidyBrandSpelling('Hermès')).toBe('Hermès');
  });

  it('leaves an apostrophe as the shop wrote it', () => {
    expect(tidyBrandSpelling("Penhaligon's")).toBe("Penhaligon's");
    expect(tidyBrandSpelling('Penhaligon’s')).toBe('Penhaligon’s');
  });
});

describe('which spelling is kept', () => {
  const pick = (entries: Record<string, number>) => pickBrandName(new Map(Object.entries(entries)));

  it('keeps a known acronym as published, ahead of a title cased copy (Dkny was 166 products)', () => {
    expect(pick({ Dkny: 166, DKNY: 8 })).toBe('DKNY');
    expect(pick({ DKNY: 3, Dkny: 90 })).toBe('DKNY');
  });

  it('keeps ordinary mixed case over shouting, whatever the volume', () => {
    expect(pick({ ARMAF: 195, Armaf: 12 })).toBe('Armaf');
    expect(pick({ 'CALVIN KLEIN': 25, 'Calvin Klein': 270, 'calvin klein': 40 })).toBe('Calvin Klein');
  });

  it('keeps the accent a feed stripped', () => {
    expect(pick({ Hermes: 127, 'Hermès': 2, HERMES: 19 })).toBe('Hermès');
    expect(pick({ 'Comme des Garcons': 39, 'Comme des Garçons': 23 })).toBe('Comme des Garçons');
    expect(pick({ Chloe: 15, 'Chloé': 1, CHLOE: 15 })).toBe('Chloé');
  });

  it('keeps the apostrophe a feed stripped', () => {
    expect(pick({ Penhaligons: 10, "Penhaligon's": 2 })).toBe("Penhaligon's");
    expect(pick({ LOccitane: 4, "L'Occitane": 1 })).toBe("L'Occitane");
  });

  it('keeps the ampersand where the shops that wrote "and" are the majority', () => {
    expect(pick({ 'Dolce and Gabbana': 131, 'Dolce & Gabbana': 98 })).toBe('Dolce & Gabbana');
    expect(pick({ 'Malin and Goetz': 9, 'Malin + Goetz': 2 })).toBe('Malin + Goetz');
    expect(pick({ 'D.S. and Durga': 30, 'D.S. & Durga': 3 })).toBe('D.S. & Durga');
  });

  it('keeps the joining words in lower case, as the houses write them', () => {
    expect(pick({ 'Oscar De La Renta': 31, 'Oscar de la Renta': 19 })).toBe('Oscar de la Renta');
    expect(pick({ 'Parfums De Marly': 81, 'Parfums de Marly': 9 })).toBe('Parfums de Marly');
    expect(pick({ 'Juliette Has A Gun': 25, 'Juliette Has a Gun': 8 })).toBe('Juliette Has a Gun');
    expect(pick({ 'Acqua Di Parma': 98, 'Acqua di Parma': 8 })).toBe('Acqua di Parma');
    expect(pick({ 'Atelier Des Ors': 7, 'Atelier des Ors': 7 })).toBe('Atelier des Ors');
  });

  it('counts an apostrophe inside a word, not a stray one beside a space', () => {
    expect(pick({ 'La French': 88, "La' French": 5 })).toBe('La French');
    expect(pick({ "D'Orsay": 3, Dorsay: 40 })).toBe("D'Orsay");
  });

  it('keeps the spaced ampersand over a tight one', () => {
    expect(pick({ 'Dolce&Gabbana': 7, 'Dolce & Gabbana': 2 })).toBe('Dolce & Gabbana');
    expect(pick({ 'Viktor&Rolf': 4, 'Viktor & Rolf': 1 })).toBe('Viktor & Rolf');
  });

  it('keeps the name without the legal form a vendor field copied', () => {
    expect(pick({ 'Assaf Trading LLC': 9, 'Assaf Trading': 1 })).toBe('Assaf Trading');
  });

  it('otherwise keeps the spelling more listings use, and breaks a tie the same way every build', () => {
    expect(pick({ 'Mont Blanc': 75, Montblanc: 26 })).toBe('Mont Blanc');
    expect(pick({ B: 2, A: 2 })).toBe('A');
    expect(pick({})).toBe('');
  });
});

describe('buildBrandCanon on the strings the shops used', () => {
  it('gives the entity spelling the name of the decoded one, whichever it is asked by', () => {
    const canon = buildBrandCanon(['Dolce & Gabbana', 'Dolce & Gabbana', 'Dolce &amp; Gabbana', 'Dolce&Gabbana']);
    expect(canon.get('Dolce &amp; Gabbana')).toBe('Dolce & Gabbana');
    expect(canon.get('Dolce & Gabbana')).toBe('Dolce & Gabbana');
    expect(canon.get('Dolce&Gabbana')).toBe('Dolce & Gabbana');
  });

  it('decodes a brand that only ever came with its entity', () => {
    const canon = buildBrandCanon(['L&#039;Occitane']);
    expect(canon.get('L&#039;Occitane')).toBe("L'Occitane");
    expect(canon.get("L'Occitane")).toBe("L'Occitane");
  });

  it('makes one brand of the five spellings the US shops used for Dolce & Gabbana', () => {
    const spellings = ['Dolce & Gabbana', 'Dolce&Gabbana', 'Dolce and Gabbana', 'DOLCE & GABBANA', 'DOLCE GABBANA'];
    const canon = buildBrandCanon([...spellings, 'Dolce and Gabbana', 'Dolce and Gabbana']);
    expect(new Set(spellings.map((s) => canon.get(s))).size).toBe(1);
    expect(canon.get('Dolce and Gabbana')).toBe('Dolce & Gabbana');
  });

  it('makes one brand of Hermes, HERMES and Hermès, and of the Chloe group, with the accent', () => {
    const canon = buildBrandCanon(['Hermes', 'Hermes', 'HERMES', 'Hermès', 'Chloe', 'CHLOE', 'Chloé']);
    for (const s of ['Hermes', 'HERMES', 'Hermès']) expect(canon.get(s), s).toBe('Hermès');
    for (const s of ['Chloe', 'CHLOE', 'Chloé']) expect(canon.get(s), s).toBe('Chloé');
  });

  it('gives the shouted-only US spellings the title cased name once, not twice', () => {
    const canon = buildBrandCanon(['Amouage', 'AMOUAGE', 'Montale', 'MONTALE', 'Calvin Klein', 'CALVIN KLEIN']);
    expect(canon.get('AMOUAGE')).toBe('Amouage');
    expect(canon.get('MONTALE')).toBe('Montale');
    expect(canon.get('CALVIN KLEIN')).toBe('Calvin Klein');
  });

  it('keeps DKNY, not Dkny', () => {
    const canon = buildBrandCanon(['DKNY', 'Dkny', 'Dkny', 'Donna Karan']);
    for (const s of ['DKNY', 'Dkny', 'Donna Karan']) expect(canon.get(s), s).toBe('DKNY');
  });

  it('keeps the house spelling Montblanc over the two word spelling most US shops write', () => {
    const canon = buildBrandCanon(['Mont Blanc', 'Mont Blanc', 'MONT BLANC', 'Montblanc']);
    for (const s of ['Mont Blanc', 'MONT BLANC', 'Montblanc']) expect(canon.get(s), s).toBe('Montblanc');
  });

  it('keeps a legal form out of the name when the plain name is also there', () => {
    const canon = buildBrandCanon(['Assaf Trading', 'Assaf Trading LLC']);
    expect(canon.get('Assaf Trading LLC')).toBe('Assaf Trading');
  });

  it('keeps the pairs that were refused or are not one house apart', () => {
    const canon = buildBrandCanon([
      'Rare', 'Rare Beauty', 'Essential Parfums', 'Essential Perfumes', 'Baron', 'The Baron', 'Paris', 'Paris Perfumes',
      'Orchid', 'Gulf Orchid', 'And Fragrance', 'Fragrance',
    ]);
    for (const s of ['Rare', 'Rare Beauty', 'Essential Parfums', 'Essential Perfumes', 'Baron', 'The Baron', 'Paris', 'Paris Perfumes', 'Orchid', 'Gulf Orchid', 'And Fragrance', 'Fragrance']) {
      expect(canon.get(s), s).toBe(s);
    }
  });

  it('is the same whatever order the strings arrive in', () => {
    const strings = ['Dolce and Gabbana', 'Dolce & Gabbana', 'DOLCE & GABBANA', 'Dolce &amp; Gabbana', 'Hermes', 'Hermès', 'HERMES'];
    const forwards = buildBrandCanon(strings);
    const backwards = buildBrandCanon([...strings].reverse());
    for (const s of strings) expect(backwards.get(s), s).toBe(forwards.get(s));
  });
});

describe('the reviewed names', () => {
  const kept = [...new Set(Object.values(KNOWN_ALIASES))];

  it('are tidy: no entity, no stray space', () => {
    for (const name of kept) {
      expect(hasHtmlEntity(name), name).toBe(false);
      expect(tidyBrandSpelling(name), name).toBe(name);
    }
    for (const [from, to] of BRAND_MERGES) {
      expect(hasHtmlEntity(from) || hasHtmlEntity(to), `${from} | ${to}`).toBe(false);
    }
  });

  it('are each one house: no two kept names share a group key', () => {
    const owner = new Map<string, string>();
    for (const name of kept) {
      const key = brandGroupKey(name);
      expect(owner.get(key) ?? name, `${name} and ${owner.get(key)} are one house`).toBe(name);
      owner.set(key, name);
    }
  });

  it('all resolve: every merged spelling becomes the kept one, and the kept one stays', () => {
    const strings = BRAND_MERGES.flatMap(([from, to]) => [from, to]);
    const canon = buildBrandCanon(strings);
    for (const [from, to] of BRAND_MERGES) {
      expect(canon.get(from), `${from} -> ${to}`).toBe(to);
      expect(canon.get(to), `${to} stays`).toBe(to);
      expect(knownAlias(from), from).toBe(to);
    }
  });

  it('also resolve for a spelling they never listed, if it differs only by what the group key ignores', () => {
    expect(knownAlias('Zadig &amp; Voltaire')).toBe('Zadig & Voltaire');
    expect(knownAlias('SCOTCH & SODA')).toBe('Scotch & Soda');
    expect(knownAlias('Tiffany &amp; Co.')).toBe('Tiffany & Co');
    expect(knownAlias('Hermes')).toBe('Hermès');
    expect(knownAlias('Beyonce')).toBe('Beyoncé');
    expect(knownAlias('No Such House')).toBeUndefined();
  });

  it('put no two merged spellings under two different kept names', () => {
    const target = new Map<string, string>();
    for (const [from, to] of BRAND_MERGES) {
      const key = brandGroupKey(from);
      expect(target.get(key) ?? to, `${from} is merged into two houses`).toBe(to);
      target.set(key, to);
    }
  });
});

describe.each(Object.entries(CATALOGUES))('the %s catalogue as built', (_name, products) => {
  const brands = [...new Set(products.map((p) => p.brand))];

  it('has brands to check', () => {
    expect(brands.length).toBeGreaterThan(400);
  });

  it('shows no two brands that are the same house spelt two ways', () => {
    const byKey = new Map<string, string[]>();
    for (const brand of brands) {
      const key = brandGroupKey(brand);
      byKey.set(key, [...(byKey.get(key) ?? []), brand]);
    }
    const duplicates = [...byKey.values()].filter((names) => names.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('carries no HTML entity in a brand or a product name', () => {
    expect(brands.filter(hasHtmlEntity)).toEqual([]);
    expect(products.filter((p) => hasHtmlEntity(p.name)).map((p) => p.name)).toEqual([]);
    expect(brands.filter((b) => /&#?\w+;/.test(b))).toEqual([]);
  });

  it('writes every brand tidily: no stray space, no doubled space', () => {
    expect(brands.filter((b) => b !== tidyBrandSpelling(b))).toEqual([]);
  });

  it('has no spelling the reviewed table merges away', () => {
    const shown = new Set(brands);
    const left = BRAND_MERGES.filter(([from]) => shown.has(from)).map(([from, to]) => `${from} should be ${to}`);
    expect(left).toEqual([]);
  });

  it('shows every house under the name the reviewed table keeps for it', () => {
    const wrong = brands
      .map((b) => [b, knownAlias(b)] as const)
      .filter(([b, alias]) => alias !== undefined && alias !== b)
      .map(([b, alias]) => `${b} should be ${alias}`);
    expect(wrong).toEqual([]);
  });
});

describe('the house files and the UK catalogue agree on the entity rule', () => {
  it('has no entity in a house product brand or name', () => {
    expect(HOUSE_PRODUCTS.filter((p) => hasHtmlEntity(p.brand) || hasHtmlEntity(p.name)).map((p) => `${p.brand} | ${p.name}`)).toEqual([]);
  });
});

describe('old brand addresses', () => {
  const live = new Set(Object.values(CATALOGUES).flatMap((products) => products.map((p) => slugify(p.brand))));

  it('open the brand that holds the house now, from the six UK brand pages that had an entity in their address', () => {
    for (const [old, now] of [
      ['dolce-and-amp-gabbana', 'dolce-and-gabbana'],
      ['viktor-and-amp-rolf', 'viktor-and-rolf'],
      ['abercrombie-and-amp-fitch', 'abercrombie-and-fitch'],
      ['tiffany-and-amp-co', 'tiffany-and-co'],
      ['zadig-and-amp-voltaire', 'zadig-and-voltaire'],
      ['l-and-039-occitane', 'l-occitane'],
    ] as const) {
      expect(matchRoute(`/brands/${old}`), old).toMatchObject({ name: 'brand', param: now });
      expect(live.has(now), now).toBe(true);
    }
  });

  it('open the house spelling for the spellings the rule folded in', () => {
    expect(matchRoute('/brands/hermes')).toMatchObject({ name: 'brand', param: 'herm-s' });
    expect(matchRoute('/brands/mont-blanc')).toMatchObject({ name: 'brand', param: 'montblanc' });
    expect(matchRoute('/brands/malin-and-goetz')).toMatchObject({ name: 'brand', param: 'malin-goetz' });
    expect(matchRoute('/brands/penhaligons')).toMatchObject({ name: 'brand', param: 'penhaligon-s' });
  });

  it('are each a spelling no catalogue shows any more, sending to a brand one does', () => {
    for (const [legacy, current] of BRAND_LEGACY_ADDRESSES) {
      expect(live.has(slugify(legacy)), `${legacy} is a brand page now`).toBe(false);
      expect(live.has(slugify(current)), `${current} is no brand`).toBe(true);
      expect(BRAND_ALIAS_SLUGS[slugify(legacy)], legacy).toBe(slugify(current));
    }
  });

  it('never send a merged brand page two ways', () => {
    const merged = new Map(BRAND_MERGES.map(([from, to]) => [slugify(from), slugify(to)]));
    const seen = new Set<string>();
    for (const [legacy, current] of BRAND_LEGACY_ADDRESSES) {
      const slug = slugify(legacy);
      expect(seen.has(slug), `${legacy} is listed twice`).toBe(false);
      seen.add(slug);
      if (merged.has(slug)) expect(merged.get(slug), legacy).toBe(slugify(current));
    }
  });

  it('send nothing to a brand that is itself folded away again', () => {
    for (const [, current] of BRAND_LEGACY_ADDRESSES) {
      expect(BRAND_ALIAS_SLUGS[slugify(current)], `${current} is folded into ${BRAND_ALIAS_SLUGS[slugify(current)]}`).toBeUndefined();
    }
  });

  it('keep every current brand page address as it is', () => {
    for (const slug of live) expect(BRAND_ALIAS_SLUGS[slug], slug).toBeUndefined();
  });
});
