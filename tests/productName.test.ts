import { describe, expect, it } from 'vitest';
import {
  CONCENTRATION_NOT_STATED, brandTitleOpens, brandTitleEnds, brandTitleEndsWithHouse, concentration, displayName,
  stripRedundantSize,
} from '../src/catalogue/productName.js';

/**
 * What a reader sees under a product photo: the name, with the brand, size and
 * concentration shown as their own separate fields beside it.
 *
 * Both bugs pinned here were duplication — the same fact printed twice on one
 * card — and both were invisible to any test, because the only way to exercise
 * this code was to run a 33,000-listing build and read the output.
 */

describe('brandTitleOpens: which spelling of the brand the title actually uses', () => {
  // A listing carries two brand strings and they are often not the same one:
  // the retailer's raw vendor field, and the spelling the app displays (chosen
  // once per house by brandName.ts). Only the raw field used to be tried, so
  // wherever they differed the strip silently did nothing.
  it.each([
    ['Afnan 9PM Elixir Extrait de Parfum 100ml Spray', 'Afnan', 'Afnan Perfumes', 'Afnan'],
    ['Dolce & Gabbana Devotion Eau de Parfum 50ml', 'Dolce & Gabbana', 'DOLCE&GABBANA', 'Dolce & Gabbana'],
    ['DKNY Fresh Blossom Eau de Parfum 100ml', 'DKNY', 'Donna Karan', 'DKNY'],
    ['Dunhill Driven Blue Eau de Toilette 100ml', 'Dunhill', 'Dunhill London', 'Dunhill'],
  ])('%s -> uses %s', (title, displayed, raw, expected) => {
    expect(brandTitleOpens(title, [displayed, raw])).toBe(expected);
  });

  // Longest match wins, and it has to. Preferring the displayed spelling gets
  // these two houses wrong: "Joop" leaves a stray "!", and "Dunhill" leaves
  // "London" sitting at the front of the fragrance's name.
  it('prefers the longer spelling when both match', () => {
    expect(brandTitleOpens('Joop! Homme Eau de Toilette 125ml', ['Joop', 'Joop!'])).toBe('Joop!');
    expect(
      brandTitleOpens('Dunhill London Desire Red For Men Eau de Toilette 100ml', ['Dunhill', 'Dunhill London']),
    ).toBe('Dunhill London');
  });

  it('returns null when the title does not open with the brand at all', () => {
    // Emirates Oud writes the house at the end: "Costa de Amalfi Perfume 100ml
    // EDP Riiffs". Nothing is stripped rather than something guessed at.
    expect(brandTitleOpens('Costa de Amalfi Perfume 100ml EDP Riiffs', ['Riiffs', 'Riiffs'])).toBeNull();
    expect(brandTitleOpens('Molecule 01 100ml', [null, null])).toBeNull();
  });
});

describe('displayName: the brand is not repeated in the name', () => {
  it.each([
    ['Afnan 9PM Elixir Extrait de Parfum 100ml Spray', 'Afnan Perfumes', 'Afnan', '9PM Elixir'],
    ['Dolce & Gabbana Devotion Eau de Parfum 50ml', 'DOLCE&GABBANA', 'Dolce & Gabbana', 'Devotion'],
    ['DKNY Fresh Blossom Eau de Parfum 100ml', 'Donna Karan', 'DKNY', 'Fresh Blossom'],
    ['Dunhill Driven Blue Eau de Toilette 100ml', 'Dunhill London', 'Dunhill', 'Driven Blue'],
    ['Lattafa Musamam Eau de Parfum 100ml', 'Lattafa Perfumes', 'Lattafa', 'Musamam'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // The regressions the longest-match rule exists to prevent. Both would ship
  // a visibly mangled name.
  it('does not leave a fragment of the brand behind', () => {
    expect(displayName('Joop! Homme Eau de Toilette 125ml Spray', 'Joop!', 'Joop')).toBe('Homme');
    expect(displayName('Dunhill London Desire Red For Men Eau de Toilette 100ml', 'Dunhill London', 'Dunhill')).toBe(
      'Desire Red For Men',
    );
  });

  // Only a spelling some source actually vouched for is ever removed. Taking a
  // prefix of a brand instead — "Escentric" off "Escentric Molecules",
  // "Tommy" off "Tommy Hilfiger" — mangles the fragrance's own name, and 143
  // listings in the live catalogue have a vendor field longer than the form
  // printed in their title.
  it.each([
    ['Escentric 01 200ml', 'Escentric Molecules', 'Escentric Molecules', 'Escentric 01'],
    ['Tommy Girl Eau De Toilette 200ml Spray', 'Tommy Hilfiger', 'Tommy Hilfiger', 'Tommy Girl'],
    ['David Beckham Classic Eau de Toilette 100ml Spray', 'David & Victoria Beckham', 'David & Victoria Beckham', 'David Beckham Classic'],
    ['Narciso Ambree Eau De Parfum 30ml', 'Narciso Rodriguez', 'Narciso Rodriguez', 'Narciso Ambree'],
  ])('never strips a mere prefix of the brand: %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });
});

describe('displayName: a fragrance named after its own house', () => {
  // Stripping the brand, the concentration and the size leaves nothing,
  // because there was nothing else in the title. The old answer handed back
  // the whole raw title, so the card read "Aramis" as the brand, "Aramis Eau
  // de Toilette 110ml Spray" as the name, "110ml" as the size and "Eau de
  // Toilette" as the concentration — the same three facts, three times, on 98
  // products.
  it.each([
    ['Aramis Eau de Toilette 110ml Spray', 'Aramis'],
    ['Chloé Eau De Parfum 50ml', 'Chloé'],
    ['Jimmy Choo Eau De Parfum 100ml Spray', 'Jimmy Choo'],
    ['4711 Eau De Cologne 100ml Spray', '4711'],
    ['Cinnabar 50ml Edp Spray', 'Cinnabar'],
  ])('%s is called %s', (title, brand) => {
    expect(displayName(title, brand, brand)).toBe(brand);
  });

  it('uses the displayed spelling of the house, not the vendor field', () => {
    expect(displayName('Afnan Eau de Parfum 100ml Spray', 'Afnan Perfumes', 'Afnan')).toBe('Afnan');
  });

  it('falls back to the raw title only when there is no brand at all', () => {
    // No listing in the live catalogue reaches this (measured: 0 of 18,906),
    // but an empty name is not something the app can render.
    expect(displayName('Eau de Parfum 100ml Spray', null, null)).toBe('Eau de Parfum 100ml Spray');
  });

  it('still prefers a real name over the house name where one exists', () => {
    expect(displayName('Chloé Nomade Eau De Parfum 50ml', 'Chloé', 'Chloé')).toBe('Nomade');
  });
});

describe('displayName: a fragrance named after its own house, qualified by a bracket', () => {
  // The mirror image of the block above: stripping the brand doesn't leave
  // nothing, it leaves nothing but a bracketed qualifier. Real, verbatim
  // rawTitle values — Missoni's own reformulation year, Tous's own shade
  // name — both refused as a brand-repeating prefix in e23137c (correctly:
  // neither is that product's brand), which used to leave them displaying as
  // a bare "(2015)"/"(Gold)": one real fact (the house) silently dropped,
  // the same failure the plain eponymous case above already fixed for an
  // empty remainder. The fragrance is called "Missoni (2015)", not "(2015)",
  // the same way it is "Chloé Nomade" and not just "Nomade" when a real name
  // exists — the qualifier modifies the brand rather than replacing it.
  it.each([
    ['Missoni (2015) Eau de Parfum 30ml Spray', 'Missoni', 'Missoni', 'Missoni (2015)'],
    ['Missoni (2015) Eau de Parfum 50ml Spray', 'Missoni', 'Missoni', 'Missoni (2015)'],
    ['Tous (Gold) Eau de Parfum 50ml Spray', 'Tous', 'Tous', 'Tous (Gold)'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // Measured before writing the rule this broadly: every CATALOGUE product
  // name that is 4 characters or shorter, and every one that is exactly a
  // common qualifier word (Homme/Femme/Man/Woman/Gold/Black/Intense/
  // Original/a bare year...), checked by hand. Every one of them but these
  // two products is a house's own real, standalone product name — pinned
  // here so this rule is never widened to swallow them.
  it.each([
    ['Dior Homme Eau De Toilette 100ml Spray', 'Dior', 'Dior', 'Homme'],
    ['DKNY Women Eau De Parfum 100ml Spray', 'DKNY', 'DKNY', 'Women'],
    ['Histoires de Parfums 1804 Eau de Parfum 60ml', 'Histoires de Parfums', 'Histoires de Parfums', '1804'],
    ['Calvin Klein One Eau de Toilette 100ml Spray', 'Calvin Klein', 'Calvin Klein', 'One'],
  ])('does not touch a real one-word or bare-year name: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // Not a blanket "always keep the brand" rule: a real name that happens to
  // carry a bracket mid-string, not as the entire remainder, is untouched —
  // "Femme (Rochas)" (mybeauty-boutique.json) is a real name in its own
  // right, brandTitleEnds' own test above already relies on it surviving
  // exactly as written, and it does not gain a second "Rochas" in front.
  it('does not touch a bracket that is only part of a real name', () => {
    expect(displayName('Femme (Rochas) 100Ml Edt', 'Rochas', 'Rochas')).toBe('Femme (Rochas)');
  });
});

describe('displayName: what it deliberately leaves in the name', () => {
  // Creed sells "Aventus" and "Aventus For Her" as two different fragrances.
  // Stripping the phrase collapsed them to one displayed name; 302 listings
  // carry it.
  it('keeps a "for her" that distinguishes two products', () => {
    expect(displayName('Creed Aventus For Her Eau de Parfum 75ml', 'Creed', 'Creed')).toBe('Aventus For Her');
  });

  // "Cologne" is part of that line's own name — Creed formulates its Cologne
  // expressions at Eau de Parfum strength — so only the phrase that actually
  // decided the concentration badge is removed.
  it('keeps a concentration-shaped word that is part of the name', () => {
    expect(concentration('Creed Aventus Cologne Eau De Parfum 50ml')).toBe('Eau de Parfum');
    expect(displayName('Creed Aventus Cologne Eau De Parfum 50ml', 'Creed', 'Creed')).toBe('Aventus Cologne');
  });

  // "Oud" leads a fragrance's own name constantly in Middle Eastern perfumery,
  // so it answers the concentration question last — after the EDP sitting
  // later in the same title.
  it('does not mistake a leading "Oud" for the concentration', () => {
    expect(concentration('Oud & Roses Perfume 60ml EDP')).toBe('Eau de Parfum');
    expect(displayName('Oud & Roses Perfume 60ml EDP', null, null)).toBe('Oud & Roses Perfume');
  });
});

describe('brandTitleEnds: which spelling of the brand the title actually closes with', () => {
  it.each([
    ['Shaghaf Oud Perfume 75ml Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian'],
    ['Costa de Amalfi Perfume 100ml EDP Riiffs', 'Riiffs', 'Riiffs', 'Riiffs'],
  ])('%s -> uses %s', (title, displayed, raw, expected) => {
    expect(brandTitleEnds(title, [displayed, raw])).toBe(expected);
  });

  // The trap this exists to catch: one shop's own feed spelling the vendor
  // field "Swiss Arabian" and gluing the same brand together with no space
  // inside a product's own title. Matching on brandKey rather than the exact
  // candidate string is what makes this land — see the function's own doc.
  it('matches a title that glues the brand together differently from the candidate spelling', () => {
    expect(brandTitleEnds('Shaghaf Oud 75ml SwissArabian', ['Swiss Arabian', 'Swiss Arabian'])).toBe('SwissArabian');
  });

  it('returns null when nothing but trailing punctuation follows the brand', () => {
    // "Femme (Rochas)" is real (mybeauty-boutique.json): stripping through
    // closing punctuation risks eating a genuine trailing annotation like a
    // "(2019)" reformulation marker sitting in the same shape elsewhere in
    // the same feed, so this stays deliberately conservative.
    expect(brandTitleEnds('Femme (Rochas)', ['Rochas', 'Rochas'])).toBeNull();
  });

  it('returns null when the title does not close with the brand at all', () => {
    expect(brandTitleEnds('Afnan 9PM Elixir Extrait de Parfum 100ml Spray', ['Afnan', 'Afnan Perfumes'])).toBeNull();
  });

  it('prefers the longer candidate on a tie', () => {
    expect(brandTitleEnds('Costa de Amalfi Perfume 100ml EDP Dunhill London', ['Dunhill', 'Dunhill London'])).toBe(
      'Dunhill London',
    );
  });
});

describe('brandTitleEndsWithHouse: a manufacturer credited at the very end, "<brand> by <house>"', () => {
  // The reported bug, verbatim from data/catalogue/emirates-oud.json: the same
  // Zimaya bottle read as two cards on the Zimaya brand page because Emirates
  // Oud's own titles credit the manufacturer behind Zimaya ("Zimaya By
  // Afnan") where every other shop's title just says "Zimaya". brandTitleEnds
  // alone can never reach this — the title does not end with the brand, it
  // ends with the house that made it, one word later.
  it.each([
    ['Sharaf Divine Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya By Afnan'],
    ['Sharaf Blend Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya By Afnan'],
    ['Adine Perfume 100ml EDP Pendora Scents by Paris Corner', 'Pendora Scents', 'Pendora Scents by Paris Corner'],
    ['Divin Asylum Perfume 100ml French Avenue by Fragrance World', 'French Avenue', 'French Avenue by Fragrance World'],
  ])('%s -> %s', (title, candidate, expected) => {
    expect(brandTitleEndsWithHouse(title, [candidate, candidate])).toBe(expected);
  });

  // The measured breadth behind this feature: 170 CATALOGUE titles contain a
  // `by <word>` construction, and checking every one for this exact anchored
  // shape (a candidate brand immediately before " by ", brandKey-matched the
  // same way brandTitleEnds matches its own candidates) finds 115 — of which
  // 14 are not a manufacturer credit at all but a real fragrance name that
  // happens to end the same way. "Afnan", "Fragrance World" and "Paris
  // Corner" are real manufacturers with their own products elsewhere in the
  // catalogue (measured: 62, 3 and 3 rawBrand rows respectively); "Night",
  // "Marciano", "The Fireplace" and "Petra" are not, so this refuses all 14
  // — see the function's own comment for the full reasoning. A rule that
  // stripped any word after "by" would have wrecked every one of these.
  it.each([
    ['Guess by Marciano', 'Guess'], // Guess's own diffusion line, not a Marciano credit.
    ['Wanted By Night', 'Azzaro'], // Azzaro's own fragrance name.
    ['By Night', 'Christina Aguilera'], // The whole fragrance name.
    ['F by Ferragamo Free Time', 'Salvatore Ferragamo'], // Ferragamo's own line.
  ])('refuses a house that is not a known manufacturer: %s', (title, candidate) => {
    expect(brandTitleEndsWithHouse(title, [candidate, candidate])).toBeNull();
  });

  it('refuses when nothing before "by" matches a brand candidate', () => {
    expect(brandTitleEndsWithHouse('Flower by Kenzo', ['Flower', 'Flower'])).toBeNull();
  });

  it('refuses when there is no "by" at all', () => {
    expect(brandTitleEndsWithHouse('Shaghaf Oud Perfume 75ml Swiss Arabian', ['Swiss Arabian', 'Swiss Arabian'])).toBeNull();
  });
});

describe('displayName: a shop that credits the manufacturer at the end, "<brand> by <house>"', () => {
  // The reported bug itself: two cards for the same Zimaya bottle on the
  // Zimaya brand page — "Sharaf Divine" from Oud Arabian (£31.98) and "Sharaf
  // Divine Perfume..." from Emirates Oud (sold out) — because Emirates Oud's
  // title carried "Zimaya By Afnan" (Zimaya is one of Afnan's sub-brands)
  // where brandTitleEnds' own end-anchored match never fires: the title does
  // not end with "Zimaya", it ends with "Afnan". Verbatim from
  // data/catalogue/emirates-oud.json.
  it.each([
    ['Sharaf Divine Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya', 'Sharaf Divine'],
    ['Sharaf Blend Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya', 'Sharaf Blend'],
    ['Sharaf The Club Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya', 'Sharaf The Club'],
    ['Adine Perfume 100ml EDP Pendora Scents by Paris Corner', 'Pendora Scents', 'Pendora Scents', 'Adine'],
    ['Divin Asylum Perfume 100ml French Avenue by Fragrance World', 'French Avenue', 'French Avenue', 'Divin Asylum'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // "Perfume" survives the ordinary concentration strip here because "EDP",
  // not the word "Perfume", is what named the concentration — the exact same
  // filler-word case brandTitleEnds' own "Shaghaf Oud" fix already handles
  // for the plain trailing-brand shape, reused here for free because this
  // strip removes the whole "<brand> by <house>" span the same way that one
  // removes a bare trailing brand.
  it('strips the stray "Perfume" filler left in front of the removed credit', () => {
    expect(displayName('Sharaf Divine Perfume 100ml EDP Zimaya By Afnan', 'Zimaya', 'Zimaya')).toBe('Sharaf Divine');
  });

  // The counter-examples this has to survive without breaking, all real,
  // verbatim CATALOGUE names — pinned exactly as they read today (measured
  // with npm run catalogue:demo before and after this change: byte-for-byte
  // identical) so a future widening of this feature cannot start eating them.
  it.each([
    // "By Night" is the whole fragrance name, not a manufacturer credit.
    ['Christina Aguilera By Night Eau De Parfum 50ml', 'Christina Aguilera', 'Christina Aguilera', 'By Night'],
    // Azzaro's own name, same shape.
    ['Azzaro Wanted By Night Eau De Parfum 100ml Spray', 'Azzaro', 'Azzaro', 'Wanted By Night'],
    // Kenzo's own flanker line — "Kenzo" here is the real fragrance's name,
    // not a house crediting itself twice.
    ['Flower by Kenzo Eau De Toilette Légère 30ml Spray', 'Kenzo', 'Kenzo', 'Flower by Kenzo Légère'],
    // Chloé's own "Chloe by Chloe" line. rawBrand is the accented "Chloé"
    // here, which does not literally open the unaccented title, so the front
    // "Chloe" stays exactly as it does today.
    ['Chloe by Chloe Eau De Parfum Rollerball 10ml', 'Chloé', 'Chloé', 'Chloe by Chloe Rollerball'],
    // Salvatore Ferragamo's own "F by Ferragamo" line.
    ['Salvatore Ferragamo F by Ferragamo Free Time Eau de Toilette 100ml Spray', 'Salvatore Ferragamo', 'Salvatore Ferragamo', 'F by Ferragamo Free Time'],
    // Guess's own "Guess by Marciano" diffusion line — "Marciano" is not a
    // manufacturer anywhere else in the catalogue, so this is refused.
    ['Guess Guess by Marciano Eau de Toilette 100ml Spray', 'Guess', 'Guess', 'Guess by Marciano'],
  ])('does not touch a real "by" name: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // The other, unrelated trap this same bug report named: a fragrance's own
  // name legitimately containing its brand mid-string, not at the trailing
  // "by" position at all. None of these have "by" in them — pinned here as
  // the companion counter-examples to the "by" cases above, all real,
  // verbatim CATALOGUE names, unaffected by this feature because it never
  // fires without a "by" in the title.
  it.each([
    ['Ramz Lattafa Silver Perfume 100ml Lattafa', 'Lattafa', 'Lattafa', 'Ramz Lattafa Silver'],
    ['My Burberry Blush Eau De Parfum 30ml Spray', 'Burberry', 'Burberry', 'My Burberry Blush'],
    ['Miss Armaf Attitude Eau De Parfum 100ml', 'Armaf', 'Armaf', 'Miss Armaf Attitude'],
    ["Kenzo L'Eau Kenzo Pour Homme Eau de Toilette 100ml Spray", 'Kenzo', 'Kenzo', "L'Eau Kenzo Pour Homme"],
    ['Cartier Pasha de Cartier Edition Noire Sport Eau de Toilette 100ml', 'Cartier', 'Cartier', 'Pasha de Cartier Edition Noire Sport'],
  ])('does not touch a real brand-mid-string name: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });
});

describe('displayName: a shop that appends its own brand to the end of the title', () => {
  // The reported bug, verbatim from data/catalogue/emirates-oud.json: Swiss
  // Arabian's own "Shaghaf Oud" reads as two separate listings on the brand
  // page because Emirates Oud appends "Perfume Swiss Arabian" (and sometimes
  // just "Swiss Arabian") to the end of its own titles. 1,904 products across
  // 96 brands carry this shape — measured with
  //
  //   npx tsx (import CATALOGUE, count products whose normalised name ends
  //   with " " + normalised brand)
  //
  // — see the commit message for the full before/after count.
  it.each([
    ['Shaghaf Oud Perfume 75ml Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian', 'Shaghaf Oud'],
    ['Shaghaf Oud Royale Perfume 75ml EDP Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian', 'Shaghaf Oud Royale'],
    ['Shaghaf Oud Tonka Perfume Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian', 'Shaghaf Oud Tonka'],
    ['Costa de Amalfi Perfume 100ml EDP Riiffs', 'Riiffs', 'Riiffs', 'Costa de Amalfi'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // "Perfume" is only ever removed here immediately adjacent to a brand this
  // function has already confirmed was genuinely appended — never elsewhere
  // in the name, where the word may be doing real work.
  it('does not strip "Perfume" when it is not adjacent to the removed brand', () => {
    expect(displayName('Al Haramain Musk Concentrated Perfume Oil 12ml Roll-On Al Haramain', 'Al Haramain', 'Al Haramain'))
      .toBe('Musk Roll-On');
  });

  // The trap this whole feature exists to avoid falling into: a brand word
  // that is genuinely part of the fragrance's own name must never be eaten
  // along with the shop's real appended copy. Both real, verbatim from
  // data/catalogue/emirates-oud.json — "Blue Laverne" and "Miss Laverne" are
  // Laverne's own sub-line names, confirmed by "Blue Laverne Bakhoor" and
  // "Blue Laverne Elixir" repeating the same "Blue Laverne" prefix elsewhere
  // in the same feed — so only the truly redundant final "Laverne" comes off,
  // never the one that is the fragrance's own name.
  it.each([
    ['Blue Laverne 100ml EDP Laverne', 'Laverne', 'Laverne', 'Blue Laverne'],
    ['Miss Laverne 100ml EDP Laverne', 'Laverne', 'Laverne', 'Miss Laverne'],
  ])('does not strip a brand word that is legitimately part of the name: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  it('still handles the leading and trailing brand independently', () => {
    // Neither strip should interfere with the other when a title happens to
    // both open and close with a brand candidate.
    expect(displayName('Afnan 9PM Elixir Extrait de Parfum 100ml Spray', 'Afnan', 'Afnan')).toBe('9PM Elixir');
  });
});

describe('displayName: "Le Parfum" and other French-article naming, not a stripped strength', () => {
  // The mirror-image bug: Jimmy Choo's real "I Want Choo Le Parfum" line was
  // read as "I Want Choo Le" with concentration "Parfum", because the bare
  // generic-tier word "parfum" doubles as both a real (if vague) strength
  // word and this exact French flanker-naming convention. Verbatim from
  // data/catalogue/fragrance-click.json and justmylook.json.
  it.each([
    ['Jimmy Choo I Want Choo Le Parfum 40ml Spray', 'Jimmy Choo', 'Jimmy Choo', 'I Want Choo Le Parfum'],
    ['Jimmy Choo I Want Choo Le Parfum 60ml Spray', 'Jimmy Choo', 'Jimmy Choo', 'I Want Choo Le Parfum'],
    ['Jimmy Choo I Want Choo Le Parfum 100ml Spray', 'Jimmy Choo', 'Jimmy Choo', 'I Want Choo Le Parfum'],
    // Fragrance Click writes the size *between* the article and the naming
    // word rather than after both — "Le 10ml Parfum" — and the strip has to
    // look past that size the same way it looks past none at all.
    ['Jimmy Choo I Want Choo Le 10ml Parfum', 'Jimmy Choo', 'Jimmy Choo', 'I Want Choo Le Parfum'],
    ['Yves Saint Laurent MYSLF Le Parfum Spray 60ml', 'Yves Saint Laurent', 'Yves Saint Laurent', 'MYSLF Le Parfum'],
    ['Chloe Le Parfum 100ml', 'Chloe', 'Chloé', 'Le Parfum'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  it('reports "Not stated" rather than a guessed strength when "Le Parfum" is the only concentration word', () => {
    expect(concentration('Jimmy Choo I Want Choo Le Parfum 40ml Spray')).toBe(CONCENTRATION_NOT_STATED);
    expect(concentration('Jimmy Choo I Want Choo Le 10ml Parfum')).toBe(CONCENTRATION_NOT_STATED);
  });

  // The listing-split half of the same bug: one retailer's title also
  // carried an explicit "EDP", so it kept its full name but landed in a
  // different concentration bucket from the other four — the reported shape
  // exactly. A real, later "EDP" is still found and still stated correctly.
  it('still finds a real concentration stated elsewhere in the same "Le Parfum" title', () => {
    expect(concentration('Jimmy Choo I Want Choo Le Parfum EDP 60ml')).toBe('Eau de Parfum');
    expect(displayName('Jimmy Choo I Want Choo Le Parfum EDP 60ml', 'Jimmy Choo', 'Jimmy Choo')).toBe(
      'I Want Choo Le Parfum',
    );
  });

  // The proof this is not a blanket "never strip after Le" rule: a genuine
  // trailing concentration is still read and stripped exactly as before.
  it('still strips a genuine trailing concentration with no French-article naming involved', () => {
    expect(concentration('Chanel Coco Mademoiselle Eau de Parfum 100ml')).toBe('Eau de Parfum');
    expect(displayName('Chanel Coco Mademoiselle Eau de Parfum 100ml', 'Chanel', 'Chanel')).toBe('Coco Mademoiselle');
  });

  // "Mademoiselle" ends in the letters "le" but is not the standalone word
  // "Le" — precededByFrenchArticle must never fire on a substring inside a
  // longer word.
  it('does not mistake the tail of a longer word for the article "le"', () => {
    expect(concentration('Rochas Mademoiselle Parfum 100ml')).toBe('Parfum');
  });

  // "Aventus Cologne" stays exactly as it was: the French-article check is
  // scoped to the generic-tier "parfum" word alone, never to the specific
  // "eau de X" phrases, so Creed's own naming (and Escada's stray "Le" ahead
  // of a genuinely stated "Eau De Toilette") is untouched by this feature.
  it('never applies to the specific "eau de X" phrases', () => {
    expect(concentration('Creed Aventus Cologne Eau De Parfum 50ml')).toBe('Eau de Parfum');
    expect(concentration('Escada Sorbetto Rosso Le Eau De Toilette 100ml')).toBe('Eau de Toilette');
  });

  // Escada's "Sorbetto Rosso Le" was investigated as a possible third case
  // alongside "I Want Choo Le Parfum" and left alone on purpose, not merely
  // forgotten. The raw title, verbatim from data/catalogue/justmylook.json:
  // "Escada Sorbetto Rosso Le Eau De Toilette 100ml". Three other retailers
  // carry the same EAN (8005610619323 — beautybase.json, perfume-click.json)
  // or the same unbarcoded listing (mybeauty-boutique.json) for what is
  // unmistakably the same bottle, and none of them has a "Le" anywhere:
  // "Escada Sorbetto Rosso Eau De Toilette 100ml Spray Edition", "Escada
  // Sorbetto Rosso Eau de Toilette 100ml Spray" (x2). So justmylook's "Le" is
  // feed noise on this one SKU, not a real flanker name Escada uses.
  //
  // Measured before writing any rule (checked every rawTitle in
  // data/catalogue/*.json for a standalone "le"/"la" word — not the
  // apostrophe-elided "l'" that "L'Eau de Parfum"/"L'Eau de Toilette" use,
  // which is a separate, genuine, and much more common French naming
  // convention of its own, e.g. Chloé's "L'Eau de Parfum Intense" and
  // Lancôme's Idôle "L'Eau de Toilette" — sitting directly in front of a
  // matched CONCENTRATION_SPECIFIC phrase): exactly two hits in the whole
  // catalogue, not one. Escada's is the only actual noise. The other is
  // Juicy Couture's "Couture La La Eau de Parfum" (perfume-click.json,
  // allbeauty.json) — "La La" is that fragrance's own real name, not two
  // words of filler; Coty markets the line as "Couture La La". A rule general
  // enough to strip Escada's stray "Le" would strip Juicy Couture's genuine
  // "La" too, trading one wrong name for another. One real noise case against
  // one real counter-example is not evidence for a general rule, so — as
  // 24cbf5f already found and left in place — this stays a known, deliberate
  // gap, not a bug fixed here. Pinned so it cannot regress silently in either
  // direction: a future change must not "fix" Escada by breaking Juicy
  // Couture, and must not start second-guessing the genuine "Le Parfum"/"La
  // La" cases either.
  it('leaves Escada\'s one stray "Le" as feed noise rather than inventing a rule that would break a real "La" name', () => {
    expect(displayName('Escada Sorbetto Rosso Le Eau De Toilette 100ml', 'Escada', 'Escada')).toBe(
      'Sorbetto Rosso Le',
    );
    expect(
      displayName('Juicy Couture Couture La La Eau de Parfum 100ml Spray', 'Juicy Couture', 'Juicy Couture'),
    ).toBe('Couture La La');
  });

  // Proof this investigation did not disturb 24cbf5f's own two fixes on the
  // same file: the trailing-own-brand strip (Shaghaf Oud, Swiss Arabian) and
  // the "Le Parfum" flanker naming (I Want Choo) still behave exactly as that
  // commit left them.
  it('does not regress the trailing-brand or "Le Parfum" fixes from 24cbf5f', () => {
    expect(displayName('Shaghaf Oud Perfume 75ml Swiss Arabian', 'Swiss Arabian', 'Swiss Arabian')).toBe(
      'Shaghaf Oud',
    );
    expect(displayName('Jimmy Choo I Want Choo Le Parfum 60ml Spray', 'Jimmy Choo', 'Jimmy Choo')).toBe(
      'I Want Choo Le Parfum',
    );
  });
});

describe('displayName: "L\'Eau de Parfum"/"L\'Eau de Toilette", an elided article stripped the wrong occurrence', () => {
  // The side-finding from the Escada investigation, now confirmed against the
  // live CATALOGUE and fixed: 21 real, currently-published names came out
  // mangled (checked with /\bL['’]\s*$/i for the orphaned-article shape and
  // /\bL['’]\s+\S/ for the space-after shape, both against CATALOGUE's own
  // `name` field). The old code stripped whichever occurrence of the matched
  // concentration phrase came first, with no regard for what sat directly in
  // front of it — fine for a plain "Eau de Parfum", wrong the moment the
  // house's own naming glues an elided "L'" onto it with no space: "Idôle
  // L'Eau de Parfum", "Chloé L'Eau de Parfum Intense", Carven's eponymous
  // "L'Eau de Toilette". All ten cases below are verbatim rawTitle values
  // from data/catalogue/*.json, not invented text.
  it.each([
    // Orphan shape: the elided phrase was the *only* occurrence, so
    // stripping it left a bare "L'" with nothing after it.
    // The parenthesised-brand prefix here is a separate fix (see the
    // "parenthesised brand" describe block below); this case exercises both
    // together, so the expected value already has it stripped.
    ["(Lancôme) Idôle Nectar L'Eau de Parfum 100ml Spray", 'Lancôme', 'Lancôme',
      "Idôle Nectar L'Eau de Parfum"],
    ["Lancome Idole L'Eau De Toilette 100ml", 'Lancome', 'Lancôme', "Idole L'Eau De Toilette"],
    ["Lancome La Vie Est Belle Iris Absolu L'eau de Parfum - 100ml", 'Lancome', 'Lancôme',
      "La Vie Est Belle Iris Absolu L'eau de Parfum"],
    ["Lancôme La Vie est Belle L'Elixir L'eau de Parfum 50ml Refillable Spray", 'Lancome', 'Lancôme',
      "La Vie est Belle L'Elixir L'eau de Parfum"],
    // Space-after shape: a second, genuinely redundant restatement of the
    // same phrase existed elsewhere in the title, and the old code stripped
    // the wrong (elided, name-bearing) one instead of that second one.
    ["Chloe L'eau De Parfum Intense 30ml Refillable Spray", 'Chloe', 'Chloé', "L'eau De Parfum Intense"],
    ["Lancome Idole Power L’Eau de Parfum Intense Spray 25ml", 'Lancome', 'Lancôme',
      "Idole Power L’Eau de Parfum Intense"],
    ["Carven L'Eau de Toilette Eau de Toilette 100ml Spray", 'Carven', 'Carven', "L'Eau de Toilette"],
    ["Lancome Idole Nectar L'Eau De Parfum - 100ml Eau de Parfum Spray", 'Lancome', 'Lancôme',
      "Idole Nectar L'Eau De Parfum"],
    ["Lancome La Vie Est Belle Rose Extraordinarie 100ml L'eau De Parfum Florale", 'Lancome', 'Lancôme',
      "La Vie Est Belle Rose Extraordinarie L'eau De Parfum Florale"],
    // The one generic-tier ("extrait", not a CONCENTRATION_SPECIFIC phrase)
    // case measured in the harvest — see precededByElidedArticle's comment.
    ["Lancôme Absolue L'Extrait Elixir Anti-Ageing Serum 30ml", 'Lancôme', 'Lancôme',
      "Absolue L'Extrait Elixir Anti-Ageing Serum"],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // The counter-examples this has to survive without breaking: real names
  // that carry an apostrophe-L but are not this shape at all, because the
  // word right after the apostrophe is not "eau"/"extrait" (Givenchy,
  // Al Haramain), or because the "L'X" is its own separate, standalone token
  // with a genuine concentration stated later rather than glued onto it
  // (Issey Miyake, Nina Ricci, Jimmy Choo). None of these were ever broken —
  // pinned here so a future change to this feature cannot start breaking
  // them either.
  it.each([
    ["Issey Miyake L'Eau D'Issey Eau De Toilette 100ml Spray", 'Issey Miyake', 'Issey Miyake', "L'Eau D'Issey"],
    ["Givenchy L'INTERDIT Eau De Parfum 35ml Spray", 'Givenchy', 'Givenchy', "L'INTERDIT"],
    ["Nina Ricci L'Air Du Temps Eau De Parfum 100ml Spray", 'Nina Ricci', 'Nina Ricci', "L'Air Du Temps"],
    ["Al Haramain L'Aventure Intense Eau De Parfum 100ml", 'Al Haramain', 'Al Haramain', "L'Aventure Intense"],
    ["Jimmy Choo L'Eau Eau De Toilette 40ml Spray", 'Jimmy Choo', 'Jimmy Choo', "L'Eau"],
  ])('leaves a genuine apostrophe-L name untouched: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // The proof this is not a blanket "never strip after L'" rule either: a
  // plain, non-elided concentration is still found and stripped exactly as
  // before, and the pre-existing Escada/Le-Parfum/trailing-brand fixes are
  // untouched by this one.
  it('still strips a genuine concentration with no elided article involved', () => {
    expect(displayName('Creed Aventus Cologne Eau De Parfum 50ml', 'Creed', 'Creed')).toBe('Aventus Cologne');
    expect(displayName('Aramis Eau de Toilette 110ml Spray', 'Aramis', 'Aramis')).toBe('Aramis');
    expect(displayName('Escada Sorbetto Rosso Le Eau De Toilette 100ml', 'Escada', 'Escada')).toBe(
      'Sorbetto Rosso Le',
    );
  });
});

describe('displayName: a shop that puts its own brand in parentheses ahead of the name', () => {
  // Real, verbatim rawTitle values. beautybase.json spells the parenthesised
  // prefix two ways in the same feed — "(Lancôme)" and "(Lancome)" — while
  // its own rawBrand field is always the accented "Lancôme", so the
  // unaccented title has no exact-spelling candidate to match against at
  // all; foldDiacritics is what makes that one land.
  it.each([
    ["(Lancôme) Idôle Nectar L'Eau de Parfum 100ml Spray", 'Lancôme', 'Lancôme', "Idôle Nectar L'Eau de Parfum"],
    ['(Lancôme) Miracle Eau de Parfum 30ml Spray', 'Lancôme', 'Lancôme', 'Miracle'],
    ['(Lancome) La Nuit Trésor Eau De Parfum 50ml Spray', 'Lancôme', 'Lancôme', 'La Nuit Trésor'],
  ])('%s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });

  // The trap a looser rule would walk into: a parenthesised word right where
  // the brand would sit is not always the brand. Missoni's own reformulation
  // marker and Tous's own shade name both take the identical shape and must
  // never be stripped as a brand repeat — neither "2015" nor "Gold" is that
  // product's brand, so brandKey never matches either against the real brand
  // candidates. They are not left as a bare "(2015)"/"(Gold)" either — see
  // the "eponymous, qualified by a bracket" describe block below for why the
  // brand comes back in front of them instead.
  it.each([
    ['Missoni (2015) Eau de Parfum 30ml Spray', 'Missoni', 'Missoni', 'Missoni (2015)'],
    ['Tous (Gold) Eau de Parfum 50ml Spray', 'Tous', 'Tous', 'Tous (Gold)'],
  ])('never strips a parenthesised word that is not the brand: %s -> %s', (title, raw, displayed, expected) => {
    expect(displayName(title, raw, displayed)).toBe(expected);
  });
});

describe('stripRedundantSize: a house product name does not repeat its own sizeMl badge', () => {
  it('strips a plain trailing size', () => {
    expect(stripRedundantSize('Ashore 100ml', 100)).toBe('Ashore');
  });

  // The punctuation forms a house's own storefront actually writes. Each
  // must come back clean — no trailing dash, comma, bracket or double space.
  it.each([
    ['Ashore - 100ml', 'Ashore'],
    ['Ashore (100ml)', 'Ashore'],
    ['Ashore, 100 ml', 'Ashore'],
    ['Ashore [100ml]', 'Ashore'],
  ])('%s -> %s', (name, expected) => {
    expect(stripRedundantSize(name, 100)).toBe(expected);
  });

  it('strips a size sitting in the middle of the name, not just at the end', () => {
    expect(stripRedundantSize('Boundless EDP 100ml (2025)', 100)).toBe('Boundless EDP (2025)');
  });

  it('reads mL and ML the same as ml', () => {
    expect(stripRedundantSize('Baruch V 100ML', 100)).toBe('Baruch V');
    expect(stripRedundantSize('Baruch V 100mL', 100)).toBe('Baruch V');
  });

  // sizeMl() itself falls back to a fl oz reading when a title has no ml
  // number at all, and a handful of house titles state the same volume
  // twice this way: once in ml, once as its fl oz conversion. The whole
  // "30 ml / 1.0 fl oz" clause is one size mention, not two, and comes out
  // together rather than leaving a stray "/ 1.0 fl oz" behind.
  it('strips a compound ml/fl oz size as one mention', () => {
    expect(stripRedundantSize('Absinth 30 ml / 1.0 fl oz Extrait de Parfum', 30)).toBe(
      'Absinth Extrait de Parfum',
    );
    expect(stripRedundantSize('Absinth 4 ml / 0.135 fl.oz Perfume Oil', 4)).toBe('Absinth Perfume Oil');
  });

  // A year is not a size, and nothing here should ever touch one — but this
  // is really just displayName's own coverage restated: neither function
  // strips a bare number, only one immediately followed by a size unit.
  it('leaves a year-like number alone', () => {
    expect(stripRedundantSize('Dior Homme 2020', 100)).toBe('Dior Homme 2020');
    expect(stripRedundantSize('Acqua di Parma Colonia 1916', 100)).toBe('Acqua di Parma Colonia 1916');
    expect(stripRedundantSize('Chanel No 5', 100)).toBe('Chanel No 5');
    expect(stripRedundantSize('4711', 100)).toBe('4711');
  });

  it('does nothing when sizeMl is null', () => {
    expect(stripRedundantSize('Ashore 100ml', null)).toBe('Ashore 100ml');
  });

  it('does nothing when the name has no size mention at all', () => {
    expect(stripRedundantSize('Ashore', 100)).toBe('Ashore');
  });

  // A name that is only ever a size must not become empty.
  it('leaves a name that is nothing but a size alone rather than emptying it', () => {
    expect(stripRedundantSize('100ml', 100)).toBe('100ml');
    expect(stripRedundantSize('(100ml)', 100)).toBe('(100ml)');
  });

  // A data conflict, not redundancy: the name and sizeMl disagree, so
  // neither is quietly hidden by deleting the text.
  it('leaves a name alone when its stated size disagrees with sizeMl', () => {
    expect(stripRedundantSize('Ashore 100ml', 50)).toBe('Ashore 100ml');
  });

  // Multi-vial notation is the product's identity, not a repeated badge —
  // "Discovery Set 5x2ml" is a 5x2ml set, not a single 2ml bottle. This
  // falls out of the same word-boundary quirk sizeMl() and displayName's own
  // strip both already rely on: there is no boundary between the "x" and the
  // digit that follows it, so "x2ml" is never read as a standalone mention.
  it.each([
    ['Discovery Set 5x2ml', 10],
    ['Legend Of Valleys-2x90 ml', 90],
    ['Fragrance Paintbrush (2x7ml)', 7],
    ['With Love from Italy A Fragrance Trio (3x10ml)', 10],
  ])('leaves a multi-vial set untouched: %s', (name, size) => {
    expect(stripRedundantSize(name, size)).toBe(name);
  });

  // More than one *standalone* size mention is left alone too — whether it
  // is the same size stated twice ("150ML 150 ML"), two different bundled
  // products each with their own size ("A 8.5ml + B 8.5ml"), or two
  // genuinely different sizes ("75 ML + ... 25 ML"). None of these is a
  // single fact repeated on the card; guessing which case is which from the
  // text alone risks mangling a real product name.
  it.each([
    ['ALEX ENABLE 150ML 150 ML', 150],
    ['Molecule 01 8.5ml + Escentric 01 8.5ml', 9],
    ['SHAGHAF AMBER INFUSION 75 ML + SHAGHAF OUD ROYALE 25 ML', 75],
    ['BAKHUR PEGASUS 100ML 150 ML', 100],
  ])('leaves a name with more than one size mention untouched: %s', (name, size) => {
    expect(stripRedundantSize(name, size)).toBe(name);
  });
});

/**
 * The Fragrance Type facet is whatever these rules produce, so a value nobody
 * can act on is a bug in here rather than in the UI. The list it was offering
 * had a "Cologne" beside an "Eau de Cologne", a "Perfume" that says nothing
 * about strength, an "Oud" that is a material, and a whole product form —
 * perfume oil — filed under the wrong label because "perfume oil" contains
 * "perfume". Each of those is pinned below with a real catalogue title.
 */
describe('concentration: values a reader can act on', () => {
  // 4711 is published by one shop under both spellings, which is as close to
  // proof as this gets that they are one value and not two.
  it('reads a bare "Cologne" as the Eau de Cologne it names', () => {
    expect(concentration('4711 Cologne 300ml Bottle')).toBe('Eau de Cologne');
    expect(concentration('4711 Original Eau de Cologne 200ml Splash')).toBe('Eau de Cologne');
    expect(concentration('Stetson Original Cologne 103.5ml Spray')).toBe('Eau de Cologne');
  });

  // The important half of the cleanup: a label meaning "the shop did not say"
  // must never become a label meaning a strength.
  it('treats a word that states no strength as not stated', () => {
    expect(concentration('Afnan Supremacy Not Only Intense 100ml')).toBe(CONCENTRATION_NOT_STATED);
    expect(concentration('Lattafa Badee Al Sublime All Over Oud 150ml')).toBe(CONCENTRATION_NOT_STATED);
    // A house storefront whose titles name no concentration at all. Same
    // non-answer, same words.
    expect(concentration('Escentric Molecules Escentric 01 100ml')).toBe(CONCENTRATION_NOT_STATED);
  });

  it('never folds a non-answer into a real concentration', () => {
    expect(concentration('Some House Perfume 100ml')).not.toBe('Parfum');
    expect(concentration('Some House Perfume 100ml')).not.toBe('Extrait de Parfum');
    expect(concentration('Some House Perfume 100ml')).not.toBe('Eau de Parfum');
  });

  // "Parfum" is left alone in both directions: it is not merged into Extrait
  // de Parfum, and it is not demoted to not stated. The shops using it also
  // list the same lines as EDT and EDP, so it reads as a real stated strength.
  it('leaves Parfum standing as its own value', () => {
    expect(concentration('Azzaro The Most Wanted Parfum 100ml')).toBe('Parfum');
    expect(concentration('Jean Paul Gaultier Le Male Elixir Parfum 125ml')).toBe('Parfum');
    expect(concentration('Afnan 9PM Elixir Extrait de Parfum 100ml')).toBe('Extrait de Parfum');
  });

  it('spells Extrait de Parfum like the other "de" phrases', () => {
    expect(concentration('Maison Asrar Cal Cologne Thriller Extrait De Parfum 100ml Spray')).toBe('Extrait de Parfum');
  });
});

describe('concentration: perfume oil is a form the shops already name', () => {
  // Nine Middle Eastern retailers are in the registry and oils are a staple,
  // yet the facet offered no oil at all: every one of these was filed under
  // "Perfume", because the generic tier matched the word sitting inside the
  // phrase.
  it.each([
    'Al Haramain Musk Concentrated Perfume Oil 12ml Roll-On',
    'Al-Rehab Sabaya Concentrated Perfume Oil 6.0ml Roll-On',
    'Ard Al Zaafaran Hareem Al Sultan Concentrated Perfume Oil 10ml Roll-On',
    'Tauer Attar Perfume Oil 5 ml',
    'Ahsan Attar Full Perfumed Oil Roll-On',
  ])('%s is a Perfume Oil', (title) => {
    expect(concentration(title)).toBe('Perfume Oil');
  });

  // And the name stops carrying the form twice, the same way it does not
  // carry "Eau de Parfum" twice.
  it('takes the oil phrase out of the displayed name', () => {
    expect(displayName('Al Haramain Musk Concentrated Perfume Oil 12ml Roll-On', 'Al Haramain', 'Al Haramain'))
      .toBe('Musk Roll-On');
  });

  // A bare "oil" is body oil, face oil, lip oil and cleansing oil far more
  // often than it is perfume, so it is never evidence on its own.
  it('ignores a bare "oil"', () => {
    expect(concentration('Jean Paul Gaultier La Favorite Body Oil 150ml')).toBe(CONCENTRATION_NOT_STATED);
    expect(concentration('Elemis Superfood Facial Oil 15ml')).toBe(CONCENTRATION_NOT_STATED);
  });

  // "Attar" is a real form and also two houses' actual name, and both of
  // those houses sell sprays. The word never outranks a real concentration.
  it('does not let the word attar outrank a stated concentration', () => {
    expect(concentration('Attar & Co Arabian Oud Intense Parfum 100ml Spray')).toBe('Parfum');
    expect(concentration('Ahsan Attar Full Eau De Parfum 100ml Spray')).toBe('Eau de Parfum');
  });
});
