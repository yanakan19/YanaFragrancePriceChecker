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

  it('reads "Lily of the Valley" via the MULTIWORD_NOTES allowlist', () => {
    // Four words, and used to be dropped outright by the three-word ceiling —
    // Al Haramain's Shefon listing publishes exactly this and this parser
    // used to throw it away. Fixed by naming the phrase in MULTIWORD_NOTES
    // rather than raising the word cap itself: raising the cap to 4 outright
    // was tried first and measured against every description in
    // data/catalogue, and it let sentence fragments of the same length back
    // in ("Alien is a warm", "makes it feel") — see MULTIWORD_NOTES' own
    // comment for what that attempt broke.
    expect(parseNotes('Top notes: Lily of the Valley, Rose.')?.top).toEqual([
      'Lily of the Valley',
      'Rose',
    ]);
  });

  it('still drops an unlisted four-word phrase, the trade-off the allowlist accepts', () => {
    // The three-word cap still applies to everything not named in
    // MULTIWORD_NOTES — a genuine but rarer note like "Queen of the Night
    // Flower" is dropped exactly like a same-length sentence fragment
    // ("a hint of the licorice") would be, until it is checked against a real
    // labelled listing and added by name.
    expect(parseNotes('Top notes: Queen of the Night Flower, Rose.')?.top).toEqual(['Rose']);
  });

  it('reads the other two names in MULTIWORD_NOTES, past the character cap too', () => {
    // "Rose de Mai Absolute" (escentual, Giorgio Armani Si) and "Mountain Oak
    // Moss Accord" (escentual, a Jo Malone listing) are both real notes found
    // inside a plain colon-headed list, not prose — see MULTIWORD_NOTES'
    // comment for the exact listings. "Mountain Oak Moss Accord" is also 25
    // characters, one past the 24-character cap, so the allowlist has to
    // clear that too, not just the word count.
    const description =
      'Heart Notes: Rose de Mai Absolute, Freesia. ' +
      'Base Notes: Haitian Vetiver, Mountain Oak Moss Accord, Sandalwood.';
    expect(parseNotes(description)).toEqual({
      top: [],
      middle: ['Rose de Mai Absolute', 'Freesia'],
      base: ['Haitian Vetiver', 'Mountain Oak Moss Accord', 'Sandalwood'],
    });
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

  // ── Prose pyramids, not just colon-headed lists ────────────────────────────
  // Nicchia Luxury labels only a small fraction of its listings with a
  // colon-headed "Top Notes:"/"Base Notes:" block; most state the pyramid in a
  // sentence instead. These shapes were found by sampling Nicchia's own
  // unlabelled descriptions directly, not assumed.

  it('reads "notes of X, Y and Z", the commonest prose shape', () => {
    // allbeauty, Elizabeth Arden "Beauty": the connector is "of", not a colon,
    // and without consuming it the first candidate of each section reads "of
    // iris", "of orchid", "of sandalwood" and is thrown away for starting with
    // "of" — losing the note along with the connector, not just the connector.
    const description =
      'Beauty is a refreshing, crystalline, amber, woody fragrance. Top notes of iris, ' +
      'bergamot, and rice flower. Middle notes of orchid, ginger, rhubarb, lotus and lily. ' +
      'Base notes of sandalwood, amber and musk.';
    expect(parseNotes(description)).toEqual({
      top: ['iris', 'bergamot', 'rice flower'],
      middle: ['orchid', 'ginger', 'rhubarb', 'lotus', 'lily'],
      base: ['sandalwood', 'amber', 'musk'],
    });
  });

  it('reads "notes are X, Y and Z", the connector Al Haramain and others use', () => {
    // allbeauty, YSL Place Vendôme — mixes both new connectors in one
    // description ("of" for the top section, "are" for the other two).
    const description =
      'Place Vendôme is a woody, floral fragrance that was launched in 2013. The scent opens ' +
      'with top notes of pink pepper, orange blossom and rose essence. Middle notes are honey, ' +
      'Jasmine and peony. Base notes are benzoin and cedar-wood.';
    expect(parseNotes(description)).toEqual({
      top: ['pink pepper', 'orange blossom', 'rose essence'],
      middle: ['honey', 'Jasmine', 'peony'],
      base: ['benzoin', 'Cedarwood'],
    });
  });

  it('reads "notes include X, Y and Z"', () => {
    const description = 'Heart notes include Rose, Jasmine and Iris.';
    expect(parseNotes(description)?.middle).toEqual(['Rose', 'Jasmine', 'Iris']);
  });

  it('prefers a later colon-headed list over an earlier prose mention of the same label', () => {
    // Al Haramain's "L'Aventure Grapefruit" listing recaps its own base notes
    // in prose first, with stray periods standing in for commas ("the
    // lingering base notes of caramel. vanilla. patchouli, benzoin.
    // sandalwood. musk and vetiver..."), then states them properly afterwards
    // ("Base note: Caramel, Vanilla, Patchouli, Benzoin, Sandalwood, Musk,
    // Vetiver."). The stray periods make the sentence splitter stop after the
    // first word, so if the prose "of" connector were tried first it would
    // return a truncated ["caramel"] and never reach the real list — the
    // colon-only pass has to run across the whole description before the
    // wider connector is tried at all, not just before it for this one label.
    const description =
      'But it doesn\'t stop there the lingering base notes of caramel. vanilla. patchouli, ' +
      'benzoin. sandalwood. musk and vetiver undertones ensure that this enchantment endures. ' +
      'Base note: Caramel, Vanilla, Patchouli, Benzoin, Sandalwood, Musk, Vetiver.';
    expect(parseNotes(description)?.base).toEqual([
      'Caramel',
      'Vanilla',
      'Patchouli',
      'Benzoin',
      'Sandalwood',
      'Musk',
      'Vetiver',
    ]);
  });
});
