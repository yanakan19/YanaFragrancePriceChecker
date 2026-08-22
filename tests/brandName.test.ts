import { describe, expect, it } from 'vitest';
import { brandKey, pickBrandName, buildBrandCanon } from '../src/catalogue/brandName.js';

describe('brandKey', () => {
  it('ignores the decoration shops disagree about', () => {
    expect(brandKey('Dolce & Gabbana')).toBe(brandKey('Dolce&Gabbana'));
    expect(brandKey('DOLCE&GABBANA')).toBe(brandKey('Dolce & Gabbana'));
    expect(brandKey('Joop!')).toBe(brandKey('Joop'));
  });

  it('never merges two genuinely different names', () => {
    expect(brandKey('Armaf')).not.toBe(brandKey('Armaf Online Shop'));
    expect(brandKey('Creed')).not.toBe(brandKey('Creeds'));
  });
});

describe('pickBrandName', () => {
  it('prefers ordinary case over shouting, even when shouting is far more common', () => {
    // The real numbers: one large catalogue shouts its vendor field, so "ARMAF"
    // outnumbers "Armaf" 195 to 12. Volume is not authority.
    expect(pickBrandName(new Map([['ARMAF', 195], ['Armaf', 12]]))).toBe('Armaf');
    expect(pickBrandName(new Map([['HUGO BOSS', 31], ['Hugo Boss', 89]]))).toBe('Hugo Boss');
    expect(pickBrandName(new Map([['AFNAN', 3], ['Afnan', 9]]))).toBe('Afnan');
  });

  it('keeps genuinely capitalised brands capitalised', () => {
    // No mixed-case spelling exists, so there is nothing to prefer over it.
    // Title casing would invent "Dkny", which is simply wrong.
    expect(pickBrandName(new Map([['DKNY', 40]]))).toBe('DKNY');
    expect(pickBrandName(new Map([['YSL', 5]]))).toBe('YSL');
  });

  it('breaks ties between equally cased spellings by how often shops used them', () => {
    expect(
      pickBrandName(new Map([['Dolce&Gabbana', 4], ['Dolce & Gabbana', 78]])),
    ).toBe('Dolce & Gabbana');
  });

  it('is deterministic when frequency ties too', () => {
    const a = pickBrandName(new Map([['Bbb', 2], ['Aaa', 2]]));
    const b = pickBrandName(new Map([['Aaa', 2], ['Bbb', 2]]));
    expect(a).toBe(b);
  });
});

describe('buildBrandCanon', () => {
  it('maps every spelling in a group to the chosen one', () => {
    const canon = buildBrandCanon([
      ...Array(195).fill('ARMAF'), ...Array(12).fill('Armaf'),
      ...Array(3).fill('AFNAN'), ...Array(9).fill('Afnan'),
      'DKNY',
    ]);
    expect(canon.get('ARMAF')).toBe('Armaf');
    expect(canon.get('Armaf')).toBe('Armaf');
    expect(canon.get('AFNAN')).toBe('Afnan');
    expect(canon.get('Afnan')).toBe('Afnan');
    expect(canon.get('DKNY')).toBe('DKNY');
  });

  it('ignores blanks without creating an empty brand', () => {
    const canon = buildBrandCanon(['Armaf', '', '   ', '!!!']);
    expect(canon.has('')).toBe(false);
    expect(canon.get('Armaf')).toBe('Armaf');
  });

  it('folds known aliases the mechanical grouping cannot see on its own', () => {
    const canon = buildBrandCanon([
      'Ysl', 'Yves Saint Laurent',
      'Donna Karan', 'DKNY',
      'Paco Rabanne', 'Rabanne',
      'Armani', 'Giorgio Armani',
      'Dunhill London', 'Dunhill',
      'Estee Lauder', 'Estée Lauder',
      'Lancome', 'Lancôme',
      'Hermes', 'Hermès',
    ]);
    expect(canon.get('Ysl')).toBe('Yves Saint Laurent');
    expect(canon.get('Yves Saint Laurent')).toBe('Yves Saint Laurent');
    expect(canon.get('Donna Karan')).toBe('DKNY');
    expect(canon.get('DKNY')).toBe('DKNY');
    expect(canon.get('Paco Rabanne')).toBe('Rabanne');
    expect(canon.get('Armani')).toBe('Giorgio Armani');
    expect(canon.get('Giorgio Armani')).toBe('Giorgio Armani');
    expect(canon.get('Dunhill London')).toBe('Dunhill');
    expect(canon.get('Estee Lauder')).toBe('Estée Lauder');
    expect(canon.get('Estée Lauder')).toBe('Estée Lauder');
    expect(canon.get('Lancome')).toBe('Lancôme');
    expect(canon.get('Hermes')).toBe('Hermès');
  });

  it('leaves Emporio Armani alone rather than folding it into Giorgio Armani', () => {
    const canon = buildBrandCanon(['Armani', 'Emporio Armani']);
    expect(canon.get('Armani')).toBe('Giorgio Armani');
    expect(canon.get('Emporio Armani')).toBe('Emporio Armani');
  });

  // One feed puts the product line in the brand field, producing 51 separate
  // "Armaf - X" brand strings — measured against demo/catalogue.generated.ts
  // on 2026-08-21 (see the KNOWN_ALIASES comment above this table's Armaf
  // block for the full count and the sample-checking that ruled out any of
  // the 51 being a genuinely different house). A representative sample here,
  // not all 51 — the block above is the authoritative list.
  it('folds the "Armaf - <line>" feed artefact into plain Armaf, not 51 separate houses', () => {
    const canon = buildBrandCanon([
      'Armaf', 'Armaf - Club De Nuit', 'Armaf - Derby', 'Armaf - Ego',
      "Armaf - L'Homme", 'Armaf - Lions Club', 'Armaf - SHK',
    ]);
    expect(canon.get('Armaf - Club De Nuit')).toBe('Armaf');
    expect(canon.get('Armaf - Derby')).toBe('Armaf');
    expect(canon.get('Armaf - Ego')).toBe('Armaf');
    expect(canon.get("Armaf - L'Homme")).toBe('Armaf');
    expect(canon.get('Armaf - Lions Club')).toBe('Armaf');
    expect(canon.get('Armaf - SHK')).toBe('Armaf');
    expect(canon.get('Armaf')).toBe('Armaf');
  });

  it('does not fold an unrelated brand that merely shares the Armaf prefix', () => {
    // brandKey already keeps 'Armaf' and 'Armaf Online Shop' apart (see
    // brandKey's own test above); this checks the alias table does not
    // accidentally widen that back out for a string the fold was never
    // measured against.
    const canon = buildBrandCanon(['Armaf', 'Armaf Online Shop']);
    expect(canon.get('Armaf Online Shop')).toBe('Armaf Online Shop');
  });

  // Found 2026-08-22 from a live-site Brands-directory screenshot plus a
  // follow-up sweep of the catalogue's brand strings — see the KNOWN_ALIASES
  // comment above this table for the full per-pair product evidence.
  it('folds "&" and "and" spellings of the same house name (brandKey does not fold this on its own)', () => {
    expect(brandKey('Viktor & Rolf')).not.toBe(brandKey('Viktor and Rolf'));
    const canon = buildBrandCanon([
      'Viktor & Rolf', 'Viktor and Rolf',
      'Dolce & Gabbana', 'Dolce and Gabbana',
      'Abercrombie & Fitch', 'Abercrombie and Fitch',
      'Tiffany & Co', 'Tiffany and Co.',
      'Roger & Gallet', 'Roger and Gallet',
    ]);
    expect(canon.get('Viktor and Rolf')).toBe('Viktor & Rolf');
    expect(canon.get('Dolce and Gabbana')).toBe('Dolce & Gabbana');
    expect(canon.get('Abercrombie and Fitch')).toBe('Abercrombie & Fitch');
    expect(canon.get('Tiffany and Co.')).toBe('Tiffany & Co');
    expect(canon.get('Roger and Gallet')).toBe('Roger & Gallet');
  });

  it('folds a trailing "UK" storefront qualifier into the same house', () => {
    const canon = buildBrandCanon(['Armaf', 'ARMAF UK', 'French Avenue', 'French Avenue UK']);
    expect(canon.get('ARMAF UK')).toBe('Armaf');
    expect(canon.get('French Avenue UK')).toBe('French Avenue');
  });

  it('folds more "generic descriptor word appended" pairs found in the 2026-08-22 sweep', () => {
    const canon = buildBrandCanon([
      'Ahmed Al Maghribi', 'Ahmed Al Maghribi Perfumes',
      'Jo Malone', 'JO MALONE LONDON',
      'Laurelle Parfums', 'Laurelle London',
      'Delroba', 'Delroba Parfums',
      'Korloff', 'Korloff Paris',
      'Notebook', 'NOTEBOOK Fragrances',
      'New Brand', 'New Brand Parfums',
    ]);
    expect(canon.get('Ahmed Al Maghribi Perfumes')).toBe('Ahmed Al Maghribi');
    expect(canon.get('JO MALONE LONDON')).toBe('Jo Malone');
    expect(canon.get('Laurelle London')).toBe('Laurelle Parfums');
    expect(canon.get('Delroba Parfums')).toBe('Delroba');
    expect(canon.get('Korloff Paris')).toBe('Korloff');
    expect(canon.get('NOTEBOOK Fragrances')).toBe('Notebook');
    expect(canon.get('New Brand Parfums')).toBe('New Brand');
  });

  it('does not fold "New Brand Perfumes" or "New Brand Prestige" into New Brand — no shared product names found', () => {
    const canon = buildBrandCanon(['New Brand', 'New Brand Parfums', 'New Brand Perfumes', 'New Brand Prestige']);
    expect(canon.get('New Brand Perfumes')).toBe('New Brand Perfumes');
    expect(canon.get('New Brand Prestige')).toBe('New Brand Prestige');
  });

  it('folds accent-stripped spellings the same way as the existing Estee Lauder/Lancome/Hermes entries', () => {
    const canon = buildBrandCanon([
      'Chloe', 'Chloé',
      'Courreges', 'Courrèges',
      'Gres', 'Gres Parfums', 'Parfums Grès',
      'Le Falcone', 'Le Falconé',
      'Frederic Malle', 'Frédéric Malle',
      'Maurer & Wirtz', 'Mäurer & Wirtz',
      'Salle Privee', 'Salle Privée',
    ]);
    expect(canon.get('Chloe')).toBe('Chloé');
    expect(canon.get('Courreges')).toBe('Courrèges');
    expect(canon.get('Parfums Grès')).toBe('Gres');
    expect(canon.get('Le Falconé')).toBe('Le Falcone');
    expect(canon.get('Frederic Malle')).toBe('Frédéric Malle');
    expect(canon.get('Maurer & Wirtz')).toBe('Mäurer & Wirtz');
    expect(canon.get('Salle Privee')).toBe('Salle Privée');
  });

  it('leaves genuinely different houses that merely share a common prefix apart (the "Acqua Di" trap)', () => {
    const canon = buildBrandCanon([
      'Acqua Di Parisis', 'Acqua Di Pino', 'Acqua Di Parma', 'Acqua Colonia 4711',
    ]);
    expect(canon.get('Acqua Di Parisis')).toBe('Acqua Di Parisis');
    expect(canon.get('Acqua Di Pino')).toBe('Acqua Di Pino');
    expect(canon.get('Acqua Di Parma')).toBe('Acqua Di Parma');
    expect(canon.get('Acqua Colonia 4711')).toBe('Acqua Colonia 4711');
  });

  it('leaves Avon Kids apart from Avon Cosmetics — a real, separately marketed children\'s line, not decoration', () => {
    const canon = buildBrandCanon(['Avon Cosmetics', 'Avon Kids']);
    expect(canon.get('Avon Cosmetics')).toBe('Avon Cosmetics');
    expect(canon.get('Avon Kids')).toBe('Avon Kids');
  });
});
