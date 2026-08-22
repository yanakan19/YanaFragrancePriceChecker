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
import { brandKey } from './brandName.js';

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
/**
 * Perfume oil, checked ahead of everything else because it is the one form
 * whose own name contains a weaker phrase that would otherwise claim it.
 *
 * "Al Haramain Musk Concentrated Perfume Oil 12ml Roll-On" is not a perfume
 * that happens to mention oil; the oil is what it is. But the generic tier
 * below sees "perfume" sitting inside "perfume oil", matches it, and files a
 * 12ml roll-on oil under the same label as a 100ml eau de parfum spray. That
 * is how a whole product form went missing: 150 titles across the harvest
 * name themselves an oil in so many words, from Al Haramain, Al Rehab, Ard Al
 * Zaafaran, Surrati, Orientica, Lattafa, Afnan and Ahsan among others, and
 * every one of them was filed as "Perfume".
 *
 *   npx tsx scripts/concentration-report.ts
 *
 * Only the explicit phrases, never a bare "oil". 643 harvested titles carry
 * the bare word and they are body oil, face oil, lip oil, cleansing oil and
 * hair oil; the word on its own says nothing about perfume. "attar" is
 * deliberately not here either, even though an attar is a perfume oil: two of
 * the houses in this catalogue are *called* Attar ("Attar & Co Arabian Oud
 * Intense Parfum 100ml Spray", "Ahsan Attar Full Eau De Parfum 100ml Spray"),
 * both of which are sprays, so the word is a brand at least as often as it is
 * a form. It stays in the generic tier below, where every real concentration
 * word beats it.
 */
const CONCENTRATION_OIL =
  /\b(concentrated perfume oil|perfume oil|perfumed oil|fragrance oil)\b/i;
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
/**
 * What the concentration field says when the title named no concentration at
 * all, or named only a word that turns out to say nothing about strength.
 *
 * Its own value rather than a plausible-looking guess, and worded as what it
 * is. A shop that wrote "Perfume" told us the thing is perfume, which we knew
 * from the fact that it is in a perfume catalogue; it did not tell us whether
 * the bottle is an eau de toilette or an extrait. Filing that under a real
 * concentration would put a strength on a bottle on no evidence, and filing
 * it under its own label lets a reader see how much of the catalogue nobody
 * has actually described. Same reasoning, and the same words, as the "Not
 * stated" option on the gender filter in demo/gender.ts.
 */
export const CONCENTRATION_NOT_STATED = 'Not stated';

/**
 * Canonical display form per CONCENTRATION alternative, so "EDT" and "Eau De
 * Toilette" in two different retailers' titles both land on the identical
 * string. Without this, a naive title case of whatever phrase the title used
 * produced two different strings ("Eau de Toilette" from the abbreviation,
 * "Eau De Toilette" from the spelled out phrase) for the same concentration,
 * which then meant only one of the two ever matched the app's own
 * abbreviation table for the popular rail's compact size and concentration
 * label.
 *
 * Four decisions are recorded in this table, each about a value the facet was
 * offering that a reader could not act on. Counts are products in the
 * catalogue at d1d7099, from `npx tsx scripts/concentration-report.ts`.
 *
 * "Cologne" (46) and "Eau de Cologne" (136) are one value, not two. The
 * clearest evidence is inside a single shop's own list: Beautybase publishes
 * "4711 Cologne 300ml Bottle" and "4711 Original Eau de Cologne 200ml Splash",
 * which is one house's one product line written both ways. The rest of the
 * bare-Cologne set is the American drugstore spelling of the same form
 * (Stetson, Jovan, Halston, Brut, Coty Exclamation), where "Cologne" on the
 * bottle is the form's name. Splitting them left a reader picking between two
 * pills for one thing and seeing neither shop's full stock under either.
 *
 * "Perfume" (241) is not a concentration and never was. It is the plain
 * English word for the category, and it appears where a shop wrote no
 * strength: it has to stay in the match tiers, because isFragrance leans on
 * it to recognise a plain-English listing as perfume at all, but what it
 * tells us about strength is nothing. It goes to CONCENTRATION_NOT_STATED
 * rather than being merged into "Parfum", which is the error this whole note
 * exists to avoid: a label meaning "the shop did not say" quietly becoming a
 * label meaning "extrait strength".
 *
 * "Parfum" (306) stays exactly where it is, unmerged, for the mirror image of
 * that reason. It reads like a real stated concentration in the shops that
 * use it — Azzaro The Most Wanted Parfum, Le Male Elixir Parfum, Montblanc
 * Explorer Extreme Parfum, all from mainstream UK retailers that also list
 * the same lines as EDT and EDP — so calling it nothing would be as wrong as
 * calling "Perfume" something. Whether it is identical to Extrait de Parfum
 * is a real question with a real answer somewhere, and nobody here has
 * established it, so the two stay separate and neither claims the other.
 *
 * "Oud" (1) is a material, not a strength, and reached the field only because
 * it is last in the generic tier and one title had nothing else. Not stated.
 *
 * "Extrait De Parfum" (433) was the only value carrying its own capitalisation
 * because it was the only specific phrase with no entry here, so it fell
 * through to the blanket title-case at the foot of `concentration`. It is a
 * real concentration and keeps its own value; it just spells it the way the
 * other three "de" phrases already do.
 */
const CONCENTRATION_DISPLAY: Record<string, string> = {
  edp: 'Eau de Parfum', edt: 'Eau de Toilette', edc: 'Eau de Cologne',
  'eau de parfum': 'Eau de Parfum', 'eau de toilette': 'Eau de Toilette',
  'eau de cologne': 'Eau de Cologne', 'eau fraiche': 'Eau Fraiche',
  'extrait de parfum': 'Extrait de Parfum', 'extrait de toilette': 'Extrait de Toilette',
  'concentrated perfume oil': 'Perfume Oil', 'perfume oil': 'Perfume Oil',
  'perfumed oil': 'Perfume Oil', 'fragrance oil': 'Perfume Oil',
  parfum: 'Parfum', aftershave: 'Aftershave',
  cologne: 'Eau de Cologne', extrait: 'Extrait', attar: 'Attar',
  perfume: CONCENTRATION_NOT_STATED, oud: CONCENTRATION_NOT_STATED,
};

/**
 * Generic-tier words that can themselves be a fragrance's own naming
 * convention rather than a stated strength, when the word directly follows
 * the French article "le", "la" or "l'" — see precededByFrenchArticle for
 * the shape and NOMINAL_AFTER_FRENCH_ARTICLE for which words actually carry
 * it, checked against the real harvest rather than assumed.
 */
const NOMINAL_AFTER_FRENCH_ARTICLE_RE = /(?:^|[^a-z])(le|la|l)['’]?\s*$/i;

/**
 * A standalone size mention sitting right at the end of the text being
 * tested, so it can be looked past rather than treated as the word directly
 * before the concentration word. Built from ML_SIZE_RE/OZ_SIZE_RE for the
 * same reason SIZE_TOKEN_RE further down is: a second, hand-written size
 * pattern is a bug waiting to happen the moment either one changes.
 *
 * Needed because one feed (Fragrance Click) writes the size *between* the
 * naming article and the naming word instead of after both — "Jimmy Choo I
 * Want Choo Le 10ml Parfum" rather than "...Le Parfum 10ml" — for at least
 * five products (Jimmy Choo I Want Choo, Jean Paul Gaultier Divine For Her
 * and Scandal Pour Homme, Lancôme La Nuit Trésor, Prada Luna Rossa Ocean; 8
 * titles). Without looking past the size, "Le" reads as three tokens back
 * from "Parfum" rather than the immediately preceding word, and
 * precededByFrenchArticle below would miss it.
 */
const TRAILING_SIZE_RE = new RegExp(`\\s*(?:${ML_SIZE_RE.source}|${OZ_SIZE_RE.source})\\s*$`, 'i');

/**
 * Whether the text immediately before `index` in `title` ends in a
 * standalone "le", "la" or "l'" — the shape a house's own flanker name takes
 * ("<Name> Le Parfum"), as opposed to the word merely sitting somewhere in a
 * longer word ("Mademoiselle Parfum" does not end in a *standalone* "le":
 * the character right before it is a letter, not a boundary, so the
 * alternative here — `(?:^|[^a-z])` — refuses to match there). A single
 * trailing size mention is stripped first — see TRAILING_SIZE_RE — so a
 * title that states the size between the article and the naming word is
 * recognised exactly the same way as one that does not.
 */
function precededByFrenchArticle(title: string, index: number): boolean {
  const before = title.slice(0, index).replace(TRAILING_SIZE_RE, '');
  return NOMINAL_AFTER_FRENCH_ARTICLE_RE.test(before);
}

/**
 * Whether `index` in `text` is immediately preceded by an *elided* French
 * article — "l'"/"l’" glued straight onto the next word with no space, as
 * opposed to precededByFrenchArticle's "le "/"la "/"l' " with a gap. This is
 * the shape "L'Eau de Parfum" and "L'Eau de Toilette" take as a house's own
 * naming — Lancôme's Idôle "L'Eau de Parfum", Chloé's own "L'Eau de Parfum
 * Intense", Carven's eponymous "L'Eau de Toilette".
 *
 * Used for both CONCENTRATION_SPECIFIC's phrases and CONCENTRATION_GENERIC_PRIORITY's
 * bare words alike (stripGenuineConcentration below does not care which tier
 * matched it), and deliberately no per-word allowlist the way
 * NOMINAL_AFTER_FRENCH_ARTICLE has to be for the bare generic-tier "parfum":
 * French only elides the article before a vowel sound, so a word starting
 * with a consonant ("parfum", "cologne", "perfume", "attar") can never
 * follow an elided "l'" grammatically in the first place, and one starting
 * with a vowel that could ("eau...", "extrait...", "oud") is safe to check
 * structurally rather than by name. Checked against the harvest before
 * relying on that rather than assuming it (the same discipline
 * NOMINAL_AFTER_FRENCH_ARTICLE's own comment used): every
 * CONCENTRATION_GENERIC_PRIORITY word tried against `l['’]<word>\b` — zero
 * hits for "oud", "attar", "edp", "edt", "edc", "perfume", "aftershave",
 * "cologne" and the already-covered "parfum"; "extrait" is the one real
 * case, 6 titles, all Lancôme ("La Vie Est Belle Gold L'Extrait Eau De
 * Parfum", "Absolue L'Extrait Elixir..."), and it needs no special-casing
 * beyond this same structural rule — concentrationMatch reaches the generic
 * tier's bare "extrait" at all only when no CONCENTRATION_SPECIFIC phrase
 * exists in the title, and where one does ("L'Extrait Eau De Parfum") that
 * specific phrase is what gets matched and stripped instead, "L'Extrait"
 * left alone as the name decoration it is, exactly like "Aventus Cologne".
 *
 * Anchored the same way precededByFrenchArticle is — `(?:^|[^a-zA-Z])` so
 * "Mademoiselle" is never mistaken for the article sitting mid-word.
 */
const ELIDED_ARTICLE_RE = /(?:^|[^a-zA-Z])l['’]$/i;
function precededByElidedArticle(text: string, index: number): boolean {
  return ELIDED_ARTICLE_RE.test(text.slice(0, index));
}

/**
 * Which generic-tier words are known to carry the "<Name> Le X" naming
 * shape at all. Checked directly against the full harvest before being
 * added, the same way CONCENTRATION_OIL and the oud-last ordering above
 * were — not applied to every generic word on the assumption that any of
 * them might:
 *
 *   npx tsx scripts/concentration-report.ts (adapted to search each generic
 *   word for an immediately preceding "le"/"la"/"l'")
 *
 * "parfum" is the only one that does: 225 titles across at least eight
 * houses carry a "<Name> Le Parfum" flanker — Jean Paul Gaultier ("Scandal
 * Le Parfum", "'Le Male' Le Parfum", "Le Beau Le Parfum"), YSL ("Black
 * Opium Le Parfum", "Libre Le Parfum", "MYSLF Le Parfum", "Y for Men Le
 * Parfum"), Prada ("Paradigme Le Parfum", "Luna Rossa Ocean Le Parfum"),
 * Elie Saab ("Le Parfum", plus several of its own flankers — "Le Parfum
 * Absolu", "Le Parfum Essentiel"), Carolina Herrera ("Bad Boy Le Parfum"),
 * Chloé ("Le Parfum"), Jimmy Choo ("I Want Choo Le Parfum") and Nuxe ("Men
 * Le Parfum") — none of them a coincidence, this is a real, common
 * perfumery naming convention, the exact reason "Le Parfum" reads as a
 * flanker line the same way Creed's own "Cologne" does in Aventus Cologne
 * above, not a strength. "cologne", "extrait", "attar", "oud" and the rest
 * of CONCENTRATION_GENERIC_PRIORITY never occur directly after "le"/"la"/
 * "l'" anywhere in the harvest (0 titles each, checked the same way) — this
 * is deliberately not a blanket rule applied to every word on the strength
 * of one example, which is exactly the mistake this file's own module doc
 * warns brandName.ts's KNOWN_ALIASES against making for brands.
 *
 * The specific "eau de X" phrases (CONCENTRATION_SPECIFIC) are never
 * checked against this at all — "Escada Sorbetto Rosso Le Eau De Toilette"
 * is real, and "Le" there is stray feed noise ahead of a genuine stated
 * concentration, not a naming convention (no house anywhere in the
 * catalogue markets a line called "Le Eau De Toilette"). Restricting the
 * check to the generic tier, and to this one measured word within it, is
 * what keeps that title's real "Eau De Toilette" concentration intact
 * while still protecting "Le Parfum".
 */
const NOMINAL_AFTER_FRENCH_ARTICLE = new Set(['parfum']);

/**
 * The first occurrence of a generic-tier word that actually states a
 * strength, skipping any occurrence NOMINAL_AFTER_FRENCH_ARTICLE flags as
 * "<Name> Le X" instead. Falls through to the next word in
 * CONCENTRATION_GENERIC_PRIORITY exactly as a title with no occurrence at
 * all would — same as returning null from a plain `.match()` — so a title
 * carrying nothing but "Le Parfum" and no other concentration word ends up
 * "Not stated", the honest answer, rather than either "Parfum" (wrong: that
 * is naming, not strength) or a guessed real concentration.
 *
 * Real two-mention case this exists to get right, not merely tolerate:
 * "Jean Paul Gaultier Divine Le Parfum Eau De Parfum Intense 200ml Refill"
 * carries "Parfum" twice — once nominally in "Le Parfum" and once for real
 * in "Eau De Parfum" — but that second one is CONCENTRATION_SPECIFIC's own
 * phrase, checked and returned before this function is ever reached, so it
 * is never in question here at all.
 */
function firstGenuineOccurrence(title: string, pattern: RegExp): string | null {
  const global = new RegExp(pattern.source, `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = global.exec(title))) {
    if (!precededByFrenchArticle(title, m.index)) return m[0];
  }
  return null;
}

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
  // Ahead of the specific tier, not inside it: see CONCENTRATION_OIL. A
  // title that names an oil has named the form, and the only phrase that
  // could outrank it is one naming a strength the oil does not have.
  const oil = title.match(CONCENTRATION_OIL)?.[0];
  if (oil) return oil;
  const specific = title.match(CONCENTRATION_SPECIFIC)?.[0];
  if (specific) return specific;
  for (const word of CONCENTRATION_GENERIC_PRIORITY) {
    const pattern = CONCENTRATION_GENERIC_PATTERNS[word]!;
    const hit = NOMINAL_AFTER_FRENCH_ARTICLE.has(word)
      ? firstGenuineOccurrence(title, pattern)
      : title.match(pattern)?.[0];
    if (hit) return hit;
  }
  return null;
}

/**
 * Concentration as a display string.
 *
 * A title naming nothing used to come back as "Fragrance", which reads like a
 * category rather than an admission and sat in the filter beside real
 * concentrations as though it were one. It is the same non-answer that
 * "Perfume" and "Oud" turn out to be, so all three now give the same one, in
 * words that say so. Only fragrance-only storefronts can reach the null case
 * at all — everywhere else isFragrance requires a concentration word before a
 * listing is published — which is why the whole of that bucket is one house's
 * own shop.
 */
export function concentration(title: string): string {
  const raw = concentrationMatch(title);
  if (!raw) return CONCENTRATION_NOT_STATED;
  const key = raw.toLowerCase();
  return CONCENTRATION_DISPLAY[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Drop diacritics so an accented spelling folds onto the plain one before a
 * brandKey comparison — brandKey on its own only deletes a non-ASCII letter
 * ("ô" is filtered out, not replaced), so "Lancôme" and "Lancome" land on
 * different keys ('lancme' vs 'lancome') even though they are the same
 * brand two rows of the same feed spelled two ways. Same technique
 * fragranceId.ts's own `fold` uses for the same reason (an accented
 * concentration word must match the plain one), reimplemented here as one
 * line rather than imported, because `fold` there is not exported and pulls
 * in the mojibake-repair machinery this one line does not need.
 */
const foldDiacritics = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

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
 * Which spelling of the brand the title actually *closes* with, if any —
 * brandTitleOpens' mirror image, for the shops that append their own vendor
 * field to the end of the title instead of opening with it.
 *
 * Real, measured cases from the live catalogue, all Emirates Oud: "Shaghaf
 * Oud Perfume 75ml Swiss Arabian", "Shaghaf Oud Royale Perfume 75ml EDP
 * Swiss Arabian", "Costa de Amalfi Perfume 100ml EDP Riiffs" — the last of
 * those is the exact example brandTitleOpens' own test coverage already
 * cites as a title it deliberately leaves alone, because opening-only was
 * the whole story until this was written. Across the full catalogue, 1,904
 * products carry their own brand trailing their name this way, across 96
 * brands, and 341 of them have an exact sibling elsewhere in the catalogue
 * that would fold into a single product once this is stripped and nothing
 * else about the two listings differs — measured with
 * scripts/trailing-brand-report.ts.
 *
 * ── Why this reuses brandKey instead of matching the candidate spelling verbatim ──
 * brandTitleOpens can afford to test the exact candidate string because the
 * candidates it is given (displayedBrand, the resolved raw brand) are
 * spellings *that source actually published*, so a byte-for-byte match at
 * the front of the very same title is the normal case. The trailing
 * position does not get that luxury: a shop that appends its vendor field
 * to a title is exactly the kind of shop whose feed also disagrees with
 * itself about spacing — "Swiss Arabian" as the vendor field, "SwissArabian"
 * glued together in one product's own title, both observed in the same
 * feed. Matching the candidate string verbatim would silently do nothing
 * for the glued form and leave the brand sitting in the display name, the
 * exact bug this function exists to fix. So the comparison is done on
 * brandKey — letters and digits only, lowercased, the same normalisation
 * brandName.ts already trusts to say "same brand, different decoration" —
 * built up token by token from the end of the title until it matches a
 * candidate's own brandKey exactly. A genuinely different trailing word
 * never reaches that length or never reaches that key, so nothing but an
 * actual match on the resolved brand is ever stripped.
 *
 * Anchored strictly at the end: matching stops the moment anything but
 * trailing whitespace follows the last token, so a brand name that happens
 * to sit mid-title, or is followed by trailing punctuation that changes its
 * meaning, is never mistaken for the trailing case. Longest candidate wins
 * on a tie, for the same reason as brandTitleOpens: preferring a shorter
 * candidate risks leaving a fragment of the longer one sitting in the name.
 */
export function brandTitleEnds(title: string, candidates: (string | null)[]): string | null {
  const tokens = [...title.matchAll(/[A-Za-z0-9]+/g)];
  if (tokens.length === 0) return null;
  const lastToken = tokens[tokens.length - 1]!;
  // Nothing but whitespace may follow the last word-ish token, or this is
  // not the trailing case at all — "Joop!" ending in punctuation after the
  // brand's own name is a different, already-handled shape (brandTitleOpens),
  // not this one.
  if (!/^\s*$/.test(title.slice(lastToken.index! + lastToken[0].length))) return null;

  let longestSpan: string | null = null;
  let longestCandidate: string | null = null;
  for (const b of candidates) {
    if (!b) continue;
    if (longestCandidate !== null && b.length <= longestCandidate.length) continue;
    const wantKey = brandKey(b);
    if (!wantKey) continue;
    let acc = '';
    for (let i = tokens.length - 1; i >= 0; i--) {
      acc = brandKey(tokens[i]![0]) + acc;
      if (acc.length > wantKey.length) break;
      if (acc === wantKey) {
        longestSpan = title.slice(tokens[i]!.index!);
        longestCandidate = b;
        break;
      }
    }
  }
  return longestSpan;
}

/**
 * The manufacturers named in a trailing "<brand> by <house>" credit —
 * "Zimaya By Afnan", "Pendora Scents by Paris Corner" — that brandTitleEnds
 * alone can never reach, because the title does not end with the brand: it
 * ends with the house that made it, one word later.
 *
 * A small, explicit, measured set, the same discipline
 * NOMINAL_AFTER_FRENCH_ARTICLE above already uses for "which generic-tier
 * word actually carries the 'Le X' shape" — not "any word after by", which is
 * the rule that was tried and rejected. 170 CATALOGUE titles contain a `by
 * <word>` construction and the overwhelming majority are real fragrance
 * names, not a brand credit: "By Night" (Christina Aguilera's whole name),
 * "Wanted By Night" (Azzaro), "Flower by Kenzo ..." (Kenzo's own line,
 * several flankers), "Chloe by Chloe Rollerball", "F by Ferragamo Free Time"
 * and "F by Ferragamo Black" (Salvatore Ferragamo), "Guess by Marciano"
 * (Guess's own diffusion line). Every one of those must survive untouched —
 * see tests/productName.test.ts for all of them pinned.
 *
 * Checked against the full harvest (every rawTitle in data/catalogue/*.json)
 * for the exact narrow shape this strips: a candidate brand anchored
 * immediately before " by ", brandKey-matched the same way brandTitleEnds
 * matches its own candidates, with nothing but the house's name following it
 * to the end of the title. 115 titles carry that shape; 14 of them are the
 * counter-examples just listed, where the word after "by" is not a
 * manufacturer at all ("Night", "Marciano", "The Fireplace", "Petra") but
 * part of the fragrance's own name — and every one of those 14 is *also*
 * followed by more of the title (a concentration, a size, "Rollerball") after
 * the word right past "by", the same "this is not actually the end" tell
 * displayName's own pipeline already resolves for most of them by stripping
 * the brand off the *front* first (see the module's `s` variable) before this
 * function ever runs. What is left once concentration, size and any opening
 * brand are already stripped and only genuinely mattered here — Guess's own
 * "Guess by Marciano" — is excluded because "Marciano" is not a name any
 * shop anywhere in the catalogue sells fragrance under; "Afnan", "Fragrance
 * World" and "Paris Corner" are, 62, 3 and 3 rawTitle/rawBrand rows
 * respectively (`grep -c '"rawBrand": "Afnan"' data/catalogue/*.json` etc.).
 * The remaining 101 titles are all real: one retailer (Emirates Oud)
 * crediting three real manufacturers (Afnan, Fragrance World, Paris Corner)
 * this way for their own sub-brands (Zimaya, Pendora Scents, French Avenue).
 *
 * Returns the whole span to remove — "Zimaya By Afnan", not just "Zimaya" —
 * so the caller need not know the house was ever there.
 */
const KNOWN_TRAILING_HOUSES = new Set(['afnan', 'fragranceworld', 'pariscorner']);

export function brandTitleEndsWithHouse(title: string, candidates: (string | null)[]): string | null {
  const m = title.match(/\s+by\s+(\S(?:.*\S)?)\s*$/i);
  if (!m) return null;
  if (!KNOWN_TRAILING_HOUSES.has(brandKey(m[1]!))) return null;
  const pre = title.slice(0, m.index!);
  const closer = brandTitleEnds(pre, candidates);
  if (!closer) return null;
  return title.slice(pre.length - closer.length);
}

/**
 * Remove the one occurrence of a matched CONCENTRATION_SPECIFIC phrase that
 * actually states the strength, skipping any occurrence sitting directly
 * after an elided "L'" — see precededByElidedArticle for the shape and why
 * it needs no per-word allowlist the way firstGenuineOccurrence's does.
 *
 * If every occurrence in `s` carries the elided article, nothing is
 * stripped and the whole phrase stays in the name: there is no second,
 * purely redundant restatement to remove instead, so taking out the only
 * one there is would delete the fragrance's own name for a badge the
 * `concentration` field already states on its own — it is derived from
 * `concentrationMatch(title)` directly and does not consult this function,
 * exactly the same separation of "what the strength is" from "what stays in
 * the name" as Aventus Cologne's "Cologne" above.
 *
 * Real two-occurrence case this exists to get right, not merely tolerate:
 * Carven's own "L'Eau de Toilette Eau de Toilette 100ml Spray" states the
 * identical phrase twice — once as the fragrance's actual name (Carven's
 * eponymous line really is called "L'Eau de Toilette"), once as a plain
 * restated concentration, the same shape Aramis restates "Eau de Toilette"
 * beside its own eponymous name in the block below. Only the second,
 * genuinely redundant occurrence comes off; the first stays because it is
 * the name, not filler.
 *
 * Measured before writing this (checked every CATALOGUE product name against
 * /\bL['’]\s*$/i and /\bL['’]\s+\S/, the exact shapes an unconditional single
 * strip produces when it eats the wrong occurrence): 21 mangled names, all
 * Lancôme, Chloé or Carven — "(Lancôme) Idôle Nectar L'", "Chloe L' Intense",
 * "Carven L' Eau de Toilette" among them — see tests/productName.test.ts for
 * the full set, each now pinned to its corrected name.
 */
function stripGenuineConcentration(s: string, phrase: string): string {
  const global = new RegExp(`\\b${escapeRe(phrase)}\\b`, 'gi');
  const matches = [...s.matchAll(global)];
  const genuine = matches.find((m) => !precededByElidedArticle(s, m.index!));
  if (!genuine) return s;
  return s.slice(0, genuine.index!) + s.slice(genuine.index! + genuine[0].length);
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
    s = stripGenuineConcentration(s, matchedConcentration);
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

  // A shop that puts its own brand in parentheses ahead of the name instead
  // of opening with it plainly — "(Lancôme) Idôle Nectar L'Eau de Parfum" —
  // repeats a fact the brand field already states, the same redundancy
  // brandTitleOpens strips for the plain-text case; brandTitleOpens itself
  // never catches it because "(Lancôme)" does not literally start with
  // "Lancôme". Checked on brandKey rather than the exact candidate string,
  // for the same reason brandTitleEnds is (beautybase's own feed spells the
  // parenthesised prefix "(Lancome)" without the accent in one title,
  // "(Lancôme)" with it in the next, while its rawBrand field is always
  // accented — the candidate list brandTitleEnds already relies on has no
  // unaccented spelling to match against at all here). brandKey alone still
  // is not enough for that pair — it deletes "ô" rather than folding it to
  // "o", so "Lancome" and "Lancôme" land on different keys ('lancome' vs
  // 'lancme') — hence foldDiacritics ahead of it, checked directly against
  // this exact case before relying on it.
  //
  // 23 CATALOGUE names open this way, measured against the live build; 20 of
  // them are this exact Lancôme shape and come off cleanly. The other 3 are
  // the trap a looser rule would walk into: Missoni's "(2015)" and Tous's
  // "(Gold)" also open with a parenthesised word, but "2015" and "Gold" are
  // not that product's brand — one is a reformulation-year marker (the same
  // shape brandTitleEnds' own "Femme (Rochas)" test guards, just at the
  // front instead of the back), the other a shade name — and neither's
  // brandKey matches any candidate here, so this leaves both exactly as they
  // are.
  const parenBrand = s.match(/^\(([^()]+)\)\s*/);
  const parenBrandKey = parenBrand ? brandKey(foldDiacritics(parenBrand[1]!)) : '';
  if (parenBrandKey && [displayedBrand, brand].some((c) => c && brandKey(foldDiacritics(c)) === parenBrandKey)) {
    s = s.slice(parenBrand![0].length);
  }

  // The mirror image of the opener strip above: a shop that appends its own
  // vendor field to the *end* of the title instead of opening with it — see
  // brandTitleEnds for the measured scale (1,904 products, 96 brands) and why
  // it has to compare on brandKey rather than an exact candidate spelling.
  // Run against the already-cleaned `s`, not the raw title, because the size,
  // spray-word and concentration strips above never touch the true tail —
  // the brand a shop appends sits after all of that in the raw text, so it
  // still sits at the end of `s` once the rest is gone.
  //
  // Tried first, and only for the narrow measured shape it covers, is
  // brandTitleEndsWithHouse — "<brand> by <house>", where the title closes
  // with the manufacturer's own credit rather than the bare brand. See that
  // function's own comment for why the check has to stay this narrow: a
  // generic "brand anywhere, then by, then anything" rule is exactly the one
  // that was measured and rejected for wrecking 14 real fragrance names.
  const closer = brandTitleEndsWithHouse(s, [displayedBrand, brand]) ?? brandTitleEnds(s, [displayedBrand, brand]);
  if (closer) {
    s = s.slice(0, s.length - closer.length);
    // A shop that appends its own brand often prefixes that append with the
    // bare, generic word "Perfume" — "Shaghaf Oud Royale Perfume 75ml EDP
    // Swiss Arabian". Where "EDP" (not "Perfume") supplied the concentration
    // badge above, that "Perfume" is never consumed by the concentration
    // strip and is left sitting immediately in front of the brand just
    // removed. Stripped only here, immediately adjacent to a brand this
    // function has just confirmed was genuinely appended — never elsewhere
    // in the name, where "Perfume" may be doing real work (see
    // CONCENTRATION_OIL's "Perfume Oil": that phrase's last word is "Oil",
    // not "Perfume", so this can never reach it).
    s = s.replace(/\s+perfume\s*$/i, '');
    // The brand strip above already trims stray leading/trailing separators
    // once; removing more text off the end here can expose a fresh one
    // ("Name -" once "- Brand" is gone), so the same trim runs again.
    s = s.replace(/[\s,\-&|]+$/g, '');
  }

  // A fragrance named after its own house, the mirror-image half of this same
  // case: stripping the brand doesn't leave *nothing*, it leaves nothing but
  // a bracketed qualifier — "Missoni (2015) Eau de Parfum 30ml Spray" and
  // "Tous (Gold) Eau de Parfum 50ml Spray" (both e23137c already refused to
  // strip as a brand-repeating prefix, correctly: "2015" and "Gold" are not
  // that product's brand). The qualifier isn't a second name replacing the
  // brand, it's a modifier of it — Missoni's fragrance is called "Missoni
  // (2015)", not "(2015)" — so displaying the bracket alone reads exactly
  // like the trailing-brand bug this file's own history keeps fixing: one
  // real fact (the house) silently dropped, leaving a fragment standing in
  // for the whole name.
  //
  // Measured how much wider than these two products the "stripping leaves
  // no real word behind" problem is before writing a rule for it, the same
  // way every other rule in this function was sized: every product name in
  // the live CATALOGUE that is 4 characters or shorter, and every one that is
  // exactly a common qualifier word (Homme/Femme/Man/Woman/Gold/Black/
  // Intense/Original/a bare year...), checked by hand. All of them but these
  // four are a house's own real product name — Dior "Homme", DKNY "Women",
  // Histoires de Parfums "1804"/"1826"/"1876", Xerjoff "1888", CK "One" — not
  // a stripped-down fragment; a rule broad enough to also catch those would
  // prepend a brand that is already the whole point of the name being just
  // that one word. Only the fully-bracketed shape — nothing outside a single
  // "(...)" survives the strip at all — is the one measured to actually be
  // this bug, so only that shape is handled.
  if (/^\([^()]*\)$/.test(s)) {
    const eponym = displayedBrand || brand;
    if (eponym) s = `${eponym} ${s}`;
  }

  // A fragrance named after its own house outright: stripping the brand, the
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

/**
 * Letters and digits only, diacritics folded first, for a loose "does this
 * text already say that word" check — the same normalisation brandTitleEnds
 * above uses to compare on brandKey rather than an exact spelling, reused
 * here for the identical reason: a shop's own title spells a sub-line's
 * apostrophe, spacing or accent inconsistently, and a byte-for-byte
 * containment check would miss "L'Homme" sitting in a name as "LHomme" or
 * "L Homme".
 */
const containsKey = (s: string): string => foldDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Put back an Armaf sub-line name a product's own `name` field never stated
 * in the first place — the gap the 2026-08-21 "Fold the 51 'Armaf - <line>'
 * brand strings" commit flagged rather than fixed (see the comment on
 * brandName.ts's Armaf alias block, and armafLineName just above it, for the
 * full reasoning and the exact 51-string list this only ever fires for).
 *
 * `line` is armafLineName's return for the product's own originating raw
 * brand string — null for every product that fold did not touch, in which
 * case this is a no-op. Where it is a real sub-line name, this only prepends
 * it when the name does not already say so: most of the 178 products this
 * fold applies to already carry their sub-line in their own title ("Club De
 * Nuit Intense Man" already says Club De Nuit), and prepending it there too
 * would double it up rather than restore something missing. The remaining
 * ~24 (Delicacy's, Landi's, Miss Armaf's, Oros Pure's and one of Le
 * Parfait's, at the 2026-08-21 measurement — see
 * tests/productName.test.ts for the live re-measurement this is pinned to)
 * never mention the line at all — "Cotton Candy" under Delicacy, "Affecte"
 * under Oros Pure — and it is those that gain the prefix.
 *
 * Deliberately called once, after every same-bottle merge has already
 * happened (scripts/build-demo-catalogue.ts calls this only on the final,
 * post-merge product record) rather than inline in displayName above: two
 * shops selling the identical Armaf bottle are folded together by matching
 * brand, size, concentration and the *exact* set of words in the name
 * (src/catalogue/productMatch.ts's matchKey) — prepending a sub-line name to
 * only one shop's copy of that name before the merge runs would change its
 * word set and silently stop it matching the other shop's otherwise-identical
 * listing, un-merging a product that correctly merges today. Reattaching only
 * the final, already-merged name has no such effect: nothing after this point
 * reads `name` to decide whether two things are the same product.
 *
 * Format matches how the majority of Armaf sub-lines that already state
 * their own name do it — the line name first, then the rest ("Club De Nuit
 * Intense Man", "Club De Nuit Bling"), not appended or bracketed — so
 * "Cotton Candy" under Delicacy becomes "Delicacy Cotton Candy", the same
 * shape as every already-correct Armaf product beside it.
 *
 * One sub-line's own name is itself two words that share one with the
 * product names under it: "Miss Armaf". A shop that shortens "Miss Armaf
 * Attitude" drops "Armaf" and keeps "Miss" — Armaf's own titles read "Miss
 * Attitude", "Miss Chic", "Miss Voce Vive" — rather than dropping the whole
 * line, unlike every other affected line here (Delicacy, Delights, Landi,
 * Oros Pure, Tennis), where the shop's shortened title keeps none of the
 * line's own words at all. Confirmed against three other shops selling the
 * identical products under their full name verbatim — "Miss Armaf Attitude
 * Eau De Parfum 100ml" (data/catalogue/mybeauty-boutique.json,
 * perfume-click.json), "Armaf Miss Armaf Grandeur Eau De Parfum 100ml Spray"
 * (beautybase.json) — never once "Miss Armaf Miss Attitude". Prepending the
 * line unconditionally would double that shared word, a form no shop
 * anywhere actually uses; dropping the leading word only when it is the same
 * word the line itself starts with is narrow enough that it can never fire
 * for the other five lines, none of which share a leading word with any of
 * their own affected product names.
 */
export function reattachArmafLine(name: string, line: string | null): string {
  if (!line) return name;
  const key = containsKey(line);
  if (!key || containsKey(name).includes(key)) return name;
  const lineWords = line.split(/\s+/);
  const nameWords = name.split(/\s+/);
  const rest =
    nameWords.length > 1 && lineWords[0]!.toLowerCase() === nameWords[0]!.toLowerCase()
      ? nameWords.slice(1).join(' ')
      : name;
  return `${line} ${rest}`.trim();
}
