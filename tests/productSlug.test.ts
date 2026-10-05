import { describe, expect, it } from 'vitest';
import {
  BRAND_NAME_MAX,
  RESERVED_WORDS,
  assignSlugs,
  baseSlug,
  foldText,
  isProductSlug,
  slugAliases,
  strengthToken,
  volumePart,
  type SlugProduct,
} from '../src/catalogue/productSlug.js';

function product(over: Partial<SlugProduct> & { id: string }): SlugProduct {
  return {
    brand: 'Creed',
    name: 'Aventus',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    giftSet: false,
    ...over,
  };
}

describe('foldText', () => {
  it('folds accents', () => {
    expect(foldText('Estée Lauder')).toBe('estee_lauder');
    expect(foldText('Chloé')).toBe('chloe');
    expect(foldText('Lancôme')).toBe('lancome');
    expect(foldText('Hermès Terre d’Hermès')).toBe('hermes_terre_dhermes');
    expect(foldText('Ørn Straße Æon Œuvre')).toBe('orn_strasse_aeon_oeuvre');
  });

  it('writes an ampersand as and', () => {
    expect(foldText('Dolce & Gabbana')).toBe('dolce_and_gabbana');
    expect(foldText('Dolce&Gabbana')).toBe('dolce_and_gabbana');
  });

  it('drops apostrophes instead of splitting on them', () => {
    expect(foldText("L'Interdit")).toBe('linterdit');
    expect(foldText('L’Eau d’Issey')).toBe('leau_dissey');
    expect(foldText("Men's Cologne")).toBe('mens_cologne');
  });

  it('turns other punctuation into one separator', () => {
    expect(foldText('N°5 L\'Eau')).toBe('n_5_leau');
    expect(foldText('Black XS (for Her) - Eau de Toilette!')).toBe('black_xs_for_her_eau_de_toilette');
    expect(foldText('  --Spice/Bomb  ')).toBe('spice_bomb');
  });

  it('can be empty for a name with no Latin letter', () => {
    expect(foldText('香水')).toBe('');
  });
});

describe('volumePart', () => {
  it('writes millilitres, a fraction with a p, a set as set and no size as nosize', () => {
    expect(volumePart({ sizeMl: 100, giftSet: false })).toBe('100ml');
    expect(volumePart({ sizeMl: 7.5, giftSet: false })).toBe('7p5ml');
    expect(volumePart({ sizeMl: 4.5, giftSet: false })).toBe('4p5ml');
    expect(volumePart({ sizeMl: null, giftSet: true })).toBe('set');
    expect(volumePart({ sizeMl: null, giftSet: false })).toBe('nosize');
  });
});

describe('baseSlug', () => {
  it('is brand, name and volume', () => {
    expect(baseSlug(product({ id: 'a' }))).toBe('creed_aventus_100ml');
    expect(
      baseSlug(product({ id: 'a', brand: 'Maison Francis Kurkdjian', name: 'Baccarat Rouge 540', sizeMl: 35 })),
    ).toBe('maison_francis_kurkdjian_baccarat_rouge_540_35ml');
  });

  it('applies the accent, ampersand and apostrophe rules to a whole product', () => {
    expect(baseSlug(product({ id: 'a', brand: 'Dolce & Gabbana', name: "L'Imperatrice", sizeMl: 50 }))).toBe(
      'dolce_and_gabbana_limperatrice_50ml',
    );
    expect(baseSlug(product({ id: 'a', brand: 'Estée Lauder', name: 'Youth Dew', sizeMl: 67 }))).toBe(
      'estee_lauder_youth_dew_67ml',
    );
  });

  it('drops a leading copy of the brand from the name when something is left', () => {
    expect(baseSlug(product({ id: 'a', brand: 'Lacoste', name: 'Lacoste Red', sizeMl: 90 }))).toBe('lacoste_red_90ml');
    expect(baseSlug(product({ id: 'a', brand: 'Hugo Boss', name: 'Hugo Boss Bottled', sizeMl: 50 }))).toBe(
      'hugo_boss_bottled_50ml',
    );
    // Nothing left after the brand: the name stays.
    expect(baseSlug(product({ id: 'a', brand: 'Kenzo', name: 'Kenzo', sizeMl: 50 }))).toBe('kenzo_kenzo_50ml');
  });

  it('uses the word set for a gift set and does not end set_set', () => {
    expect(
      baseSlug(
        product({
          id: 'a',
          brand: 'Rabanne',
          name: 'Phantom Parfum 100ml & Travel Spray 20ml Gift Set',
          sizeMl: null,
          giftSet: true,
        }),
      ),
    ).toBe('rabanne_phantom_parfum_100ml_and_travel_spray_20ml_set');
    expect(
      baseSlug(product({ id: 'a', brand: 'Aramis', name: 'Intuition Eau de Parfum Travel Set', sizeMl: null, giftSet: true })),
    ).toBe('aramis_intuition_eau_de_parfum_travel_set');
    expect(baseSlug(product({ id: 'a', brand: 'Aramis', name: 'Gift Set', sizeMl: null, giftSet: true }))).toBe(
      'aramis_gift_set',
    );
  });

  it('uses nosize for a product whose shops disagree about the size', () => {
    expect(baseSlug(product({ id: 'a', sizeMl: null }))).toBe('creed_aventus_nosize');
  });

  it('never leaves a part empty', () => {
    const slug = baseSlug(product({ id: 'a', brand: '香水', name: '香水', sizeMl: 50 }));
    expect(slug).toBe('brand_product_50ml');
    expect(isProductSlug(slug)).toBe(true);
  });

  it('cuts a long name at a part boundary and keeps the volume', () => {
    const name = 'Eau De Parfum 100ml & Travel Spray 10ml & Shower Gel 100ml & Body Lotion 100ml & Hand Cream 50ml & Candle';
    const slug = baseSlug(product({ id: 'a', brand: 'Hugo Boss', name, sizeMl: null, giftSet: true }));
    const [rest] = slug.split(/_set$/);
    expect(rest!.length).toBeLessThanOrEqual(BRAND_NAME_MAX);
    expect(slug.endsWith('_set')).toBe(true);
    expect(isProductSlug(slug)).toBe(true);
    // Cut between parts, never inside one.
    expect(name.length).toBeGreaterThan(BRAND_NAME_MAX);
    expect(slug).toBe('hugo_boss_eau_de_parfum_100ml_and_travel_spray_10ml_and_shower_gel_100ml_set');
  });

  it('cuts one very long part hard', () => {
    const slug = baseSlug(product({ id: 'a', brand: 'Creed', name: 'x'.repeat(200), sizeMl: 10 }));
    expect(slug.length).toBeLessThanOrEqual(BRAND_NAME_MAX + '_10ml'.length);
    expect(isProductSlug(slug)).toBe(true);
  });
});

describe('strengthToken', () => {
  it('names every strength the catalogue has', () => {
    expect(strengthToken('Eau de Parfum')).toBe('edp');
    expect(strengthToken('Eau de Toilette')).toBe('edt');
    expect(strengthToken('Extrait de Parfum')).toBe('extrait');
    expect(strengthToken('Parfum')).toBe('parfum');
    expect(strengthToken('Eau de Cologne')).toBe('cologne');
    expect(strengthToken('Perfume Oil')).toBe('oil');
    expect(strengthToken('Not stated')).toBe('unstated');
    expect(strengthToken('Some New Strength')).toBe('some_new_strength');
  });
});

describe('isProductSlug', () => {
  it('needs three or more parts and a volume last', () => {
    expect(isProductSlug('creed_aventus_100ml')).toBe(true);
    expect(isProductSlug('creed_aventus_edp_v2_100ml')).toBe(true);
    expect(isProductSlug('creed_aventus_set')).toBe(true);
    expect(isProductSlug('creed_aventus_nosize')).toBe(true);
    expect(isProductSlug('creed_aventus_7p5ml')).toBe(true);
    expect(isProductSlug('aventus_100ml')).toBe(false);
    expect(isProductSlug('creed_aventus_edp')).toBe(false);
    expect(isProductSlug('creed-aventus-100ml')).toBe(false);
    expect(isProductSlug('Creed_Aventus_100ml')).toBe(false);
    expect(isProductSlug('creed__aventus_100ml')).toBe(false);
    expect(isProductSlug('_creed_aventus_100ml')).toBe(false);
    expect(isProductSlug('search')).toBe(false);
  });
});

describe('assignSlugs: collisions', () => {
  it('gives the plain slug to a product that has it to itself', () => {
    const { slugs, stats } = assignSlugs({}, [product({ id: 'ean-1' })]);
    expect(slugs).toEqual({ 'ean-1': 'creed_aventus_100ml' });
    expect(stats).toMatchObject({ fresh: 1, plain: 1, withStrength: 0, withVersion: 0 });
  });

  it('adds the strength to both when two products collide', () => {
    const { slugs, stats } = assignSlugs({}, [
      product({ id: 'ean-2', concentration: 'Eau de Toilette' }),
      product({ id: 'ean-1', concentration: 'Eau de Parfum' }),
    ]);
    expect(slugs['ean-1']).toBe('creed_aventus_edp_100ml');
    expect(slugs['ean-2']).toBe('creed_aventus_edt_100ml');
    expect(stats).toMatchObject({ fresh: 2, plain: 0, withStrength: 2, withVersion: 0 });
  });

  it('uses a version, ordered by id, only when the strength does not settle it', () => {
    const { slugs, stats } = assignSlugs({}, [
      product({ id: 'ean-3' }),
      product({ id: 'ean-1' }),
      product({ id: 'ean-2' }),
    ]);
    expect(slugs['ean-1']).toBe('creed_aventus_edp_100ml');
    expect(slugs['ean-2']).toBe('creed_aventus_edp_v2_100ml');
    expect(slugs['ean-3']).toBe('creed_aventus_edp_v3_100ml');
    expect(stats).toMatchObject({ withStrength: 1, withVersion: 2 });
  });

  it('gives the same answer whatever order the products come in', () => {
    const items = [
      product({ id: 'b', concentration: 'Eau de Toilette' }),
      product({ id: 'd' }),
      product({ id: 'a' }),
      product({ id: 'c', brand: 'Dior', name: 'Sauvage' }),
    ];
    const one = assignSlugs({}, items).slugs;
    const two = assignSlugs({}, [...items].reverse()).slugs;
    expect(two).toEqual(one);
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('settles every plain slug before any strength form takes an address', () => {
    // "Aventus Edp" is a real plain slug; the strength form of the two
    // Aventus products must not take it.
    const { slugs } = assignSlugs({}, [
      product({ id: 'ean-1' }),
      product({ id: 'ean-2', concentration: 'Eau de Toilette' }),
      product({ id: 'ean-3', name: 'Aventus Edp' }),
    ]);
    expect(slugs['ean-3']).toBe('creed_aventus_edp_100ml');
    expect(slugs['ean-1']).toBe('creed_aventus_edp_v2_100ml');
    expect(slugs['ean-2']).toBe('creed_aventus_edt_100ml');
    expect(new Set(Object.values(slugs)).size).toBe(3);
  });

  it('separates different sizes without a strength', () => {
    const { slugs } = assignSlugs({}, [product({ id: 'a', sizeMl: 50 }), product({ id: 'b', sizeMl: 100 })]);
    expect(slugs).toEqual({ a: 'creed_aventus_50ml', b: 'creed_aventus_100ml' });
  });

  it('separates two gift sets whose names are cut to the same text', () => {
    const long = 'Eau De Parfum 100ml & Travel Spray 10ml & Shower Gel 100ml & Body Lotion 100ml';
    const { slugs } = assignSlugs({}, [
      product({ id: 'set-1', brand: 'Hugo Boss', name: `${long} & Hand Cream 50ml Gift Set`, sizeMl: null, giftSet: true }),
      product({ id: 'set-2', brand: 'Hugo Boss', name: `${long} & Candle 50g Gift Set`, sizeMl: null, giftSet: true }),
    ]);
    expect(slugs['set-1']).not.toBe(slugs['set-2']);
    expect(Object.values(slugs).every(isProductSlug)).toBe(true);
  });
});

describe('assignSlugs: a slug never changes', () => {
  it('keeps the slug a product has whatever it is called now', () => {
    const first = assignSlugs({}, [product({ id: 'ean-1' })]).slugs;
    const renamed = assignSlugs(first, [product({ id: 'ean-1', name: 'Aventus Eau de Parfum', sizeMl: 50 })]);
    expect(renamed.slugs['ean-1']).toBe('creed_aventus_100ml');
    expect(renamed.stats).toMatchObject({ kept: 1, fresh: 0 });
  });

  it('is the same file after a rebuild with a changed catalogue', () => {
    const catalogueOne = [
      product({ id: 'ean-1' }),
      product({ id: 'ean-2', brand: 'Dior', name: 'Sauvage', sizeMl: 60 }),
      product({ id: 'ean-3', brand: 'Dior', name: 'Sauvage', sizeMl: 60, concentration: 'Eau de Toilette' }),
    ];
    const one = assignSlugs({}, catalogueOne).slugs;

    // A product leaves, one arrives, one is renamed and one changes strength.
    const catalogueTwo = [
      product({ id: 'ean-1', name: 'Aventus Cologne' }),
      product({ id: 'ean-3', brand: 'Dior', name: 'Sauvage', sizeMl: 60, concentration: 'Parfum' }),
      product({ id: 'ean-4', brand: 'Chanel', name: 'Bleu', sizeMl: 100 }),
    ];
    const two = assignSlugs(one, catalogueTwo).slugs;

    for (const id of Object.keys(one)) expect(two[id]).toBe(one[id]);
    expect(two['ean-4']).toBe('chanel_bleu_100ml');
    // The product that left still holds its slug.
    expect(two['ean-2']).toBe(one['ean-2']);
  });

  it('gives a later product with a held plain slug the strength form, and leaves the older one alone', () => {
    const first = assignSlugs({}, [product({ id: 'ean-9' })]).slugs;
    expect(first['ean-9']).toBe('creed_aventus_100ml');
    const later = assignSlugs(first, [
      product({ id: 'ean-9' }),
      product({ id: 'ean-1', concentration: 'Eau de Toilette' }),
    ]).slugs;
    expect(later['ean-9']).toBe('creed_aventus_100ml');
    expect(later['ean-1']).toBe('creed_aventus_edt_100ml');
  });

  it('never gives a slug that a product that has left still holds', () => {
    const first = assignSlugs({}, [product({ id: 'ean-1' })]).slugs;
    // ean-1 is merged away and is not in the next catalogue. A new product wants its address.
    const next = assignSlugs(first, [product({ id: 'ean-2' })]).slugs;
    expect(next['ean-1']).toBe('creed_aventus_100ml');
    expect(next['ean-2']).toBe('creed_aventus_edp_100ml');
  });

  it('writes the file sorted by id and reads its own output back unchanged', () => {
    const items = [product({ id: 'z' }), product({ id: 'a', brand: 'Dior', name: 'Sauvage' })];
    const one = assignSlugs({}, items);
    expect(Object.keys(one.slugs)).toEqual(['a', 'z']);
    const again = assignSlugs(one.slugs, items);
    expect(JSON.stringify(again.slugs)).toBe(JSON.stringify(one.slugs));
    expect(again.stats).toMatchObject({ kept: 2, fresh: 0 });
  });

  it('ignores a product listed twice', () => {
    const { slugs, stats } = assignSlugs({}, [product({ id: 'a' }), product({ id: 'a' })]);
    expect(slugs).toEqual({ a: 'creed_aventus_100ml' });
    expect(stats.fresh).toBe(1);
  });
});

describe('assignSlugs: usable addresses only', () => {
  it('never produces a reserved word or a slug of the wrong shape', () => {
    const odd = [
      product({ id: 'a', brand: 'Search', name: 'Deals' }),
      product({ id: 'b', brand: '--', name: '!!', sizeMl: 10 }),
      product({ id: 'c', brand: 'A', name: 'B', sizeMl: 0.5 }),
    ];
    const { slugs } = assignSlugs({}, odd);
    for (const slug of Object.values(slugs)) {
      expect(isProductSlug(slug)).toBe(true);
      expect(RESERVED_WORDS).not.toContain(slug);
    }
  });
});

describe('slugAliases', () => {
  it('points the slug of a merged product at the product that holds it', () => {
    const slugs = { old: 'creed_aventus_100ml', live: 'creed_aventus_edp_100ml', gone: 'dior_gone_50ml' };
    const pages = new Set(['live']);
    const result = slugAliases(slugs, { old: 'live' }, (id) => pages.has(id));
    expect(result).toEqual({ creed_aventus_100ml: 'live' });
  });

  it('follows a short chain and never aliases a page to itself', () => {
    const slugs = { a: 'x_a_1ml', b: 'x_b_1ml', c: 'x_c_1ml' };
    const result = slugAliases(slugs, { a: 'b', b: 'c' }, (id) => id === 'c');
    expect(result).toEqual({ x_a_1ml: 'c', x_b_1ml: 'c' });
  });

  it('leaves out an id that is a page again', () => {
    expect(slugAliases({ a: 'x_a_1ml' }, { a: 'b' }, () => true)).toEqual({});
  });
});
