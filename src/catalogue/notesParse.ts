/**
 * Pull the note pyramid out of a retailer's own product copy.
 *
 * Split out of scripts/build-demo-catalogue.ts so this regex-heavy heuristic —
 * the part of that script hardest to get right from reading alone — can be
 * tested directly against real, previously-mismeasured description text
 * instead of only being checkable by rerunning a 14,000-product build.
 *
 * This only ever reads notes a source has explicitly labelled ("Top notes:",
 * "Middle notes:" or "Heart notes:", "Base notes:"). It never infers a note
 * from a product name, a brand's house style or anything else — a fragrance
 * whose description does not spell them out simply has no notes here, and the
 * app says so rather than filling the gap.
 *
 * Worth being precise about the source: this is the *retailer's* copy, taken
 * from the affiliate feed we are licensed to use, not the perfumer's own
 * website. Those two usually agree, and where a retailer has copied the house
 * text they agree exactly, but this is not a claim to be quoting the maker
 * directly.
 */

export interface ParsedNotes {
  top: string[];
  middle: string[];
  base: string[];
}

/** Groups spelling variants for the Notes key so counting them once, not once per spelling. */
const noteKey = (s: string): string => s.toLowerCase().replace(/[-\s]+/g, ' ').trim();

/**
 * Real spelling and typo variants of one note, checked against the live
 * catalogue's own Notes list before being added — a fragrance house's own
 * inconsistent spelling within a single feed ("Ylang-Ylang" and "Ylang
 * ylang" a few products apart), not a guess at what might be the same note.
 * Kept small and specific rather than an automated fuzzy match, the same
 * reason `brandName.ts`'s KNOWN_ALIASES stays a short hand-checked list:
 * a wrong merge silently hides two genuinely different notes as one entry.
 */
const NOTE_ALIASES: Record<string, string> = {
  [noteKey('Woody')]: 'Woods',
  [noteKey('Ylang ylang')]: 'Ylang-Ylang',
  [noteKey('Cyrpiol')]: 'Cypriol',
  [noteKey('Guiacwoof')]: 'Guaiac Wood',
  [noteKey('Gaiac wood')]: 'Guaiac Wood',
  [noteKey('Haiti Vetiver')]: 'Haitian Vetiver',
  [noteKey('Haiti Vetyver')]: 'Haitian Vetiver',
  [noteKey('Ooakmoss')]: 'Oakmoss',
  [noteKey('Oak Moss')]: 'Oakmoss',
  [noteKey('Muget')]: 'Lily-of-the-Valley',
  [noteKey('Muguet')]: 'Lily-of-the-Valley',
  [noteKey('Mandarino')]: 'Mandarin',
  [noteKey('Vetyver')]: 'Vetiver',
  [noteKey('Jasmin')]: 'Jasmine',
  [noteKey('Cedar Wood')]: 'Cedarwood',
};

const canonicalNoteName = (s: string): string => NOTE_ALIASES[noteKey(s)] ?? s;

/**
 * The handful of HTML entities that survive into feed copy, decoded.
 *
 * Not a general HTML decoder and not trying to be. `&nbsp;` is the one that
 * mattered: Nicchia Luxury publishes "Top notes:&nbsp;geranium, lemongrass,
 * mandarin orange", and with the entity left in place the first item of every
 * such list reads "&nbsp;geranium" and is thrown away as not a note name. 117
 * of that shop's descriptions carry "Base notes:&" and its siblings.
 */
const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&');

export function parseNotes(descriptionRaw: string | null | undefined): ParsedNotes | null {
  if (!descriptionRaw) return null;
  const description = decodeEntities(descriptionRaw);

  // Each section runs until the next label or the end of the copy. Feeds
  // frequently omit any separator between one section and the next label
  // ("...CardamomMiddle notes:"), so the lookahead does the splitting.
  /**
   * A note name, as opposed to a sentence that happened to follow one.
   *
   * The last section in a description runs into whatever marketing prose comes
   * after it, and some sources write the next heading without a colon so the
   * lookahead cannot split on it. Both leak sentences into the list, so the
   * shape of a real note is asserted directly: a short phrase of a few words,
   * with no sentence punctuation and no leftover heading fragment.
   */
  /**
   * Words that only ever appear because a sentence has been sliced mid clause
   * ("...where amber and musk take over", "citrus through spices"). A real note
   * is a noun phrase and never contains any of these.
   */
  // Adverbs are matched by name rather than by an "ends in ly" rule, which
  // would throw away Lily of the Valley.
  const PROSE =
    /\b(take|takes|taken|over|through|leading|with|into|from|that|which|while|before|after|creating|providing|making|giving|adding|fairly|quickly|slowly|gently|softly|deeply|subtly|really|quite|very|soon|later|eventually|immediately|composed|consisting|comprising|comprised|featuring|including|blended|blending|infused|enriched|enhanced|combined|combining|accented|balanced|opens|opening)\b/i;

  /**
   * Trims a real note back out of a sentence describing how it behaves —
   * "Amber  emerge", "Musk provide depth", "Vetiver come forth" all name a
   * genuine note in their first word or two and then run straight into the
   * clause that says what it does. Two rules catch this before the shape
   * check below ever sees it:
   *
   *   1. A real note phrase never contains two consecutive spaces — only
   *      prose does, wherever the source's own markup ("<br>" and similar)
   *      collapsed to whitespace. Cutting at the first such run recovers
   *      "Amaryllis" from "Amaryllis  🍮" the same way it recovers "Amber"
   *      from "Amber  emerge", with no need to name every stray glyph.
   *   2. A fixed list of description verbs ("emerge", "provide depth", "come
   *      forth" and the rest) that a note name itself never contains, cutting
   *      at the first one found even across a single space ("Vetiver come
   *      forth", "Patchouli for depth").
   *
   * Checked against the live catalogue before being written: every note name
   * that actually exists survives both cuts unchanged.
   */
  const TRAILING_CLAUSE =
    /\s+(emerge|emerges|develop|develops|settle|settles|unfold|unfolds|linger|lingers|intertwine|intertwines|provide|provides|contribute|contributes|add|adds|offer|offers|come\s+forth|comes\s+forth|greet|greets|resonate|resonates|lend|lends|uplift|steam|delivery|for\s+her|for\s+him|for\s+depth|these\b).*$/i;

  /**
   * List furniture, at either end of a candidate.
   *
   * Leading, because two shops write their note lists as bullets and the
   * bullet arrives glued to the first word: Al Haramain publishes "Top note:.
   * -Bergamot, Lemon, Tamarind" and Avon publishes "• Top note: lush greens",
   * so "-Bergamot" and "• lush greens" were reaching the shape check with a
   * punctuation mark where the note's first letter should be.
   *
   * Trailing full stops, because a source that ends every line with ".." —
   * Avon again, "Top Notes: Black Pepper.. Middle Notes: Vanilla.." — leaves
   * one behind after the sentence split takes the other, and a candidate
   * carrying a full stop is rejected as a sentence. 99 Avon listings and 94
   * Al Haramain ones carried a labelled section that parsed to nothing for
   * exactly these two reasons.
   */
  const LEADING_FURNITURE = /^[\s.:;,|*•·—–-]+/;
  const TRAILING_STOPS = /[.\s]+$/;

  const cleanCandidate = (s: string): string =>
    s
      .replace(LEADING_FURNITURE, '')
      .split(/\s{2,}/)[0]!
      .replace(TRAILING_CLAUSE, '')
      .replace(/[|*•·™®—–-]+$/, '')
      .replace(TRAILING_STOPS, '')
      .trim();

  /**
   * A note name is a material — a flower, a wood, a fruit, a spice, a musk —
   * never the vague quality-adjective a marketing sentence describes it
   * with. Checked against the live catalogue: at least one source (Lattafa
   * "Sing Kids", read via emirates-oud) publishes a `Top Notes:`/`Middle
   * Notes:`/`Base Notes:` heading whose content is "Lively and sweet" /
   * "Cozy and welcoming" / "Soft and soothing" — real labelled headings, but
   * feelings, not ingredients. Shape rules alone (short, capitalised, no
   * sentence punctuation) cannot tell that apart from a genuine short note
   * like "Amber" or "Musk", so the specific words are named here instead —
   * the same closed, hand-checked approach as NOTE_ALIASES above, extended
   * only when a real instance of one of these turns up attached to a real
   * product's notes.
   */
  const NOT_A_NOTE = new Set([
    'warm',
    'cozy',
    'cosy',
    'soft',
    'rich',
    'deep',
    'lively',
    'soothing',
    'welcoming',
    'finally',
    'summer days',
    'invigorate the senses',
    'embody charm',
    'experience a warm',
    // A "Recommended for: Daytime, Spring, Summer" line right after a real
    // Base Notes list has no colon of its own to stop the capture at, so the
    // season names ride along as if they were the last two notes — found via
    // Lacoste L.12.12 Blanc Eau Intense (mybeauty-boutique), and, checked
    // separately, already present in 18 places pre-dating this change.
    'spring',
    'summer',
    'autumn',
    'fall',
    'winter',
    'daytime',
    'nighttime',
  ]);

  /**
   * Everything a note must be except capitalised.
   *
   * Split out from `looksLikeNote` because the capitalisation rule turns out
   * to be about the *section*, not about the candidate — see `bodyIsAList`.
   */
  const looksLikeNoteIgnoringCase = (s: string): boolean =>
    s.length > 1 &&
    s.length <= 24 &&
    s.split(/\s+/).length <= 3 &&
    !/[.:;!?()]/.test(s) &&
    !/\bnotes?\b/i.test(s) &&
    !NOT_A_NOTE.has(s.toLowerCase()) &&
    !PROSE.test(s) &&
    // A real note never opens on a bare article, pronoun or preposition —
    // nothing genuinely named "A Bright", "As It Develops" or "At Its Core"
    // exists, those are a sentence's own opening words ("A bright, sparkling,
    // vibrant citrus...", "As it develops...", "At its core...") caught by the
    // comma split before the sentence itself was recognised as prose.
    //
    // The prepositions were added with the case rule below: "Top notes
    // composed of Bergamot, Lemon, Rosemary" (Nicchia Luxury, Alchimista
    // Enapay) splits into "of Bergamot" once the comma split runs, and a
    // lowercase "of Bergamot" used to be discarded for its case rather than
    // for what it is. Checked at the very start only, never anywhere in the
    // phrase — "Lily of the Valley" keeps its own "of" and "the" mid-phrase,
    // which this must never touch.
    !/^(a|an|as|at|it|its|the|of|for|by|on|in|to|and|or|is|are|was|were)\b/i.test(s);

  /**
   * Whether a labelled section's content is a list of notes or a sentence
   * about them, decided from the section as a whole.
   *
   * The capitalisation rule this replaces read "feed copy capitalises note
   * names, so a lowercase start means the split landed inside a sentence".
   * The first half is not true of every feed, and the shops it is false for
   * are large ones: Nicchia Luxury publishes "Top notes: geranium,
   * lemongrass, mandarin orange" and Avon publishes "• Top note: lush
   * greens", both entirely lowercase and both unambiguously lists.
   *
   * But dropping the rule outright lets real prose through. Measured on
   * mybeauty-boutique, whose copy reads "Base Notes: envelop your senses with
   * a rich blend of...", "envelop your senses" is three lowercase words with
   * no sentence punctuation and would be published as a note.
   *
   * So the question is asked of the section rather than of the item: a list is
   * a run of things that are *all* note-shaped, and one item that is plainly a
   * clause makes the whole thing prose. In prose the old rule still applies
   * and only a capitalised item can be a note; in a list, case is not
   * evidence of anything.
   */
  const bodyIsAList = (items: readonly string[]): boolean =>
    items.length > 0 && items.every(looksLikeNoteIgnoringCase);

  /**
   * Some sources mention "top notes" twice: once loosely in marketing prose
   * ("Top notes include an enchanting blend of saffron...") and again as the
   * real labelled list further down ("Top Notes: Mint, Bergamot, Mugwort.").
   * A single first-match read (the original behaviour, still what a
   * single-mention description gets) latched onto the prose mention, filled
   * `listOnly` with sentence fragments, filtered every one of them out via
   * `looksLikeNote`, and returned empty — even though a real, unambiguous
   * labelled list of the same section sat later in the same copy. Walking
   * every occurrence of the label and returning the first one that actually
   * survives `looksLikeNote` fixes this without changing anything for the
   * (overwhelmingly common) case where the first occurrence already is the
   * real list: that occurrence still wins, unchanged. Checked against
   * Emirates Oud's Hawas Elixir listing, which has exactly this shape.
   */
  const section = (label: string): string[] => {
    const re = new RegExp(
      `${label}\\s*:?\\s*([\\s\\S]*?)(?=(?:top|middle|heart|base|bottom)\\s+notes?\\s*:|$)`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(description)) !== null) {
      if (m[1]) {
        // Whatever sits between the label and the notes themselves — Al
        // Haramain writes "Top note:. -Bergamot" and the leading full stop
        // would otherwise make the sentence split below return an empty first
        // segment and throw the entire list away.
        const body = m[1].replace(LEADING_FURNITURE, '');
        // Notes are a comma separated list, never sentences, so the first full
        // stop that ends a sentence also ends the list.
        const listOnly = body.split(/\.\s|\.$/)[0] ?? '';
        const candidates = listOnly
          // "&" joins two notes as readily as "and" does — Beauty Base writes
          // "Top Notes: Pink Pepper Essence & Blackcurrant". It used to be
          // split anyway, but by accident and in the wrong place: the source
          // publishes the HTML entity, and the ";" that ends "&amp;" is in
          // this character class, so the list came out as ["White Musks &amp",
          // "Vanilla"] — one real note and one corrupted one. Decoding the
          // entity fixed the corruption and removed the accidental split with
          // it, so the split is now made on purpose.
          .split(/[,;/&]|\band\b/i)
          .map((s) => cleanCandidate(s.trim()))
          .filter((s) => s.length > 0);
        // Case is only evidence when the section is prose — see bodyIsAList.
        const keep = bodyIsAList(candidates)
          ? looksLikeNoteIgnoringCase
          : (s: string) => looksLikeNoteIgnoringCase(s) && /^[A-Z]/.test(s);
        const items = candidates.filter(keep).map(canonicalNoteName).slice(0, 14);
        if (items.length > 0) return items;
      }
      // A zero-width overall match (label sits directly against the next
      // boundary) would otherwise leave lastIndex unmoved and loop forever.
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return [];
  };

  const top = section('top\\s+notes?');
  const middle = section('(?:middle|heart)\\s+notes?');
  // "Bottom notes" is Avon's own wording for the base — "Top Notes: Black
  // Pepper.. Middle Notes: Vanilla.. Bottom Notes: Cashmere Woods.." — and
  // that section was being read as ordinary prose because no label matched it.
  const base = section('(?:base|bottom)\\s+notes?');

  if (top.length === 0 && middle.length === 0 && base.length === 0) return null;
  return { top, middle, base };
}
