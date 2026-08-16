import { describe, expect, it } from 'vitest';
import {
  CONCENTRATION_NOT_STATED, brandTitleOpens, concentration, displayName, stripRedundantSize,
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
