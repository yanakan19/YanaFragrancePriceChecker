/**
 * Prose a shop wrote that the parser used to read as a note (decision 7 of
 * docs/NOTES-PAGE-PLAN.md, fixed 9 Oct 2026): "sensual finish", "this
 * fragrance", "awakening your senses". Measured on the catalogue of that day,
 * 0.4% of note uses were of this kind. The rule is conservative: a real note,
 * including a long one or one with a marketing adjective in front, must survive.
 */
import { describe, expect, it } from 'vitest';
import { parseNotes } from '../src/catalogue/notesParse.js';
import { proseTest, withoutProse } from '../src/catalogue/notesPick.js';

/** Real notes as the catalogue holds them (verbatim, multi word ones included). */
const REAL_NOTES = [
  'Burgundy Blackcurrant Buds Absolute', 'Tonka Bean', 'Lily of the Valley', 'Orris Root', 'Bergamot',
  'Jasmine Sambac', 'Pink Pepper', 'Cashmere Wood', 'Sparkling Bergamot', 'Skin-to-Skin Accord',
  'Black Lapsang Tea Leaves', 'Jasmine Grandiflorum India Absolute', 'Haitian Vetiver', 'Ylang-Ylang', 'Oakmoss',
  'Sensual Musk', 'Mountain Oak Moss Accord', 'Rose de Mai Absolute', 'White Amber', 'Neroli Bigarade',
  'Violet Leaf', 'Elegant Gardenia', 'Dark Splendour Plum', 'Italian Riviera Marine Accord', 'Madagascan Vanilla Bean',
];

/** Sentences and marketing phrases that were read as notes; each rode in behind a real one. */
const PROSE = [
  'sensual finish', 'this fragrance', 'awakening your senses', 'behind the ears', 'setting the stage',
  'provide lasting warmth', 'Musk is soothing', 'dominated by jasmine', 'Body Lotion 50ml', 'Eau',
  'unforgettable impression', 'Sandalwood a warm', 'Experience warmth', 'Dipropylene Glycol', 'leaving a magnetic',
  'offering a refreshing', 'Enjoy a warm', 'Shower Gel', 'smooth finish', 'ensuring a long-lasting',
];

describe('prose in a notes list', () => {
  it.each(REAL_NOTES)('keeps the real note %s', (note) => {
    expect(parseNotes(`Top notes: Citrus, ${note}. Base notes: Musk.`)?.top, note).toContain(note);
  });

  it.each(PROSE)('drops the prose %s', (text) => {
    // A capitalised and a lower case list: neither may carry the prose.
    for (const body of [`Bergamot, ${text}`, `bergamot, ${text.toLowerCase()}`]) {
      const top = parseNotes(`Top notes: ${body}. Base notes: Musk.`)?.top ?? [];
      expect(top.map((n) => n.toLowerCase()), body).not.toContain(text.toLowerCase());
    }
  });

  it('does not turn a lower case list of real notes into prose because of one stray word', () => {
    expect(parseNotes('Top notes: geranium, lemongrass, mandarin orange, finish. Base notes: musk.')?.top).toEqual([
      'geranium', 'lemongrass', 'mandarin orange',
    ]);
  });

  it('recovers the note from "consists of jasmine"', () => {
    expect(parseNotes('Heart notes: consists of jasmine, rose.')?.middle).toEqual(['jasmine', 'rose']);
  });

  it('keeps an adjective in front of a real material (the material is still the note)', () => {
    const top = parseNotes('Top notes: refreshing mint, Sparkling Citrus, Romantic Geranium.')?.top ?? [];
    expect(top).toEqual(['refreshing mint', 'Sparkling Citrus', 'Romantic Geranium']);
  });
});

describe('the reviewed list at the picker', () => {
  const isProse = proseTest({ notes: [{ note: 'Leathery Opulence' }, { note: 'depth' }] });

  it('matches a listed name whatever its case and spacing', () => {
    expect(isProse('leathery  opulence')).toBe(true);
    expect(isProse('Depth')).toBe(true);
    expect(isProse('Leather')).toBe(false);
  });

  it('removes prose from every tier and returns null when nothing real is left', () => {
    expect(withoutProse({ top: ['Bergamot', 'depth'], middle: ['Rose'], base: [] }, isProse)).toEqual({
      top: ['Bergamot'], middle: ['Rose'], base: [],
    });
    expect(withoutProse({ top: [], middle: [], base: ['Leathery Opulence'] }, isProse)).toBeNull();
  });
});
