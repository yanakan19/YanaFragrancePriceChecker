/**
 * How a product is labelled once we have decided it is a fragrance.
 *
 * Split out of scripts/build-demo-catalogue.ts so the two hard questions here —
 * "which concentration is this title actually naming" and "what is this
 * fragrance called once the shop's noise is off" — can be tested directly.
 * They are the parts of that script most driven by specific, checked-against-
 * the-catalogue facts, and until now the only way to exercise them was to run
 * a full 33,000-listing build and read the output.
 *
 * Nothing here decides whether a listing is a fragrance at all; that lives in
 * fragranceId.ts, which is a different question with a different failure mode.
 */
import { ML_SIZE_RE, OZ_SIZE_RE, OZ_TO_ML } from './fragranceId.js';

/**
 * Concentrations, split into two tiers so a match can be tried by
 * specificity — the full "eau de X" / "extrait de X" phrases first, then the
 * bare single-word alternatives — rather than by whichever happens to sit
 * first in the title. See concentrationMatch below for why that distinction
 * is load-bearing, not tidiness: "cologne" alone is ambiguous between a real
 * concentration and part of a product line's own name (Creed's "Aventus
 * Cologne"), where a full "eau de parfum" is never anything but the
 * concentration.
 *
 * "perfume" was a real gap in the generic tier: a title reading "Chanel No 5
 * Perfume 100ml" matched none of the French-derived terms and was silently
 * rejected as not a fragrance, despite being an obvious one — plain English
 * listings (feeds especially) favour "perfume" over "parfum". "attar" and
 * "oud" cover the concentrated-oil style Middle Eastern perfumery uses,
 * relevant because the registry already models a 'mideast' tier for three
 * retailers.
 *
 * The generic tier is itself ordered by reliability, not left as one
 * alternation — see concentrationMatch, which checks each word in this order
 * rather than taking whichever occurs earliest in the string. "oud" is last
 * for a concrete reason: it is also an extremely common leading word in a
 * fragrance's own name in Middle Eastern perfumery — "Oud & Roses", "Oud
 * Couture", "Oud Ispahan" — so a title like "Oud & Roses Perfume 60ml EDP"
 * naively matched leftmost picked "Oud" as the concentration, stripped it
 * from the display name, and left "& Roses Perfume 60ml EDP" with a bare
 * leading ampersand and the wrong concentration badge, even though "EDP"
 * sits right there later in the same title. Checked against Emirates Oud's
 * own catalogue: 38+ titles hit this exact collision.
 */
export const CONCENTRATION_SPECIFIC =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|extrait de parfum|extrait de toilette)\b/i;
const CONCENTRATION_GENERIC_PRIORITY = [
  'edp', 'edt', 'edc', 'parfum', 'perfume', 'aftershave', 'cologne', 'extrait', 'attar', 'oud',
] as const;
const CONCENTRATION_GENERIC_PATTERNS: Record<string, RegExp> = Object.fromEntries(
  CONCENTRATION_GENERIC_PRIORITY.map((w) => [w, new RegExp(`\\b${w}\\b`, 'i')]),
);

/**
 * Canonical display form per CONCENTRATION alternative, so "EDT" and "Eau De
 * Toilette" in two different retailers' titles both land on the identical
 * string. Without this, a naive title case of whatever phrase the title used
 * produced two different strings ("Eau de Toilette" from the abbreviation,
 * "Eau De Toilette" from the spelled out phrase) for the same concentration,
 * which then meant only one of the two ever matched the app's own
 * abbreviation table for the popular rail's compact size and concentration
 * label.
 */
const CONCENTRATION_DISPLAY: Record<string, string> = {
  edp: 'Eau de Parfum', edt: 'Eau de Toilette', edc: 'Eau de Cologne',
  'eau de parfum': 'Eau de Parfum', 'eau de toilette': 'Eau de Toilette',
  'eau de cologne': 'Eau de Cologne', 'eau fraiche': 'Eau Fraiche',
  parfum: 'Parfum', perfume: 'Perfume', aftershave: 'Aftershave',
  cologne: 'Cologne', extrait: 'Extrait', attar: 'Attar', oud: 'Oud',
};

/**
 * Whichever concentration phrase a title actually names, by specificity
 * rather than by which one merely occurs first in the string.
 *
 * A single combined alternation isn't global, so `.match()` stops at the
 * first alternative that matches, scanning left to right — not the most
 * specific one. That is usually harmless, but Creed's own "Aventus Cologne"
 * line breaks it: the
 * title reads "Creed Aventus Cologne Eau De Parfum 50ml", where "Cologne" is
 * genuinely part of that line's own name (Creed formulates its Cologne
 * expressions at Eau de Parfum strength — an oddity of that one house, not a
 * general rule) and "Eau De Parfum" right after it is the actual
 * concentration. Because "Cologne" sits earlier in the string, the old
 * single match picked it as *the* concentration and left "Eau De Parfum"
 * sitting unremoved in the display name — "Aventus Eau De Parfum" labelled
 * Cologne, on the same product this file's other fix was written for.
 * Checking the specific "eau de X" phrases first, regardless of position,
 * is what a reader would call the actual concentration; a bare word like
 * "cologne" only gets to answer the question when nothing more specific
 * appears anywhere in the title.
 *
 * The same reasoning applies one level down, inside the generic tier itself:
 * checked by CONCENTRATION_GENERIC_PRIORITY order — does EDP appear anywhere,
 * then EDT, then Parfum, and so on down to "oud" last — rather than by
 * position. Without this, "Oud & Roses Perfume 60ml EDP" matched bare "Oud"
 * at position 0 for the exact same reason "Cologne" won above: leftmost, not
 * most reliable.
 */
export function concentrationMatch(title: string): string | null {
  const specific = title.match(CONCENTRATION_SPECIFIC)?.[0];
  if (specific) return specific;
  for (const word of CONCENTRATION_GENERIC_PRIORITY) {
    const hit = title.match(CONCENTRATION_GENERIC_PATTERNS[word]!)?.[0];
    if (hit) return hit;
  }
  return null;
}

/** Concentration as a display string. */
export function concentration(title: string): string {
  const raw = concentrationMatch(title);
  if (!raw) return 'Fragrance';
  const key = raw.toLowerCase();
  return CONCENTRATION_DISPLAY[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which spelling of the brand the title actually opens with, longest first.
 *
 * A listing has two brand strings and they are frequently not the same one.
 * There is the retailer's raw vendor field, and there is the spelling the app
 * displays beside the name (canonBrand's, chosen once per house by
 * brandName.ts). Only the raw field used to be offered here, so wherever the
 * two differed the strip silently did nothing and the brand stayed doubled on
 * screen. Real cases, all confirmed in the live catalogue:
 *
 *   raw "Afnan Perfumes"  title "Afnan 9PM Elixir Extrait de Parfum 100ml"
 *   raw "DOLCE&GABBANA"   title "Dolce & Gabbana Devotion Eau de Parfum 50ml"
 *   raw "Donna Karan"     title "DKNY Fresh Blossom Eau de Parfum 100ml"
 *   raw "Dunhill London"  title "Dunhill Driven Blue Eau de Toilette 100ml"
 *
 * In each of those the displayed brand is exactly what the title opens with,
 * because brandName.ts's alias table already did the work of deciding what the
 * house is called. Offering that spelling too is what makes the strip land.
 *
 * Longest match wins, and that is not a tidiness preference — trying the
 * displayed spelling first gets two houses wrong:
 *
 *   Joop!    displayed "Joop", raw "Joop!", title "Joop! Homme ..."
 *            -> "Joop" strips first and leaves "! Homme"
 *   Dunhill  displayed "Dunhill", raw "Dunhill London",
 *            title "Dunhill London Desire Red For Men ..."
 *            -> "Dunhill" strips first and leaves "London Desire Red For Men"
 *
 * Both are fixed by removing whichever candidate is longer. Neither is fixed
 * by picking a favourite.
 *
 * What this deliberately will not do is strip a *prefix* of a brand — take
 * "Escentric" off "Escentric Molecules", "Narciso" off "Narciso Rodriguez",
 * "Tommy" off "Tommy Hilfiger". Measured across the catalogue, 143 listings
 * have a vendor field longer than the form printed in the title, and shortening
 * the vendor field to match would mangle most of them: "Escentric 01" becomes
 * "01", "Tommy Girl" becomes "Girl", "Nina" (Nina Ricci's own eponymous scent)
 * becomes nothing, "David Beckham Classic" becomes "Beckham Classic". Only a
 * spelling some source actually vouched for is used here.
 */
export function brandTitleOpens(title: string, candidates: (string | null)[]): string | null {
  let longest: string | null = null;
  for (const b of candidates) {
    if (!b) continue;
    if (longest !== null && b.length <= longest.length) continue;
    if (new RegExp(`^${escapeRe(b)}\\s*`, 'i').test(title)) longest = b;
  }
  return longest;
}

/**
 * Strip the shop's noise off a title to get something readable.
 *
 * Deliberately conservative. Where this cannot do better it leaves the shop's
 * own words alone, because a mangled name is worse than a verbose one.
 *
 * `for men/women/him/her` used to be stripped here alongside genuine format
 * noise like "spray" and "splash", on the assumption that it was always
 * redundant gender marketing on an otherwise identical bottle. It is not:
 * Creed sells "Aventus" and "Aventus For Her" as two different fragrances
 * with different compositions, not one fragrance with an optional label, and
 * the same pattern repeats across the catalogue under whichever name a house
 * gives its own paired lines — Calvin Klein's "Eternity" and "Eternity for
 * Him", Dolce & Gabbana's "The One" and "The One For Men", Hugo Boss's "The
 * Scent" and "The Scent For Her" are each two distinct products, not a men's
 * and women's presentation of one. Stripping the phrase collapsed "Aventus"
 * and "Aventus For Her" to the same displayed name, which is how a reader
 * ended up looking at what read as three identical Creed Aventus listings —
 * checked against the live catalogue: 302 listings carry this phrase, so
 * this was never a Creed-only edge case. Kept in the name from here on,
 * because a shop's own genuine distinguishing word being dropped is a worse
 * failure than a name that reads a little more verbose than strictly needed.
 *
 * Only the specific phrase concentrationMatch actually identified gets
 * stripped here, not the whole CONCENTRATION alternation — the same
 * "Aventus Cologne Eau De Parfum" case again: blindly stripping every
 * concentration-shaped word would take "Cologne" out too, and "Cologne" is
 * part of that line's own name, not just a concentration descriptor,
 * exactly the same category of mistake this function stopped making with
 * "For Her" above. Removing only the one phrase that was actually used to
 * decide the concentration badge leaves the rest of the title's own words
 * alone, which is the whole rule this function follows everywhere else.
 */
export function displayName(title: string, brand: string | null, displayedBrand: string | null): string {
  let s = title;
  const opener = brandTitleOpens(title, [displayedBrand, brand]);
  if (opener) s = s.replace(new RegExp(`^${escapeRe(opener)}\\s*`, 'i'), '');
  const matchedConcentration = concentrationMatch(title);
  if (matchedConcentration) {
    s = s.replace(new RegExp(`\\b${escapeRe(matchedConcentration)}\\b`, 'i'), '');
  }
  s = s
    .replace(/\b\d{1,4}(?:\.\d)?\s*ml\b/gi, '')
    .replace(/\b(spray|splash|refillable|vapo|natural)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    // Leading "&" only, not trailing: Tiffany & Co's own titles read "Tiffany
    // & Co & Love for Her ...", where the second "&" belongs to the "Tiffany
    // & Love" line's own name, not the brand being stripped above. Stripping
    // the brand leaves a stray leading ampersand ("& Love for Her") on all
    // four of that line's listings — checked, no other product's name starts
    // with "&" for a legitimate reason. A trailing "&" is left alone: nothing
    // in the catalogue has one, so there is no case to fix and no reason to
    // guess at what stripping one would do.
    .replace(/^[\s,\-&|]+|[\s,\-|]+$/g, '');
  // A fragrance named after its own house. Stripping the brand, the
  // concentration and the size leaves nothing because there was nothing else
  // in the title: Chloé's "Chloé", Aramis's "Aramis", Jimmy Choo's "Jimmy
  // Choo" are real fragrances whose own name is the house's name.
  //
  // The old answer was to hand back the entire raw title, which threw away
  // every strip that had just succeeded and displayed "Aramis Eau de Toilette
  // 110ml Spray" as the product's name — beside a brand field already reading
  // "Aramis", a size field already reading 110ml and a concentration field
  // already reading Eau de Toilette. The same three facts, three times.
  //
  // So the name is the brand, which is what the fragrance is actually called.
  // It reads as the eponymous scent it is, it states nothing that is not true,
  // and it never invents a name the shop did not use. `title` remains the last
  // resort for the case with no brand at all to fall back on — no listing in
  // the live catalogue reaches it today (measured: 0 of 18,906), but an
  // unbranded listing whose title is nothing but a concentration and a size
  // would, and an empty name is not something the app can render.
  return s || displayedBrand || brand || title;
}

/**
 * One *standalone* size mention in a title — a size a reader would point to
 * and call the size, as opposed to one fused into a multi-vial count like
 * "2x90ml".
 *
 * Built from ML_SIZE_RE and OZ_SIZE_RE rather than its own patterns, so a
 * token this finds is guaranteed to be one sizeMl() also reads — see the
 * comment on those two in fragranceId.ts for why a second hand-written copy
 * would be a bug waiting to happen. Two things are added on top of them:
 *
 *  - A leading `\b` neither of those two patterns has. sizeMl() does not
 *    need one — it only ever wants *a* value, and "2x90 ml" reading as 90 is
 *    a value worth having. This function needs to know whether the size is
 *    its own token before deciding to touch it, and "2x90 ml" is not: there
 *    is no boundary between the "x" and the "9" that follows it, so the
 *    added `\b` refuses to match there at all, and the name falls through to
 *    the same "no standalone mention" branch a genuine zero-mention name
 *    does — see stripRedundantSize below.
 *
 *  - An optional trailing clause: sizeMl() stops at the first ml match and
 *    never looks further, but a handful of house titles state the same
 *    volume twice, once in ml and once as its fl oz conversion — "30 ml /
 *    1.0 fl oz". Matching that whole clause here, even though only the ml
 *    part is ever used as the value, is what keeps a stray "/ 1.0 fl oz"
 *    from being left behind once the ml part is gone.
 */
const SIZE_TOKEN_RE = new RegExp(
  `\\b${ML_SIZE_RE.source}(?:\\s*/\\s*\\d+(?:\\.\\d+)?\\s*fl\\.?\\s*oz\\b)?|\\b${OZ_SIZE_RE.source}`,
  'gi',
);

/** The millilitre value a single SIZE_TOKEN_RE match states, by the same reading sizeMl() would give it. */
function sizeTokenValueMl(token: string): number {
  const ml = token.match(ML_SIZE_RE);
  if (ml) return Math.round(Number.parseFloat(ml[1]!));
  const oz = token.match(OZ_SIZE_RE)!;
  return Math.round(Number.parseFloat(oz[1]!) * OZ_TO_ML);
}

/**
 * Drop a size mention from a house product's name when it only repeats what
 * `sizeMl` already says as its own field — "Ashore 100ml" beside a 100ml
 * badge states the one fact twice. This is a house-products-only problem:
 * displayName above already strips every ml mention unconditionally for
 * retailer products (line 213), but a house listing's title passes straight
 * through as `rawTitle` with no brand or concentration stripping either,
 * because a house's own titles rarely repeat the brand or spell out a
 * concentration the way a general retailer's do — so nothing upstream ever
 * touches its size. Measured against the live house catalogue: 1,356 of
 * 2,514 names carried one.
 *
 * Deliberately narrower than displayName's blanket strip in three ways,
 * because a mangled product name is a worse failure than a verbose one:
 *
 *  - Exactly one size mention, no more. A name with two or more —
 *    "ALEX ENABLE 150ML 150 ML" (the same size stated twice), "Molecule 01
 *    8.5ml + Escentric 01 8.5ml" (two different bottles bundled, each with
 *    its own size), "SHAGHAF AMBER INFUSION 75 ML + SHAGHAF OUD ROYALE 25
 *    ML" (two different products at two different sizes) — is left exactly
 *    as it is. Telling "the size is stated twice by accident" apart from
 *    "the size is part of what is being sold, twice, on purpose" is not a
 *    call this function can make from the text alone, and a wrong guess
 *    mangles a real product name. Measured: 95 house names carry more than
 *    one size mention.
 *
 *  - Multi-vial notation — "5x2ml", "(2x7ml)", "2x90 ml" — is identity, not
 *    packaging noise: a discovery set's size *is* "5x2ml", not a single 2ml
 *    bottle repeating a badge that would read "5x2ml" beside it. SIZE_TOKEN_RE's
 *    own leading `\b` is what keeps this function out of that decision
 *    rather than needing a separate rule for it — see that comment. sizeMl()
 *    still assigns these a value (it reads "90" straight out of "2x90 ml"
 *    with no boundary check of its own), so the two stay in step: a size the
 *    app can show as a badge, in a name this function leaves alone. Checked:
 *    17 house names are multi-vial notation this way, all left untouched.
 *
 *  - The mention must agree with `sizeMl`. A title reading one size beside a
 *    `sizeMl` field reading another is not redundancy, it is two facts in
 *    conflict, and silently deleting the text one would hide a real
 *    disagreement a reader might otherwise have caught. Left untouched
 *    rather than guessed at — measured: 0 of the live house catalogue's
 *    single-mention names disagree with their own `sizeMl` today, but the
 *    check stays because a future harvest is not guaranteed to.
 *
 * A name that is only ever a size — "100ml" and nothing else — is also left
 * alone rather than emptied. None exist in the catalogue today, but an empty
 * product name is not something the app can render if one ever does.
 */
export function stripRedundantSize(name: string, sizeMl: number | null): string {
  if (sizeMl == null) return name;
  const tokens = [...name.matchAll(SIZE_TOKEN_RE)];
  if (tokens.length !== 1) return name;
  const token = tokens[0]!;
  if (sizeTokenValueMl(token[0]) !== sizeMl) return name;
  const stripped = (name.slice(0, token.index) + name.slice(token.index! + token[0].length))
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,\-&|]+|[\s,\-|]+$/g, '')
    .trim();
  return stripped || name;
}
