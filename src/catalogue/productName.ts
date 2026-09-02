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
 *
 * 2026-09-01: the same leftmost-not-most-specific failure was still live one
 * level *up* — inside CONCENTRATION_SPECIFIC's own single alternation, which
 * this function used to hand straight to `.match()` unmodified. Two of its
 * six alternatives, "eau fraiche" and "eau de parfum", both genuinely occur
 * in real titles — Versace's own "Eau Fraiche Extreme" and "Eau Fraiche"
 * lines (also Lacoste's L.12.12 "Rose Eau Fraiche", Elizabeth Arden's "White
 * Tea Eau Fraiche", Estée Lauder's "Bronze Goddess Eau Fraiche", Revlon's
 * "Charlie Red Eau Fraiche", Angel Schlesser's own "Eau Fraiche Citrus
 * Marino") name "Eau Fraiche" as part of the fragrance's own line, exactly
 * the same shape as Creed's "Cologne" above, with the real stated strength
 * ("Eau De Toilette"/"Eau De Parfum") sitting later in the same title.
 * `.match()` against the combined alternation still scans left to right and
 * still stops at the first alternative to match at the earliest position —
 * "eau fraiche" beat "eau de parfum" in "Versace Eau Fraiche Extreme Eau De
 * Parfum 50ml Spray" for that reason alone, mislabelling the concentration
 * "Eau Fraiche" and leaving "Eau De Parfum" sitting unremoved in the display
 * name. Confirmed by running concentrationMatch directly against that exact
 * rawTitle from data/catalogue/beautybase.json before touching anything:
 * it returned "Eau Fraiche". Two EANs (8011003890972, 8011003890989) had
 * this patched in CONCENTRATION_RESOLUTIONS rather than at the root; those
 * two override entries were removed once this fix made them redundant —
 * verified by removing them and rebuilding before deleting them for real:
 * identical audit counts either way, and both EANs' own `concentration`
 * field still comes out "Eau de Parfum" with no override consulted. See
 * CONCENTRATION_RESOLUTIONS' own 2026-08-27 second-pass note for where they
 * used to sit.
 *
 * One EAN this fix corrects that the audit-driven override table could
 * never have reached at all: ean-8011003890996, Versace Eau Fraiche Extreme
 * 200ml. Both shops selling it (beautybase, perfume-click) spell the line
 * name in unaccented ASCII at that size — "Versace Man Eau Fraiche Extreme
 * Eau de Parfum 200ml Spray" — so both titles hit the identical leftmost bug
 * and both computed "Eau Fraiche", agreeing with each other and therefore
 * never flagged as a contradiction, never entering CONCENTRATION_RESOLUTIONS'
 * reach at all. It sat wrong, silently, until this root-cause fix.
 *
 * longestSpecificMatch below is the fix: every occurrence of every
 * CONCENTRATION_SPECIFIC alternative in the title is found (not just the
 * first), and the textually longest one wins, regardless of where it sits.
 * This is a safe proxy for "most specific" here specifically because the six
 * alternatives happen to have six distinct lengths (11 to 20 characters), so
 * there is never a tie to break arbitrarily, and because "eau fraiche" — the
 * one alternative that is also a common line name — is the shortest of the
 * six, so it can only ever lose to a real stated concentration elsewhere in
 * the same title, never wrongly beat one. Measured against every title in
 * data/catalogue/*.json carrying more than one distinct CONCENTRATION_SPECIFIC
 * alternative (66 titles, `scripts/concentration-specific-multi-report.ts`):
 * the other 60-odd are multi-item gift sets genuinely naming two or three
 * different concentrations for two or three different bottles in one listing
 * ("Eau De Toilette 15ml & Eau De Parfum 15ml & Parfum 15ml Gift Set") — for
 * those there was never one true single answer, leftmost was already
 * arbitrary, and swapping to longest is neither better nor worse, just a
 * different arbitrary pick among several truths. Only the "eau fraiche"
 * cases have one actually-correct answer, and longest gets every one of them
 * right. See scripts/build-demo-catalogue.ts's rebuild for the measured
 * blast radius across the live catalogue.
 */
function longestSpecificMatch(title: string): string | null {
  const global = new RegExp(CONCENTRATION_SPECIFIC.source, `${CONCENTRATION_SPECIFIC.flags}g`);
  let longest: string | null = null;
  for (const m of title.matchAll(global)) {
    if (!longest || m[0].length > longest.length) longest = m[0];
  }
  return longest;
}
export function concentrationMatch(title: string): string | null {
  // Ahead of the specific tier, not inside it: see CONCENTRATION_OIL. A
  // title that names an oil has named the form, and the only phrase that
  // could outrank it is one naming a strength the oil does not have.
  const oil = title.match(CONCENTRATION_OIL)?.[0];
  if (oil) return oil;
  const specific = longestSpecificMatch(title);
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

/**
 * What the concentration field says when two shops' own titles genuinely
 * disagree about it — "Eau de Parfum" and "Parfum" for the same barcode, not
 * one shop naming a strength and another naming none (see
 * productMatch.ts's byConcentration bridge for that case, which is not a
 * disagreement and never reaches this value).
 *
 * scripts/build-demo-catalogue.ts's concentration audit is what decides a
 * product needs this: every shop selling it shares one EAN, which is the
 * manufacturer's own word that this is one bottle (see productMatch.ts's
 * header on how much weight a real barcode carries here), so the two
 * different words are one shop's mislabelling, not two products merged. But
 * *which* shop is mislabelled needs the manufacturer's own listing to settle,
 * and the proxy this project's harvest runs behind refuses every brand and
 * retailer domain — see the audit's own comment for the two live examples
 * (Yardley Gentleman Classic 100ml, Lancôme La Vie Est Belle Rose
 * Extraordinaire 30ml) that motivated this field.
 *
 * Picking one shop's word anyway — which is what this field used to do,
 * silently, by nothing more principled than which retailer's snapshot file
 * happened to sort first on disk — states a fact nobody here can stand
 * behind. This value states the true fact instead: the bottle is real, the
 * offers on it are real, and what it says on the label is contested. See
 * CONCENTRATION_NOT_STATED just above for the same reasoning applied to
 * silence rather than to a dispute.
 *
 * 2026-08-27 update: WebSearch (unlike a direct fetch) is not blocked by the
 * harvest's egress proxy, and the owner approved using it to chase down the
 * manufacturer's own word for the remainder. See CONCENTRATION_RESOLUTIONS
 * just below for what that pass actually settled.
 */
export const CONCENTRATION_DISPUTED = 'Disputed';

/**
 * A curated, EAN-keyed override for the disputes CONCENTRATION_DISPUTED
 * would otherwise flatten to "Disputed" — settled by a 2026-08-27 WebSearch
 * pass, not by anything on disk. Consumed in scripts/build-demo-catalogue.ts
 * at the exact point a contradiction is found: a resolved EAN gets its true
 * concentration instead of the generic dispute label; an unresolved one
 * still gets CONCENTRATION_DISPUTED, unchanged.
 *
 * ── THE EVIDENCE BAR (owner ruling, 2026-09-02 — read this before adding or
 * refusing an entry) ──
 *
 * Two independent routes clear it. They are alternatives, not conditions to
 * be met together. Either one is sufficient on its own:
 *
 *   (A) THE MANUFACTURER'S OWN WORD about its own product, read on the
 *       manufacturer's own domain, naming this product at this size. This is
 *       sufficient BY ITSELF. A retailer's title that says something else does
 *       not block it and never has to be argued away: a shop mislabelling a
 *       bottle does not make the house that filled the bottle wrong. This is
 *       the whole point of the ruling — a contradicting retailer title is
 *       simply outranked, not weighed.
 *
 *   (B) OVERWHELMING INDEPENDENT AGREEMENT, where the manufacturer is silent,
 *       unreachable, or says something this codebase's vocabulary cannot
 *       express. Here — and ONLY here — a persisting title-level contradiction
 *       from a second, equally independent source does still disqualify, for
 *       the reason it always did: with no manufacturer to break the tie there
 *       is nothing left to prefer one retailer's word over another's.
 *
 * For (A), the manufacturer must genuinely have been *read*: a real prior
 * citation in this file naming what its own domain said, or a retrieval done
 * in the pass that adds the entry. "The house presumably calls it X" is not
 * route (A) and never counts. Three real ways route (A) fails to apply even
 * though the domain was opened, all of them live in the log below: the house
 * has no storefront at all (French Avenue); its own page names no
 * concentration (calvinklein.us, ahmedalmaghribi.co.in), or its own regional
 * sites disagree with each other (Ahmed Al Maghribi) or with themselves
 * (azzaro.com's title says "Eau de toilette" while its own URL path says
 * "eau-de-parfum"); or it names a real concentration this codebase has no slot
 * for (Elizabeth Arden's "Green Tea Scent Spray", vintage Coty's "Parfum de
 * Toilette"). Silence, self-contradiction and an unmodellable answer are not
 * the manufacturer's word — they are the absence of one, which drops the
 * question back to route (B).
 *
 * Route (A) also requires the claim to be a claim. A concentration suffix that
 * a domain applies to every product on a template regardless of tier is not
 * the manufacturer saying anything about this bottle — see the Armani My Way
 * 90ml entry below, where armani.com's blanket "Eau de Parfum" was checked by
 * fetching the domain and found to sit on every My Way flanker alike.
 *
 * Whichever route is used, a fact counts only when it appears in a search
 * result's own title or link, never merely in a search summary's prose gloss —
 * the same rule this project's other web-sourced facts follow (see
 * demo/brandSites.ts). Fragrantica's own title can corroborate but is never
 * accepted standing alone. Jomashop is the standing example of a source whose
 * own listing titles show both words at once ("1 Million Parfum EDP Spray",
 * "Le Male Elixir EDP Spray Parfum") — a URL/title template artifact, not an
 * independent claim, and so not a route-(B) dissent either.
 *
 * History, because the entries below were written under two different rules
 * and it matters which: the 2026-08-27 through 2026-09-01 passes (five of
 * them) read the bar as requiring (A) AND the absence of any contradiction,
 * and on that reading refused fifteen EANs where the manufacturer's own
 * domain had actually been read and had actually answered. The owner ruled on
 * 2026-09-02 that (A) alone is sufficient. Those fifteen were re-derived from
 * their own logged citations — not assumed — and moved into the table below;
 * see the 2026-09-02 pass note after the table for which moved, on whose
 * word, and why the remaining ten did not.
 *
 * See each entry for its own citation, and the comment at the end of this
 * table for what was checked and left Disputed regardless, so a future pass
 * does not repeat the same searches for nothing.
 *
 * Two patterns worth naming because they cut across many individual
 * entries:
 *
 * - Paco Rabanne genuinely sells a "Parfum" concentration as its own named,
 *   more-concentrated tier — distinct from "Eau de Parfum" — across several
 *   of its lines (1 Million, Invictus, Olympéa, Phantom). Where beautybase's
 *   bare "Parfum" and perfume-click's inserted "Eau de Parfum" disagree on
 *   one of these, independent EAN-tied retailers across several countries
 *   (Jean Coutu in Canada, Scentia.fr in France, lojaglamourosa in Brazil,
 *   hadeeqatalatoor in the Gulf, upcitemdb.com's own crowd-sourced database)
 *   agree with beautybase far more often than not — perfume-click's own
 *   blanket "Eau de Parfum" suffix looks, on this evidence, like a feed
 *   default applied whether or not it is true, the same failure shape as
 *   this project's own past shop-wide defects (manchester-ouds' EDP
 *   shorthand, Emirates Oud's self-contradicting "Fragrance Type" field).
 *   That is a pattern, not a proof for any one bottle, which is why each
 *   Rabanne entry below still has its own citation and several — Olympéa
 *   30ml, 1 Million Royal, both sizes of Invictus Victory Elixir, Olympéa
 *   Absolu — are left Disputed where the same search surfaced a genuine
 *   conflict instead.
 * - The reverse also happened, more than once: beautybase's own "Extrait de
 *   Parfum"/"Parfum" lost outright to a fuller "Eau de Parfum" for Burberry
 *   Her Elixir (its own real name is "Her Elixir de Parfum" — see
 *   burberry.com's own listing at exactly this size), for two Ahmed Al
 *   Maghribi bottles, and for French Avenue Ripple — the exact opposite
 *   shop from the exact opposite direction of the four French Avenue
 *   bottles CONCENTRATION_RESTATEMENT_RE already resolved the other way.
 *   Nothing here trusts one shop's general reputation over the other's;
 *   every entry was checked on its own barcode.
 */
export interface ConcentrationResolution {
  /** The true concentration, in the same display form `concentration()` returns. */
  concentration: string;
  /** One-line citation of the search evidence that settled this EAN. */
  citation: string;
}

export const CONCENTRATION_RESOLUTIONS: Readonly<Record<string, ConcentrationResolution>> = {
  // ── Prada Paradoxe Radical Essence: unanimous "Parfum" (Jomashop, Realry,
  // three separate Nandansons SKUs, ScentsWorld, BeyondStyle); no source
  // anywhere in the search names an "Eau de Parfum" for either size. ──
  '3614274306217': { concentration: 'Parfum', citation: 'Prada Paradoxe Radical Essence 50ml: Jomashop, Realry, Nandansons and ScentsWorld unanimously "Parfum"; no conflicting source found.' },
  '3614274305401': { concentration: 'Parfum', citation: 'Prada Paradoxe Radical Essence 90ml: Jomashop, Realry, Nandansons, ScentsWorld and BeyondStyle unanimously "Parfum"; no conflicting source found.' },

  // ── Rabanne "Parfum" tier (see the general note above): each entry below
  // is unanimous or near-unanimous across independent, EAN-tied sources. ──
  '3349668641826': { concentration: 'Parfum', citation: 'Rabanne Invictus Victory Absolu 50ml: ShopSimon, Jomashop, eBay ("2025 ... ABSOLU Parfum INTENSE"), bestbrandsperfume all "Parfum(e Intense)"; no EDP claim found.' },
  '3349668641833': { concentration: 'Parfum', citation: 'Rabanne Invictus Victory Absolu 100ml: ShopSimon, Jomashop, eBay, news-parfums.com ("RABANNE PARFUM Invictus Victory Absolu"), ModeSens all "Parfum"; no EDP claim found.' },
  '3349668579822': { concentration: 'Parfum', citation: 'Rabanne 1 Million 50ml: upcitemdb.com’s independent EAN database names this exact barcode "1 Million Parfum Spray"; lojaglamourosa agrees.' },
  '3349668579839': { concentration: 'Parfum', citation: 'Rabanne 1 Million 100ml: upcitemdb.com’s independent EAN database names this exact barcode "1 Million Parfum Spray, 3.4-oz"; eBid, iraqdutyfree agree.' },
  '3349668644025': { concentration: 'Parfum', citation: 'Rabanne Phantom Elixir 150ml: rabanne.com’s own domain tags it "Parfum Intense" (both the ww/en and us/en_US product pages); eBay and Amobeleza agree.' },
  '3349668644063': { concentration: 'Parfum', citation: 'Rabanne Phantom Elixir 50ml: eBay, Walmart, Jomashop, Shoppers Drug Mart (exact-EAN match) all "Phantom Elixir Parfum"; no EDP claim found.' },
  '3349668644049': { concentration: 'Parfum', citation: 'Rabanne Phantom Elixir 100ml: eBay, Walmart, Jomashop, news-parfums.com ("RABANNE PARFUM Phantom Elixir"), Parfumdo.com all "Parfum(e Intense)"; no EDP claim found.' },
  '3349668627523': { concentration: 'Parfum', citation: 'Rabanne Invictus 50ml: Parfuma, Jomashop, World of Watches, Coral Perfumes, A&R Perfumes all "Invictus Parfum"; Fragrantica titles it as a distinct 2024 "Invictus Parfum" launch.' },
  '3349668627530': { concentration: 'Parfum', citation: 'Rabanne Invictus 100ml: Jean Coutu, Realry, Walmart, Jomashop, Scentia.fr, hadeeqatalatoor, ModeSens, lojaglamourosa — ten independent, EAN-tied retailers across five countries, unanimous "Invictus Parfum".' },
  '3349668627547': { concentration: 'Parfum', citation: 'Rabanne Invictus 200ml: eBay, Walmart, Jomashop unanimous "Invictus Parfum"; Fragrantica titles the exact barcode "Invictus Parfum ... 2024".' },
  '3349668627462': { concentration: 'Parfum', citation: 'Rabanne Olympéa 50ml: Farmamix, Jomashop, RP-Luxury, news-parfums.com ("RABANNE PARFUM Olympéa"), A&R Perfumes unanimous "Parfum"; no EDP claim found for this size.' },
  '3349668627479': { concentration: 'Parfum', citation: 'Rabanne Olympéa 80ml: Jomashop, World of Watches, Mengotti Couture, Jack Gifts Cosmetica unanimous "Olympea Parfum"; no EDP claim found for this size.' },
  '3349668614592': { concentration: 'Parfum', citation: 'Rabanne Phantom 100ml: eBay, Jomashop, eperfumes.gr, Fragrancelord, EK Perfumes, A&R Perfumes all "Phantom Parfum"; no independent EDP claim found.' },

  // ── Jean Paul Gaultier's own "Parfum (Intense)"/"Parfum Concentré" tier,
  // the men's Le Male and Scandal lines specifically. ──
  '8435415102339': { concentration: 'Parfum', citation: 'JPG Le Male Elixir Absolu 75ml: jeanpaulgaultier.com’s own product page names it "Le Male Elixir Absolu Parfum Intense"; eBay, Walmart, Jomashop, Fragrantica agree.' },
  '8435415102346': { concentration: 'Parfum', citation: 'JPG Le Male Elixir Absolu 125ml: Walmart, giftexpress, Jomashop, Nandansons, news-parfums.com and Maple Prime all "Parfum (Intense)"; matches the jeanpaulgaultier.com naming for the line.' },
  '8435415102353': { concentration: 'Parfum', citation: 'JPG Le Male Elixir Absolu 200ml: Jomashop, news-parfums.com (exact-EAN URL), Maple Prime all "Le Male Elixir Absolu Parfum"; matches the jeanpaulgaultier.com naming for the line.' },
  '8435415076937': { concentration: 'Parfum', citation: 'JPG Le Male Elixir 75ml: upcitemdb.com’s independent EAN database names this exact barcode "Le Male Elixir Spray, 2.5 oz" as a Parfum; giftexpress, ShopCGX, DLG agree "Parfum".' },
  '8435415076944': { concentration: 'Parfum', citation: 'JPG Le Male Elixir 125ml: upcitemdb.com’s independent EAN database names this exact barcode a Parfum; giftexpress, ShopCGX, DLG, Perfume Plus Outlet agree.' },
  '8435415080378': { concentration: 'Parfum', citation: 'JPG Scandal Pour Homme Absolu 50ml: Amazon’s own title reads "Parfum Concentré"; Walmart, Jomashop, giftexpress, Perfumerías Padilla agree.' },
  '8435415080385': { concentration: 'Parfum', citation: 'JPG Scandal Pour Homme Absolu 100ml: Jean Coutu (exact-EAN match) titles it "Scandal Absolu Parfum Concentré for Men"; Amazon, Walmart, Jomashop agree.' },

  // ── Everyone else: each checked on its own barcode. ──
  '3614274219579': { concentration: 'Parfum', citation: 'Armani Stronger With You 100ml: eBay, Realry, Fragmantic, PicClick, ModeSens, seekfab unanimous "Stronger With You Parfum"; no EDP claim found.' },
  '3423474884155': { concentration: 'Parfum', citation: '"Nuit D’Issey Parfum" 75ml: Amazon and Perfume Clearance Centre both "Parfum", naming the 2014 "Parfum" flanker distinct from the same-year EDT; no conflicting claim found.' },
  '3616305616203': { concentration: 'Parfum', citation: 'Hugo Boss Alive Absolu Intense 30ml: Marionnaud (major French retailer, exact-EAN URL) and two further EAN-tied French retailers all "Parfum Intense"; only Jomashop’s own listing dissents with "EDP".' },
  '3614273844673': { concentration: 'Parfum', citation: 'Armani My Way 30ml: Jomashop, Perfume Corner (UK), eperfumes.gr, ModeSens unanimous "My Way Parfum"; no EDP claim for this exact EAN.' },
  '3614273844666': { concentration: 'Parfum', citation: 'Armani My Way 50ml (refillable): Jomashop unanimous "My Way Parfum Refillable"; no EDP claim for this exact EAN.' },
  '3614273927352': { concentration: 'Parfum', citation: 'Armani My Way 90ml Refillable (new dispute, 2026-09-01): eBay ("My Way PARFUM 90ml"), lojaglamourosa (exact-EAN URL, "My Way Le Parfum - 90ml"), supercosmetics.com, fathyibrahim.com, mengotticouture.com and pariscom2030.com all "My Way Parfum"/"Le Parfum"; armani.com’s own page for this exact EAN reads "MY WAY PARFUM 90 ml Eau de Parfum", but the identical "Eau de Parfum" suffix sits on every My Way flanker on that same domain regardless of tier (base, Intense, Nectar, Parfum alike, confirmed by fetching armani.com directly) — a fixed category-page template, not a per-bottle claim — so it neither corroborates nor contradicts; no independent source anywhere calls this exact EAN a bare, unqualified Eau de Parfum.' },
  '3386460157315': { concentration: 'Parfum', citation: 'Coach Gold 30ml: Jomashop and Perfume Clearance Centre both "Coach Gold Parfum"; no EDP claim found.' },
  '3616303429669': { concentration: 'Parfum', citation: 'Calvin Klein Eternity 200ml: eBay, Perfume Clearance Centre and beautyqueensupply all "Eternity ... Parfum"; only Direct Chemist Outlet dissents, and its own listing also mismatches the product’s gender.' },
  '8011003891498': { concentration: 'Parfum', citation: 'Versace Crystal Noir 50ml: Superdrug (major UK retailer) and lojaglamourosa (exact-EAN URL) both "Crystal Noir Parfum"; versace.com itself lists an EDT and a Parfum as separate 50ml SKUs, and the majority of independent listings for this EAN say Parfum.' },
  '3614273638852': { concentration: 'Parfum', citation: 'Azzaro The Most Wanted 100ml: Belova, Fragmantic, pariscom2030, giftexpress, clothbase all "The Most Wanted Parfum"; only Jomashop’s own URL (not its title) inserts "edp".' },

  // ── Eau de Parfum: cases where the fuller name won, including two where
  // beautybase’s own claim was the wrong one. ──
  '3616304061943': { concentration: 'Eau de Parfum', citation: 'Burberry Her Elixir 100ml: burberry.com’s own site names the exact product "Her Elixir de Parfum" at exactly this 100ml size — "de Parfum" is part of the bottle’s own name, i.e. Eau de Parfum tier; fragrance-click already had this right, beautybase and perfume-click’s "Parfum" did not.' },
  '3614273953764': { concentration: 'Eau de Parfum', citation: 'Armani Acqua di Giò Profondo 50ml: giorgioarmanibeauty-usa.com’s own domain titles the line "Acqua di Giò Profondo Eau de Parfum Cologne"; outweighs the resale-site majority saying bare "Parfum".' },
  '6298042001893': { concentration: 'Eau de Parfum', citation: 'French Avenue Ripple 100ml: Jomashop, Fruugo, theislamshop, PerfumeGiants, pennypart.com unanimous "Eau de Parfum" — zero Extrait claims found — and manchester-ouds’ own title and description already independently agree at this value (see the "Ripple" test case for concentrationOfListing); beautybase’s "Extrait de Parfum" was the mislabel here.' },
  '3616305033055': { concentration: 'Eau de Parfum', citation: 'Marc Jacobs Daisy Wild Eau So Intense 100ml: marcjacobs.com’s own product URL is keyed to this exact EAN and titled "Daisy Wild Intense Eau De Parfum"; beautybase and fragrance-click already had this right, perfume-click’s "Parfum" did not.' },
  '6290360616933': { concentration: 'Eau de Parfum', citation: 'Ahmed Al Maghribi Blu Oud 100ml: Superdrug (major UK retailer), PerfumeBox, DubaiOudh, Triple Traders, FridayCharm unanimous "Eau de Parfum"; beautybase’s "Extrait de Parfum" was the mislabel here.' },
  '6290360617312': { concentration: 'Eau de Parfum', citation: 'Ahmed Al Maghribi Black Fumes 100ml: samawa.ae, luxurious-fragrances.com, PerfumeBox, DubaiOudh unanimous "Eau de Parfum"; ahmedalmaghribi.co.in’s own regional site files it under an "/eau-de-parfum/" URL path; beautybase’s "Extrait de Parfum" was the mislabel here.' },
  '8435415054041': { concentration: 'Eau de Parfum', citation: 'JPG Scandal Gold 80ml: Walmart, V Perfumes, Venera Cosmetics, Jomashop, World of Watches, alseerandsafeer.com all "Eau de Parfum"/"EDP"; fragrance-click’s "Parfum" was the mislabel here.' },
  '3614274103007': { concentration: 'Eau de Parfum', citation: 'Lancôme La Vie Est Belle Rose Extraordinaire 30ml: lancome-usa.com’s own site names it "La Vie Est Belle Rose Extraordinaire Eau de Parfum" — the brand’s own domain, exactly the shape of evidence this field was written to require — corroborated by Superdrug, Harrods and lojaglamourosa (exact-EAN URL); beautybase already had this right, perfume-click’s "Eau de Toilette" did not.' },

  // ── Extrait de Parfum: where the fuller, more concentrated name won. ──
  '6290171075738': { concentration: 'Extrait de Parfum', citation: 'Afnan 9pm Elixir Intense 100ml: Walmart, Jomashop, Amazon, Perfume Plus Outlet, perfumeheadquarters.com unanimous "Extrait de Parfum"; beautybase’s bare "Parfum" was the mislabel here.' },
  '6297001571040': { concentration: 'Extrait de Parfum', citation: 'Rayhaan Tiger Cal Cologne 100ml: Cosmos (bluesoft.io), a GTIN/EAN product database, names this exact barcode "Extrait De Parfum Spray"; giftexpress, Amazon and beautyhouse.com agree.' },
  '6298042001718': { concentration: 'Extrait de Parfum', citation: 'French Avenue Frostbite 100ml: pennypart.com explicitly "Extrait de Parfum"; matches the established manchester-ouds abbreviation pattern (see CONCENTRATION_RESTATEMENT_RE) against Jomashop’s lone "EDP".' },
  '6290171070207': { concentration: 'Extrait de Parfum', citation: 'Afnan Supremacy In Oud 100ml: ShopSimon, Jomashop (its own title, not just its URL), clothbase, DLG, Nandansons, ModeSens all "Extrait de Parfum"; perfume-click’s "Eau de Parfum" was the mislabel here.' },
  '6298042001800': { concentration: 'Extrait de Parfum', citation: 'French Avenue Safari Breeze 100ml: three separate eBay listings, Jomashop and ModeSens all "Extrait de Parfum"; beautybase already had this right, manchester-ouds’ "Eau de Parfum" did not.' },

  // ══ Added 2026-09-02, on route (A) of the evidence bar above — the
  // manufacturer's own domain, read, naming this product at this size. Each
  // one had a contradicting retailer title that the five passes before the
  // owner's ruling treated as disqualifying; under the ruling it is
  // outranked, and each entry names it so a reader can see exactly what was
  // set aside and by whose word. Nothing here is new agreement; every one of
  // these turns on a manufacturer statement that was already read (citation
  // carried over from the log below) or was retrieved in this pass. ══

  // ── Rabanne: rabanne.com re-checked directly for each of these five in the
  // 2026-08-27 second pass, "Parfum"/"Parfum Intense" every time. See the
  // Rabanne paragraph near the top of this table for why the house's own
  // "Parfum" tier is a real, separately-marketed concentration and not a
  // sloppier way of writing Eau de Parfum. ──
  '3349668641758': { concentration: 'Parfum', citation: 'Rabanne Olympéa Absolu Intense 30ml: rabanne.com’s own domain states "Parfum Intense" (read directly, 2026-08-27 second pass). Argos independently says "Eau De Parfum" for the same EAN; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '3349668617043': { concentration: 'Parfum', citation: 'Rabanne 1 Million Royal 50ml: rabanne.com’s own domain states "Parfum" (read directly, 2026-08-27 second pass); most resellers agree. kanerbrandhouse.com and thebarbersupplier.com say "EDP"; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '3349668627486': { concentration: 'Parfum', citation: 'Rabanne Olympéa 30ml: rabanne.com’s own domain states "Parfum" (read directly, 2026-08-27 second pass), consistent with the already-resolved 50ml and 80ml. Scentia.fr says "EDP" at this size only; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '3349668614516': { concentration: 'Parfum', citation: 'Rabanne Invictus Victory Elixir Intense 50ml: rabanne.com’s own domain states "Parfum Intense" (read directly, 2026-08-27 second pass); eBay, Jomashop and ModeSens agree. giftexpress, kanerbrandhouse.com and perfumesclub.co.uk say "Eau De Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '3349668614523': { concentration: 'Parfum', citation: 'Rabanne Invictus Victory Elixir Intense 100ml: rabanne.com’s own domain states "Parfum Intense" (read directly, 2026-08-27 second pass); eBay, Jomashop and ModeSens agree. giftexpress, kanerbrandhouse.com and perfumesclub.co.uk say "Eau De Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },

  // ── Versace: versace.com runs the Crystal lines as two separately-titled
  // SKU families at the same sizes — an EDT and a Parfum — and names no "Eau
  // de Parfum" in either line at all, which is what perfume-click's suffix
  // claims. Crystal Noir 90ml was read on versace.com in the 2026-08-27
  // second pass; both Bright Crystal sizes were retrieved 2026-09-02. ──
  '8011003891061': { concentration: 'Parfum', citation: 'Versace Crystal Noir 90ml: versace.com’s own product page is titled exactly "Crystal Noir Parfum 90 ml Black" (read directly, 2026-08-27 second pass). Harvey Nichols independently says "Eau De Parfum"; outranked by the manufacturer under the 2026-09-02 ruling. Consistent with the already-resolved Crystal Noir 50ml.' },
  '8011003891092': { concentration: 'Parfum', citation: 'Versace Bright Crystal 90ml: versace.com’s own product page (R512032-R090MLS) is titled "Bright Crystal Parfum 90 ml Pink", and the same domain runs the alternative as a separately-titled "Bright Crystal EDT 90 ml Pink" (R510032) — the house names no Bright Crystal "Eau de Parfum" at any size. Harvey Nichols says "Eau De Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '8011003891467': { concentration: 'Parfum', citation: 'Versace Bright Crystal 50ml: versace.com’s own product page (R512030-R050MLS) is titled "Bright Crystal Parfum 50 ml Pink"; same two-family Parfum/EDT structure as the 90ml, no "Eau de Parfum" anywhere in the line. Harvey Nichols says "Eau De Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },

  // ── Jean Paul Gaultier Scandal Absolu (women's), all three sizes: the
  // house's own UK product page titles the bottle "Scandal Absolu Parfum
  // Concentré" and offers exactly 30ml, 50ml and 80ml under that one name, so
  // every disputed size is covered by the manufacturer's own word rather than
  // inferred from a neighbouring one. ──
  '8435415080408': { concentration: 'Parfum', citation: 'JPG Scandal Absolu 30ml: jeanpaulgaultier.com’s own UK product page names it "Scandal Absolu Parfum Concentré" and lists 30/50/80ml under it (retrieved 2026-09-02; the 2026-09-01 third pass had already read the US site’s 1oz/2.7oz SKUs). Jomashop runs two self-contradicting listings for the line; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '8435415080415': { concentration: 'Parfum', citation: 'JPG Scandal Absolu 50ml: jeanpaulgaultier.com’s own UK product page names it "Scandal Absolu Parfum Concentré" and offers this exact 50ml under that name (retrieved 2026-09-02 — the size the US site does not carry, which is why earlier passes reached only 30ml/80ml). fragrance-click titles it "Parfum" too; perfume-click’s "Eau de Parfum" is outranked under the 2026-09-02 ruling.' },
  '8435415080422': { concentration: 'Parfum', citation: 'JPG Scandal Absolu 80ml: jeanpaulgaultier.com’s own UK product page names it "Scandal Absolu Parfum Concentré" at this size (retrieved 2026-09-02). alsayyedcosmetics.com and perfumesclub.se say "EDP"; outranked by the manufacturer under the 2026-09-02 ruling.' },

  // ── Afnan / Zimaya (Zimaya is Afnan's own sub-brand, with its own house
  // storefront): the house's own product pages state the concentration in so
  // many words, in both directions — Extrait for Supremacy Not Only Intense,
  // EDP for Musk Is Great. Nothing here favours one label over the other. ──
  '6290171072775': { concentration: 'Extrait de Parfum', citation: 'Afnan Supremacy Not Only Intense 150ml: us.afnan.com’s own product page states "EXTRAIT DE PARFUM" for this exact 150ml product (fetched directly, 2026-09-01 third pass). Superdrug titles the same EAN "Eau de Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '6290171070214': { concentration: 'Extrait de Parfum', citation: 'Afnan Supremacy Not Only Intense 100ml: us.afnan.com’s own product page for the 100ml states type "EXTRAIT DE PARFUM" (fetched directly, 2026-09-02 — the 150ml sibling had been read before, this size had not). eBay, Realry and Triple Traders say "Eau de Parfum"; outranked by the manufacturer under the 2026-09-02 ruling.' },
  '6290171070276': { concentration: 'Eau de Parfum', citation: 'Zimaya Musk Is Great 100ml: us.zimayaperfumes.com — the house’s own storefront — titles it "Musk Is Great EDP 100ml" and states "100ML | EDP | Unisex" (fetched directly, 2026-09-02; no manufacturer domain had been checked for this EAN in any earlier pass). perfumeheadquarters.com’s "Extrait de Parfum" title, itself contradicted by its own URL, is outranked under the 2026-09-02 ruling.' },

  // ── Yardley: the flagship example the Disputed value was originally
  // written around, and the clearest case of the AND reading refusing a fact
  // it had in hand. ──
  '6297000226163': { concentration: 'Eau de Parfum', citation: 'Yardley Gentleman Classic 100ml: yardleylondon.co.uk — the manufacturer’s own domain — titles the exact 100ml "Gentleman Classic Eau de Parfum 100ml" (read directly, 2026-08-27 second pass). upcitemdb.com and news-parfums.com say "Eau de Toilette" for the same barcode; outranked by the manufacturer under the 2026-09-02 ruling.' },
} as const;

/*
 * Left CONCENTRATION_DISPUTED by the same 2026-08-27 pass — checked, not
 * skipped — so a future pass does not repeat these same searches for
 * nothing. Each is a genuine split in the search results themselves, not a
 * gap in the search: a second independent, similarly-placed source
 * contradicted the first every time, which is exactly the "ambiguous or
 * summary-only" case this project's evidence bar says to leave alone.
 *
 *   - ean-085805268848 Elizabeth Arden Green Tea 100ml: sevendays-shop says
 *     "EDT", two other retailers say "Eau de Parfum"; several more call it a
 *     bare "Scent Spray" with no concentration word at all, suggesting the
 *     bottle's own branding may not use standard terminology here.
 *   - ean-6297000226163 Yardley Gentleman Classic 100ml: the flagship
 *     example this field was written around. Majority of retailers say EDP,
 *     but upcitemdb.com's own independent EAN database and news-parfums.com
 *     both say "Eau de Toilette" for this exact barcode — a real, not
 *     summary-only, conflict from an independent database.
 *   - ean-3614274258080 / ean-3614274258073 Azzaro Wanted Forever Elixir
 *     50ml/100ml: four different concentration words (EDP, Extrait de
 *     Parfum, Parfum) appear across sources for the 100ml alone.
 *   - ean-3349668641758 Rabanne Olympéa Absolu Intense 30ml: rabanne.com's
 *     own domain says "Parfum Intense", but Argos — a major UK retailer,
 *     not a resale mirror — independently says "Eau De Parfum" for the same
 *     EAN.
 *   - ean-6290360379203 / ean-6290360379227 French Avenue Carnal Desire /
 *     Royal Taboo 100ml: a UK niche specialist (soghaat.co.uk) says Extrait
 *     against a majority of general resale sites saying EDP; Royal Taboo
 *     even splits within eBay itself, two listings disagreeing.
 *   - ean-8011003891092 / ean-8011003891061 / ean-8011003891467 Versace
 *     Bright Crystal 90ml/50ml and Crystal Noir 90ml: Harvey Nichols (a
 *     shop in this project's own registry) independently names all three
 *     "Eau De Parfum" against a majority calling them "Parfum"; Scentia.fr
 *     even disagrees with itself, running two pages for Crystal Noir 90ml
 *     under two different names.
 *   - ean-3349668627486 Rabanne Olympéa 30ml: Scentia.fr (used favourably
 *     for the 50ml/80ml sizes above) names this size "EDP" instead.
 *   - ean-3616303476793 Calvin Klein Eternity Aromatic Essence Intense
 *     50ml: calvinklein.us's own product page carries the exact EAN but no
 *     concentration word in its title; Perfume Clearance Centre says
 *     "Parfum", Jomashop says "EDP".
 *   - ean-8435415080408 / ean-8435415080415 / ean-8435415080422 JPG Scandal
 *     Absolu (women's) 30/50/80ml: Jomashop runs two different listings for
 *     the 80ml alone, one "Parfum" and one "EDP"; alsayyedcosmetics.com and
 *     perfumesclub.se both independently call the 80ml "EDP".
 *   - ean-6290171070276 Zimaya Musk Is Great 100ml: perfumeheadquarters.com
 *     disagrees with its own URL; ForeverLux says Extrait against a
 *     majority saying EDP.
 *   - ean-3349668617043 Rabanne 1 Million Royal 50ml: rabanne.com's own
 *     domain and most resellers say "Parfum", but kanerbrandhouse.com and
 *     thebarbersupplier.com both independently say "EDP".
 *   - ean-3349668614516 / ean-3349668614523 Rabanne Invictus Victory Elixir
 *     Intense 50ml/100ml: giftexpress, kanerbrandhouse.com and
 *     perfumesclub.co.uk all call the 100ml "Eau De Parfum" against eBay/
 *     Jomashop/ModeSens calling it "Parfum" — a genuine split within the
 *     same barcode, not just across sizes.
 *   - ean-6290171070214 Afnan Supremacy Not Only Intense 100ml: roughly an
 *     even split between "Extrait de Parfum" (DLG, unitedperfumes.com,
 *     Jomashop's own title, ModeSens) and "Eau de Parfum" (eBay, Realry,
 *     Triple Traders).
 *   - ean-6298042001909 French Avenue Ravine Ice 100ml: manchester-ouds' own
 *     description independently restates "Extrait De Parfum" (see the
 *     concentration audit's own header), but the external majority
 *     (Amazon, marabika.lt, souqfragrance.com) says "Eau de Parfum" —
 *     repo-internal and web evidence point opposite ways.
 *   - ean-6290360617442 Ahmed Al Maghribi Summer Oud 60ml: two German
 *     specialists (bella-me.de, Parfuem365.de) say "Extrait de Parfum"
 *     against Amazon and oudstore.com saying "Eau de Parfum"/"EDP".
 *   - ean-5012209042441 L'Aimant 50ml: the true name on every authoritative
 *     hit (Walmart, Nandansons, chemist.net) is "Parfum de Toilette" — a
 *     distinct vintage Coty concentration this codebase's vocabulary does
 *     not model — which matches neither beautybase's "Parfum" nor
 *     perfume-click's "Eau de Toilette" claim, so neither can be credited.
 *   - ean-3616304175916 Gucci Guilty Pour Femme Elixir de 60ml: sources
 *     split between "Eau de Parfum" and what several call "ExDP"/"Extrait
 *     de Parfum" (the men's version at a neighbouring EAN is confirmed
 *     Extrait de Parfum, but that is a different barcode); too mixed to
 *     credit either disputed claim.
 *
 * 2026-08-27 second pass (same day, a later session): measured against
 * demo/catalogue.generated.ts freshly rebuilt from that day's own harvest,
 * live disputes had moved from 68 to 69 (69 contradicting, 44 resolved, 25
 * left Disputed) — one EAN above (ean-6290171070214, Afnan Supremacy Not
 * Only Intense) dropped out of the live set entirely between harvests and no
 * longer needs checking; two new ones appeared that the first pass never
 * saw (ean-8011003890972, ean-8011003890989 — Versace Eau Fraiche Extreme
 * 50ml/100ml), and both actually resolved; the "dispute" was this file's own
 * leftmost-match parsing artifact on Versace's "Eau Fraiche Extreme" line
 * name, not a real disagreement between shops. Both were originally patched
 * here as per-EAN overrides; a 2026-09-01 pass fixed the root cause instead
 * — see concentrationMatch's own doc comment and longestSpecificMatch below
 * it — after which concentrationMatch alone gets both EANs right and they no
 * longer register as a contradiction at all (confirmed: removing the two
 * override entries and rebuilding reproduces the identical 145/70/44/26
 * concentration-audit counts), so the entries were removed rather than kept
 * as dead weight. Every one of the other 23 was re-checked from
 * a genuinely different angle than the first pass used (manufacturer's own
 * domain where the first pass hadn't reached it, an EAN-first barcode-
 * database query, or both) rather than re-run verbatim; none crossed the
 * bar, and every one still comes back as a real conflict between two
 * independent, title-level sources, often now with more sources on both
 * sides rather than fewer:
 *   - ean-6297000226163 Yardley Gentleman Classic 100ml: yardleylondon.co.uk
 *     itself — the manufacturer's own domain, not reached by the first pass
 *     — titles the exact 100ml "Gentleman Classic Eau de Parfum 100ml".
 *     Doesn't move it: upcitemdb.com's independent EAN database and
 *     news-parfums.com still say "Eau de Toilette" for the same barcode, an
 *     EAN-tied database contradicting the manufacturer being exactly the
 *     kind of second independent result the evidence bar treats as
 *     disqualifying (see the Rabanne Olympéa Absolu Intense entry below for
 *     the same shape: manufacturer vs. a strong independent source, left
 *     Disputed on that basis already).
 *   - ean-3614274258080 / ean-3614274258073 Azzaro Wanted Forever Elixir
 *     50ml/100ml: azzaro.com's own official product page is internally
 *     self-contradictory — its own title reads "Eau de toilette" while its
 *     own URL path reads ".../eau-de-parfum" — and Jomashop's listing for
 *     this exact EAN is separately self-contradictory the same way (title
 *     "Parfum", URL "edp-spray"). Even the manufacturer's own page cannot be
 *     read as a clean fact here; if anything this confirms four-way
 *     confusion rather than resolving it.
 *   - ean-3349668641758 Rabanne Olympéa Absolu Intense 30ml,
 *     ean-3349668617043 Rabanne 1 Million Royal 50ml, ean-3349668627486
 *     Rabanne Olympéa 30ml, ean-3349668614516 / ean-3349668614523 Rabanne
 *     Invictus Victory Elixir Intense 50ml/100ml: rabanne.com's own domain
 *     re-checked directly for each and confirms "Parfum"/"Parfum Intense"
 *     every time, exactly as the first pass already had it via resellers —
 *     but the same named independent dissenters the first pass already
 *     found (Argos, kanerbrandhouse.com, thebarbersupplier.com, giftexpress,
 *     perfumesclub.co.uk) are still there and still contradict it. Extra
 *     confirmation of one side of an already-real conflict is not new
 *     evidence against the other side.
 *   - ean-6290360379203 / ean-6290360379227 French Avenue Carnal Desire /
 *     Royal Taboo 100ml: a barcode-first search turns up far more "EDP"
 *     sources than the first pass logged (ShopSimon, Walmart, Jomashop,
 *     jesaida.lt, pariscom2030, SplitScents, bestbrandsperfume, ModeSens),
 *     but it also turns up a second independent Extrait source the first
 *     pass hadn't logged — eBay UK titles Carnal Desire itself "Perfume
 *     extract 100ml" — alongside soghaat.co.uk's unchanged "Extrait De
 *     Parfum". Two independent sources against many is still two genuine,
 *     title-level dissents, not a gap. Royal Taboo's own eBay listings still
 *     split 3-Extrait/1-EDP exactly as before.
 *   - ean-8011003891092 / ean-8011003891061 / ean-8011003891467 Versace
 *     Bright Crystal 90ml/50ml and Crystal Noir 90ml: versace.com's own
 *     domain, not reached by the first pass, titles the Crystal Noir SKU
 *     exactly "Crystal Noir Parfum 90 ml Black" — but Harvey Nichols, a shop
 *     in this project's own registry and not a resale mirror, still
 *     independently says "Eau De Parfum" for all three, the same weight of
 *     dissent that kept the Rabanne Olympéa Absolu Intense entry Disputed
 *     against rabanne.com's own word. Treated the same way here.
 *   - ean-3616303476793 Calvin Klein Eternity Aromatic Essence Intense
 *     50ml: a barcode-first search adds riuparfum.com (Spanish retailer) as
 *     a second independent "Parfum Intense" source alongside Perfume
 *     Clearance Centre — but Jomashop's own title (not merely its URL) still
 *     independently says "EDP" for the same barcode, and calvinklein.us's
 *     own exact-EAN page still names no concentration at all in its title.
 *     Still a real, title-level 2-vs-1 split.
 *   - ean-8435415080408 / ean-8435415080415 / ean-8435415080422 JPG Scandal
 *     Absolu (women's) 30/50/80ml: jeanpaulgaultier.com's own domain, not
 *     reached by the first pass, confirms the line as "Scandal Absolu Parfum
 *     Concentré" in 1oz/2.7oz (≈30ml/80ml) SKUs — but alsayyedcosmetics.com
 *     and perfumesclub.se still independently call the 80ml "EDP", and
 *     Jomashop still runs two self-contradicting listings for it. Same
 *     shape as Yardley and Crystal Noir above: manufacturer confirmation
 *     doesn't erase an independent retailer's contradicting claim.
 *   - ean-6290171070276 Zimaya Musk Is Great 100ml: re-checked by barcode;
 *     perfumeheadquarters.com is unchanged (title "Extrait de Parfum", own
 *     URL "eau-de-parfum"), still self-contradicting, still the only
 *     dissent from the eBay/Walmart/Jomashop/Lyst/clothbase/ModeSens "EDP"
 *     majority. No new source found on either side.
 *   - ean-6298042001909 French Avenue Ravine Ice 100ml: unchanged; the
 *     repo-internal vs. external-majority conflict already logged still
 *     stands and no manufacturer domain exists to check (French Avenue has
 *     no storefront of its own outside the shops that resell it).
 *   - ean-6290360617442 Ahmed Al Maghribi Summer Oud 60ml: Ahmed Al
 *     Maghribi's own regional domains, not reached by the first pass, are
 *     themselves inconsistent with each other — the Oman site categorises
 *     Summer Oud under an "/eau-de-parfum/" URL path, the Kuwait site under
 *     "Oriental Fragrance" with no concentration word — and a further
 *     independent source, orientalaromas.com, calls it "Extrait De Parfum"
 *     on top of the German specialists the first pass already found. More
 *     sources, same genuine split.
 *   - ean-5012209042441 L'Aimant 50ml: structurally unresolvable regardless
 *     of angle — see the first-pass note; this codebase's concentration
 *     vocabulary has no slot for vintage Coty's "Parfum de Toilette", so no
 *     search result could ever satisfy either disputed claim. Not re-tried.
 *   - ean-3616304175916 Gucci Guilty Pour Femme Elixir de 60ml: a
 *     barcode-first search reaches the same pariscom2030 ("Elixir De
 *     Parfum") and Walmart ("ExDP Spray", i.e. Extrait de Parfum) split the
 *     first pass found, and still fails to surface a gucci.com result for
 *     this specific product. Unchanged.
 *
 * 2026-09-01 third pass: alongside the CONCENTRATION_SPECIFIC root-cause fix
 * (see concentrationMatch's own doc comment), the harvest had moved on since
 * the second pass — measured against demo/catalogue.generated.ts rebuilt
 * fresh that day: 26 live Disputed products, two of them genuinely new
 * (ean-6290171070214, one of the 23 already logged above, simply reappeared
 * after having dropped out for one harvest; not re-checked, its conflict is
 * unchanged and already fully logged). The two actually new EANs:
 *
 *   - ean-3614273927352 Armani My Way 90ml Refillable: resolved — see
 *     CONCENTRATION_RESOLUTIONS above. Six independent, non-templated
 *     sources unanimous "Parfum"/"Le Parfum"; armani.com's own matching
 *     "Eau de Parfum" suffix turned out, on fetching the domain directly, to
 *     sit on every My Way flanker regardless of tier and so isn't a genuine
 *     per-bottle claim either way.
 *   - ean-6290171072775 Afnan Supremacy Not Only Intense 150ml: checked and
 *     left Disputed — the sibling case to ean-6290171070214 (100ml, already
 *     logged above), same shop, same product line, same shape of conflict.
 *     us.afnan.com's own domain, fetched directly, states "EXTRAIT DE
 *     PARFUM" for this exact 150ml product in so many words — but
 *     Superdrug, a major UK retailer already in this project's own registry
 *     and not a resale mirror, independently titles the identical EAN
 *     "Afnan Supremacy Not Only Intense Eau de Parfum 150ml Spray" (its own
 *     search-result title, not a summary). Manufacturer confirmation
 *     doesn't erase an independent retailer's contradicting claim — the same
 *     ruling this file already applied to Yardley Gentleman Classic,
 *     Rabanne Olympéa Absolu Intense and Versace Crystal Noir above.
 *
 * 2026-09-01 fourth pass (later the same day): live Disputed set unchanged
 * at 25 (measured against the current demo/catalogue.generated.ts). Read
 * this entire log first, per this pass's own brief, rather than repeating
 * any search already logged above. Picked two of the least-revisited
 * entries — checked from a genuinely different angle each — and resolved
 * neither; both stay Disputed, one with materially stronger evidence for
 * exactly why:
 *
 *   - ean-085805268848 Elizabeth Arden Green Tea 100ml: the first pass
 *     (2026-08-27) only inferred a vocabulary gap from several retailers
 *     calling it a bare "Scent Spray"; never revisited since. Checked the
 *     manufacturer's own domain directly this pass — elizabetharden.co.uk's
 *     own fragrance collection page — and it confirms the inference as
 *     fact: the product's own name there is "Green Tea Scent Spray", not
 *     "Eau de Toilette" or "Eau de Parfum" at all, matching neither
 *     disputed claim. Same shape as ean-5012209042441 L'Aimant above (a
 *     true name outside this codebase's modelled vocabulary), now
 *     confirmed from the manufacturer's own domain rather than inferred
 *     from resellers.
 *   - ean-3616304175916 Gucci Guilty Pour Femme Elixir de 60ml: re-checked
 *     by product name rather than repeating the second pass's barcode-first
 *     search. Ten major, independent retailers (Harrods, Sephora, John
 *     Lewis — a shop in this project's own registry, Liberty London,
 *     Dillard's, Ulta, DFS, Frankfurt Airport's own shop, Fragrantica)
 *     unanimously name the bottle itself "Elixir de Parfum" — strong
 *     agreement, but still not gucci.com directly, and still not decisive
 *     on its own: Walmart's own listing, re-checked specifically, still
 *     independently tags the identical product "ExDP Spray" (Extrait de
 *     Parfum) even while using the same "Elixir de Parfum" product name —
 *     the exact persisting contradiction the second pass already found,
 *     confirmed unchanged rather than resolved by the new agreement on the
 *     name alone.
 *
 * 2026-09-01 fifth pass (later the same day): live Disputed set unchanged at
 * 25, verified against the current demo/catalogue.generated.ts. Zero
 * resolved. This log was read end to end first and no search recorded above
 * was repeated — the one angle tried instead was a source type none of the
 * four passes before it used: this project's own harvested data, rather than
 * the web.
 *
 * The idea worth testing was this. Nearly every one of the 25 is beautybase
 * against perfume-click, and the Rabanne paragraph near the top of this table
 * already suspects "perfume-click's own blanket 'Eau de Parfum' suffix looks,
 * on this evidence, like a feed default applied whether or not it is true."
 * If that were demonstrably a template artefact rather than a claim, the
 * dissent could be disqualified the same way Jomashop's self-contradicting
 * titles already are, and a root-cause fix would settle many disputes at once
 * instead of 25 separate web questions.
 *
 * Five of the 25 have a perfume-click title that names a concentration twice
 * — the product's own tier word inside the name, and the shop's own suffix on
 * the end — which is exactly the Jomashop shape:
 *
 *     ean-8011003891467  "Versace Bright Crystal Parfum Eau de Parfum 50ml Spray"
 *     ean-8011003891092  "Versace Bright Crystal Parfum Eau de Parfum 90ml Spray"
 *     ean-8011003891061  "Versace Crystal Noir Parfum Eau de Parfum 90ml Spray"
 *     ean-3349668627486  "Paco Rabanne Olympéa Parfum Eau de Parfum 30ml Spray"
 *     ean-3616304175916  "Gucci Guilty Elixir de Parfum pour Femme Eau de Parfum 60ml Spray"
 *
 * Measured before acting on it, and the measurement refuses the idea. Across
 * perfume-click's 10,469 active listings, 4,720 titles end
 * "<concentration> <size>ml Spray" and only 83 of those — 1.8% — also name a
 * concentration inside the product name. A suffix applied to 4,720 titles
 * that conflicts with the name in 83 of them is not a blanket default
 * overwriting the truth; it is a suffix that is usually consistent with it.
 * Worse for the idea, the same shape appears in the *other* shop's feed and
 * is correct there: beautybase does it 13 times, twelve of them Elie Saab
 * ("Elie Saab Le Parfum Eau De Parfum 90ml Spray"), where "Le Parfum" is
 * genuinely the bottle's name and "Eau de Parfum" is genuinely its
 * concentration. Carolina Herrera Bad Boy Le Parfum is the same shape again,
 * in perfume-click's own feed, and also correct as written.
 *
 * So a title naming a concentration twice carries no information about which
 * of the two is the concentration — the pattern occurs in both directions, in
 * both shops, and is right at least as often as it is wrong. Nothing here
 * disqualifies perfume-click's claim on any of the five above, and no
 * root-cause rule could be written from it that would not break the Elie
 * Saab and Bad Boy lines. Recorded as a foreclosed approach so a future pass
 * does not spend the same measurement finding out.
 *
 * Two smaller in-repo observations from the same sweep, neither sufficient:
 *
 *   - fragrance-click is a third shop in this catalogue on four of the
 *     disputes (Azzaro Wanted Forever Elixir 50ml and 100ml, JPG Scandal
 *     Absolu 50ml, Rabanne Olympéa 30ml, Gucci Guilty Elixir de 60ml) and
 *     independently titles every one of them "Parfum", siding with
 *     beautybase. It does not count as a second voice: its descriptions read
 *     as copy generated from its own title ("this 50ml parfum combines sweet
 *     raspberry with rich leather"), so title and description are one claim,
 *     not two — and, per the bar this table has applied throughout, one more
 *     source on the majority side does not un-say perfume-click's dissent.
 *   - Only two of the 25 have any shop description mentioning a
 *     concentration at all: manchester-ouds on ean-6298042001909 (French
 *     Avenue Ravine Ice, already logged and already the whole basis of that
 *     entry's repo-vs-web conflict) and allbeauty on ean-085805268848,
 *     whose description restates "Elizabeth Arden Green Tea Eau Parfumée
 *     Scent Spray 100ml" — which is the fourth pass's finding confirmed from
 *     a second direction: the bottle's real name matches neither disputed
 *     claim, and this codebase's vocabulary has no slot for "Eau Parfumée".
 *     Every other disputed listing's description is either absent or names
 *     no concentration, so there is no unread evidence sitting on disk.
 *
 * ══ 2026-09-02: the owner's OR ruling applied. 25 Disputed -> 10. ══
 *
 * Everything above this line was written under the AND reading of the
 * evidence bar: manufacturer confirmation was treated as insufficient while
 * any independent retailer title contradicted it. Five passes applied it, and
 * the phrase that recurs through the entries above — "manufacturer
 * confirmation doesn't erase an independent retailer's contradicting claim" —
 * is that reading in so many words. The owner has ruled the other way, and
 * the bar's own statement above the table has been rewritten to say so
 * unambiguously: the manufacturer's own word about its own product is
 * sufficient by itself, and a retailer mislabelling a bottle does not make the
 * manufacturer wrong.
 *
 * The reasoning in the entries above is left exactly as it was, because it is
 * a true record of what was found; only the ruling on top of it has changed.
 * What follows is which of the 25 moved and on whose word.
 *
 * Method, so this is auditable rather than a re-shuffle: every one of the 25
 * was re-read from this log, and the *only* question asked of each was
 * whether the manufacturer's own domain had actually been read for that exact
 * product and what it said. Where a prior pass recorded reading it, that
 * citation was carried into the table verbatim as to substance. Where no pass
 * had read it, the domain was retrieved in this pass or the entry stayed
 * Disputed; nothing was assumed from a house's general naming habits. Five
 * entries needed a fresh retrieval (both Versace Bright Crystal sizes, JPG
 * Scandal Absolu 50ml, Afnan Supremacy Not Only Intense 100ml, Zimaya Musk Is
 * Great 100ml) and all five answered.
 *
 * Fifteen resolved — see CONCENTRATION_RESOLUTIONS above for each citation:
 *   ean-6297000226163 Yardley Gentleman Classic 100ml          (yardleylondon.co.uk)
 *   ean-3349668641758 Rabanne Olympéa Absolu Intense 30ml      (rabanne.com)
 *   ean-3349668617043 Rabanne 1 Million Royal 50ml             (rabanne.com)
 *   ean-3349668627486 Rabanne Olympéa 30ml                     (rabanne.com)
 *   ean-3349668614516 Rabanne Invictus Victory Elixir 50ml     (rabanne.com)
 *   ean-3349668614523 Rabanne Invictus Victory Elixir 100ml    (rabanne.com)
 *   ean-8011003891061 Versace Crystal Noir 90ml                (versace.com)
 *   ean-8011003891092 Versace Bright Crystal 90ml              (versace.com, new)
 *   ean-8011003891467 Versace Bright Crystal 50ml              (versace.com, new)
 *   ean-8435415080408 JPG Scandal Absolu 30ml                  (jeanpaulgaultier.com)
 *   ean-8435415080415 JPG Scandal Absolu 50ml                  (jeanpaulgaultier.com, new)
 *   ean-8435415080422 JPG Scandal Absolu 80ml                  (jeanpaulgaultier.com)
 *   ean-6290171072775 Afnan Supremacy Not Only Intense 150ml   (us.afnan.com)
 *   ean-6290171070214 Afnan Supremacy Not Only Intense 100ml   (us.afnan.com, new)
 *   ean-6290171070276 Zimaya Musk Is Great 100ml               (us.zimayaperfumes.com, new)
 *
 * Ten stay Disputed, and not one of them for the reason the ruling
 * overturned. In every case route (A) does not apply at all — the
 * manufacturer is silent, unreachable, self-contradictory, or names something
 * this codebase cannot express — so the question falls back to route (B),
 * where a persisting independent contradiction still disqualifies:
 *
 *   - ean-3614274258080 / ean-3614274258073 Azzaro Wanted Forever Elixir
 *     50ml/100ml: azzaro.com contradicts *itself* (own title "Eau de
 *     toilette", own URL path "eau-de-parfum"). A house that says two things
 *     has not said one; there is no manufacturer's word here to outrank
 *     anything with.
 *   - ean-6298042001909 French Avenue Ravine Ice 100ml,
 *     ean-6290360379203 Carnal Desire, ean-6290360379227 Royal Taboo 100ml:
 *     French Avenue has no storefront of its own anywhere — route (A) is not
 *     merely unmet, it is unavailable — and route (B) splits genuinely (see
 *     the entries above; Ravine Ice additionally has this repo's own
 *     harvested description pointing opposite to the external majority).
 *   - ean-6290360617442 Ahmed Al Maghribi Summer Oud 60ml: the house's own
 *     regional domains still disagree with each other, and the .co.in product
 *     page was re-read this pass to be sure — its title is "SUMMER OUD 60ML
 *     H/B", it sits under a plain "Perfumes" collection, and it states no
 *     concentration at all. Silence plus inconsistency is not the
 *     manufacturer's word.
 *   - ean-3616304175916 Gucci Guilty Pour Femme Elixir de 60ml: gucci.com has
 *     never been reachable for this product. Tried again this pass from a
 *     different direction and hit a hard wall rather than a miss: gucci.com
 *     refuses this project's search user agent outright ("domain not
 *     accessible to our user agent"), so route (A) cannot be attempted at
 *     all by any means available here. Route (B) still has Walmart's "ExDP"
 *     standing against ten retailers' "Elixir de Parfum".
 *   - ean-3616303476793 Calvin Klein Eternity Aromatic Essence Intense 50ml:
 *     calvinklein.us's own exact-EAN page names no concentration in its
 *     title. Manufacturer read, manufacturer silent.
 *   - ean-085805268848 Elizabeth Arden Green Tea 100ml: the manufacturer's
 *     own domain was read (fourth pass) and names the bottle "Green Tea Scent
 *     Spray" — matching *neither* disputed claim. A manufacturer answering a
 *     different question than the one asked cannot settle it.
 *   - ean-5012209042441 L'Aimant 50ml: the true name is "Parfum de Toilette",
 *     a vintage Coty concentration this codebase's vocabulary has no slot
 *     for. Structurally unresolvable at any evidence bar.
 *
 * So the ruling's whole effect is on the ten-of-twenty-five where a house had
 * spoken and was being overruled by a shop. Where no house has spoken, the
 * table is as empty as it was, which is the correct outcome and not a
 * shortfall.
 */

/**
 * A specific concentration phrase immediately followed by its own size in
 * parentheses and "is" — "Extrait De Parfum (100ml) is a ..." — the shape a
 * supplier's own product blurb takes when its opening line restates the
 * bottle's full name, as opposed to a phrase merely occurring somewhere in
 * marketing prose (which is not reliable — see concentrationOfListing below).
 *
 * Measured across every active, priced listing that carries a description:
 * 448 match this exact shape, from four shops (justmylook 419, manchester-
 * ouds 18, mybeauty-boutique 10, fragrancehub 1). Of those 448, 441 already
 * agree with what the same listing's own title says. The 7 that do not are
 * every one of manchester-ouds' — all French Avenue bottles, all the same
 * direction: the title compresses to a bare "EDP" while the description
 * restates "French Avenue <Name> Extrait De Parfum (<size>ml) is a ...
 * fragrance", word for word the shape of a manufacturer product blurb rather
 * than manchester-ouds' own house style. Four of those seven (Aether, Amber
 * Empire, Royal Blend Sequoia, Liquid Brun Limited Edition) are also EAN-
 * shared with Beautybase, which independently titles the identical bottle
 * "Extrait De Parfum" too — see scripts/build-demo-catalogue.ts's own
 * concentration audit.
 */
export const CONCENTRATION_RESTATEMENT_RE =
  /\b(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|extrait de toilette)\s*\(\d{1,4}\s*ml\)\s*is\b/i;

/**
 * Concentration, trusting a listing's own description over its own title in
 * one narrow, structural case: the title names only a bare abbreviation
 * ("EDP"/"EDT"/"EDC" — inherently a shorthand, never a house's own way of
 * naming a flanker line the way "Parfum" or "Le Parfum" can be, see
 * concentrationMatch's own header) and the description independently
 * restates the bottle's full name at a different, specific concentration —
 * see CONCENTRATION_RESTATEMENT_RE for the shape and the measurement that
 * justifies trusting it.
 *
 * Deliberately not "does the description mention a different concentration
 * anywhere" — that question was asked first, across the whole harvest with a
 * description at all, and it produced 308 disagreements, most of them noise:
 * a description that quotes the *inspiration* fragrance a dupe is compared
 * against ("Indulge in ... Burberry Touch for Men Eau de Toilette" on a
 * listing titled "Mr England Touch ... EDP" — a description of a different,
 * named perfume, not a second opinion on this one), a labelled
 * "Fragrance Type:" field that disagrees with the very same shop's title in
 * both directions on 143 of its own listings (Emirates Oud) — which is
 * evidence that shop's own data entry is unreliable throughout, not evidence
 * for either the title or the field. Restricting to the exact restatement
 * shape is what keeps this from repeating either mistake: every one of the
 * 7 real disagreements it does find sit in one shop's feed, in one
 * direction, independently corroborated where a second shop is available —
 * see CONCENTRATION_RESTATEMENT_RE.
 *
 * Every other listing — the other 441 that already agree, and everything
 * with no description at all — falls through to `concentration(title)`
 * unchanged.
 */
export function concentrationOfListing(title: string, description: string | null): string {
  const fromTitle = concentration(title);
  if (!description) return fromTitle;

  const titleWord = concentrationMatch(title);
  if (!titleWord || !/^(edp|edt|edc)$/i.test(titleWord)) return fromTitle;

  const restated = description.match(CONCENTRATION_RESTATEMENT_RE)?.[1];
  if (!restated) return fromTitle;

  const fromDescription = concentration(restated);
  return fromDescription === fromTitle ? fromTitle : fromDescription;
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
 * A separator character with nothing real left on the side that used to hold
 * the thing it was joining — because that thing was a size or a noise word
 * this same function already deleted a few lines above, or in
 * stripRedundantSize's own, narrower version of the identical operation.
 *
 * "Al Haramain Another Perfume Oil 3ml + 6ml + 12ml 3ml" is the shape this
 * exists for: "Perfume Oil" is the stated concentration and comes off above,
 * every "3ml"/"6ml"/"12ml" comes off by the unconditional ml strip that
 * follows it, and what is left is "Another  +  + " — the two pluses that used
 * to join a menu of sizes, now joining nothing. Trimmed only at the very
 * edges, the existing boundary strip a few lines up leaves "Another + +"
 * exactly as broken as the title it came from, because "+" was never in that
 * strip's character class and neither plus sits at the outermost edge until
 * the other one is gone too.
 *
 * Measured against the live CATALOGUE (`npx tsx scripts/orphaned-separator-report.ts`,
 * written to make this fix and re-run after it): 53 distinct product names,
 * 71 products once every size variant of each is counted, four genuinely
 * different shapes:
 *
 *   - Al Haramain's own multi-size menu, exactly as above: 8 names, 26
 *     products, "Another + +" / "Collection + +" / "Jd + +" / "Mukhallath
 *     Burj + +" / "Oudh Abyat + +" / "Palm Beach + +" / "Sultan + +" (all
 *     trailing double "+"), plus one with the same cause but a comma instead
 *     — "Solitaire Musk, , Concentrated Unisex" — where the shop's own title
 *     already read "Musk, , Concentrated" with the size that used to sit
 *     between the two commas long gone before this file ever sees it.
 *
 *   - A gift-with-purchase bridge whose *both* sides were a plain ml size:
 *     "Bvlgari Man in Black 100ml Eau de Parfum + 15ml" and "Dolce & Gabbana
 *     Devotion 100ml Eau de Parfum + 10ml" each lose every "100ml"/"15ml"/
 *     "10ml" to the same unconditional strip, leaving "Man in Black +" and
 *     "Devotion +" — a trailing "+" with nothing on its right at all, never
 *     doubled, so the boundary strip's blind spot is simpler here but no less
 *     real.
 *
 *   - Emirates Oud's own titles restate the size a second time after a
 *     colon: "Raed Absolu Perfume 100ml EDP Lattafa Unboxed: 100ml" strips to
 *     "Raed Absolu Perfume Lattafa Unboxed:" once both "100ml"s are gone —
 *     37 names, one per product, spanning house lines as different as Al
 *     Rehab, Ard Al Zaafaran, Armaf, Fragrance World, Khadlaj, Lattafa,
 *     Maison Alhambra, Nusuk, Paris Corner, Rasasi and Surrati. Not the
 *     Al-Haramain-only bug the count this file was handed with described —
 *     it is one retailer's own recurring feed shape, and it outnumbers the
 *     Al Haramain case.
 *
 *   - A duplicated unit conversion where only one unit is ever read: "Clinique
 *     Happy Heart Perfume Spray 1.7oz/50ml" strips its "50ml" and leaves
 *     "Happy Heart 1.7oz/" (2 names), and "Escada Magnetism by Escada for
 *     Women Eau De Parfum Spray 2.5 Oz / 75 Ml" leaves "Magnetism by Escada
 *     for Women 2.5 Oz /" the same way (1 name) — both a bare trailing slash
 *     with the ml half of the same measurement gone from the far side of it.
 *
 * One more shape reaches the identical wreckage through stripRedundantSize's
 * own, separately-written strip rather than through this function at all:
 * Assaf's own "FRANKEL AVENTUS BLACK ELIXIR 30% Elixir / 200 ML" and "FRANKEL
 * BLUE ELIXIR 30% Elixir / 200 ML" (2 names) lose their one size mention and
 * leave "... Elixir /" — the same duplicated-unit slash as Happy Heart above,
 * just reached from the house-catalogue path instead of the retailer one.
 * stripRedundantSize calls this same function for exactly that reason: two
 * independently hand-written trims of the same wreckage would be a second
 * copy to keep in step with this one, the exact failure this fix's own
 * measurement above (the CONCENTRATION patterns' shared regexes, `fold`,
 * `wordSet`) keeps naming as the thing to avoid.
 *
 * There is a fifth, related orphan this function deliberately leaves alone:
 * "Kilian Good Girl Gone Bad For Women - 50ml Eau de Parfum Refillable Spray
 * + Case" loses its "50ml", "Eau de Parfum" and "Refillable Spray" and is
 * left as "Good Girl Gone Bad For Women - + Case" — a dash and a plus
 * standing side by side in the *middle* of the name, not at either edge,
 * because real content ("Case") still follows. A boundary trim can never
 * reach this one; it needs the chain check below instead, and is folded into
 * the same 53/71 count above.
 *
 * ── What this must never touch ──────────────────────────────────────────
 * A separator glued to a letter or digit on the side facing away from the
 * string's edge is never orphaned — it is either part of the name itself
 * ("+MA", Blood Concept's own eponymous line, glued straight onto the next
 * letter with no space) or a rating mark that only looks like a chain
 * ("SPF50+ PA++++": every "+" but the very first sits directly against
 * another "+", not against whitespace, so none of them reads as the
 * "connector with a real gap on both sides" this function requires). "24/7",
 * "17/17" and Turnbull & Asser's "71/72" are a fragrance's or a house's own
 * name, digits glued directly to the slash on both sides, never a joined-then-
 * emptied size. And a slash or comma with real content surviving past it —
 * "La Petite Robe Noire / 3.3 fl.oz.", "Thank U, Next" — is doing real work
 * and is never touched, because only the trailing and chained shapes above
 * ever reach this function's replacements at all. Every one of these is
 * pinned in tests/productName.test.ts alongside the real malformed titles.
 */
const STANDALONE_CONNECTOR_CHAIN_RE = /\s[+&-](\s+)(?=[+&,-](?:\s|$))/;
const COMMA_CHAIN_RE = /,(\s+)(?=[+&,-](?:\s|$))/;
const TRAILING_CONNECTOR_CHAIN_RE = /(?:\s+[+&,-])+\s*$/;
const TRAILING_GLUED_SEPARATOR_RE = /[:/]+\s*$/;
const LEADING_STANDALONE_PLUS_RE = /^\+(?=\s|$)/;

function stripOrphanedSeparators(s: string): string {
  // A run of two or more connectors separated only by whitespace can never
  // all be doing real joining work — whichever one sits closest to the real
  // content on its far side is the one still meaning anything, so every
  // earlier one in the chain is dropped and the loop repeats until nothing
  // more folds. "+" and "&" and "-" keep the whitespace they were sitting in
  // (there was always a real gap around them when they were doing real work,
  // "Aventus + Case"); a comma keeps none, because a comma is never preceded
  // by a space when it is doing real work either ("Musk, Concentrated").
  let prev: string;
  do {
    prev = s;
    s = s.replace(STANDALONE_CONNECTOR_CHAIN_RE, '$1').replace(COMMA_CHAIN_RE, '');
  } while (s !== prev);
  return s
    .replace(TRAILING_CONNECTOR_CHAIN_RE, '')
    .replace(TRAILING_GLUED_SEPARATOR_RE, '')
    .replace(LEADING_STANDALONE_PLUS_RE, '')
    .trim();
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
    // The connector that introduced the brand, now introducing nothing.
    //
    // "Flower by Kenzo" becomes "Flower by"; "K by Dolce & Gabbana" becomes
    // "K By"; "Ari by Ariana Grande" becomes "Ari By". The house is already
    // shown beside the name, so the word is not carrying a fact — it is a
    // sentence cut off mid-phrase, and it reads as a bug because it is one.
    // Measured on the live catalogue: 348 product names ended this way before
    // this rule, across houses as ordinary as Kenzo, Diesel and Dolce &
    // Gabbana.
    //
    // Only ever at the very end, and only inside this block — where a brand
    // has just been confirmed and removed from the end of the name. "for" is
    // included because "Musk Abiyad for Afnan" leaves the same wreckage, but
    // a mid-name "for" is untouched, so "Eilish for Her" and "9pm for Men"
    // keep the words that tell a reader who the fragrance is for.
    s = s.replace(/\s+(?:by|for|from|pour)\s*$/i, '');
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
  // A trailing connector is wrong however the name arrived at one.
  //
  // The trailing-brand block above strips one for the case it handles, and
  // that cleared 443 of 450 live names. The remaining 7 — "Flash by" (Jimmy
  // Choo), "Libre By" (YSL), "Polo Sport by" (Ralph Lauren) among them —
  // reached the same shape down other paths, because the brand can leave the
  // name through several rules in this function and each would need its own
  // copy of the cleanup.
  //
  // So it runs once, here, on the way out. "X by" with nothing after the "by"
  // states no fact the house beside it does not already state, and reads as a
  // sentence cut in half. Anchored to the very end, so a connector still doing
  // work keeps its words: "9pm for Men" and "Black XS Pour Elle" are
  // untouched, because something follows.
  s = s.replace(/\s+(?:by|for|from|pour)\s*$/i, '').replace(/[\s,\-&|]+$/g, '');

  // Run once, on the way out, after every strip above has had its chance to
  // hollow out whatever a separator was joining — see stripOrphanedSeparators
  // for the measured shapes (53 names, 71 products) this catches that the
  // plain boundary trim just above never could, because a doubled or
  // mid-string "+ +" / "- +" is not a boundary problem at all.
  s = stripOrphanedSeparators(s);

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
 *
 * The one size mention this strips is sometimes the second half of a
 * duplicated unit conversion — Assaf's own "FRANKEL AVENTUS BLACK ELIXIR 30%
 * Elixir / 200 ML" states the identical volume twice, once as a bare percent
 * and once in ml, joined by a slash that has nothing left to join once the ml
 * half is gone: "... Elixir /". stripOrphanedSeparators is the same fix
 * displayName's own blanket ml-strip needs for the identical wreckage
 * (Clinique's "Happy Heart 1.7oz/50ml"), called here rather than
 * reimplemented for the reason its own comment gives — two hand-written
 * copies of one trim drift the moment either changes.
 */
export function stripRedundantSize(name: string, sizeMl: number | null): string {
  if (sizeMl == null) return name;
  const tokens = [...name.matchAll(SIZE_TOKEN_RE)];
  if (tokens.length !== 1) return name;
  const token = tokens[0]!;
  if (sizeTokenValueMl(token[0]) !== sizeMl) return name;
  const stripped = stripOrphanedSeparators(
    (name.slice(0, token.index) + name.slice(token.index! + token[0].length))
      .replace(/\(\s*\)/g, ' ')
      .replace(/\[\s*\]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,\-&|]+|[\s,\-|]+$/g, '')
      .trim(),
  );
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
