import { describe, expect, it } from 'vitest';
import {
  brandKey, pickBrandName, buildBrandCanon,
  recoverBrandFromTitle, CONFIRMED_FRAGRANCE_HOUSES,
} from '../src/catalogue/brandName.js';

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

  // Found 2026-08-26 checking demo/brandSites.ts's worklist for mis-splits —
  // data/catalogue/avon.json uses "Eve" as the rawBrand for its own Confidence/
  // One/Privé Purse/Truth line, the same shape as the Avon-lines fold above.
  it('folds "Eve" into "Avon Cosmetics" — another avon.uk.com line, not a coincidental one-word brand', () => {
    const canon = buildBrandCanon(['Avon Cosmetics', 'Eve']);
    expect(canon.get('Eve')).toBe('Avon Cosmetics');
    expect(canon.get('Avon Cosmetics')).toBe('Avon Cosmetics');
  });

  // "BOTTEGA VENETA BEAUTY" is Bottega Veneta's own current fragrance-division
  // name, not a second house — see the KNOWN_ALIASES comment for the
  // Selfridges rawBrand/URL evidence tying it to the same manufacturer as the
  // existing "Bottega Veneta" (Illusione) products.
  it('folds "Bottega Veneta Beauty" into "Bottega Veneta"', () => {
    const canon = buildBrandCanon(['Bottega Veneta', 'Bottega Veneta Beauty']);
    expect(canon.get('Bottega Veneta Beauty')).toBe('Bottega Veneta');
    expect(canon.get('Bottega Veneta')).toBe('Bottega Veneta');
  });

  // "CRM" spans five unrelated, already-real houses (Armani, Azzaro, Juliette
  // Has A Gun, Tiffany, YSL) in the-beauty-store-uk's own raw data — a feed
  // field, not a house, the same "Unbranded" shape and just as unfoldable:
  // there is no single house to fold it into.
  it('leaves "CRM" apart — a feed field spanning several unrelated real houses, not a house itself', () => {
    const canon = buildBrandCanon(['Giorgio Armani', 'CRM']);
    expect(canon.get('CRM')).toBe('CRM');
  });
});

/**
 * CONFIRMED_FRAGRANCE_HOUSES: the hand-checked, citation-carrying exception to
 * scripts/build-demo-catalogue.ts's "two independent listings" rule, added
 * 2026-09-09. The same shape as productName.ts's CONCENTRATION_RESOLUTIONS,
 * and held to the same standard — a name is here because somebody read a
 * source outside this catalogue and wrote down the URL, never because a
 * pattern suggested it.
 *
 * These tests pin the discipline rather than the contents: what would actually
 * go wrong is a future maintainer adding an uncited name, or letting the table
 * grow into a general-purpose bypass of the evidence rule.
 */
describe('CONFIRMED_FRAGRANCE_HOUSES', () => {
  it('carries a citation for every house — an uncited name is not allowed in', () => {
    for (const house of CONFIRMED_FRAGRANCE_HOUSES) {
      expect(house.name.trim()).not.toBe('');
      // A real, checkable source, not a bare assertion that someone looked.
      expect(house.citation).toMatch(/\.(com|co\.uk|uk|net|org|io)\b/);
      expect(house.citation.length).toBeGreaterThan(40);
    }
  });

  it('stays an exception list, not a second brand registry', () => {
    // The measured 2026-09-09 pass found six houses named in Perfumeo's
    // vendor-field-less titles and needed exactly ONE of them here; the other
    // five were already attested by two or more non-self-vendored listings
    // elsewhere in the catalogue, so the ordinary rule admits them. If this
    // ever runs into double figures, the thing to check is whether the
    // evidence rule itself is mis-set, not whether to keep adding names.
    expect(CONFIRMED_FRAGRANCE_HOUSES.length).toBeLessThan(10);
  });

  it('holds La Beaute Paris, the one house of the 2026-09-09 pass this catalogue cannot confirm on its own', () => {
    // No shop but Perfumeo has ever carried "La Beaute Paris" as a rawBrand
    // (checked across every data/catalogue snapshot), so its four listings —
    // Silk Musc, Duke of Edinburgh, Oud of London, Oud of Dubai — had no
    // honest brand available until this entry. Two other retailers shelve it
    // as a house of its own; see the entry's own citation.
    const entry = CONFIRMED_FRAGRANCE_HOUSES.find((h) => h.name === 'La Beaute Paris');
    expect(entry).toBeDefined();
    expect(entry!.citation).toContain('filledwithbarakah.com');
    expect(entry!.citation).toContain('dubaiperfumehub.com');
  });

  it('does not list a house the two-listings rule already confirms', () => {
    // Mykonos (60 non-self-vendored listings at emirates-oud and
    // fragrancehub), Rayhaan (79), Le Falcone (24), Atralia (24) and Ibrahim
    // Al Qurashi (20) are all admitted by the evidence rule itself. Listing
    // them here would be a hand-maintained copy of a fact the data proves,
    // which is exactly how a curated table starts drifting from reality.
    const names = CONFIRMED_FRAGRANCE_HOUSES.map((h) => h.name);
    for (const attested of ['Mykonos', 'Rayhaan', 'Le Falcone', 'Atralia', 'Ibrahim Al Qurashi']) {
      expect(names).not.toContain(attested);
    }
  });
});

/**
 * recoverBrandFromTitle: reading the house out of a listing's own title when
 * its vendor field cannot say. Moved here from scripts/build-demo-catalogue.ts
 * on 2026-09-09 so the rule that makes it safe — a candidate must already be a
 * confirmed house — can be tested rather than only described.
 *
 * The confirmed set is passed in, so these tests state their own evidence
 * instead of depending on whatever the live catalogue happens to contain
 * today. Every title below is a real one from data/catalogue except the two
 * marked CONSTRUCTED, which pin guards nothing in the live data currently
 * exercises — those are the ones most worth keeping, since a guard with no
 * live example is exactly the kind a refactor silently drops.
 */
describe('recoverBrandFromTitle', () => {
  const confirmed = new Set([
    'atralia', 'mykonos', 'le falcone', 'ibrahim al qurashi', 'rayhaan',
    'riiffs', 'molton brown', 'lattafa', 'afnan', 'swiss arabian', 'creed',
    // Deliberately included: real brand strings some shop published twice
    // that are ALSO ordinary product or sub-line words. These are what the
    // pass ordering has to survive.
    'musk', 'risala', 'mayfair', 'pride', 'supremacy',
    // Not a house anyone publishes; here only so the longest-first preference
    // below has something shorter to wrongly prefer.
    'swiss',
  ]);

  it('takes the shop at its word when the shop states the maker', () => {
    expect(recoverBrandFromTitle('Absolute Chill by Atralia 100ml Eau De Parfum | Atralia | Perfumeo UK', 'Perfumeo', confirmed)).toBe('Atralia');
    expect(recoverBrandFromTitle('Al Fursan Highfly by Le Falcone 85ml Eau De Parfum - Perfumeo', 'Perfumeo', confirmed)).toBe('Le Falcone');
  });

  // Measured 2026-09-09: with the positional passes running first — the order
  // this had until then — eight of Perfumeo's 120 titles resolved to a product
  // or sub-line word that happened to sit at the front, and every one of them
  // was a false statement about who made the bottle. An explicit "by" is the
  // shop saying it in English; a leading word is a guess about position.
  it('prefers an explicit "by <house>" over a leading word that merely looks like a brand', () => {
    expect(recoverBrandFromTitle('Musk Al Qamar by Ibrahim Al Qurashi 75ml EDP | Perfumeo UK', 'Perfumeo', confirmed)).toBe('Ibrahim Al Qurashi');
    expect(recoverBrandFromTitle('Risala For You by Le Falcone 100ml Eau De Parfum - Perfumeo', 'Perfumeo', confirmed)).toBe('Le Falcone');
    expect(recoverBrandFromTitle('Mayfair by Mykonos 100ml EDP | Perfumeo UK', 'Perfumeo', confirmed)).toBe('Mykonos');
  });

  // The three self-vendored recoveries the reorder changed, checked before it
  // shipped: all three already folded onto the same displayed brand through
  // KNOWN_ALIASES ('Supremacy' -> Afnan, 'Pride' -> Lattafa), so no product's
  // brand moved — but naming the house directly is the more honest answer.
  it('reads the house rather than its own sub-line where a title names both', () => {
    expect(recoverBrandFromTitle('Supremacy in Heaven Eau De Parfum 100ml By Afnan', 'FragranceHub', confirmed)).toBe('Afnan');
    expect(recoverBrandFromTitle('Vintage Radio 100ml Eau De Parfum by Lattafa Pride', 'FragranceHub', confirmed)).toBe('Lattafa');
  });

  it('still reads a leading or trailing house where the title has no attribution', () => {
    // Superdrug and Lookfantastic publish no vendor field and open the title
    // with the house name; Emirates Oud puts it last.
    expect(recoverBrandFromTitle('Molton Brown Fiery Pink Pepper Eau de Parfum 100ml', 'Lookfantastic', confirmed)).toBe('Molton Brown');
    expect(recoverBrandFromTitle('Costa de Amalfi Perfume 100ml EDP Riiffs', 'Emirates Oud', confirmed)).toBe('Riiffs');
  });

  it('refuses a house nobody has confirmed, rather than guessing from the title', () => {
    // "La Beaute Paris" is a real house, but only because someone checked and
    // cited it — take it out of the confirmed set and the title alone is not
    // enough. This is the whole safety property.
    expect(recoverBrandFromTitle('Silk Musc by La Beaute Paris 100ml Eau De Parfum - Perfumeo', 'Perfumeo', confirmed)).toBeNull();
    expect(recoverBrandFromTitle('Silk Musc by La Beaute Paris 100ml Eau De Parfum - Perfumeo', 'Perfumeo', new Set([...confirmed, 'la beaute paris']))).toBe('La Beaute Paris');
  });

  it('never credits a dupe to the house it is imitating', () => {
    // CONSTRUCTED. "inspired by <house>" names the fragrance being imitated,
    // not the maker; crediting Creed would state something false about a
    // bottle Creed did not make. All 15 live "inspired by" titles today name
    // a fragrance rather than a house after the "by" (FragranceHub's "Maraaj
    // Illusion ... Inspired by Aventus" and the rest), so none of them would
    // resolve anyway — which is precisely why this guard needs a test of its
    // own rather than relying on the data to keep exercising it.
    expect(recoverBrandFromTitle('Maraaj Illusion Eau De Parfum 100ml Inspired by Creed', 'FragranceHub', confirmed)).toBeNull();
  });

  it('prefers the longest house name after "by", so "Swiss Arabian" is not read as "Swiss"', () => {
    expect(recoverBrandFromTitle('Essence Of Casablanca Extrait De Parfum 100ml by Swiss Arabian', 'FragranceHub', confirmed)).toBe('Swiss Arabian');
  });

  it('never reads a bare mid-title word with no attribution behind it', () => {
    // "Lattafa" sits in the middle with no "by", and "4" is not a house.
    expect(recoverBrandFromTitle('Yara Perfume 100ml EDP Lattafa Set Of 4', 'Emirates Oud', confirmed)).toBeNull();
  });

  it('refuses to hand back the shop itself as the fragrance house', () => {
    // CONSTRUCTED, and the confirmed set is deliberately poisoned with the
    // shop's own name — the situation isSelfVendored exists to catch, arriving
    // one layer lower. A shop is not a house however it got into the set.
    expect(recoverBrandFromTitle('Oud Wood 100ml EDP by Perfumeo', 'Perfumeo', new Set([...confirmed, 'perfumeo']))).toBeNull();
  });
});
