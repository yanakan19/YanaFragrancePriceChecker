import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { STRENGTH_EVIDENCE, declinesStrengthWords, evidencedStrength } from '../src/catalogue/unstatedStrengthEvidence.js';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import { CONCENTRATION_NOT_STATED, concentrationOfStoredListing } from '../src/catalogue/productName.js';
import type { StoredListing } from '../src/catalogue/types.js';

// About 185 Cult Beauty perfume pages state no strength and were hidden (commit
// 710db0a1). The brand's own page names it for some; this holds each entry to its
// source and holds the rest hidden. Titles below are verbatim Cult Beauty titles,
// stored 2026-10-04.

function listing(rawTitle: string, o: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerId: 'cult-beauty-global',
    retailerSku: 'x',
    url: 'https://shop.example/p/1',
    rawTitle,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp: 220,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-10-03T00:00:00.000Z',
    lastSeenAt: '2026-10-04T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    description: null,
    productType: null,
    ...o,
  } as StoredListing;
}

describe('the table of what a brand says its perfume is', () => {
  it('cites an https page, a quote and a day for every entry, in a strength the catalogue has', () => {
    const allowed = new Set(['Eau de Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Extrait de Parfum', 'Parfum']);
    for (const e of STRENGTH_EVIDENCE) {
      expect(e.source, e.names.join()).toMatch(/^https:\/\//);
      expect(e.quote.length, e.names.join()).toBeGreaterThan(10);
      expect(e.readAt).toMatch(/^2026-\d\d-\d\d$/);
      expect(allowed.has(e.concentration)).toBe(true);
      expect(e.names.length).toBeGreaterThan(0);
      expect(e.brands.length).toBeGreaterThan(0);
    }
  });

  it('has no entry for a brand that says it does not use the words (Commodity)', () => {
    expect(STRENGTH_EVIDENCE.some((e) => e.brands.some((b) => /commodity/i.test(b)))).toBe(false);
    expect(evidencedStrength({ rawTitle: 'Commodity Gold Personal 100ml' })).toBeNull();
    expect(evidencedStrength({ rawTitle: 'Commodity Milk+ Bold 100ml' })).toBeNull();
  });

  it('has no entry for a brand whose pages state none, or that refuses us (Kismet, Fascent, Nue Co, Kilian, Malle)', () => {
    for (const t of [
      'Kismet Olfactive The Poet 50ml',
      'Fascent Corn Star 30ml',
      'The Nue Co. Forest Lungs Mood-Balancing Fragrance 50ml',
      'Kilian Sacred Wood 50ml',
      'Frédéric Malle Carnal Flower 10ml',
    ]) {
      expect(evidencedStrength({ rawTitle: t }), t).toBeNull();
    }
  });
});

describe('which listings an entry reaches', () => {
  it.each([
    ['Creed Wild Vetiver 50ml', 'Eau de Parfum'],
    ['Creed Queen Of Silk 75ml', 'Eau de Parfum'],
    ['Creed Absolu Aventus 100ml', 'Eau de Parfum'],
    ['Discothèque Lola at Coat Check 50ml', 'Eau de Parfum'],
    ['Discothèque Heathens, Cowboys and the Santa Ana Winds 8ml', 'Eau de Parfum'],
    ["D.S. & Durga Ain't That Sweet 50ml", 'Eau de Parfum'],
    ['D.S. & DURGA Cowgirl Grass 50ml', 'Eau de Parfum'],
    ['Charlotte Tilbury Collection of Emotions Joyphoria 10ml', 'Eau de Parfum'],
    ['Charlotte TilburyCollection of Emotions Cosmic Power 100ml', 'Eau de Parfum'],
    ['Le Labo Eucalyptus 20 (50ml)', 'Eau de Parfum'],
    ['BORNTOSTANDOUT® Dirty Heaven 15ml', 'Eau de Parfum'],
    ['Sisley Paris L\'Eau Revee d\'Isa - 50ml', 'Eau de Toilette'],
    ['Jo Loves A Fragrance - Pomelo 50ml', 'Eau de Toilette'],
    ['Jo Loves Rose & Dates A Fragrance 100ml', null],
    ['Jo Loves A Fragrance - Cobalt Patchouli and Cedar 100ml', 'Eau de Toilette'],
    ['Acqua di Parma Colonia Il Profumo 100ml', 'Eau de Parfum'],
    ['Creed Erolfa 50ml', 'Eau de Parfum'],
  ])('%s is %s', (title, expected) => {
    expect(evidencedStrength({ rawTitle: title })?.concentration ?? null).toBe(expected);
  });

  it('takes a name alone only where the shop\'s own brand field is the brand', () => {
    expect(evidencedStrength({ rawTitle: 'Wild Vetiver 50ml', rawBrand: 'Creed' })?.concentration).toBe('Eau de Parfum');
    expect(evidencedStrength({ rawTitle: 'Wild Vetiver 50ml', rawBrand: null })).toBeNull();
    expect(evidencedStrength({ rawTitle: 'Wild Vetiver 50ml', rawBrand: 'Someone Else' })).toBeNull();
  });

  it('honours the sizes a page sells, where an entry lists them', () => {
    expect(evidencedStrength({ rawTitle: 'Byredo Alto Astral 100ml' })).not.toBeNull();
    expect(evidencedStrength({ rawTitle: 'Byredo Alto Astral 7.5ml' })).toBeNull();
  });

  it('leaves another product of the same name alone: a duo, a travel atomiser, a paintbrush, the Extrait', () => {
    for (const t of [
      'Creed Black 5ml Refillable Atomiser',
      'Creed Wild Vetiver Sample 2ml',
      'Jo Loves A Fragrance Paintbrush Pomelo 7ml',
      'Discothèque Lola at Coat Check The Extrait 50ml',
      'BORNTOSTANDOUT Dirty Duo: Dirty Heaven 15ml & Dirty Rice 15ml (Worth £158.00)',
      'Sol de Janeiro Cheirosa 90ml Fragrance Duo',
    ]) {
      expect(evidencedStrength({ rawTitle: t }), t).toBeNull();
    }
  });

  it('does not reach the BORNTOSTANDOUT Eau Intimite line, which the house does not file as a strength', () => {
    expect(evidencedStrength({ rawTitle: 'Warm Air Eau Intimité 30 ml', rawBrand: 'BORNTOSTANDOUT®' })).toBeNull();
  });
});

describe('what it unlocks', () => {
  it('lets a title with no strength be a fragrance, and states the brand\'s strength', () => {
    const wild = listing('Creed Wild Vetiver 50ml');
    expect(isFragrance({ ...wild, rawTitle: 'Creed Wild Vetiver 50ml' })).toBe(true);
    expect(concentrationOfStoredListing(wild)).toBe('Eau de Parfum');
  });

  it('keeps every other title with no strength out, as before', () => {
    expect(isFragrance(listing('Commodity Gold Personal 100ml'))).toBe(false);
    expect(isFragrance(listing('Kismet Olfactive The Poet 50ml'))).toBe(false);
    expect(isFragrance(listing('Jo Malone London Revitalise Body Gel-Cream 200ml'))).toBe(false);
    expect(concentrationOfStoredListing(listing('Commodity Gold Personal 100ml'))).toBe(CONCENTRATION_NOT_STATED);
  });

  it('puts no strength on a Commodity bottle at a THG shop, even where the page copy or title says one', () => {
    const t = 'Commodity Book- Personal Eau de Parfum 100ml';
    expect(declinesStrengthWords({ rawTitle: t })).toBe(true);
    expect(declinesStrengthWords({ rawTitle: 'Creed Wild Vetiver 50ml' })).toBe(false);
    expect(isFragrance(listing(t))).toBe(false);
    // The same words at a shop that is not read from page copy are that shop's own title.
    expect(isFragrance(listing(t, { retailerId: 'bloom-perfumery' }))).toBe(true);
  });

  it('never overrules a strength the title states', () => {
    const edt = listing('Creed Wild Vetiver Eau de Toilette 50ml');
    expect(concentrationOfStoredListing(edt)).toBe('Eau de Toilette');
  });

  it('puts the unlocked Creed pages in the built catalogue, as Eau de Parfum, once each', () => {
    const wild = CATALOGUE.filter((p) => p.brand === 'Creed' && p.name === 'Wild Vetiver' && p.sizeMl === 50);
    if (wild.length === 0) return; // the shops stopped listing it
    expect(wild).toHaveLength(1);
    expect(wild[0]!.concentration).toBe('Eau de Parfum');
    expect((CRAWLED[wild[0]!.id] ?? []).some((o) => o.retailerId === 'cult-beauty-global')).toBe(true);
  });

  it('shows no Commodity perfume from Cult Beauty: the house names no strength, so none is put on it', () => {
    const fromCult = CATALOGUE.filter(
      (p) => p.brand === 'Commodity' && (CRAWLED[p.id] ?? []).some((o) => o.retailerId === 'cult-beauty-global'),
    );
    expect(fromCult.map((p) => `${p.name} ${p.concentration}`)).toEqual([]);
  });
});
