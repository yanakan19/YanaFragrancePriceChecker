import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isGiftSet, isGiftSetWithoutReviewedRules } from '../src/catalogue/giftSet.js';
import { CONCENTRATION, foldTitle, isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { MAX_VIAL_ML, UNNAMED_SET_RULES, isReviewedUnnamedSet, isVialSet } from '../src/catalogue/unnamedSets.js';
import { RETAILERS } from '../src/config/retailers.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Phase 9 of docs/GIFT-SETS-AND-OILS-PLAN.md: fragrance sets whose title has no strength
 * word, taken by a reviewed rule for the shop that sells them (src/catalogue/unnamedSets.ts),
 * never by a wider SET_TITLE. The titles below are real listings read on 2026-10-06; each
 * group is "this is a set" or "this stays out", with the reason.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const listing = (retailerId: string, rawTitle: string, rawBrand: string | null = null, productType: string | null = null) => ({
  retailerId,
  rawTitle,
  rawBrand,
  productType,
  description: null,
});
const setAt = (shop: string, title: string, brand: string | null = null, type: string | null = null) => isGiftSet(listing(shop, title, brand, type));

describe('real fragrance sets with no strength word are now sets', () => {
  const REAL: [string, string, string | null, string | null][] = [
    // John Lewis: "Fragrance Gift Set", miniature, discovery, travel and layering
    ['john-lewis', 'Versace Pour Femme Miniature Fragrance Gift Set, 4 x 5ml', 'Versace', null],
    ['john-lewis', 'Acqua di Parma Buongiorno Collection Fragrance Gift Set, 5 x 10ml', 'Acqua di Parma', null],
    ['john-lewis', 'BDK Parfums La Decouverte Matieres Discovery Fragrance Gift Set, 3 x 10ml', 'BDK Parfums', null],
    ['john-lewis', 'Jo Malone London Scent Layering Kit Trio Fragrance Gift Set, 3 x 9ml', 'Jo Malone London', null],
    ['john-lewis', 'Van Cleef & Arpels The Collection Extraordinaire Travel Fragrance Gift Set', 'Van Cleef & Arpels', null],
    // Cult Beauty: discovery, layering and travel sets, duos, bundles
    ['cult-beauty-global', 'BYREDO La Sélection Nomade Discovery Set', null, null],
    ['cult-beauty-global', 'Creed Men\'s Discovery Set (Aventus, Silver Mountain Water, Millesime Imperial)', null, null],
    ['cult-beauty-global', 'Jo Malone London Wood Sage & Sea Salt Travel Set', null, null],
    ['cult-beauty-global', 'Jo Malone London English Pear & Freesia & English Oak & Hazelnut Scent Layering Gift Set (Worth £74.00)', null, null],
    ['cult-beauty-global', 'KAYALI Vanilla Musk Duo 2 x 5ml', null, null],
    ['cult-beauty-global', 'Creed Bundle: Wild vetiver 50ml and Vetiver 50ml', null, null],
    ['cult-beauty-global', 'Maison Francis Kurkdjian Miniatures Fragrance Gift Set 5x10ml', null, null],
    // LookFantastic, Just My Look
    ['lookfantastic', 'Jo Malone London English Pear & Sweet Pea Layering Collection', null, null],
    ['lookfantastic', 'Versace Eros Flame Bundle Set', null, null],
    ['justmylook', 'Paco Rabanne Men\'s Mini Fragrance Gift Set 4 x 5ml', 'Paco Rabanne', null],
    ['justmylook', 'Kilian The Liquors Fragrance Mini Discovery Set 4 x 7.5ml', 'Kilian', null],
    // Avon: only in its own Fragrance category
    ['avon', 'Rare Gold Gift Set', 'Rare', 'FRAGRANCE'],
    // Emirates Oud: gift sets, bundles of two or three
    ['emirates-oud', 'Lattafa Maahir Gift Set', 'Lattafa', 'Gift Set'],
    ['emirates-oud', 'Asad Gift Set 100ml + 12ml + Shower Gel Lattafa', 'Lattafa', 'Gift Set'],
    ['emirates-oud', 'Mayar Gift Set 100ml + 12ml + Hairmist Lattafa', 'Lattafa', 'Gift Set'],
    ['emirates-oud', 'Angham Symphony Duo Bundle Set Of 2', 'Lattafa', 'Perfume'],
    ['emirates-oud', 'Lattafa Maahir Legacy Gifft Set', 'Lattafa', 'Gift Set'],
    // The houses' own shops and fragrance specialists
    ['armaf', 'Odyssey Gourmand Discovery Set 3 x 30ml', 'Armaf - Odyssey Series', null],
    ['al-haramain', 'Al Haramain Musk Series Unisex Discovery Set 6 x 10ml', 'AL HARAMAIN', 'GIFT SETS & BUNDLES'],
    ['ibraq', 'Blue Wish Set 1 (3x75ml)', 'Ibrahim Al Qurashi (IBRAQ)', 'Arabic Perfumes'],
    ['ibraq', 'Diamond Mini Collection 6 in 1', 'Ibrahim Al Qurashi (IBRAQ)', 'Arabic Perfumes'],
    ['manchester-ouds', 'Moon Collection (20ml, 15ml, 10ml)', 'Ibrahim Al Qurashi (IBRAQ)', null],
    ['nicchia-luxury-uk', 'Clive Christian Crown Collection Discovery Set 3x10 ml', 'Clive Christian', 'Discovery Set'],
    ['nicchia-luxury-uk', 'Le Patchouli Travel Kit 5x11 ml', 'Reminiscence', 'Discovery Set'],
    ['les-senteurs', 'Houbigant Collection Privée Miniature Set 6 x 3ml', 'Houbigant', 'Discovery Set'],
    ['les-senteurs', 'Baccarat Rouge 540 Travel Set 5 x 11ml', 'Maison Francis Kurkdjian', 'Gift Set'],
    ['escentric-molecules', 'Escentric 01 Scent & Body Gift Set', 'Escentric Molecules', 'Bundle'],
    ['the-fragrance-counter', 'Ghost The Fragrance Gift Set 30ml', 'Ghost', null],
    ['fragrancehub', 'Lattafa Khamrah Trio Bundle (Khamrah, Khamrah Qahwa, Khamrah Dukhaan)', 'Lattafa', null],
    ['scentstore', 'New for Christmas : Lacoste L.12.12 Silver Grey Gift Set 2025', null, null],
    ['space-nk', 'Hermès The Parfums-Jardins Collection Travel Set', null, null],
  ];

  for (const [shop, title, brand, type] of REAL) {
    it(`${shop}: ${title}`, () => {
      expect(isReviewedUnnamedSet(listing(shop, title, brand, type))).toBe(true);
      expect(setAt(shop, title, brand, type)).toBe(true);
    });
  }
});

describe('what stays out, whatever the title says', () => {
  const OUT: [string, string, string | null, string | null, string][] = [
    // Sample vials (owner's answer to question 8: a set of vials is not a set)
    ['john-lewis', 'Penhaligon\'s Best Seller Scent Library Fragrance Gift Set, 8 x 2ml', "Penhaligon's", null, 'vials'],
    ['john-lewis', 'CREED Men\'s Sample Inspiration Fragrance Gift Set, 5 x 1.7ml', 'CREED', null, 'vials and a sample'],
    ['john-lewis', 'Maison Francis Kurkdjian Mini Fragrance Wardrobe Essentiel Fragrance Gift Set, 8 x 2ml', 'Maison Francis Kurkdjian', null, 'vials'],
    ['cult-beauty-global', 'KAYALI Discovery Layering Set (8x1.5ml)', null, null, 'vials'],
    ['cult-beauty-global', 'KAYALI Discovery Layering Set', null, null, 'the same vial set, with no size stated'],
    ['cult-beauty-global', 'BORNTOSTANDOUT Dark & Drunk 2ml X 8 Discovery Kit', null, null, 'vials, size first'],
    ['cult-beauty-global', 'Kilian Heroes Mini Discovery Set 5X1.5ml', null, null, 'vials'],
    ['les-senteurs', 'Midnight City Discovery Set 7 x 1.5ml Extrait Sample', 'Memoirs of a Perfume Collector', 'Discovery Set', 'vials and a sample'],
    ['les-senteurs', 'Atelier Materi Discovery Set 6 x 2ml', 'Atelier Materi', 'Discovery Set', 'vials'],
    ['escentric-molecules', 'Molecule 2ml Sample Set 2ml', 'Escentric Molecules', 'Sample Set', 'vials'],
    ['nicchia-luxury-uk', 'Goldfield & Banks Fragrance Discovery Set 10x2 ml', 'Goldfield & Banks', 'Discovery Set', 'vials'],
    // Home fragrance, candles, soap, body care, skincare
    ['john-lewis', 'The White Company Sea Salt Luxury Fragrance Gift Set', 'The White Company', null, 'home fragrance'],
    ['lookfantastic', 'The White Company Lime & Bay Large Home Scenting Set', null, null, 'home fragrance'],
    ['cult-beauty-global', 'TRUDON La Promeneuse Candle and Scented Wax Set', null, null, 'candle'],
    ['cult-beauty-global', 'NEST New York Born to Travel Trio Set 20ml', null, null, 'home scent house'],
    ['les-senteurs', 'Holiday Scented Candle Trio 3 x 95g', 'Maison Francis Kurkdjian', 'Candle', 'candle'],
    ['nicchia-luxury-uk', 'Blue Grotto Casette Soap Gift Set 150 gr', 'Casa Amalfi', 'Sapone solido', 'soap'],
    ['nicchia-luxury-uk', 'Epicò Pop Kit Home spray 3x100 ml', 'Epicò', 'Profumo per ambiente spray', 'home spray'],
    ['nicchia-luxury-uk', 'The Essential Pouch Discovery Set UN', 'EviDenS de Beauté', 'Discovery Set', 'skincare'],
    ['nicchia-luxury-uk', 'Boosters discovery kit 3x10 ml', 'Perris Swiss Laboratory', 'Beauty kit', 'skincare, and not its Discovery Set category'],
    ['cult-beauty-global', 'Jo Malone London Care Collection Purify & Revitalise Duo', null, null, 'body care'],
    ['cult-beauty-global', 'Molton Brown Delicious Rhubarb & Rose Scent Layering Set (Worth £42.00)', null, null, 'bath and body house'],
    ['cult-beauty-global', 'Sol de Janeiro Bum Bum Jet Set', null, null, 'body care'],
    ['cult-beauty-global', 'Sol de Janeiro Cheirosa 90ml Fragrance Duo', null, null, 'body mist'],
    ['john-lewis', 'Sol de Janeiro Cheirosa Perfume Mist Best Sellers Fragrance Gift Set', 'Sol de Janeiro', null, 'body mist'],
    ['john-lewis', 'Fenty Skin Body Lil’ Mists Mini Body Mist Duo, 2 x 75ml', 'Fenty Beauty', null, 'body mist'],
    ['john-lewis', 'This Works Seventh Heaven Mini Deep Sleep Pillow Spray Bodycare Gift Set, 7 x 5ml', 'This Works', null, 'pillow spray'],
    ['lookfantastic', 'NEOM Wellbeing Essential Oil Blend Scent Discovery Set', null, null, 'wellbeing'],
    ['lookfantastic', 'Alia Discovery Kit', null, null, 'a kit the shop does not say is fragrance'],
    ['avon', 'Anew Skin Renewal Gift Set', 'Anew', 'FACE', 'skincare'],
    ['avon', 'Candle Care Gift Set', 'Avon Cosmetics', 'HOME DECOR', 'candle'],
    ['avon', 'Her Wisdom Baobab Hair & Body Duo', 'Her Wisdom', 'BODY', 'body'],
    ['avon', 'Black 4-Step Nail File Set', 'Avon Cosmetics', 'COLOR', 'nails'],
    ['avon', 'Wild Country Gift Set', 'Wild Country', 'BODY', 'a gift set in its Body category is not fragrance'],
    ['escentric-molecules', 'Escentric 01 Bath & Body Gift Set', 'Escentric Molecules', 'Bundle', 'bath and body'],
    // Air fresheners, empty bottles, bags, wrap, cards
    ['fragrancehub', 'Lattafa Khamrah Air Freshner Bundle of Three', 'Fragrance Hub LTD', null, 'air freshener'],
    ['emirates-oud', 'Lattafa Air Fresheners Pack of 4 Mixed', 'Lattafa', 'Air Freshener', 'air freshener'],
    ['emirates-oud', 'Premium Gift Bag by Lattafa', 'Lattafa', 'Gift Bag', 'a bag'],
    ['emirates-oud', 'La Collection D\'antiquites 1505 (Watch) Perfume Sample 2ml EDP Lattafa Pride', 'Lattafa', 'Perfume Sample', 'a sample'],
    ['al-haramain', 'Al Haramain Gift Wrap', 'Al Haramain', null, 'wrap'],
    ['al-haramain', 'eGift Cards E-Gift Card £10', 'Al Haramain Perfumes', 'Gift Card', 'a card'],
    ['les-senteurs', 'E-Gift Card £100.00', 'Les Senteurs', 'Gift Card', 'a card'],
    ['al-haramain', 'Al Haramain Collection Air Freshener 250ml', 'AL HARAMAIN', 'HOME & BEAUTY', 'air freshener'],
    // A shop no rule names
    ['perfume-click', 'Benefit Icons Gift Set 7.5ml POREfessional Primer + 4ml BAGgal BANG! Mascara - Intense Pitch Black', 'Benefit', null, 'make up, a shop with no rule'],
    ['boots', 'Some Brand Fragrance Gift Set', 'Some Brand', null, 'a shop with no rule'],
  ];

  for (const [shop, title, brand, type, why] of OUT) {
    it(`${shop}: ${title} (${why})`, () => {
      expect(isReviewedUnnamedSet(listing(shop, title, brand, type))).toBe(false);
      expect(setAt(shop, title, brand, type)).toBe(false);
    });
  }
});

describe('the vial rule', () => {
  it('reads a count against a size either way round, and calls 2.5ml and under a vial', () => {
    expect(MAX_VIAL_ML).toBe(2.5);
    for (const t of ['Discovery Set 10x1.5ml', 'Discovery Set 8 x 2ml', 'Discovery Kit 2ml X 8', 'Set 5 x 1.7ml', 'Set 6x2.5 ml']) expect(isVialSet(t), t).toBe(true);
    for (const t of ['Discovery Set 6 x 3ml', 'Gift Set 4 x 7ml', 'Set 3 x 10ml', 'Discovery Set', 'Travel Set 100ml']) expect(isVialSet(t), t).toBe(false);
    // Mixed: one full size among the vials is a set.
    expect(isVialSet('Set 2 x 1.5ml + 3 x 50ml')).toBe(false);
  });
});

describe('every rule names a shop in the registry, and says why', () => {
  it('has a real shop, a regular expression and a note for each', () => {
    const ids = new Set(RETAILERS.map((r) => r.id));
    for (const r of UNNAMED_SET_RULES) {
      expect(ids.has(r.shop), r.shop).toBe(true);
      expect(r.title).toBeInstanceOf(RegExp);
      expect(r.note.length, r.shop).toBeGreaterThan(10);
    }
  });
});

describe('on the shops\' stored listings', () => {
  const live = new Set(RETAILERS.filter((r) => r.enabled).map((r) => r.id));
  /** What a rule names, and what isGiftSet then makes of it (its older refusals, such as "hair", still apply). */
  const named: { shop: string; title: string; listing: StoredListing }[] = [];
  const haveData = UNNAMED_SET_RULES.filter((r) => existsSync(resolve(root, 'data/catalogue', `${r.shop}.json`)));
  for (const shop of new Set(haveData.map((r) => r.shop))) {
    if (!live.has(shop)) continue;
    const snap = JSON.parse(readFileSync(resolve(root, 'data/catalogue', `${shop}.json`), 'utf8')) as { listings: StoredListing[] };
    for (const l of snap.listings) {
      if (l.status === 'active' && l.priceGbp !== null && l.priceGbp > 0 && isReviewedUnnamedSet(l)) named.push({ shop, title: l.rawTitle, listing: l });
    }
  }
  const taken = named.filter((a) => isGiftSet(a.listing));
  /** The ones that are sets only because of a rule. */
  const added = taken.filter((a) => !isGiftSetWithoutReviewedRules(a.listing));

  it('adds a good number of sets from each of the big shops', () => {
    const by = (shop: string) => added.filter((a) => a.shop === shop).length;
    expect(by('john-lewis')).toBeGreaterThanOrEqual(10);
    expect(by('cult-beauty-global')).toBeGreaterThanOrEqual(30);
    expect(by('emirates-oud')).toBeGreaterThanOrEqual(20);
    expect(by('nicchia-luxury-uk')).toBeGreaterThanOrEqual(25);
    expect(added.length).toBeGreaterThanOrEqual(150);
  });

  it('adds only listings the general rule had left out, and none states a strength (a Cologne Collection aside)', () => {
    // A listing that states a strength is decided by the general rule, before and after: the
    // reviewed rules add the ones that state none, so no bottle can become a set through them.
    // "Cologne" alone is the one exception: Jo Malone's three "Cologne Collection" boxes of
    // several colognes, which a strength word on its own does not make a bottle.
    expect(added.filter((a) => CONCENTRATION.test(foldTitle(a.title).replace(/\bcologne collection\b|\bcologne intense collection\b/gi, ' '))).map((a) => `${a.shop}: ${a.title}`)).toEqual([]);
  });

  it('takes no vial set, no candle and no air freshener', () => {
    for (const a of named) {
      expect(isVialSet(foldTitle(a.title)), a.title).toBe(false);
      expect(/candle|air fresh|freshn?er|soap|\bsamples?\b/i.test(a.title), a.title).toBe(false);
    }
  });

  it('makes each added set a catalogue listing, so it is built as a set with a `set-` id', () => {
    for (const a of added) {
      expect(isCatalogueListing(a.listing), a.title).toBe(true);
      expect(isGiftSet(a.listing), a.title).toBe(true);
    }
  });
});

describe('in the built catalogue', () => {
  const sets = CATALOGUE.filter((p) => p.giftSet !== undefined);
  const has = (re: RegExp) => sets.some((p) => re.test(p.giftSet!.title));

  it('holds the sets that were missing, and none of the vial sets or home fragrance sets', () => {
    expect(has(/Versace Pour Femme Miniature Fragrance Gift Set/i)).toBe(true);
    expect(has(/Lattafa Maahir Gift Set/i)).toBe(true);
    expect(has(/Blue Wish Set 1/i)).toBe(true);
    expect(has(/Clive Christian Crown Collection Discovery Set/i) || has(/Crown Collection Discovery Set/i)).toBe(true);
    for (const re of [/Sample Inspiration/i, /Scent Library Fragrance Gift Set/i, /White Company/i, /Gift Bag|Gift Wrap|Gift Card/i]) {
      expect(sets.filter((p) => re.test(p.giftSet!.title)).map((p) => p.giftSet!.title), String(re)).toEqual([]);
    }
  });

  it('keeps every set of it a set: a `set-` id with a record, and no bottle among them', () => {
    for (const p of sets) expect(p.id.startsWith('set-'), p.id).toBe(true);
    expect(CATALOGUE.filter((p) => p.id.startsWith('set-') && p.giftSet === undefined).map((p) => p.id)).toEqual([]);
  });
});
