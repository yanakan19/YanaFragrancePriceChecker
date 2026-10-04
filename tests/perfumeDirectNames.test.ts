import { describe, expect, it } from 'vitest';
import { displayName, stripShopTitleLabel } from '../src/catalogue/productName.js';
import { ownSizeTitle } from '../src/catalogue/shopifyJson.js';
import { sizeMl } from '../src/catalogue/fragranceId.js';
import { matchKey } from '../src/catalogue/productMatch.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { readGender } from '../demo/gender.js';

/**
 * Perfume Direct writes its own category into the middle of a title, "Women's
 * Perfume", "Men's Aftershave", "Unisex Fragrance", and no other shop does, so
 * the same bottle never met itself: 19 of 3,095 rows shared a product with
 * another shop. The titles below are stored rows (data/catalogue/perfume-direct.json,
 * 2026-10-04) beside the titles other shops stored for the same bottle.
 */
const PD = 'perfume-direct';
const strip = (title: string) => stripShopTitleLabel(title, PD);

/** The matchKey a title earns from a shop, size taken from its own text. */
function keyOf(title: string, brand: string, concentration: string, shop = PD): string {
  const read = stripShopTitleLabel(ownSizeTitle(title), shop);
  const name = displayName(read.title, brand, brand);
  return matchKey({ id: 'x', brand, name, concentration, sizeMl: sizeMl(ownSizeTitle(title)), ean: null });
}

describe('the category label comes off a Perfume Direct title', () => {
  it.each([
    [
      "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (50ml) 50ml",
      'Bvlgari Splendida Patchouli Tentation Eau de Parfum Spray (50ml) 50ml',
      'womens',
    ],
    ["Gucci Guilty Pour Homme Eau de Toilette Men's Aftershave Spray (150ml) 150ml", 'Gucci Guilty Pour Homme Eau de Toilette Spray (150ml) 150ml', 'mens'],
    ['Prada Luna Rossa Ocean Eau de Toilette Mens Aftershave Spray (100ml) 100ml', 'Prada Luna Rossa Ocean Eau de Toilette Spray (100ml) 100ml', 'mens'],
    ['Xerjoff V Collection Ouverture Eau de Parfum Unisex Fragrance Spray (100ml) 100ml', 'Xerjoff V Collection Ouverture Eau de Parfum Spray (100ml) 100ml', 'unisex'],
    ['Acqua Di Parma Blu Mediterraneo Fico Di Amalfi Eau de Toilette Unisex Spray (75ml) 75ml', 'Acqua Di Parma Blu Mediterraneo Fico Di Amalfi Eau de Toilette Spray (75ml) 75ml', 'unisex'],
    ["Lancome La Nuit Tresor Eau de Parfum Women's Spray (50ml) 50ml", 'Lancome La Nuit Tresor Eau de Parfum Spray (50ml) 50ml', 'womens'],
    // The label before the strength, and after it.
    ["Dolce & Gabbana Dolce Violet Women's Eau de Toilette Perfume Spray (50ml)", 'Dolce & Gabbana Dolce Violet Eau de Toilette Spray (50ml)', 'womens'],
    ['Kenzo Flower Perfume Eau de Parfum for Women (50ml) 50ml', 'Kenzo Flower Perfume Eau de Parfum (50ml) 50ml', 'womens'],
    // The refillable word between the gender and the noun.
    ["Thierry Mugler Alien Pulp Eau de Parfum Women's Refillable Perfume Spray (30ml) 30ml", 'Thierry Mugler Alien Pulp Eau de Parfum Spray (30ml) 30ml', 'womens'],
    // A generic noun between the strength and Spray, with no gender word at all.
    ['Calvin Klein Obsession for Men Eau de Toilette Aftershave Spray (75ml) 75ml', 'Calvin Klein Obsession for Men Eau de Toilette Spray (75ml) 75ml', null],
    ["Clinique Happy For Men Eau de Toilette Cologne Spray (50ml) 50ml", 'Clinique Happy For Men Eau de Toilette Spray (50ml) 50ml', null],
  ])('%s', (title, expected, audience) => {
    expect(strip(title)).toEqual({ title: expected, audience });
  });

  it('keeps the gender it took off, so the Gender filter still has it', () => {
    const title = "Hugo Boss Bottled Eau de Toilette Men's Aftershave Spray (50ml) 50ml";
    const read = strip(title);
    expect(readGender(displayName(read.title, 'Hugo Boss', 'Hugo Boss'))).toBe('notStated');
    expect(read.audience).toBe('mens');
  });

  it('is the same on its own output', () => {
    const once = strip("Elie Saab Girl of Now Lovely Eau de Parfum Women's Perfume Spray (90ml) 90ml").title;
    expect(strip(once)).toEqual({ title: once, audience: null });
  });

  it('touches no other shop', () => {
    const t = "Hugo Boss Bottled Eau de Toilette Men's Aftershave Spray (50ml) 50ml";
    expect(stripShopTitleLabel(t, 'the-perfume-shop')).toEqual({ title: t, audience: null });
  });
});

describe('what stays in a Perfume Direct title', () => {
  it.each([
    // Real names: the audience is part of what the bottle is called.
    'Gucci Guilty Pour Femme Eau de Parfum (90ml) 90ml',
    'Burberry for Women Eau de Parfum (100ml) 100ml',
    'Hugo Boss The Scent for Him Eau de Toilette (100ml) 100ml',
    'Abercrombie & Fitch First Instinct for Her Eau de Parfum (50ml) 50ml',
    'Paul Smith Women Eau de Parfum (100ml) 100ml',
    'Jimmy Choo Man Eau de Toilette (100ml) 100ml',
    'Dior Homme Intense Eau de Parfum (100ml) 100ml',
    // A different product, not the scent: a lotion, a balm, a body mist, alcohol free.
    "Jean Paul Gaultier Le Male Men's Aftershave Lotion Splash (100ml) 100ml",
    'Jean Paul Gaultier Le Male Aftershave Balm (100ml)',
    "Carolina Herrera Good Girl Women's Body Mist (250ml)",
    // An aftershave with no strength in the title is the product itself.
    'Davidoff Cool Water Aftershave Splash (75ml) 75ml',
    'Davidoff Cool Water Aftershave Spray (75ml) 75ml',
    // Flanker words are never touched.
    'Calvin Klein Euphoria Bold Elixir Parfum Intense (100ml) 100ml',
    'Charlie Blue Eau Fraiche (75ml) 75ml',
  ])('%s', (t) => {
    expect(strip(t)).toEqual({ title: t, audience: null });
  });

  it('keeps Alcohol Free, which is a different formulation', () => {
    const t = "Yves Saint Laurent YSL Libre L'eau Nue de Peau Women's Alcohol-Free Perfume Parfum Spray (50ml) 50ml";
    expect(strip(t).title).toContain('Alcohol-Free');
  });
});

describe('the same bottle at Perfume Direct and another shop is one product', () => {
  // [Perfume Direct's stored title, another shop's stored title, brand, strength]
  it.each([
    ["Gucci Guilty Pour Femme Eau de Parfum Women's Perfume Spray (90ml) 90ml", 'Gucci Guilty Pour Femme Eau de Parfum 90ml Spray', 'Gucci', 'Eau de Parfum'],
    ["Chloe Nomade Eau de Parfum Women's Perfume Spray (75ml) 75ml", 'Chloé Nomade Eau de Parfum 75ml Spray', 'Chloé', 'Eau de Parfum'],
    ["Dolce & Gabbana K Eau de Toilette Men's Aftershave Spray (150ml) 150ml", 'Dolce & Gabbana K Eau de Toilette 150ml Spray', 'Dolce & Gabbana', 'Eau de Toilette'],
    ["Viktor & Rolf Good Fortune Eau de Parfum Women's Perfume Spray (90ml) 90ml", 'Viktor & Rolf Good Fortune Eau De Parfum 90ml Spray', 'Viktor & Rolf', 'Eau de Parfum'],
    ["Lattafa Asad Zanzibar Eau de Parfum Men's Aftershave Spray (100ml)", 'Lattafa Perfumes Asad Zanzibar Eau de Parfum 100ml Spray', 'Lattafa', 'Eau de Parfum'],
    ['Acqua Di Parma Blu Mediterraneo Fico Di Amalfi Eau de Toilette Unisex Spray (150ml) 150ml', 'Acqua Di Parma Blu Mediterraneo Fico Di Amalfi Eau De Toilette 150ml', 'Acqua Di Parma', 'Eau de Toilette'],
    ["Prada Luna Rossa Sport Eau de Toilette Mens Aftershave Spray (100ml) 100ml", 'Prada Luna Rossa Sport Eau de Toilette 100ml Spray', 'Prada', 'Eau de Toilette'],
    ["Valentino Donna Born In Roma Eau de Parfum Women's Perfume Spray (100ml) 100ml", 'Valentino Born In Roma Donna Eau De Parfum 100ml Spray', 'Valentino', 'Eau de Parfum'],
    ["Estee Lauder Modern Muse Eau de Parfum Women's Perfume Spray (50ml) 50ml", 'Estée Lauder Modern Muse Eau De Parfum 50ml Spray', 'Estée Lauder', 'Eau de Parfum'],
    ["Calvin Klein Obsession for Men Eau de Toilette Aftershave Spray (75ml) 75ml", 'Calvin Klein Obsession For Men Eau de Toilette 75ml Spray', 'Calvin Klein', 'Eau de Toilette'],
  ])('%s', (pd, other, brand, strength) => {
    expect(keyOf(pd, brand, strength)).toBe(keyOf(other, brand, strength, 'perfume-click'));
  });
});

describe('flankers and other bottles stay apart', () => {
  const pairs: [string, string, string, string][] = [
    // Intense is a different bottle from the plain one.
    ["Issey Miyake L'Eau d'Issey Pour Homme Solar Lavender Eau de Toilette Men's Aftershave Spray (100ml) 100ml", "Issey Miyake L'Eau d'Issey pour Homme Solar Lavender Intense Eau de Toilette 100ml Spray", 'Issey Miyake', 'Eau de Toilette'],
    // Pour Homme and Pour Femme are different bottles.
    ["Gucci Guilty Pour Homme Eau de Parfum Men's Aftershave Spray (90ml) 90ml", 'Gucci Guilty Pour Femme Eau de Parfum 90ml Spray', 'Gucci', 'Eau de Parfum'],
    // L'Elixir is not L'Eau de Parfum.
    ["Lancome La Vie Est Belle L'Elixir Eau de Parfum Women's Perfume Spray (50ml) 50ml", "Lancome La Vie Est Belle Eau de Parfum 50ml Spray", 'Lancôme', 'Eau de Parfum'],
    // Eau Fraiche keeps its words.
    ["Estee Lauder Bronze Goddess Eau Fraiche Women's Perfume Spray (100ml) 100ml", 'Estée Lauder Bronze Goddess Eau Fraiche Skinscent Spray 100ml', 'Estée Lauder', 'Eau Fraiche'],
    // Another size.
    ["Chloe Nomade Eau de Parfum Women's Perfume Spray (50ml) 50ml", 'Chloé Nomade Eau de Parfum 75ml Spray', 'Chloé', 'Eau de Parfum'],
    // Another strength.
    ["Gucci Guilty Pour Femme Eau de Toilette Women's Perfume Spray (50ml) 50ml", 'Gucci Guilty Pour Femme Eau de Parfum 50ml Spray', 'Gucci', 'Eau de Parfum'],
  ];
  it.each(pairs)('%s', (pd, other, brand, strength) => {
    // The strength is taken from the title's own words in the build; here the
    // Perfume Direct row is keyed on the strength its own title states.
    const pdStrength = /Eau de Toilette/i.test(pd) ? 'Eau de Toilette' : /Eau Fraiche/i.test(pd) ? 'Eau Fraiche' : 'Eau de Parfum';
    expect(keyOf(pd, brand, pdStrength)).not.toBe(keyOf(other, brand, strength, 'perfume-click'));
  });
});

describe('the sizes the shop lists with a pack name or leaves unclosed', () => {
  it.each([
    [
      "Thierry Mugler Alien Extraintense Eau de Parfum Refillable Women's Perfume Spray (30ml, 60ml, 90ml Refillable Talisman) 60ml",
      "Thierry Mugler Alien Extraintense Eau de Parfum Refillable Women's Perfume Spray (60ml) 60ml",
    ],
    [
      "Thierry Mugler Alien Goddess Eau de Parfum Refillable Women's Perfume Spray (30ml, 60ml, 90ml, 100ml Refillable Talisman) 90ml",
      "Thierry Mugler Alien Goddess Eau de Parfum Refillable Women's Perfume Spray (90ml) 90ml",
    ],
    [
      "Jean Paul Gaultier Scandal Elixir Eau de Parfum Women's Perfume Spray (30ml, 50ml, 80ml 50ml",
      "Jean Paul Gaultier Scandal Elixir Eau de Parfum Women's Perfume Spray (50ml) 50ml",
    ],
  ])('%s', (title, expected) => {
    expect(ownSizeTitle(title)).toBe(expected);
    expect(ownSizeTitle(expected)).toBe(expected);
  });

  it('leaves a refill row, which names no size of its own, as it was', () => {
    const t = "Armani Si Eau de Parfum Women's Perfume Spray (30ml, 50ml, 100ml, Refill) Refill";
    expect(ownSizeTitle(t)).toBe(t);
  });
});

describe('the built catalogue', () => {
  const pdRows = (id: string) => (CRAWLED[id] ?? []).filter((o) => o.retailerId === PD);
  const entries = CATALOGUE.filter((c) => pdRows(c.id).length > 0);

  it('now compares most Perfume Direct rows with another shop', () => {
    const rows = entries.reduce((n, c) => n + pdRows(c.id).length, 0);
    const shared = entries.reduce((n, c) => n + ((CRAWLED[c.id] ?? []).some((o) => o.retailerId !== PD) ? pdRows(c.id).length : 0), 0);
    // Before: 36 of 3,094 rows (about 1%). After: about two thirds.
    expect(shared / rows).toBeGreaterThan(0.5);
  });

  it('names no Perfume Direct bottle with the shop\'s own category words', () => {
    const labelled = entries.filter((c) => !c.giftSet && /\b(?:women['’]?s|men['’]?s|mens|unisex)\s+(?:perfume|aftershave|fragrance|scent)\b/i.test(c.name));
    // Only the bottles Perfume Direct sells to both men and women under one name keep it.
    for (const c of labelled) expect(c.name, `${c.brand} ${c.name}`).toMatch(/Cool Water|Eternity|Brit|First Instinct Blue|The One Gold Intense|Reborn/);
  });

  it('puts one Perfume Direct row with other shops where the barcode is the same bottle', () => {
    // Read from Perfume Direct's own product page on 2026-10-04: the 150ml
    // variant of its Dolce & Gabbana K page carries barcode 3423473049654.
    const k = CATALOGUE.find((c) => c.id === 'ean-3423473049654')!;
    expect(k.name).toBe('K');
    expect(pdRows(k.id).length).toBe(1);
    expect((CRAWLED[k.id] ?? []).length).toBeGreaterThanOrEqual(3);
    // Chloe Nomade 75ml, barcode 3614223113347; Viktor and Rolf Good Fortune 90ml, 3614273662581.
    for (const id of ['ean-3614223113347', 'ean-3614273662581']) expect(pdRows(id).length, id).toBe(1);
  });

  it('keeps the gender the label gave on the product, where the name is silent', () => {
    const nomade = CATALOGUE.find((c) => c.id === 'ean-3614223113347')!;
    expect(readGender(`${nomade.brand} ${nomade.name} ${nomade.concentration}`)).toBe('notStated');
    expect(nomade.gender).toBe('womens');
    const k = CATALOGUE.find((c) => c.id === 'ean-3423473049654')!;
    expect(k.gender).toBe('mens');
    const aqua = CATALOGUE.find((c) => c.brand === 'Acqua Di Parma' && c.name === 'Blu Mediterraneo Fico Di Amalfi' && c.sizeMl === 150);
    expect(aqua?.gender).toBe('unisex');
  });

  it('rarely gives a product a gender its own name contradicts, and the name wins when it does', () => {
    // Perfume Direct files Valentino Donna Born In Roma Coral Fantasy under Men's
    // Aftershave while its title says Donna. The Gender filter reads the name
    // first (demo/app.ts genderOf), so that product is still filed as women's.
    const contradicted = CATALOGUE.filter((c) => {
      if (!c.gender) return false;
      const named = readGender(`${c.brand} ${c.name} ${c.concentration}`);
      return named !== 'notStated' && named !== c.gender;
    });
    expect(contradicted.length).toBeLessThanOrEqual(3);
    for (const c of contradicted) expect(c.name).toContain('Donna');
  });

  it('keeps apart the men\'s and the women\'s bottle Perfume Direct sells under one name', () => {
    // Davidoff Cool Water: its Women's page is Cool Water Woman (its own
    // description says so), so the label is the only thing telling them apart.
    const coolWater = entries.filter((c) => c.brand === 'Davidoff' && /^Cool Water\b/.test(c.name) && !c.giftSet);
    const womens = coolWater.filter((c) => /women/i.test(c.name));
    const mens = coolWater.filter((c) => /\bmen/i.test(c.name));
    expect(womens.length).toBeGreaterThan(0);
    expect(mens.length).toBeGreaterThan(0);
    for (const w of womens) for (const m of mens) expect(w.id).not.toBe(m.id);
  });

  it('never merged a gift set with a single bottle', () => {
    for (const c of entries) if (c.giftSet) expect(c.sizeMl).toBeNull();
  });
});
