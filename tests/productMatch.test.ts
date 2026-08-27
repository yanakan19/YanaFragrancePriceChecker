import { describe, expect, it } from 'vitest';
import {
  matchKey,
  findDuplicateGroups,
  untrustworthyEans,
  trustworthyEan,
  NOT_STATED_MATCH_KEY,
  type MatchableProduct,
  type EanListing,
} from '../src/catalogue/productMatch.js';
import { fragranceId } from '../src/catalogue/fragranceId.js';
import { CONCENTRATION_NOT_STATED } from '../src/catalogue/productName.js';
import type { StoredListing } from '../src/catalogue/types.js';

const p = (o: Partial<MatchableProduct> & { id: string }): MatchableProduct => ({
  brand: 'Afnan',
  name: 'Supremacy In Extrait De Parfum',
  concentration: 'Oud',
  sizeMl: 100,
  ean: null,
  ...o,
});

/** A minimal StoredListing, for the fragranceId regression tests below. */
function listing(o: Partial<StoredListing> & Pick<StoredListing, 'retailerId' | 'retailerSku' | 'ean' | 'rawTitle'>): StoredListing {
  return {
    url: 'https://shop.example/p/1',
    rawBrand: null,
    imageUrl: null,
    priceGbp: 95,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-16T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...o,
  };
}

describe('product matching', () => {
  describe('the reported duplicate', () => {
    // Verbatim from demo/catalogue.generated.ts: the same bottle listed twice
    // at £38.99 and £50.00 because only one shop published the barcode.
    const beautyBase = p({ id: 'ean-6290171070207', ean: '6290171070207' });
    const justmylook = p({ id: 'justmylook-afnn0005', ean: null });

    it('recognises them as one bottle', () => {
      const groups = findDuplicateGroups([beautyBase, justmylook]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['justmylook-afnn0005']);
    });

    it('keeps the record that carries the barcode', () => {
      const groups = findDuplicateGroups([justmylook, beautyBase]);
      expect(groups[0]!.canonical.id).toBe('ean-6290171070207');
    });
  });

  describe('what counts as the same bottle', () => {
    it('ignores the word order shops disagree about', () => {
      // Also real: "Supremacy Pour Homme Silver" vs "Supremacy Silver Pour Homme".
      const a = p({ id: 'a', name: 'Supremacy Pour Homme Silver', concentration: 'Eau de Parfum' });
      const b = p({ id: 'b', name: 'Supremacy Silver Pour Homme', concentration: 'Eau de Parfum' });
      expect(matchKey(a)).toBe(matchKey(b));
    });

    it('ignores punctuation and casing', () => {
      expect(matchKey(p({ id: 'a', name: "Bade'e Al-Oud" }))).toBe(
        matchKey(p({ id: 'b', name: 'BADEE AL OUD' })),
      );
    });

    it('ignores the brand spellings feeds disagree about', () => {
      expect(matchKey(p({ id: 'a', brand: 'ARMAF' }))).toBe(matchKey(p({ id: 'b', brand: 'Armaf' })));
    });
  });

  describe('what must stay separate', () => {
    it('keeps different sizes apart', () => {
      const groups = findDuplicateGroups([p({ id: 'a', sizeMl: 100 }), p({ id: 'b', sizeMl: 150 })]);
      expect(groups).toHaveLength(0);
    });

    it('keeps different concentrations apart', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', concentration: 'Eau de Parfum' }),
        p({ id: 'b', concentration: 'Extrait' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('keeps different houses apart', () => {
      const groups = findDuplicateGroups([p({ id: 'a', brand: 'Afnan' }), p({ id: 'b', brand: 'Armaf' })]);
      expect(groups).toHaveLength(0);
    });

    it('keeps genuinely different names apart', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', name: 'Supremacy Silver' }),
        p({ id: 'b', name: 'Supremacy Not Only' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('never overrules two barcodes that disagree', () => {
      // A reformulation shares its name, size and concentration with the
      // original and is a different article. The manufacturer said so.
      // Both codes carry a valid GTIN check digit, which is what makes them
      // the manufacturer speaking rather than a shop's own numbering.
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '3349668612611' }),
        p({ id: 'b', ean: '3349668508471' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('leaves a barcode-less listing alone when the barcodes around it disagree', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '3349668612611' }),
        p({ id: 'b', ean: '3349668508471' }),
        p({ id: 'c', ean: null }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('keeps two flankers apart when only the barcode tells them apart', () => {
      // Verbatim from data/catalogue/perfume-click.json: IN2U for Him and
      // IN2U for Her are sold under the byte-identical title "Calvin Klein
      // IN2U Eau de Toilette 100ml Spray", so name, size and concentration
      // all agree and the barcode is the only thing left saying these are two
      // different perfumes. Merging them would publish one price for both.
      const groups = findDuplicateGroups([
        p({ id: 'ean-0088300196890', brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', ean: '0088300196890' }),
        p({ id: 'ean-0088300196814', brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', ean: '0088300196814' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    /**
     * An unknown size — sizeMl: null, the seven Hamidi/Red Velvet/Club De
     * Nuit Woman/Full Speed listings whose own titles state two conflicting
     * sizes rather than one (see sizeConflict in src/catalogue/fragranceId.ts)
     * — is a real fact, and "we could not read one number" is not the same
     * fact as any other listing's own stated size, including another
     * listing that also could not be read. See sizeKeyPart's own comment in
     * src/catalogue/productMatch.ts for why an unknown never merges with
     * anything, sized or not.
     */
    it('never merges an unknown size into a listing with a real one', () => {
      const groups = findDuplicateGroups([p({ id: 'a', sizeMl: null }), p({ id: 'b', sizeMl: 100 })]);
      expect(groups).toHaveLength(0);
    });

    it('never merges two listings that are each individually unknown, even when everything else agrees', () => {
      // Same brand, name and concentration on both — the only thing telling
      // matchKey these might be different bottles is that neither one's own
      // size could be read, which is not evidence that they agree.
      const groups = findDuplicateGroups([
        p({ id: 'a', sizeMl: null }),
        p({ id: 'b', sizeMl: null }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('gives two unknown-size products from the same listing set different match keys', () => {
      // The concrete mechanism behind the two tests above: matchKey must
      // never collapse onto a shared placeholder like the string "null".
      expect(matchKey(p({ id: 'a', sizeMl: null }))).not.toBe(matchKey(p({ id: 'b', sizeMl: null })));
    });
  });

  describe('what a shop puts in its ean field is not always a barcode', () => {
    // Oud Arabian publishes its Shopify internal item ids there. 173 of its
    // listings carry an "ean" and 16 pass a GTIN check digit — 9.2%, the rate
    // random digits pass at. Those ids were counting as a second, disagreeing
    // barcode and blocking real merges.
    const real = (id: string, ean: string | null) =>
      p({ id, brand: 'Bujairami', name: 'Chubby', concentration: 'Extrait de Parfum', ean });

    it('ignores a code that fails its own check digit', () => {
      const groups = findDuplicateGroups([
        real('ean-9362014001413', '9362014001413'),
        real('ean-10485679980886', '10485679980886'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001413');
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['ean-10485679980886']);
    });

    it('ignores a GTIN-14 case code even when its check digit is valid', () => {
      // 10486020047190 does pass the check digit, at 14 digits. A GTIN-14 with
      // a non-zero indicator digit identifies a case of some number of units,
      // never the bottle inside it.
      const groups = findDuplicateGroups([
        real('ean-9362014001499', '9362014001499'),
        real('ean-10486020047190', '10486020047190'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001499');
    });

    it('still merges a listing whose only code is unusable into a real barcode', () => {
      const groups = findDuplicateGroups([
        real('a', null),
        real('ean-10485679980886', '10485679980886'),
        real('ean-9362014001413', '9362014001413'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001413');
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('treats two unusable codes as no barcode at all rather than a disagreement', () => {
      const groups = findDuplicateGroups([
        real('x', '10485679980886'),
        real('y', '10464548454742'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed).toHaveLength(1);
    });

    it('reads a barcode that lost a leading zero as the same barcode', () => {
      // Both are Calvin Klein Contradiction 100ml, one feed padding to 12 and
      // the other not. See normalizedEan.
      const groups = findDuplicateGroups([
        p({ id: 'a', brand: 'Calvin Klein', name: 'Contradiction', ean: '088300602513' }),
        p({ id: 'b', brand: 'Calvin Klein', name: 'Contradiction', ean: '88300602513' }),
      ]);
      expect(groups).toHaveLength(1);
    });
  });

  describe('the reported triple listing', () => {
    // Rabanne Lady Million Eau de Parfum 30ml, verbatim from
    // demo/catalogue.generated.ts: five separate listings of one bottle.
    const lm = (id: string, ean: string | null) =>
      p({ id, brand: 'Rabanne', name: 'Lady Million', concentration: 'Eau de Parfum', sizeMl: 30, ean });

    it('folds the barcode-less shops into the barcode that agrees with them', () => {
      const groups = findDuplicateGroups([
        lm('ean-3349668612611', '3349668612611'),
        lm('justmylook-pac0023', null),
        lm('mybeauty-boutique-shopify-gb-8338265768073-44927131877513', null),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-3349668612611');
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('still refuses while two genuine Rabanne barcodes disagree', () => {
      // 3349668612611 and 3349668508471 are both well-formed and both sit in
      // Rabanne's own 334966 range: one bottle each from two packaging
      // generations, which is the manufacturer's statement and not ours to
      // overrule. This group is deliberately left split — see the report.
      const groups = findDuplicateGroups([
        lm('ean-3349668612611', '3349668612611'),
        lm('ean-3349668508471', '3349668508471'),
        lm('justmylook-pac0023', null),
      ]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('grouping', () => {
    it('folds three shops into one product', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '6290171070207' }),
        p({ id: 'b' }),
        p({ id: 'c' }),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('reports nothing when every product is already distinct', () => {
      const groups = findDuplicateGroups([p({ id: 'a', sizeMl: 50 }), p({ id: 'b', sizeMl: 100 })]);
      expect(groups).toEqual([]);
    });
  });

  describe('an EAN one retailer prints on two different products', () => {
    // Verbatim from data/catalogue/nicchia-luxury-uk.json (measured
    // 2026-08-19): 8055277283900 is stuck on two genuinely different Bois
    // 1920 bottles in that one shop's own feed. Both codes pass the GTIN
    // check digit, so isBarcode alone would wave both through.
    const cannabisDolce: EanListing = {
      retailerId: 'nicchia-luxury-uk',
      ean: '8055277283900',
      rawTitle: 'Bois 1920 Cannabis Dolce Eau de Parfum 100 ml',
    };
    const cannabisSalata: EanListing = {
      retailerId: 'nicchia-luxury-uk',
      ean: '8055277283900',
      rawTitle: 'Bois 1920 Cannabis Salata Eau de Parfum 100 ml',
    };

    it('untrustworthyEans catches the real Nicchia collision', () => {
      const untrustworthy = untrustworthyEans([cannabisDolce, cannabisSalata]);
      expect(untrustworthy.size).toBe(1);
    });

    it('trustworthyEan revokes the code on both listings, like a missing EAN', () => {
      const untrustworthy = untrustworthyEans([cannabisDolce, cannabisSalata]);
      expect(trustworthyEan(cannabisDolce, untrustworthy)).toBeNull();
      expect(trustworthyEan(cannabisSalata, untrustworthy)).toBeNull();
    });

    it('does not flag a genuine repeat listing of one bottle written two ways', () => {
      // The exact case matchKey itself already protects — see "ignores the
      // word order shops disagree about" above. untrustworthyEans must not
      // start flagging what the rest of this file already knows is one
      // bottle, or every barcode in the catalogue would end up "untrustworthy"
      // the moment a shop republished its own listing with a reordered title.
      const a: EanListing = { retailerId: 'x', ean: '6290171070207', rawTitle: 'Supremacy Pour Homme Silver' };
      const b: EanListing = { retailerId: 'x', ean: '6290171070207', rawTitle: 'Supremacy Silver Pour Homme' };
      expect(untrustworthyEans([a, b]).size).toBe(0);
      expect(trustworthyEan(a, untrustworthyEans([a, b]))).toBe('6290171070207');
    });

    it('is scoped to the one retailer that misused the code, never the shops that did not', () => {
      // Perfume Click publishing the identical code correctly, for the
      // identical bottle, must not be caught by Nicchia's mistake — the whole
      // point of keying untrustworthyEans per retailer.
      const elsewhere: EanListing = {
        retailerId: 'perfume-click',
        ean: '8055277283900',
        rawTitle: 'Bois 1920 Cannabis Dolce Eau de Parfum 100 ml',
      };
      const untrustworthy = untrustworthyEans([cannabisDolce, cannabisSalata, elsewhere]);
      expect(trustworthyEan(elsewhere, untrustworthy)).toBe('8055277283900');
    });

    it('leaves a code that was never barcode-shaped exactly as it found it', () => {
      // An Oud Arabian-style Shopify id reused across two products was never
      // trustworthy to begin with (see isBarcode); there is nothing here to
      // revoke, and it must keep flowing through untouched.
      const a: EanListing = { retailerId: 'oud-arabian', ean: '173', rawTitle: 'Bujairami Chubby' };
      const b: EanListing = { retailerId: 'oud-arabian', ean: '173', rawTitle: 'Bujairami Ghost' };
      expect(untrustworthyEans([a, b]).size).toBe(0);
      expect(trustworthyEan(a, new Set())).toBe('173');
    });

    it('still merges an untrustworthy-coded listing into a bottle a real barcode identifies', () => {
      // Part (a) of the guard: revoking a code for identity purposes must not
      // stop the listing being folded into a genuinely matching product by
      // name, size and concentration — it is treated exactly like a listing
      // that never had an EAN, which is allowed to merge, just never to lead.
      const canonical = p({ id: 'ean-6290171070207', ean: '6290171070207' });
      const sameShopOtherListing: EanListing = {
        retailerId: 'shop-x',
        ean: '3349668612611', // a real, well-formed barcode elsewhere in shop-x's own feed
        rawTitle: 'Supremacy In Extrait De Parfum',
      };
      const untrustworthy = untrustworthyEans([
        sameShopOtherListing,
        { retailerId: 'shop-x', ean: '3349668612611', rawTitle: 'Something Else Entirely' },
      ]);
      const revoked = trustworthyEan(sameShopOtherListing, untrustworthy);
      expect(revoked).toBeNull();
      const groups = findDuplicateGroups([canonical, p({ id: 'shop-x-sku', ean: revoked })]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-6290171070207');
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['shop-x-sku']);
    });

    it('never weakens a genuine barcode disagreement sitting alongside the Nicchia collision', () => {
      // Proof the guard is scoped narrowly: computing untrustworthyEans over a
      // listing set that includes the real Nicchia collision must not touch
      // the completely unrelated, genuinely disagreeing Rabanne codes from
      // "still refuses while two genuine Rabanne barcodes disagree" above.
      const rabanne1: EanListing = { retailerId: 'a', ean: '3349668612611', rawTitle: 'Lady Million' };
      const rabanne2: EanListing = { retailerId: 'b', ean: '3349668508471', rawTitle: 'Lady Million' };
      const untrustworthy = untrustworthyEans([cannabisDolce, cannabisSalata, rabanne1, rabanne2]);
      expect(trustworthyEan(rabanne1, untrustworthy)).toBe('3349668612611');
      expect(trustworthyEan(rabanne2, untrustworthy)).toBe('3349668508471');
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '3349668612611', brand: 'Rabanne', name: 'Lady Million', concentration: 'Eau de Parfum', sizeMl: 30 }),
        p({ id: 'b', ean: '3349668508471', brand: 'Rabanne', name: 'Lady Million', concentration: 'Eau de Parfum', sizeMl: 30 }),
      ]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('fragranceId: the same collision, one step earlier', () => {
    // fragranceId() keys a listing on `ean-${ean}` before findDuplicateGroups
    // ever runs. Without the untrustworthy-ean guard, that means two
    // genuinely different Nicchia listings sharing one code silently fuse
    // into a single product record — no name, size or concentration check at
    // all — the moment the second one is read.
    const divineVanille = listing({
      retailerId: 'nicchia-luxury-uk',
      retailerSku: '56535436886400',
      ean: '3770010614098',
      rawTitle: 'Essential Parfums Divine Vanille Eau de Parfum 10 ml',
    });
    const theMusc = listing({
      retailerId: 'nicchia-luxury-uk',
      retailerSku: '56535437934976',
      ean: '3770010614098',
      rawTitle: 'Essential Parfums The Musc Eau de Parfum 10 ml',
    });

    it('demonstrates the bug is real: without the guard, both listings key to the same id', () => {
      expect(fragranceId(divineVanille)).toBe('ean-3770010614098');
      expect(fragranceId(theMusc)).toBe('ean-3770010614098');
      expect(fragranceId(divineVanille)).toBe(fragranceId(theMusc));
    });

    it('never fuses the two different Essential Parfums bottles once the guard is supplied', () => {
      const untrustworthy = untrustworthyEans([divineVanille, theMusc]);
      const divineVanilleId = fragranceId(divineVanille, untrustworthy);
      const theMuscId = fragranceId(theMusc, untrustworthy);
      expect(divineVanilleId).not.toBe(theMuscId);
      expect(divineVanilleId).toBe('nicchia-luxury-uk-56535436886400');
      expect(theMuscId).toBe('nicchia-luxury-uk-56535437934976');
    });

    it('leaves an uncontested EAN keying exactly as before, guard supplied or not', () => {
      const clean = listing({
        retailerId: 'perfume-click',
        retailerSku: 'sku-9',
        ean: '0088300196890',
        rawTitle: 'Calvin Klein IN2U Eau de Toilette 100ml Spray',
      });
      const untrustworthy = untrustworthyEans([divineVanille, theMusc, clean]);
      expect(fragranceId(clean)).toBe('ean-0088300196890');
      expect(fragranceId(clean, untrustworthy)).toBe('ean-0088300196890');
    });
  });

  describe('a "Not stated" concentration joining the one real sibling that names it', () => {
    // Verbatim from demo/catalogue.generated.ts once productName.ts's trailing-
    // brand strip runs: Emirates Oud's own "Shaghaf Oud Perfume 75ml Swiss
    // Arabian" cleans to the same brand, size and name as the other four
    // shops' "Shaghaf Oud Perfume 75ml EDP", but its title never states a
    // concentration at all, so it reads "Not stated" where the other four
    // read "Eau de Parfum" — the exact reported bug (see the commit message
    // for the real npm run catalogue:demo before/after counts).
    const fourShops = p({
      id: 'ean-6295124024832', ean: '6295124024832',
      brand: 'Swiss Arabian', name: 'Shaghaf Oud', concentration: 'Eau de Parfum', sizeMl: 75,
    });
    const emiratesOud = p({
      id: 'emirates-oud-8916599177565-default-title', ean: null,
      brand: 'Swiss Arabian', name: 'Shaghaf Oud', concentration: 'Not stated', sizeMl: 75,
    });

    it('joins the barcode-bearing group rather than sitting beside it as a second product', () => {
      const groups = findDuplicateGroups([fourShops, emiratesOud]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-6295124024832');
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['emirates-oud-8916599177565-default-title']);
      // The merged record keeps the real, stated concentration — a "Not
      // stated" sibling joining the group must never downgrade what the
      // other four shops actually said.
      expect(groups[0]!.canonical.concentration).toBe('Eau de Parfum');
    });

    it('never bridges the other way: a stated concentration cannot absorb a "Not stated" sibling\'s identity', () => {
      // Same two records, canonical selection must still prefer the one that
      // actually names a concentration — proven above — but the rule itself
      // is asymmetric by construction: swapping the input order must not
      // change which one is picked, or "Not stated" could end up leading.
      const groups = findDuplicateGroups([emiratesOud, fourShops]);
      expect(groups[0]!.canonical.id).toBe('ean-6295124024832');
    });

    it('refuses when two different real concentrations both share the identity (ambiguous)', () => {
      // Real, verbatim shape from Afnan "Supremacy Not Only Intense" 100ml:
      // an Eau de Parfum sibling and an Extrait de Parfum sibling both exist
      // for the same brand, size and name, so "Not stated" cannot tell which
      // of the two it secretly was. Left as three separate products rather
      // than guessed into either.
      const edp = p({ id: 'a', brand: 'Afnan', name: 'Supremacy Not Only Intense', concentration: 'Eau de Parfum', sizeMl: 100 });
      const extrait = p({ id: 'b', brand: 'Afnan', name: 'Supremacy Not Only Intense', concentration: 'Extrait de Parfum', sizeMl: 100 });
      const notStated = p({ id: 'c', brand: 'Afnan', name: 'Supremacy Not Only Intense', concentration: 'Not stated', sizeMl: 100 });
      const groups = findDuplicateGroups([edp, extrait, notStated]);
      expect(groups).toHaveLength(0);
    });

    it('refuses when there is no stated sibling to join at all', () => {
      const groups = findDuplicateGroups([emiratesOud]);
      expect(groups).toHaveLength(0);
    });

    it('still refuses a bridge whose own barcode disagrees with the stated group', () => {
      const disagreeing = p({
        id: 'x', ean: '3349668508471',
        brand: 'Swiss Arabian', name: 'Shaghaf Oud', concentration: 'Not stated', sizeMl: 75,
      });
      const barcoded = p({
        id: 'ean-3349668612611', ean: '3349668612611',
        brand: 'Swiss Arabian', name: 'Shaghaf Oud', concentration: 'Eau de Parfum', sizeMl: 75,
      });
      const groups = findDuplicateGroups([barcoded, disagreeing]);
      expect(groups).toHaveLength(0);
    });

    it('still respects brand, size and name — an unrelated "Not stated" product is untouched', () => {
      const unrelated = p({
        id: 'y', ean: null,
        brand: 'Afnan', name: 'Something Else Entirely', concentration: 'Not stated', sizeMl: 50,
      });
      const groups = findDuplicateGroups([fourShops, emiratesOud, unrelated]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['emirates-oud-8916599177565-default-title']);
    });

    // NOT_STATED_MATCH_KEY is a hand-copy of CONCENTRATION_NOT_STATED,
    // lowercased — productMatch.ts cannot import productName.ts directly
    // without closing a circular import (productName.ts -> fragranceId.ts ->
    // productMatch.ts; see NOT_STATED_MATCH_KEY's own comment). This is the
    // guard that stops the copy silently drifting from the original.
    it('NOT_STATED_MATCH_KEY never drifts from CONCENTRATION_NOT_STATED', () => {
      expect(NOT_STATED_MATCH_KEY).toBe(CONCENTRATION_NOT_STATED.toLowerCase());
    });
  });
});
