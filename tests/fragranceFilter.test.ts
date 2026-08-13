import { describe, expect, it } from 'vitest';
import { isFragrance, repairMojibake } from '../src/catalogue/fragranceId.js';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The concentration test and its one exception.
 *
 * `isFragrance` requires a title to name a concentration — "eau de parfum",
 * "EDP", "cologne". That test is what keeps a broad beauty retailer's
 * skincare out of a fragrance comparison, and these tests exist to stop it
 * being loosened site-wide by someone fixing the symptom below.
 *
 * The symptom: a single fragrance house names products after itself, never
 * after a concentration, so its entire catalogue failed. Escentric Molecules
 * reached the app with 2 of its 118 listings. The fix is a per-shop opt-in
 * (`fragranceOnlyCatalogue`), not a weaker regex.
 */

function listing(retailerId: string, rawTitle: string, priceGbp: number | null = 95): StoredListing {
  return {
    retailerId,
    retailerSku: 'sku-1',
    url: 'https://shop.example/p/1',
    rawTitle,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-12T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  };
}

describe('isFragrance: the concentration requirement', () => {
  it('keeps a titled concentration at an ordinary multi-brand shop', () => {
    expect(isFragrance(listing('escentual', 'Chanel Bleu de Chanel Eau de Parfum 100ml'))).toBe(true);
  });

  // The reason the requirement exists at all. These are real titles from
  // Escentual's own harvested catalogue, where 4,173 listings fail this test —
  // serums, brushes and shampoo, correctly kept out of a fragrance comparison.
  it.each([
    'Lancome Absolue Longevity MD Reset The Serum 30ml',
    'Nuxe Nuxuriance Ultra The Global Anti-Aging Rich Cream 50ml',
    'NIOD Copper Amino Isolate Lipid 1% 15ml',
    'Elemis Pro-Collagen Toning Mist 150ml',
  ])('rejects non-fragrance without a concentration word: %s', (title) => {
    expect(isFragrance(listing('escentual', title))).toBe(false);
  });
});

describe('isFragrance: fragranceOnlyCatalogue shops', () => {
  // The 44 listings this recovers are single bottles priced £60-£220.
  it.each([
    'Escentric 01 200ml',
    'Molecule 01 100ml',
    'Molecule 01 + Clary Sage 100ml',
    'Escentric 05 Portable 30ml',
  ])('accepts a real fragrance with no concentration word: %s', (title) => {
    expect(isFragrance(listing('escentric-molecules', title))).toBe(true);
  });

  // Multi-item sets must still be rejected. sizeMl reads the first size it
  // finds, so admitting "Set 3 x 8.5ml" at £80 would publish it as a single
  // 8.5ml bottle at £80 — the most overpriced thing on the site, and untrue.
  it.each([
    'Molecule 01 ATOM.iser. Set 3 x 8.5ml, 1 x ATOM.iser',
    'M+ Patchouli ATOM.iser. Set 3 x 8.5ml, 1 x ATOM.iser',
    'Molecule 01 8.5ml + Escentric 01 8.5ml',
  ])('still rejects a multi-item set: %s', (title) => {
    expect(isFragrance(listing('escentric-molecules', title))).toBe(false);
  });

  it('does not relax the requirement for shops without the flag', () => {
    // Byte-identical title, different shop: the exemption is per-shop, so an
    // ordinary retailer gets the concentration test exactly as before.
    expect(isFragrance(listing('escentric-molecules', 'Escentric 01 200ml'))).toBe(true);
    expect(isFragrance(listing('escentual', 'Escentric 01 200ml'))).toBe(false);
  });

  it('still applies the non-fragrance and price rules to an exempt shop', () => {
    // The exemption drops one test, not all of them.
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 Body Wash 100ml'))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 100ml', null))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 100ml', 0))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01'))).toBe(false);
  });
});

describe('fragranceOnlyCatalogue is opt-in and deliberately narrow', () => {
  it('is set on exactly the shops a human has vouched for', () => {
    const flagged = RETAILERS.filter((r) => r.fragranceOnlyCatalogue).map((r) => r.id).sort();
    expect(flagged).toEqual(['escentric-molecules']);
  });

  // The trap this guards. LUSH and Bath & Body Works are also single-brand,
  // and their tiers are indistinguishable from Escentric Molecules', so
  // nothing about a registry entry's shape can be used to infer the flag.
  // They sell bath and body products, where the concentration test is exactly
  // what keeps soap out of the comparison.
  it('is not implied by singleBrandOnly', () => {
    for (const id of ['lush', 'bath-body-works-uk']) {
      const r = getRetailer(id);
      expect(r?.singleBrandOnly, `${id} should still be single-brand`).toBeTruthy();
      expect(r?.fragranceOnlyCatalogue, `${id} must not be exempt`).toBeFalsy();
    }
  });

  it('is not inferable from tiers', () => {
    // Both 'niche'. If anyone ever tries to derive the flag from tiers, this
    // is the pair that makes it impossible.
    expect(getRetailer('lush')?.tiers).toEqual(getRetailer('escentric-molecules')?.tiers);
  });
});

describe('isFragrance: scented air and body sprays are not perfume', () => {
  // These passed because "Oud" is the product *line's* name — Lattafa's
  // "Bade'e Al Oud" and "Oud Mood" ranges — not a strength, and the size
  // parses. 26 of them were in the comparison beside the actual eau de parfum
  // of the same line, at £2.99-£5.29, reading as the bargain of the site.
  it.each([
    ['emirates-oud', 'Badee al Oud Sublime Air Freshener 300ml Lattafa'],
    ['emirates-oud', 'Oud 24 Hours Air Freshener 300ml Ard Al Zaafaran'],
    ['mybeauty-boutique', "Lattafa Bade'e Al Oud Room Spray 300ml"],
    ['mybeauty-boutique', 'Floris Oud And Cashmere Room Spray 100ml'],
    ['justmylook', 'Ashleigh & Burwood Lamp Fragrance Bergamot & Oud 500ml'],
    ['mybeauty-boutique', 'The Olphactory Cedar Oud Home Spray 500ml'],
    ['mybeauty-boutique', 'Private Blend Oud Wood by Tom Ford All Over Body Spray 150ml'],
    ['beautybase', "Lattafa Bade'e Al Oud Amethyst Perfumed Body Spray 200ml Spray"],
  ])('rejects %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(false);
  });

  // Every entry is a phrase, and this is why. Each of these is a genuine
  // fragrance carrying the bare word on its own — the bare word would take all
  // of them, and 34 more real listings containing "air".
  it.each([
    ['beautybase', "Nina Ricci L'Air Du Temps Eau De Parfum 100ml Spray"],
    ['fragrance-click', 'Calvin Klein Eternity Air 100ml Eau de Parfum'],
    ['nicchia-luxury-uk', 'Vilhelm Parfumerie Room Service Eau de Parfum 50 ml'],
    ['nicchia-luxury-uk', 'Vilhelm Parfumerie Body Paint Eau de Parfum 100 ml'],
    ['mybeauty-boutique', 'Reebok Cool Your Body Men Eau de Toilette 100ml Spray'],
    ['mybeauty-boutique', 'TOVA Beverly Hills Body Mind Spirit Eau De Parfum 100ml'],
  ])('keeps a real fragrance carrying the bare word at %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(true);
  });

  // The only two titles in all 32,912 active priced listings that pair one of
  // these phrases with a real concentration. Both are two products sold as one
  // unit, published as a lone 100ml bottle at the pair's price — dropped on
  // purpose, not tolerated as collateral.
  it.each([
    ['beautybase', 'Lattafa Najdia Eau De Parfum 100ml & Body Spray 50ml Spray'],
    ['mybeauty-boutique', 'Arthes Rocky Man 100Ml EDT + Body Spray 200Ml Set'],
  ])('drops a bottle-plus-body-spray pair deliberately at %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(false);
  });
});

describe('isFragrance: a quantity against a size means several bottles', () => {
  // sizeMl reads the first size in the title, so each of these published as a
  // single small bottle at the price of the whole pack: £205 for "10ml",
  // £114 for "20ml". All real titles; all 44 matches in the live catalogue
  // were read by hand and every one is a genuine multi-pack.
  it.each([
    ['nicchia-luxury-uk', 'Parfums de Marly Delina Exclusif Parfum 3x10 ml Travel Set + Case'],
    ['nicchia-luxury-uk', 'Franck Boclet Cocaine Extrait de Parfum 4x20 ml'],
    ['nicchia-luxury-uk', 'Kilian Good Girl Gone Bad Eau de Parfum 4x7.5 ml'],
    ['justmylook', 'Parfums De Marly Delina Eau De Parfum Travel Set 3 x 10ml'],
    ['emirates-oud', 'Lattafa Pride No.1 Gift Set 5X20ml EDP Lattafa'],
    ['mybeauty-boutique', 'Laurent Mazzone Hysteric Extrait de Parfum Travel set 3x15ml'],
  ])('rejects a multi-pack at %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(false);
  });

  // The rule this replaces, and the reason it was never applied site-wide.
  // Emirates Oud repeats the size in its own titles and Escentual and Oud
  // Arabian both write a size twice for one bottle. Re-measured against the
  // live catalogue: a ">= 2 sizes" rule would drop 47 kept listings this one
  // does not, mostly single bottles like these.
  it.each([
    ['emirates-oud', 'Odyssey Aqua Perfume 100ml EDP Armaf 100ml'],
    ['emirates-oud', 'Marwa Perfume 100ml EDP Arabiyat Prestige 100ml'],
    ['escentual', "Jimmy Choo I Want Choo Eau de Parfum 100ml -  Collector's Edition 100ml"],
    ['oud-arabian', 'Bujairami Only Ever 100ml 100ml Eau De Parfum Bujairami Sydney'],
    ['mybeauty-boutique', "L'Artisan Mure et Musc Extreme Eau de Parfum 100ml Spray 100ml Spray"],
  ])('still keeps a single bottle whose size is written twice at %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(true);
  });

  // A bare "set" is not safe globally either. Tommy Bahama's line is called
  // Set Sail, and Fragrance Click's "+ 10ml" listings really are the headline
  // 100ml bottle with a miniature beside it — sizeMl reads the right size.
  it.each([
    ['mybeauty-boutique', 'Tommy Bahama Tommy Bahama Set Sail Cologne St. Barts Eau de Cologne 100ml Spray'],
    ['fragrance-click', 'Burberry Her 100ml Eau de Parfum + 10ml Set'],
    ['emirates-oud', 'Genesis Perfume Set 90ml EDP French Avenue by Fragrance World'],
  ])('does not reject a single bottle for the word "set" alone at %s: %s', (retailerId, title) => {
    expect(isFragrance(listing(retailerId, title))).toBe(true);
  });

  it('reads "1 x" as one bottle, not several', () => {
    // Nothing in the catalogue relies on this today — all 5 such titles are
    // already rejected for other reasons — but a rule meaning "several" must
    // not quietly mean "one or more".
    expect(isFragrance(listing('escentual', 'Diptyque Do Son Eau de Parfum 1 x 100ml'))).toBe(true);
  });
});

describe('accented spellings still name a concentration', () => {
  // Seven real bottles were dropped by this, all at Nicchia Luxury UK,
  // including Kilian Good Girl Gone Bad at £205: "eau fraiche" was in the
  // pattern from the start, but the shop spells it properly.
  it.each([
    'Kilian Good Girl Gone Bad Eau Fraîche 50 ml',
    'Nicolai L’Eau Mixte Eau Fraîche 100 ml',
    'Robert Piguet Fracas Eau Fraîche 25 ml',
  ])('accepts an accented concentration: %s', (title) => {
    expect(isFragrance(listing('nicchia-luxury-uk', title))).toBe(true);
  });

  // The regression the fold itself introduced, and why "parfumee" is now
  // named in its own right. Before folding, "é" is not a word character, so
  // "Parfumée" matched \bparfum\b by accident; folding removes that accidental
  // boundary, and without its own entry this real bottle would have vanished.
  it('accepts Eau Parfumée, which folding would otherwise have broken', () => {
    expect(isFragrance(listing('allbeauty', 'Elizabeth Arden Green Tea Eau Parfumée Scent Spray 100ml'))).toBe(true);
    expect(isFragrance(listing('allbeauty', 'Elizabeth Arden Green Tea Eau Parfumee Scent Spray 100ml'))).toBe(true);
  });

  it('does not let folding smuggle a non-fragrance past the reject list', () => {
    expect(isFragrance(listing('escentual', 'Nuxe Crème Prodigieuse Body Cream 200ml'))).toBe(false);
  });
});

describe('repairMojibake', () => {
  // MyBeauty.Boutique's feed arrives UTF-8-decoded-as-Latin-1. 156 of its
  // listings carry it and 114 were rendering that way on the live site.
  it.each([
    ['212 VIP RosÃ©', '212 VIP Rosé'],
    ['Good Girl LÃ©gÃ¨re', 'Good Girl Légère'],
    ['Roger & Gallet VÃ©tyver Eau ParfumÃ©e 100ml Splash', 'Roger & Gallet Vétyver Eau Parfumée 100ml Splash'],
  ])('repairs %s', (broken, fixed) => {
    expect(repairMojibake(broken)).toBe(fixed);
  });

  it('leaves correctly-encoded text alone', () => {
    for (const t of ['Lancôme La Vie Est Belle', 'Eau Fraîche 50 ml', 'Molecule 01 100ml']) {
      expect(repairMojibake(t)).toBe(t);
    }
  });

  // The conservative guard. A title carrying BOTH correct UTF-8 and mojibake
  // cannot be round-tripped without corrupting the correct half, so it is left
  // exactly as it is rather than made worse. 29 such titles remain.
  it('declines a mixed-encoding title rather than corrupting the good half', () => {
    const mixed = 'Lancôme Ã”ff Now';
    expect(repairMojibake(mixed)).toBe(mixed);
  });

  it('recovers a fragrance whose title was only mojibake-encoded', () => {
    expect(isFragrance(listing('mybeauty-boutique', 'Roger & Gallet VÃ©tyver Eau ParfumÃ©e 100ml Splash'))).toBe(true);
  });
});
