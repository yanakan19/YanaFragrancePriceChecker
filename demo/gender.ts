/**
 * Who a fragrance is sold to, read off the words a shop actually used.
 *
 * There is no gender field anywhere in this project. A catalogue entry carries
 * id, brand, name, concentration, sizeMl, ean, shops, image and notes, and not
 * one of those says who a bottle is for. Nothing upstream supplies it either:
 * of the 3,431 products whose retailer spelled its scent notes out, exactly
 * one has an audience word anywhere in that list (Floris Platinum 22, whose
 * note list ends "Women | Woods | Spicy"), which is a labelling accident in
 * one shop's copy rather than a source worth reading.
 *
 * So the only evidence available is the product's own title, and this file
 * reads it literally: a title that says "Pour Homme" is a shop stating an
 * audience, and a title that says nothing is a shop stating nothing. Those are
 * the only two things that can be established here, and the second one is by
 * far the more common: 8,957 of the 10,376 products in the catalogue as it
 * stands say nothing at all. See the measurements at the foot of this
 * comment, and re-run the script named there rather than trusting them.
 *
 * ── The one rule that matters ────────────────────────────────────────────────
 * "Not stated" means not stated. It never means unisex.
 *
 * Those are different claims about a bottle and only one of them is ours to
 * make. Most of the catalogue is Chanel No 5, Sauvage, Baccarat Rouge 540 and
 * ten thousand others whose titles are just a name — the shop did not say, so
 * neither do we. Folding that silence into "Unisex" would take the largest
 * group in the catalogue and attach a marketing claim to it that nobody
 * established, and would do it invisibly, which is exactly the kind of quiet
 * invention this project does not do. `readGender` therefore has a fourth
 * reading rather than a default, and 'unisex' is only ever returned when a
 * title contains the word.
 *
 * ── Why a title, and why that is honest enough ───────────────────────────────
 * The evidence is a phrase inside the name the reader is already looking at.
 * "Versace Eros Pour Femme" is filed under Women's because those two words are
 * printed on the card, so a reader can check the classification against the
 * same string we did, with no hidden table to take on trust. That is the whole
 * reason this reads the display name rather than some richer upstream field:
 * the reader can audit it.
 *
 * `readGenderEvidence` returns the phrase that decided it for the same reason,
 * and the tests pin it, so "why is this one filed here" always has an answer.
 *
 * ── What is deliberately not evidence ────────────────────────────────────────
 * A word has to be a shop naming an audience, not a word with a gender in it
 * somewhere. Three exclusions, each from a real catalogue case:
 *
 *   "lady"     Portrait Of A Lady, Lady Vengeance, The Revenge Of Lady
 *              Blanche, Lady Emblem. 39 products, and in every one of them
 *              "Lady" is a character in the fragrance's own story, not a
 *              counter it is sold from. Plural "ladies" is kept: "Armaf
 *              Ladies Club De Nuit" is a shop naming a shelf.
 *   "man's"    Byredo's Rose Of No Man's Land. The possessive is part of an
 *              idiom; the bare noun ("Jimmy Choo Man", "Ultraviolet Man") is
 *              a flanker's audience. So "man" counts and "man's" does not.
 *   "donna     Donna Karan is a person's name that happens to be the Italian
 *    karan"    for woman, and DKNY's own titles still carry it. "Valentino
 *              Donna" and "Privato Per Donna" are the real use.
 *
 * Contradictory evidence — masculine and feminine phrases in one title, with
 * no explicit "unisex" — returns 'notStated' rather than a guess at which
 * word wins. No product in the catalogue at d1d7099 hits this, but a
 * "Pour Homme / Pour Femme" twin pack listing would, and silence is the right
 * answer to a question the title contradicts itself on.
 *
 * ── Measured, 10,376 products ────────────────────────────────────────────────
 *   npx tsx scripts/gender-coverage.ts
 *
 *   Women's       548    5.28%
 *   Men's         853    8.22%
 *   Unisex         18    0.17%
 *   Not stated  8,957   86.32%
 *
 * 13.68% classified, 1,419 products. The same rules over the 43,478 undelisted
 * raw listings read 8.53%, lower because a title one shop wrote is less likely
 * to name an audience than a product several shops stock and only one of them
 * had to label. Neither figure is going to climb much, so the filter panel
 * states the split on screen rather than leaving a reader to conclude the
 * filter is broken.
 */

/**
 * A reading, not a fact about the bottle. 'notStated' is a statement about the
 * title, not about the fragrance: it says the shop did not tell us.
 */
export type GenderReading = 'mens' | 'womens' | 'unisex' | 'notStated';

/**
 * Phrases that count as a shop naming an audience.
 *
 * Checked as whole words, so "men" never matches inside "women" and "male"
 * never matches inside "female" — there is no word boundary in either place.
 * Both the straight and the typographic apostrophe are accepted: 20 products
 * in the catalogue use the curly one somewhere in their name.
 */
const MASCULINE = /\b(?:pour homme|homme|men[’']?s|men|man(?![’']s)|male|uomo|for him)\b/i;
const FEMININE = /\b(?:pour femme|femme|women[’']?s|women|woman|ladies|donna(?! karan)|female|for her)\b/i;
/**
 * Only the word itself. A shop that writes "Unisex" has made a claim and we
 * repeat it; nothing else in a title implies one.
 */
const UNISEX = /\b(?:unisex|for men and women|for him and her)\b/i;

/** The phrase a title was read on, or null when nothing decided it. */
export interface GenderEvidence {
  reading: GenderReading;
  /** Exactly the words matched, as the title spelled them. */
  phrase: string | null;
}

/**
 * Reads a product title and reports both the reading and the words behind it.
 *
 * Unisex is checked first, because "Unisex" is an explicit statement and the
 * "men and women" it is sometimes spelled out as would otherwise trip the
 * masculine and feminine patterns at once and be discarded as contradictory.
 */
export function readGenderEvidence(title: string): GenderEvidence {
  const unisex = title.match(UNISEX)?.[0];
  if (unisex) return { reading: 'unisex', phrase: unisex };

  const masculine = title.match(MASCULINE)?.[0] ?? null;
  const feminine = title.match(FEMININE)?.[0] ?? null;
  if (masculine && feminine) return { reading: 'notStated', phrase: null };
  if (masculine) return { reading: 'mens', phrase: masculine };
  if (feminine) return { reading: 'womens', phrase: feminine };
  return { reading: 'notStated', phrase: null };
}

/** The reading alone, for the filter. */
export const readGender = (title: string): GenderReading => readGenderEvidence(title).reading;

/**
 * Order the four options are offered in, fixed rather than alphabetical or
 * by count: the three stated readings first, and the one that means "we do
 * not know" last, where a reader expects an "everything else" bucket.
 */
export const GENDER_ORDER: readonly GenderReading[] = ['womens', 'mens', 'unisex', 'notStated'];

/**
 * Reader facing labels. The words carry the meaning on their own, so the
 * pink and blue marks beside them are never the only thing distinguishing
 * one option from another.
 */
export const GENDER_LABEL: Record<GenderReading, string> = {
  womens: "Women's",
  mens: "Men's",
  unisex: 'Unisex',
  notStated: 'Not stated',
};
