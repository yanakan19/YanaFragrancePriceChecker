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

  // Added 2026-08-26: brandKey used to delete an accented letter outright as
  // "not a letter", the same treatment punctuation gets, so an accented and
  // unaccented spelling of the same word hashed to different keys and needed
  // a hand-written KNOWN_ALIASES pair to ever meet (the module doc's own
  // "real blind spot"). NFKD decomposition plus a nonspacing-mark strip folds
  // this mechanically, for any accented pair, not just the ones already
  // found and hand-listed.
  it('folds an accented letter onto its plain base, mechanically', () => {
    expect(brandKey('Chloé')).toBe(brandKey('Chloe'));
    expect(brandKey('Estée Lauder')).toBe(brandKey('Estee Lauder'));
    expect(brandKey('Lancôme')).toBe(brandKey('Lancome'));
    expect(brandKey('Hermès')).toBe(brandKey('Hermes'));
    expect(brandKey('Frédéric Malle')).toBe(brandKey('Frederic Malle'));
    // A compatibility decomposition (superscript 2 -> plain "2"), not a
    // combining mark, but NFKD folds both the same way.
    expect(brandKey('DSquared²')).toBe(brandKey('DSquared2'));
  });

  // The fold only reaches letters Unicode can decompose into a base plus a
  // combining mark. ø, æ, œ, ß and the like are their own letters, not a
  // composed accent, so they still need their own KNOWN_ALIASES entry (see
  // the Kanøn/Kanon pair in buildBrandCanon's tests below) — asserted here so
  // a future change to this function cannot silently start guessing at those
  // instead.
  it('does not invent a fold for a letter with no diacritic decomposition', () => {
    expect(brandKey('Kanøn')).not.toBe(brandKey('Kanon'));
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

  // Found 2026-08-26 auditing the 354 canonical houses with no known site,
  // for splits a spelling difference had hidden rather than for new sites —
  // see the KNOWN_ALIASES comment above this table's 2026-08-26 block for
  // the full per-pair product-name evidence.
  it('folds the 2026-08-26 batch of houses split by brand-field spelling', () => {
    const canon = buildBrandCanon([
      'Armaf', 'Oros',
      'Guy Laroche', 'Drakkar',
      'Lattafa', 'So Poudree',
      'Eden Classic', 'Eden Classics', 'Mandate',
      'Kanon', 'Kanøn',
      'Swiss Army', 'Swiss Army Victorinox', 'Victorinox Swiss Army', 'Victorinox',
    ]);
    expect(canon.get('Oros')).toBe('Armaf');
    expect(canon.get('Drakkar')).toBe('Guy Laroche');
    expect(canon.get('So Poudree')).toBe('Lattafa');
    expect(canon.get('Eden Classics')).toBe('Eden Classic');
    expect(canon.get('Mandate')).toBe('Eden Classic');
    expect(canon.get('Eden Classic')).toBe('Eden Classic');
    expect(canon.get('Kanøn')).toBe('Kanon');
    expect(canon.get('Swiss Army')).toBe('Victorinox Swiss Army');
    expect(canon.get('Swiss Army Victorinox')).toBe('Victorinox Swiss Army');
    expect(canon.get('Victorinox')).toBe('Victorinox Swiss Army');
    expect(canon.get('Victorinox Swiss Army')).toBe('Victorinox Swiss Army');
  });

  // Found while investigating demo/brandSites.ts's worklist entry for
  // "Whisky" (8 products): mybeauty-boutique.json's Awin feed put EVAFLORPARIS's
  // own "Whisky" line name in the brand field, not the house — see the
  // KNOWN_ALIASES comment above for the cross-retailer and WebSearch evidence.
  it('folds "Whisky" into Evaflor — a line name in the brand field, not a house', () => {
    const canon = buildBrandCanon(['Evaflor', 'Whisky']);
    expect(canon.get('Whisky')).toBe('Evaflor');
    expect(canon.get('Evaflor')).toBe('Evaflor');
  });

  // Two candidates the same 2026-08-26 sweep raised and rejected, checked
  // against each other rather than folded on one matching title alone — see
  // the KNOWN_ALIASES comment for the full reasoning.
  it('does not fold "The One" into Dolce & Gabbana or "London Fragrances" into Jo Malone', () => {
    const canon = buildBrandCanon(['Dolce & Gabbana', 'The One', 'Jo Malone', 'London Fragrances']);
    expect(canon.get('The One')).toBe('The One');
    expect(canon.get('London Fragrances')).toBe('London Fragrances');
  });

  // Found 2026-08-26 re-checking demo/brandSites.ts's own "eleven strings
  // that are not brands at all" list against data/catalogue/avon.json —
  // avon.uk.com's own raw scrape, not a cross-reference — which uses every
  // one of these eight as a `rawBrand` for products living at its own
  // avon.uk.com/products/... URLs. Seven were already flagged there as
  // reading like Avon lines on product-title shape alone; "Perfect
  // Nonsense" was not (it had been grouped with the unrelated "Designer
  // Collection" instead) until this same domain check turned it up as an
  // eighth. 'Avon Cosmetics' is picked as canon because it is the spelling
  // avon.json's own feed actually uses for its unnamed-line releases —
  // bare "Avon" never appears anywhere in the data.
  it('folds Avon\'s own fragrance lines into "Avon Cosmetics"', () => {
    const canon = buildBrandCanon([
      'Avon Cosmetics', 'Attraction', 'Black Suede', 'Full Speed',
      'Little Black Dress', 'Imari', 'Perceive', 'Incandessence', 'Perfect Nonsense',
    ]);
    expect(canon.get('Attraction')).toBe('Avon Cosmetics');
    expect(canon.get('Black Suede')).toBe('Avon Cosmetics');
    expect(canon.get('Full Speed')).toBe('Avon Cosmetics');
    expect(canon.get('Little Black Dress')).toBe('Avon Cosmetics');
    expect(canon.get('Imari')).toBe('Avon Cosmetics');
    expect(canon.get('Perceive')).toBe('Avon Cosmetics');
    expect(canon.get('Incandessence')).toBe('Avon Cosmetics');
    expect(canon.get('Perfect Nonsense')).toBe('Avon Cosmetics');
    expect(canon.get('Avon Cosmetics')).toBe('Avon Cosmetics');
  });

  // Checked against the same avon.json domain evidence and ruled out:
  // neither string appears anywhere in that scrape, so neither is an Avon
  // line — each is a different retailer's own private-label range instead
  // (an Awin dupe-fragrance feed for Designer Collection, bmstores.co.uk's
  // in-house range for Scent Favourites). "Avon Kids" stays apart from
  // "Avon Cosmetics" for the reason its own existing test above gives, not
  // because this fold changed anything about that call.
  it('does not fold "Designer Collection" or "Scent Favourites" into Avon Cosmetics', () => {
    const canon = buildBrandCanon(['Avon Cosmetics', 'Designer Collection', 'Scent Favourites']);
    expect(canon.get('Designer Collection')).toBe('Designer Collection');
    expect(canon.get('Scent Favourites')).toBe('Scent Favourites');
  });
});
