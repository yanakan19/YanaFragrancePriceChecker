import { describe, expect, it } from 'vitest';
import { isFragrance, repairMojibake, sizeMl, sizeConflict } from '../src/catalogue/fragranceId.js';
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

/**
 * isFragrance: a title with two disagreeing sizes stays in, a title with no
 * size at all still does not.
 *
 * These are the same seven real titles as
 * tests/fragranceFilter.test.ts's "sizeMl/sizeConflict" describe block above
 * this one in the file — see there for why `sizeMl` reads five of them as
 * `null` and the other two (Club De Nuit Woman's perfume oil, Full Speed) as
 * a real, description-confirmed number. isFragrance keeps all seven either
 * way: for the five, the size rule inside isFragrance has to tell that null
 * apart from the null a title with no size at all also produces, or
 * loosening it to admit these seven would just as easily admit
 * "Fragrance-free baby nappy cream", which is the exact regression
 * NOT_A_FRAGRANCE and this size gate together exist to prevent — see this
 * describe block's second case for that.
 */
describe('isFragrance: a conflicting size stays in, an absent one still does not', () => {
  it.each([
    'Hamidi Maison Luxe Patchouli Imperial Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Midnight Amber Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Gypsy Rose Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Elixir Eau De Parfum 100ml 110ml',
    'Red Velvet Eau De Parfum 70ml 100ml',
    'Club De Nuit Woman Luxury French Perfume Oil 20ml 18ml',
    'Full Speed Eau de Toilette - 100ml 75ml',
  ])('keeps a real fragrance whose title states two conflicting sizes: %s', (title) => {
    expect(isFragrance(listing('armaf', title))).toBe(true);
  });

  // The rule this size gate exists for, unchanged: a title naming no size at
  // all is still rejected, whatever else it says. Two sizes that disagree is
  // a different fact from no size ever stated — see sizeConflict's own
  // comment in fragranceId.ts.
  it.each([
    'Lancome Absolue Longevity MD Reset The Serum',
    'Chanel Bleu de Chanel Eau de Parfum',
  ])('still rejects a title that names no size at all: %s', (title) => {
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
    // Zimaya joined on the same evidence Escentric Molecules did, and only
    // after its whole harvested catalogue was read title by title: 84
    // listings, every one a fine fragrance, none naming a concentration. See
    // its entry in src/config/retailers.ts.
    expect(flagged).toEqual(['escentric-molecules', 'zimaya']);
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

describe('isFragrance: a skincare serum is not a fragrance', () => {
  // The reported gap, verbatim from data/catalogue/perfume-click.json: a real
  // product, genuinely stated at an "extrait" strength with a parseable size,
  // but a skincare serum. Measured before adding "serum" to NOT_A_FRAGRANCE
  // (ran isFragrance over every one of the 894 active listings in
  // data/catalogue/*.json carrying the bare word): this was the *only* one
  // ever actually classified as a fragrance — the other 893 (face serum, eye
  // serum, beard serum, hair serum, brow serum, scalp serum from Anua, Avène,
  // CeraVe, Clarins, Biotherm, Beauty Of Joseon among others) were already
  // kept out by having no stated concentration at all.
  it('rejects a serum that happens to carry a real concentration word', () => {
    expect(isFragrance(listing('perfume-click', "Lancôme Absolue L'Extrait Elixir Anti-Ageing Serum 30ml"))).toBe(
      false,
    );
  });

  // The same shape "hair" is already trusted for: no genuine fine fragrance
  // is titled "[house] [anything] Serum", so the bare word needs no phrase
  // wrapper the way the body-spray family above does.
  it.each([
    'Anua Niacinamide 10% + Txa 4% Dark Spot Correcting Serum 30ml',
    'CeraVe Hydrating Hyaluronic Acid Serum 30ml',
    'American Crew Beard Serum 50ml',
  ])('rejects other real skincare serums too: %s', (title) => {
    expect(isFragrance(listing('perfume-click', title))).toBe(false);
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

  // The repair runs per `[ÃÂ][\s\S]` cluster, not on the whole string, so a
  // title carrying BOTH a correct UTF-8 accent and a mojibake sequence gets
  // only the broken half fixed — the correct half is never even examined,
  // because it never starts with "Ã" or "Â" to begin with.
  it.each([
    ['Lancôme Ã”ff Now', 'Lancôme Ôff Now'],
    [
      'Lancôme La Vie Est Belle IntensÃ©ment Eau de Parfum 50ml Spray',
      'Lancôme La Vie Est Belle Intensément Eau de Parfum 50ml Spray',
    ],
    [
      "Hermès Terre d'Hermès Eau GivrÃ©e Eau de Parfum 175ml Spray",
      "Hermès Terre d'Hermès Eau Givrée Eau de Parfum 175ml Spray",
    ],
    [
      "L'Oréal Professionnel SÃ©rie Expert Blondifier Conditioner 200ml",
      "L'Oréal Professionnel Série Expert Blondifier Conditioner 200ml",
    ],
  ])('repairs only the broken half of a mixed-encoding title: %s', (mixed, fixed) => {
    expect(repairMojibake(mixed)).toBe(fixed);
  });

  // The reversal has to be CP1252, not Latin-1, because the decoder that broke
  // these was a Windows one. UTF-8 byte 0x89 — the second byte of "É" — came
  // back as "‰" (U+2030), and Buffer.from(s, 'latin1') truncates that to 0x30,
  // the digit "0". "Ã‰clat" became "�0clat", the guard saw the U+FFFD and
  // correctly refused, and eleven real titles stayed broken because the
  // reversal used the wrong table — not because they were unrepairable.
  it.each([
    ['Atelier Cologne Ã‰clat De TubÃ©reuse', 'Atelier Cologne Éclat De Tubéreuse'],
    ['Caron Rose Ã‰bÃ¨ne De Caron', 'Caron Rose Ébène De Caron'],
    ['Miller Harris Ã‰tui Noir', 'Miller Harris Étui Noir'],
    ['Giorgio Armani SÃŒ Eau De Parfum Intense', 'Giorgio Armani SÌ Eau De Parfum Intense'],
    ['United Colors & Prestige BeautyTRIBÃ™ Luscious Pink', 'United Colors & Prestige BeautyTRIBÙ Luscious Pink'],
  ])('repairs a CP1252 misreading Latin-1 could not: %s', (broken, fixed) => {
    expect(repairMojibake(broken)).toBe(fixed);
  });

  // Worse than leaving it broken: the Latin-1 reversal turned this one into a
  // different, wrong character and the guard never fired, because "€" (U+20AC)
  // truncates to 0xAC, which happens to be a valid UTF-8 continuation byte.
  // "À la Rose" was published as "ì la Rose".
  it('does not silently substitute a wrong character where the truncation stays valid', () => {
    expect(repairMojibake('Maison Francis Kurkdjian Ã€ la Rose')).toBe('Maison Francis Kurkdjian À la Rose');
  });

  // "Ã" standing alone as its own word repairs to "à": 0xA0, the byte that
  // would make it a two-byte cluster like every other repaired case here, is
  // the one CP1252-mapped continuation byte that is itself whitespace, so a
  // later normaliser collapsing it into an ordinary space is the only way to
  // reach a bare "Ã" with nothing following it — no other accented letter's
  // mojibake form disappears into whitespace that way. The same feed carries
  // the same corruption with that byte still intact ("Balade Ã  Paris",
  // "Masque Ã  l'OrchidÃ©e", both below), and ordinary cluster reversal
  // already turns *those* into "à" — this is the one case that needed a
  // second, narrower rule to reach the same answer.
  it.each([
    ['Coty PrÃªt Ã Porter', 'Coty Prêt à Porter'],
    ['Gloria Vanderbilt Minuit Ã New York', 'Gloria Vanderbilt Minuit à New York'],
    ['Gloria Vanderbilt Jardin Ã New York Fraiche', 'Gloria Vanderbilt Jardin à New York Fraiche'],
  ])('recovers the standalone-word case the byte reversal alone cannot: %s', (broken, fixed) => {
    expect(repairMojibake(broken)).toBe(fixed);
  });

  it('repairs the same corruption where the non-breaking space survived', () => {
    // The byte that the standalone-word cases above lost: 0xA0, U+00A0
    // non-breaking space, spelled out here rather than typed literally so it
    // cannot be silently collapsed by an editor the way it was upstream.
    const nbsp = '\u00A0';
    expect(repairMojibake(`Jeanne Arthes Balade Ã${nbsp} Paris`)).toBe('Jeanne Arthes Balade à Paris');
    expect(repairMojibake(`Leonor Greyl Masque Ã${nbsp} l'OrchidÃ©e`)).toBe("Leonor Greyl Masque à l'Orchidée");
  });

  it('leaves correct French that merely trips the marker', () => {
    // "âme" is soul. These were never mojibake; the guard declining them is
    // the guard working.
    for (const t of ['Liquides Imaginaires Âme de Fleur', 'Liquides Imaginaires Âme du Coeur']) {
      expect(repairMojibake(t)).toBe(t);
    }
  });

  it('recovers a fragrance whose title was only mojibake-encoded', () => {
    expect(isFragrance(listing('mybeauty-boutique', 'Roger & Gallet VÃ©tyver Eau ParfumÃ©e 100ml Splash'))).toBe(true);
  });

  // A naive "fix mojibake" pass is exactly the kind of thing that corrupts
  // real accented names — every one of these must reach repairMojibake and
  // come back byte-for-byte identical.
  it('never touches correctly-encoded names carrying real diacritics or symbols', () => {
    for (const t of [
      'Hermès',
      "Guerlain L'Heure Bleue",
      'N°5',
      'Eau de Cologne Impériale',
      'Lancôme',
      'Estée Lauder',
    ]) {
      expect(repairMojibake(t)).toBe(t);
    }
  });

  // Running the repair twice must never change a second time — neither on
  // titles that needed fixing nor on ones that never did.
  it('is idempotent', () => {
    for (const t of [
      'Coty PrÃªt Ã Porter Eau de Toilette 100ml Spray',
      'Gloria Vanderbilt Jardin Ã New York Eau de Parfum Fraiche 100ml Spray',
      'Gloria Vanderbilt Minuit Ã New York Eau de Parfum 100ml Spray',
      "Hermès Terre d'Hermès Eau GivrÃ©e Eau de Parfum 175ml Spray",
      'Lancôme Ã”ff Now Eau de Parfum 50ml Spray',
      'Lancôme Ã”ver The Top Eau de Parfum 50ml Spray',
      'Lancôme La Vie Est Belle IntensÃ©ment Eau de Parfum 50ml Spray',
      'Hermès',
      "Guerlain L'Heure Bleue",
      'N°5',
      'Eau de Cologne Impériale',
      'Liquides Imaginaires Âme de Fleur',
    ]) {
      const once = repairMojibake(t);
      const twice = repairMojibake(once);
      expect(twice).toBe(once);
    }
  });

  // The seven names this fix was written for, verified against the actual
  // mojibake byte sequences rather than assumed from how they look.
  it.each([
    ['PrÃªt Ã Porter', 'Prêt à Porter'],
    ['Jardin Ã New York Fraiche', 'Jardin à New York Fraiche'],
    ['Minuit Ã New York', 'Minuit à New York'],
    ["Terre d'Hermès Eau GivrÃ©e", "Terre d'Hermès Eau Givrée"],
    ['Ã”ff Now', 'Ôff Now'],
    ['Ã”ver The Top', 'Ôver The Top'],
    ['La Vie Est Belle IntensÃ©ment', 'La Vie Est Belle Intensément'],
  ])('recovers the demo catalogue mojibake name: %s', (broken, fixed) => {
    expect(repairMojibake(broken)).toBe(fixed);
  });
});

/**
 * sizeMl: a title stating a menu of sizes, then its own variant's size.
 *
 * The Al Haramain multi-size mis-grouping. Musk Al Tahara sells 3ml, 6ml,
 * 12ml, 24ml and 35ml from a single URL, and every one of its five titles
 * reads "Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml <this row's own size>" — the
 * product's title spells out the whole menu, and the harvester appends the
 * specific variant's own size after it. Reading the first ml number, the
 * ordinary rule, reads the menu's first entry on all five rows regardless of
 * which one they actually are: every row came back "3ml", so all five
 * collapsed into one product under productMatch.ts's matchKey and a £4.75
 * 3ml bottle was compared against a £26.00 35ml one as though they were the
 * same size. See fragranceId.ts's SIZE_MENU_THEN_VARIANT_RE for the fix and
 * the full measurement (30 listings, all Al Haramain, across 8 product URLs)
 * that scoped it.
 *
 * Every title below is a real one from data/catalogue/al-haramain.json, not
 * invented — this is the whole family the fix has to get right at once:
 * comma-separated menus, plus-separated ones, and menus of different
 * lengths whose own boilerplate does not always list every size the product
 * actually comes in (see the 24ml/35ml cases below, neither of which is
 * itself in the "3ml + 6ml + 12ml" text).
 */
describe('sizeMl: a size menu followed by the row’s own size', () => {
  it.each([
    ['Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 3ml', 3],
    ['Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 6ml', 6],
    ['Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 12ml', 12],
    ['Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 24ml', 24],
    ['Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 35ml', 35],
    ['Al Haramain Oudh Abyat Perfume Oil 3ml + 6ml + 12ml 3ml', 3],
    ['Al Haramain Oudh Abyat Perfume Oil 3ml + 6ml + 12ml 6ml', 6],
    ['Al Haramain Oudh Abyat Perfume Oil 3ml + 6ml + 12ml 12ml', 12],
    // The menu text itself only ever lists three sizes, even on the two
    // rows whose own size is not one of them — the boilerplate does not
    // grow with the product, so matching against menu membership (rather
    // than just taking the trailing token) would get exactly these two
    // rows wrong.
    ['Al Haramain Sultan Perfume Oil 3ml + 6ml + 12ml 24ml', 24],
    ['Al Haramain Sultan Perfume Oil 3ml + 6ml + 12ml 35ml', 35],
  ])('reads the trailing size, not the menu’s first entry: %s', (title, expected) => {
    expect(sizeMl(title)).toBe(expected);
  });

  /**
   * The trap a broader "trust the last size mentioned" rule would fall
   * into. A bottle plus a smaller companion item — a gift, a travel size —
   * is also a title with two sizes in it, and there the *first*, headline
   * size is the one actually being priced; the second belongs to the free
   * extra, not this listing. None of these is Al Haramain's menu shape:
   * each joins its two sizes with a word or a "+" that names the second
   * item, rather than restating one option list before picking an entry
   * from it. Real titles from fragrance-click.json, armaf.json and
   * mybeauty-boutique.json, none of them affected by the fix above.
   *
   * Re-measured 2026-08-26, following up on the 42 multi-size titles
   * 2797294 counted and deliberately left alone. 33 of them are this same
   * bundle/gift-with-purchase shape (a "+" or "&" always present) across
   * fragrance-click, mybeauty-boutique, perfume-click, the-beauty-store-uk,
   * home-bargains and two Armaf "+ FREE Refillable" titles — every one
   * still reads correctly as the first, headline size. Spot-checked against
   * each shop's own description text rather than assumed: Home Bargains'
   * "Firetrap Nocturnal Eau De Toilette 50ml & Bodywash 150ml" is confirmed
   * 50ml by its own description ("Gift Set EDC 50ml"), and the two Armaf
   * "250ml + FREE Refillable 5ml 250ml" titles by "presented in a grand
   * 250ml decanter". None of the 33 needed a code change.
   *
   * The bare two-size titles covered by their own describe block below
   * (Hamidi's four, Red Velvet, Club De Nuit Woman's perfume oil, and Avon's
   * Full Speed) used to sit in this same it.each, reading as a confident but
   * occasionally wrong number. See that block for why they now read `null`
   * instead.
   */
  it.each([
    ['Burberry Her 100ml Eau de Parfum + 10ml Set', 100],
    ['Dolce & Gabbana Devotion 100ml Eau de Parfum + 10ml', 100],
    ['Jimmy Choo Man 200ml Eau De Toilette & 30ml Set', 200],
    ['Boss Bottled EDT 50Ml + Deo Spray 150Ml Gs', 50],
  ])('leaves an ordinary bundle alone, reading the headline size: %s', (title, expected) => {
    expect(sizeMl(title)).toBe(expected);
  });
});

/**
 * sizeMl/sizeConflict: a title stating two different sizes with nothing
 * between them but whitespace.
 *
 * Seven real titles (Armaf's four Hamidi Maison Luxe lines, its own Red
 * Velvet and Club De Nuit Woman perfume oil, and Avon's Full Speed), and for
 * five of them the ambiguity is real: title text alone cannot settle it.
 * Reading every one of Armaf's four Hamidi Maison Luxe "...100ml 110ml"
 * titles against that product's own description on armaf.uk: Patchouli
 * Imperial and Gypsy Rose confirm 110ml, Midnight Amber and Elixir confirm
 * 100ml. Same shop, same exact title shape, same token order — the first
 * number is right for two of the four and wrong for the other two, so no
 * title-only rule (first, last, or otherwise) gets all four right, and there
 * is nothing in the title itself that tells them apart. Red Velvet's own
 * description never states a size at all.
 *
 * `sizeMl` used to return the first number anyway — a confident size that
 * was right five times out of seven and wrong by one size step (110ml read
 * as 100ml, or the reverse) on the other two, never an order of magnitude
 * off the way the pre-2797294 Al Haramain bug was, but still a number stated
 * with no more basis than a coin flip. It now returns `null` for these five,
 * and `sizeConflict` is what lets a caller — isFragrance below, in
 * particular — tell this apart from a title that names no size at all: see
 * that function's own comment for why the difference decides whether the
 * listing stays in the catalogue. Every downstream consumer of a built
 * product's `sizeMl` (productMatch.ts's matchKey, wasPriceCredibility.ts's
 * CredibilityOffer, demo/volumeBands.ts, demo/listSort.ts, demo/app.ts's
 * facet and tile rendering) treats a null size as "cannot compare", never as
 * a definite number to sort, key or print — see each file's own tests for
 * the specific behaviour.
 *
 * The other two of the seven — Club De Nuit Woman's perfume oil and Avon's
 * Full Speed — are the describe block just below this one: unlike the five
 * above, their own description text (not the title) settles them, so
 * `sizeMl` reads a real number for these two while `sizeConflict` still
 * reports the title itself as stating two disagreeing sizes — see
 * SIZE_CONFLICT_RESOLVED's own comment in fragranceId.ts for the evidence.
 */
describe('sizeMl/sizeConflict: two disagreeing sizes, nothing between them', () => {
  it.each([
    'Hamidi Maison Luxe Patchouli Imperial Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Midnight Amber Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Gypsy Rose Eau De Parfum 100ml 110ml',
    'Hamidi Maison Luxe Elixir Eau De Parfum 100ml 110ml',
    'Red Velvet Eau De Parfum 70ml 100ml',
  ])('reads as unresolved, not as either number: %s', (title) => {
    expect(sizeMl(title)).toBeNull();
    expect(sizeConflict(title)).toBe(true);
  });

  // The complement: a title repeating the identical size twice has nothing
  // to disagree about, and reads exactly as it always did — see
  // SIZE_CONFLICT_RE's own comment in fragranceId.ts for the measurement
  // (nine more titles like this one in the live catalogue).
  it.each([
    ['Club De Nuit Woman Eau De Parfum 30ml 30ml', 30],
    ['Club De Nuit Woman Body Spray 200ml 200ml', 200],
  ])('a repeated, agreeing size is not a conflict: %s', (title, expected) => {
    expect(sizeMl(title)).toBe(expected);
    expect(sizeConflict(title)).toBe(false);
  });

  // A bundle joined by "+"/"&"/"," is never mistaken for this shape, however
  // many bare sizes it ends on — see SIZE_CONFLICT_RE's own comment.
  it.each([
    'Burberry Her 100ml Eau de Parfum + 10ml Set',
    'Al Haramain Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml, 35ml 6ml',
  ])('never fires on a title carrying a comma, plus or ampersand: %s', (title) => {
    expect(sizeConflict(title)).toBe(false);
  });
});

/**
 * sizeMl: the two SIZE_CONFLICT_RE titles resolved by their own description
 * text rather than left null — see SIZE_CONFLICT_RESOLVED's own comment in
 * fragranceId.ts for the raw-data evidence (armaf.uk's and avon.uk.com's own
 * description fields, plus Full Speed's price agreeing with its other
 * confirmed-100ml lines). `sizeConflict` still reports these titles as
 * conflicting — that fact is about what the title itself states, unchanged
 * by a different field settling it — which is exactly why sizeMl needed the
 * lookup rather than sizeConflict needing an exception.
 */
describe('sizeMl: two of the seven conflicting titles resolved by their own description', () => {
  it.each([
    ['Club De Nuit Woman Luxury French Perfume Oil 20ml 18ml', 20],
    ['Full Speed Eau de Toilette - 100ml 75ml', 100],
  ])('reads the description-confirmed size, not null: %s', (title, expected) => {
    expect(sizeMl(title)).toBe(expected);
    expect(sizeConflict(title)).toBe(true);
  });
});

/**
 * sizeMl: a title that restates its own headline size, then ends on the
 * row's own — possibly different — variant size.
 *
 * The second half of the 2026-08-26 re-measurement above. Emirates Oud's
 * Shopify feed restates a "headline" size (its default variant) with the
 * concentration and brand name repeated after it, then the harvester
 * appends this row's own variant size at the very end: "Milky Way Perfume
 * 100ml EDP Maison Asrar 25ml" is the 25ml row, not a 25ml bottle
 * mislabelled as 100ml. See fragranceId.ts's SIZE_RESTATED_THEN_VARIANT_RE
 * for the corroborating evidence (retailerSku, and Odyssey Aqua's price
 * genuinely falling with its size) this function cannot see but which
 * settled it. All four titles below are real, from
 * data/catalogue/emirates-oud.json.
 */
describe('sizeMl: a headline size restated, then the row’s own variant size', () => {
  it.each([
    ['Milky Way Perfume 100ml EDP Maison Asrar 25ml', 25],
    ['Milky Way Perfume 100ml EDP Maison Asrar 100ml', 100],
    ['Odyssey Aqua Perfume 100ml EDP Armaf 60ml', 60],
    ['Odyssey Aqua Perfume 100ml EDP Armaf 100ml', 100],
  ])('reads the row’s own trailing size, not the restated headline: %s', (title, expected) => {
    expect(sizeMl(title)).toBe(expected);
  });
});
