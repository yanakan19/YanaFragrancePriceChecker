/**
 * Scent note names: cleaning, the merge rule, and the order they sort in.
 *
 * Shops publish note names with all sorts of debris around them: emoji
 * ("🍋 Lemon"), zero width spaces glued to the end ("Rose​"), trademark marks
 * ("Ambrox®"), list bullets ("__ marshmallow"), the odd quote or brace, and
 * HTML left over from a line break ("Dragon fruit>br>"). The same note also
 * arrives spelled several ways: "Oak Moss" and "Oakmoss", "Ylang-Ylang" and
 * "Ylang ylang", "Maté" and "Mate". Left alone, the Notes tab sorts the emoji
 * ones out of place and lists one note several times.
 *
 * Three pure steps, none of which touches a note's meaning:
 *
 *   cleanNoteName  what a visitor sees: debris stripped, spaces tidied.
 *   noteSortKey    what the A to Z order uses: case and accents folded, so a
 *                  name that opened with an emoji sorts where its letters say.
 *   noteMergeKey   what decides that two names are the same note.
 *
 * THE MERGE RULE (owner request, 6 Oct 2026). Two names are one note only when
 * they differ in case, spacing, symbols, emoji, accents or obvious punctuation
 * (hyphen, apostrophe) and nothing else. Their merge keys are then equal. It
 * never merges a variant: "Madagascan Vanilla" is not "Vanilla", "Sambac
 * Jasmine" is not "Jasmine", "Tonka Bean" is not "Tonka Beans" (a plural is a
 * different word), and "Jasmine Sambac" is not "Sambac Jasmine" (word order is
 * the shop's own, and the two stay separate until a person says otherwise).
 * That is the whole rule: the key is the name with everything that is not a
 * letter or digit removed, after case and accents are folded. Nothing is
 * inferred, nothing is fuzzy, nothing is looked up in a list.
 */

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{20E3}]/gu;
const FORMAT = /\p{Cf}/gu;
const LINE_BREAK_DEBRIS = /<?\/?\s*br\s*\/?>/gi;

/**
 * The name as a visitor should read it. Keeps letters (accents included),
 * digits, spaces, hyphens and apostrophes; every other character is replaced
 * by a space and the spaces are tidied. A name with nothing left returns ''.
 */
export function cleanNoteName(raw: string): string {
  // Trademark, registered and copyright marks sit against the word, so they go
  // first and without a gap (NFKC would turn "TM" signs into the letters TM).
  let s = raw.replace(/[©®™]/g, '').normalize('NFKC');
  s = s.replace(FORMAT, '').replace(EMOJI, '');
  s = s.replace(LINE_BREAK_DEBRIS, ' ').replace(/>br>|\bbr>/gi, ' ');
  s = s.replace(/[‐-―−]/g, '-').replace(/[‘’ʼ`´]/g, "'");
  // Anything that is not a letter, digit, space, hyphen or apostrophe becomes a space.
  s = s.replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ');
  // A hyphen with a space on both sides separates two things and stays so; a
  // hyphen with a space on one side is a typo for a joining hyphen.
  s = s.replace(/\s+/g, ' ').replace(/ - /g, '\u0001').replace(/\s*-\s*/g, '-').replace(/\u0001/g, ' - ');
  s = s.replace(/^[\s'-]+|[\s'-]+$/g, '');
  // A name of one character is a stray, not a note.
  return [...s].length < 2 ? '' : s;
}

const foldAccents = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** What the A to Z order compares: folded, with only letters, digits and single spaces. */
export function noteSortKey(name: string): string {
  return foldAccents(cleanNoteName(name))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Two names with the same key are the same note. See the merge rule above. */
export function noteMergeKey(name: string): string {
  return foldAccents(cleanNoteName(name)).replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The pure rule as a question. */
export function sameNote(a: string, b: string): boolean {
  const ka = noteMergeKey(a);
  return ka !== '' && ka === noteMergeKey(b);
}

/**
 * The address segment of a note's page: its clean name with accents folded,
 * lower case, letters and digits joined by single hyphens. Folding the accents
 * first is the difference from the router's own slugify, which drops an
 * accented letter outright ("Maté" became "mat"). A name with no Latin letter
 * left has no readable slug, so it falls back to its merge key.
 */
export function noteSlug(name: string): string {
  const slug = foldAccents(cleanNoteName(name))
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? encodeURIComponent(noteMergeKey(name)) : slug;
}

export interface NoteGroup {
  /** The merge key every name in the group shares. */
  key: string;
  /** The name shown: the commonest clean spelling, see `groupNotes`. */
  display: string;
  /** Every raw spelling that landed here, for redirecting old addresses. */
  raw: string[];
  /** Fragrances using any of the spellings (as counted by the caller). */
  products: number;
}

/** A spelling that is not all lower case or all upper case reads as intended. */
const looksIntended = (s: string): boolean => s !== s.toLowerCase() && s !== s.toUpperCase();

/**
 * Groups raw note names into notes. `raw` maps each raw spelling to the number
 * of fragrances using it. The shown name is the clean spelling used by the most
 * fragrances; a tie goes to the one written in mixed case, then the one that
 * sorts first, so the choice is the same on every build. A name that cleans to
 * nothing is left out. Groups come back in sort order.
 */
export function groupNotes(raw: ReadonlyMap<string, number>): NoteGroup[] {
  const byKey = new Map<string, { spell: Map<string, number>; raw: string[]; products: number }>();
  for (const [name, products] of raw) {
    const clean = cleanNoteName(name);
    const key = noteMergeKey(clean);
    if (!key) continue;
    let g = byKey.get(key);
    if (!g) {
      g = { spell: new Map(), raw: [], products: 0 };
      byKey.set(key, g);
    }
    g.spell.set(clean, (g.spell.get(clean) ?? 0) + products);
    g.raw.push(name);
    g.products += products;
  }
  const groups: NoteGroup[] = [];
  for (const [key, g] of byKey) {
    const display = [...g.spell]
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          Number(looksIntended(b[0])) - Number(looksIntended(a[0])) ||
          (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
      )[0]![0];
    groups.push({ key, display, raw: g.raw.sort(), products: g.products });
  }
  return groups.sort((a, b) => compareNotes(a.display, b.display));
}

/** The A to Z comparison: by sort key, then by the plain code unit order so it is total. */
export function compareNotes(a: string, b: string): number {
  const ka = noteSortKey(a);
  const kb = noteSortKey(b);
  return ka.localeCompare(kb, 'en-GB') || (ka < kb ? -1 : ka > kb ? 1 : 0) || (a < b ? -1 : a > b ? 1 : 0);
}
