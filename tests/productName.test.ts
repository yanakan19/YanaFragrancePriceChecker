import { describe, expect, it } from 'vitest';
import { brandTitleOpens, concentration, displayName } from '../src/catalogue/productName.js';

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
