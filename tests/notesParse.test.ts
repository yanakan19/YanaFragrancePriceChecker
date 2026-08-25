import { describe, it, expect } from 'vitest';
import { parseNotes } from '../src/catalogue/notesParse.js';

describe('parseNotes', () => {
  it('returns null for a missing description', () => {
    expect(parseNotes(null)).toBeNull();
    expect(parseNotes(undefined)).toBeNull();
    expect(parseNotes('')).toBeNull();
  });

  it('returns null when nothing is labelled as notes', () => {
    expect(parseNotes('A bold, confident fragrance for the modern man.')).toBeNull();
  });

  it('reads a single clean colon-headed list per section, the ordinary case', () => {
    const description =
      'Top notes: Bergamot, Lemon. Middle notes: Jasmine, Rose. Base notes: Musk, Amber.';
    expect(parseNotes(description)).toEqual({
      top: ['Bergamot', 'Lemon'],
      middle: ['Jasmine', 'Rose'],
      base: ['Musk', 'Amber'],
    });
  });

  it('canonicalises a known spelling variant via NOTE_ALIASES', () => {
    const description = 'Top notes: Ylang ylang, Woody.';
    expect(parseNotes(description)?.top).toEqual(['Ylang-Ylang', 'Woods']);
  });

  // Regression test for the fix landed alongside this test: a source that
  // mentions "top notes" loosely in marketing prose *and* again as a real
  // labelled list further down used to bind to the first (prose) mention,
  // find nothing that survived the shape check, and give up — even though an
  // unambiguous list sat later in the same copy. Modelled directly on the
  // real Emirates Oud "Hawas Elixir" listing that exposed this.
  it('walks past an earlier prose mention of a label to a later real list', () => {
    const description =
      'Top notes include an enchanting blend of saffron, cardamom and nutmeg that will ' +
      'awaken your senses. Heart notes of amber, agarwood and patchouli give it depth. ' +
      'The base notes of vanilla, musk and sandalwood make the finish rich. . Features: . ' +
      'Suitable for: Men . Hawas Elixir Fragrance Notes: . ' +
      'Top Notes: Mint, Bergamot, Mugwort. . ' +
      'Middle Notes: Vanilla, Benzoin, Lavender, Dark Chocolate. . ' +
      'Base Notes: Honey, Tonka Bean, Tobacco, White Musk. . Why choose this perfume?';
    expect(parseNotes(description)).toEqual({
      top: ['Mint', 'Bergamot', 'Mugwort'],
      middle: ['Vanilla', 'Benzoin', 'Lavender', 'Dark Chocolate'],
      base: ['Honey', 'Tonka Bean', 'Tobacco', 'White Musk'],
    });
  });

  // A single-mention description where that one mention already is the real
  // list must be completely unaffected by the walk-forward change above —
  // the first (only) occurrence still wins, same as before it existed.
  it('still returns the first match unchanged when there is only one mention', () => {
    const description = 'Top notes: Bergamot, Citrus, Fresh florals. Base notes: Vanilla, Musk.';
    expect(parseNotes(description)).toEqual({
      top: ['Bergamot', 'Citrus', 'Fresh florals'],
      middle: [],
      base: ['Vanilla', 'Musk'],
    });
  });

  // Regression test for the NOT_A_NOTE denylist: a source can label a
  // heading exactly right ("Top Notes:", "Middle Notes:", "Base Notes:") and
  // still not be naming real notes — Lattafa "Sing Kids" (read via
  // emirates-oud) publishes mood words under each heading instead of
  // ingredients. Every section here is genuinely unattributable, so the
  // whole result must be null, not a product "having notes" that are really
  // just adjectives.
  it('rejects a labelled section whose content is a mood word, not a note', () => {
    const description =
      'Sing Kids Perfume is a cheerful fragrance. Notes: . ' +
      'Top Notes: Lively and sweet . Middle Notes: Cozy and welcoming . ' +
      'Base Notes: Soft and soothing . Why should you choose this?';
    expect(parseNotes(description)).toBeNull();
  });

  // Regression test for the season leak: an unlabelled "Recommended for:"
  // line straight after a real Base Notes list has no colon'd notes label of
  // its own to stop the capture at, so without NOT_A_NOTE the season names
  // ride along as though they were the last two notes. Modelled on the real
  // Lacoste L.12.12 Blanc Eau Intense listing (mybeauty-boutique) that
  // exposed this.
  it('drops season names that trail an unterminated base-notes capture', () => {
    const description =
      'Top Notes: Mandarin Orange, Turmeric . Heart Notes: Lavender, Cardamom, Clary Sage . ' +
      'Base Notes: Sandalwood, Leather, Vetiver . Fragrance Type: Eau de Toilette (EDT) . ' +
      'Recommended for: Daytime, Spring, Summer';
    expect(parseNotes(description)).toEqual({
      top: ['Mandarin Orange', 'Turmeric'],
      middle: ['Lavender', 'Cardamom', 'Clary Sage'],
      base: ['Sandalwood', 'Leather', 'Vetiver'],
    });
  });

  // ── Shapes found by auditing every description in data/catalogue ──────────
  // Each of the descriptions below is copied from a real listing, and each one
  // carried a properly labelled notes section that this parser read as
  // nothing. 524 listings were in that state when the audit was run.

  it('reads a list written in the singular, behind a stray full stop, as bullets', () => {
    // Al Haramain, 94 listings in this exact shape. Three separate defects at
    // once: "Top note" not "Top notes", a "." between the colon and the list
    // which made the sentence split return an empty first segment, and a "-"
    // glued to the first note.
    const description =
      'Madinah is a promised gift in itself.. Fragrance notes: . Top note:. ' +
      '-Rose, Geranium, Davana Blossoms, Bergamot, Orange . Middle note:. ' +
      '-Jasmine, Orchid, Clove, Saffron . Base note:. -Musk, Amber, Cedar wood, Fruity.';
    expect(parseNotes(description)).toEqual({
      top: ['Rose', 'Geranium', 'Davana Blossoms', 'Bergamot', 'Orange'],
      middle: ['Jasmine', 'Orchid', 'Clove', 'Saffron'],
      base: ['Musk', 'Amber', 'Cedarwood', 'Fruity'],
    });
  });

  it('still drops a four-word note, which is a limit this change does not lift', () => {
    // Recorded rather than fixed. "Lily of the Valley" is four words and the
    // shape rule allows three, so Al Haramain's Shefon listing publishes it
    // and this parser does not read it. Widening the rule lets prose
    // fragments of the same length through ("hint of the licorice"), which is
    // a worse trade than a missing note, so it stays until someone has a
    // better idea than a word count.
    expect(parseNotes('Top notes: Lily of the Valley, Rose.')?.top).toEqual(['Rose']);
  });

  it('reads "Bottom notes" as the base, which is what Avon calls it', () => {
    // Avon, "Black Suede Touch Deodorant Body Spray". The doubled full stops
    // are the source's own, and one of them survived the sentence split and
    // made every note read as a sentence.
    const description =
      'A hint of intimacy makes the man.. Key notes:. Top Notes: Black Pepper.. ' +
      'Middle Notes: Vanilla.. Bottom Notes: Cashmere Woods.. Why you’ll love it:';
    expect(parseNotes(description)).toEqual({
      top: ['Black Pepper'],
      middle: ['Vanilla'],
      base: ['Cashmere Woods'],
    });
  });

  it('reads a lowercase list, because not every feed capitalises its notes', () => {
    // Nicchia Luxury publishes the whole pyramid in lower case, and behind an
    // HTML entity that had to be decoded before the first note was reachable.
    const description =
      'Perfumer: Anne Silvye Top notes:&nbsp;geranium, lemongrass, mandarin orange. ' +
      'Heart notes:&nbsp;basil, mint, turkish rose. Base notes:&nbsp;sandalwood, musk';
    expect(parseNotes(description)).toEqual({
      top: ['geranium', 'lemongrass', 'mandarin orange'],
      middle: ['basil', 'mint', 'turkish rose'],
      base: ['sandalwood', 'musk'],
    });
  });

  it('still refuses a lowercase phrase when the section is prose, not a list', () => {
    // The other half of the same change, and the reason it is decided per
    // section rather than per item. mybeauty-boutique writes whole sentences
    // under its labels; "envelop your senses" is three lowercase words with no
    // sentence punctuation and would otherwise be published as a note.
    const description =
      'Top Notes:  Delight in the invigorating bursts of peppermint and lavender, ' +
      'awakening your senses right from the start. ' +
      'Base Notes:  envelop your senses in a rich blend of musk';
    const parsed = parseNotes(description);
    expect(parsed?.base ?? []).not.toContain('envelop your senses');
    expect(parsed?.top ?? []).not.toContain('awakening your senses');
  });

  it('splits notes joined by an ampersand, and never publishes half an entity', () => {
    // Beauty Base. This one used to "work": the ";" ending "&amp;" happened to
    // be a separator, so the list came out as ["White Musks &amp", "Vanilla"]
    // — one real note and one corrupted one. Decoding the entity removed the
    // accidental split, so "&" is now a separator on purpose.
    const description =
      'Top Notes: Pink Pepper Essence &amp; Blackcurrant Heart Notes: ' +
      'Damascena Rose Essence &amp; Violet Base Notes: White Musks &amp; Vanilla';
    expect(parseNotes(description)).toEqual({
      top: ['Pink Pepper Essence', 'Blackcurrant'],
      middle: ['Damascena Rose Essence', 'Violet'],
      base: ['White Musks', 'Vanilla'],
    });
  });

  it('does not turn a perfumer credit into a top note', () => {
    // Nicchia Luxury's Laboratorio Olfattivo listings named "Cécile Zarokian"
    // as a top note. Prose after a label, and a person's name is capitalised
    // like a note is, so only the section-level list test rules it out.
    const description =
      'A perfume by Cécile Zarokian. The top notes are built around a leather accord ' +
      'that the perfumer has described as difficult to place.';
    expect(parseNotes(description)?.top ?? []).not.toContain('Cécile Zarokian');
  });
});
