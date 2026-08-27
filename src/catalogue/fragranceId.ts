import type { StoredListing } from './types.js';
import { getRetailer } from '../config/retailers.js';
import { trustworthyEan } from './productMatch.js';

/**
 * What decides whether a listing is a fragrance, and the identity a
 * fragrance is grouped under across shops.
 *
 * Pulled out of scripts/build-demo-catalogue.ts rather than duplicated,
 * because scripts/build-price-history.ts needs the exact same two answers —
 * "is this a fragrance" and "what is its id" — against the same historical
 * listings. Two independently maintained copies of this logic would drift
 * the moment either one got a fix the other did not, and the failure mode
 * would be a price history line that silently stops matching the product it
 * is meant to belong to.
 */

/**
 * Concentrations, which are the strongest signal a listing is a scent.
 *
 * "parfumee" earns its own entry rather than riding on "parfum". Titles are
 * accent-folded before this runs (see `fold`), and before that folding the
 * accented "Eau Parfumée" matched `\bparfum\b` only by accident: "é" is not a
 * word character, so it acted as the word boundary "parfum" needs. Fold the
 * accent away and "Parfumee" no longer has that boundary, which would have
 * quietly dropped Elizabeth Arden Green Tea Eau Parfumée — a fix for one
 * accent bug creating another. It is a real concentration in its own right
 * (Elizabeth Arden, Roger & Gallet, Diptyque all use it), so naming it is
 * both the fix and the more honest description.
 *
 * "perfume" was a real gap here: a title reading "Chanel No 5 Perfume 100ml"
 * matched none of the French-derived terms and was silently rejected as not
 * a fragrance, despite being an obvious one — plain English listings (feeds
 * especially) favour "perfume" over "parfum". "attar" and "oud" cover the
 * concentrated-oil style Middle Eastern perfumery uses, relevant because the
 * registry already models a 'mideast' tier for three retailers.
 */
const CONCENTRATION =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|eau parfumee|parfumee|parfum|perfume|edp|edt|edc|aftershave|cologne|extrait|attar|oud)\b/i;

/**
 * Things that live near perfume in a sitemap but are not perfume.
 *
 * "hair" was added after "Balmain Hair Silk Perfume 200ml" and "Sachajuan
 * Protective Hair Perfume 50ml" both passed as fragrance: real products,
 * genuinely named with the word "Perfume", but a scented hair treatment
 * rather than something worn as one. No genuine fine fragrance is titled
 * "[house] Hair [anything]", so the word alone is safe to exclude — the
 * surrounding \b...\b only matches it as a whole word, so this stays
 * exactly as safe as the existing "reed" entry already is against "Creed"
 * (no word boundary between the C and the r, so it is never touched).
 * Checked against the live catalogue before being added: no collision.
 *
 * "serum" is the same shape as "hair": "Lancôme Absolue L'Extrait Elixir
 * Anti-Ageing Serum 30ml" is a real product, genuinely stated at an
 * "extrait" strength and a parseable size, but a skincare serum rather than
 * something worn as a scent. Checked before adding it, the same way "hair"
 * was: 894 active listings across the harvest carry the bare word — face
 * serum, eye serum, beard serum, hair serum, brow serum, scalp serum, every
 * one of them skincare or haircare (Anua, Avène, CeraVe, Clarins, Biotherm,
 * Beauty Of Joseon among others) — and this Lancôme row is the *only* one
 * that was ever actually being counted as a fragrance; the rest are already
 * excluded upstream by having no stated concentration at all. No genuine
 * fine fragrance is titled "[house] [anything] Serum", so the bare word is
 * safe the same way "hair" is — checked, no other currently-classified
 * fragrance in the catalogue carries it.
 *
 * The scented-air and body-spray entries — "air freshener", "room spray",
 * "lamp fragrance", "home spray", "body spray", "body mist" — were added after
 * 26 of them were being sold to readers as perfume. They get in because the
 * concentration test is satisfied by a word that is part of the *product line's*
 * name rather than a strength: almost all of them are Lattafa's "Bade'e Al Oud"
 * or "Oud Mood" range, where "Oud" is the name, plus a parseable size. So
 * "Badee Al Oud Sublime Air Freshener 300ml" and "Lattafa Bade'e Al Oud Room
 * Spray 300ml" sat in the comparison beside the actual eau de parfum of the
 * same line, at £2.99 and £5.29 — which reads as the bargain of the site and is
 * not the same product at all.
 *
 * Every one is a phrase, never a bare word, and that is the whole point:
 *
 *   - bare "air" would take Nina Ricci L'Air du Temps and CK Eternity Air
 *     (checked: 40 kept listings contain "air", 34 of them real fragrances);
 *   - bare "room" would take Vilhelm Parfumerie's Room Service Eau de Parfum;
 *   - bare "body" would take Reebok Cool Your Body, Vilhelm Parfumerie Body
 *     Paint and TOVA Body Mind Spirit, all genuine eaux de parfum.
 *
 * "body spray" covers "all over body spray" without needing its own entry.
 * Checked across all 32,912 active priced listings: exactly two titles pair one
 * of these phrases with a real concentration — "Lattafa Najdia Eau De Parfum
 * 100ml & Body Spray 50ml" and "Arthes Rocky Man 100Ml EDT + Body Spray 200Ml
 * Set". Both are two products sold as one unit, and both were being published
 * as a lone 100ml bottle at the pair's price, which understates what the bottle
 * costs — the same misrepresentation as MULTI_PACK, pointing the other way. So
 * they are dropped deliberately, not tolerated as collateral.
 */
export const NOT_A_FRAGRANCE =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|body cream|shampoo|conditioner|deodorant|shower gel|body wash|candle|diffuser|reed|gift ?set|set of|bundle|tester|sample|refill|travel spray|decant|hand wash|moisturis|lotion|balm|scrub|talc|hair|serum|air ?freshener|room spray|lamp fragrance|home spray|body spray|body mist)\b/i;

/**
 * The size phrases sizeMl() reads, exported so a caller that needs to find
 * rather than merely measure a size — productName.ts's stripRedundantSize,
 * which has to locate the exact substring stating the size before it can
 * remove it — matches precisely what this function matches. A second,
 * independently written copy of these two patterns would drift the moment
 * either one changed, and the failure mode is exactly the header comment
 * above: a title sizeMl() reads a size out of, that the other pattern reads
 * differently or not at all.
 */
export const ML_SIZE_RE = /(\d{1,4}(?:\.\d)?)\s*ml\b/i;
export const OZ_SIZE_RE = /(\d{1,2}(?:\.\d)?)\s*(?:fl\.?\s*)?oz\b/i;
/** 1 fl oz in millilitres — the imperial fluid ounce, which is what every oz size in the catalogue means. */
export const OZ_TO_ML = 29.5735;

/**
 * A title that states a menu of the sizes a product comes in, then, at the
 * very end and separated from that menu by nothing but whitespace, states
 * the one size *this particular row* actually is.
 *
 * This is Al Haramain's Shopify feed: the product's own title spells out
 * every option it sells ("Musk Al Tahara Perfume Oil 3ml, 6ml, 12ml, 24ml,
 * 35ml"), and the harvester appends the variant's own title after it
 * verbatim, producing "...35ml 3ml" for the 3ml row, "...35ml 6ml" for the
 * 6ml row, and so on. Reading the first ml number in a title like that — the
 * ordinary rule below — reads the *menu's* first entry every time, so all
 * five rows come back "3ml" regardless of which one they actually are. Every
 * price on the product then compares a real 3ml bottle against what reads as
 * a 35ml one, and scripts/build-demo-catalogue.ts's find-duplicate-groups
 * step, matching on that identical wrong size, folds all five rows into one
 * product — the "Al Haramain multi-size mis-grouping" bug report.
 *
 * Measured against the whole of data/catalogue on 2026-08-26: this pattern
 * matches exactly 30 listings, all thirty of them Al Haramain "Perfume Oil"
 * rows across eight product URLs, and the size it recovers tracks price
 * exactly — Musk Al Tahara's five rows read 3/6/12/24/35ml at £4.75/£7/£9/
 * £18/£26, a sensible per-ml curve, where the old first-token rule read every
 * one of them as 3ml. It does not fire anywhere else in the catalogue.
 *
 * Deliberately narrow, not "prefer the last size mentioned" in general.
 * Titles that state two *different* sizes joined by "+" or "&" are common
 * and mean something else entirely — a bottle plus a smaller gift ("Burberry
 * Her 100ml Eau de Parfum + 10ml Set", "Boss Bottled EDT 50Ml + Deo Spray
 * 150Ml Gs") — where the *first*, headline size is the bottle actually being
 * priced and the trailing one is a companion product's own size, not this
 * one's. A blanket "trust the last mention" rule would silently reprice
 * every one of those to the free gift's size. What is checked for here is
 * specifically a clean, bare list of two or more sizes — nothing but commas
 * or pluses between them, no words like "Set", "Spray" or "&" — immediately
 * followed by one more bare size and the end of the title, which a genuine
 * bundle listing never is: there is always a word or a "+" sitting between
 * the two sizes it names, because it is naming two different products, not
 * restating one option list before picking one of its own entries.
 *
 * Also deliberately not "the trailing size must equal one of the menu's own
 * entries" — Al Haramain's own menu text is a fixed boilerplate string that
 * does not always list every size the product actually comes in (several
 * titles read "...3ml + 6ml + 12ml 24ml" and "...3ml + 6ml + 12ml 35ml",
 * where 24 and 35 never appear in the menu half at all), so requiring
 * membership would silently fall back to the wrong first-token answer on
 * exactly the rows furthest from the menu's own start.
 */
const SIZE_MENU_THEN_VARIANT_RE =
  /\d{1,4}(?:\.\d)?\s*ml(?:\s*[,+]\s*\d{1,4}(?:\.\d)?\s*ml){1,}\s+(\d{1,4}(?:\.\d)?)\s*ml\s*$/i;

/**
 * A title that restates its own headline size once, in words, before ending
 * on the row's own — possibly different — variant size.
 *
 * A second Shopify-variant artefact of the same underlying bug
 * SIZE_MENU_THEN_VARIANT_RE fixes, found re-measuring the 42 multi-size
 * titles that fix (2797294) deliberately left alone. Emirates Oud's product
 * titles restate a "headline" size — the shop's own default/first variant —
 * then repeat the concentration and brand ("100ml EDP Maison Asrar"), then
 * the harvester appends *this row's own* variant size at the very end:
 * "Milky Way Perfume 100ml EDP Maison Asrar 25ml" is the 25ml row of a
 * product whose default variant is 100ml, not a 25ml bottle mislabelled
 * twice. Reading the first ml number, the ordinary rule below, reads the
 * headline every time, so this row publishes as "100ml" at its actual 25ml
 * price — and for Odyssey Aqua, whose 60ml variant is genuinely cheaper
 * (£16.99) than its 100ml one (£22.50), that reads as an implausibly cheap
 * 100ml bottle rather than what it is.
 *
 * Confirmed against data this function cannot see, but which corroborates
 * the trailing number rather than guesses at it: each row's own
 * retailerSku carries the real variant directly — "...-60ml" beside
 * "...-100ml" for Odyssey Aqua, "SMALL BOTTLE - MILKY WAY" beside "BIG
 * BOTTLE - MILKY WAY" for Milky Way — and Odyssey Aqua's price falls with
 * it (100ml £22.50, 60ml £16.99, a sensible smaller-costs-less relationship
 * a same-size misreading would erase).
 *
 * Requires no comma, "+" or "&" anywhere in the title — the signal a
 * genuine bundle or gift-with-purchase always carries, see
 * SIZE_MENU_THEN_VARIANT_RE's own comment — and requires at least one real
 * word between the two sizes, not just whitespace. That second condition is
 * what keeps this from also firing on Armaf's Hamidi sub-line ("...100ml
 * 110ml", nothing at all between the two numbers): re-reading that shop's
 * own description text row by row shows the trailing number is *not*
 * reliably the right one there — two of its four rows confirm the first
 * number instead — so a title with nothing between its two sizes stays
 * deliberately unresolved; see tests/fragranceFilter.test.ts's own comment
 * on that shape for the evidence.
 *
 * Measured against every file in data/catalogue on 2026-08-26: fires on 110
 * titles. On 108 of them — mostly Escentual's "...Xml Gift Set Xml" and
 * further Al Haramain titles that restate one size rather than listing a
 * menu — the headline and trailing numbers are identical, so this changes
 * nothing either way. On exactly 2, both Emirates Oud, both above, it
 * recovers a genuinely different, corroborated size. It does not fire on
 * any of the 33 remaining multi-size titles that are genuine bundles (all
 * of them contain a "+" or "&") nor on the bare two-size titles above.
 */
const SIZE_RESTATED_THEN_VARIANT_RE =
  /\d{1,4}(?:\.\d)?\s*ml\b(?:\s+[A-Za-z][\w.'-]*)+\s+(\d{1,4}(?:\.\d)?)\s*ml\s*$/i;

/**
 * A title stating two different sizes with nothing between them but
 * whitespace — the one shape 2797294 measured and deliberately left
 * unresolved (see that commit's note, reproduced on tests/fragranceFilter.test.ts's
 * "leaves an ordinary bundle alone" describe block): Armaf's four Hamidi
 * Maison Luxe titles ("...Eau De Parfum 100ml 110ml"), its own "Red Velvet
 * Eau De Parfum 70ml 100ml" and "Club De Nuit Woman Luxury French Perfume
 * Oil 20ml 18ml", and Avon's "Full Speed Eau de Toilette - 100ml 75ml".
 *
 * Genuinely ambiguous from the title alone, not merely unstated: the title
 * states a size, twice, and the two statements disagree. That is a different
 * fact from a title naming no size at all, and sizeConflict below exists so
 * isFragrance can tell the two apart — see its own comment for why the
 * difference matters to that function specifically. Two of these seven —
 * see SIZE_CONFLICT_RESOLVED just below — turn out not to be ambiguous once
 * the shop's own description text is read; this pattern still matches all
 * seven titles (the shape it names is unchanged), but sizeMl no longer
 * returns null for those two.
 *
 * Requires no comma, "+" or "&" anywhere in the title, exactly like
 * SIZE_RESTATED_THEN_VARIANT_RE just above and for the identical reason: a
 * bundle or gift-with-purchase (Burberry Her 100ml Eau de Parfum + 10ml Set)
 * also carries two sizes, but the second one is a free extra's own size, not
 * a second statement about this bottle, and that shape always carries one of
 * those three characters. This pattern requires the opposite of
 * SIZE_RESTATED_THEN_VARIANT_RE's own "at least one real word between the two
 * sizes" — nothing at all, not even a word, between them — which is exactly
 * the shape that comment already carves out as unresolved by that rule: "a
 * title with nothing between its two sizes stays deliberately unresolved".
 *
 * Measured against every file in data/catalogue on 2026-08-27: fires on
 * exactly the seven titles named above and no others. Every other title in
 * the catalogue with two bare ml mentions in a row states the identical
 * number twice ("Club De Nuit Woman Eau De Parfum 30ml 30ml", nine more like
 * it) — a restatement, not a disagreement, which is why the check below
 * requires the two captured numbers to actually differ.
 */
const SIZE_CONFLICT_RE = /\b(\d{1,4}(?:\.\d)?)\s*ml\s+(\d{1,4}(?:\.\d)?)\s*ml\s*$/i;

/**
 * Two of SIZE_CONFLICT_RE's seven titles, resolved by reading fields
 * SIZE_CONFLICT_RE itself never sees — the same method that solved Emirates
 * Oud's restated-headline shape (SIZE_RESTATED_THEN_VARIANT_RE above), but
 * unlike that case the distinguishing fact lives in the row's own
 * `description`, not in a title-generalisable pattern or in `retailerSku`,
 * so it is recorded here as an exact-title lookup rather than a second
 * regex. Checked 2026-08-27 against data/catalogue/armaf.json and
 * data/catalogue/avon.json:
 *
 *   - "Club De Nuit Woman Luxury French Perfume Oil 20ml 18ml"
 *     (retailerSku ARF32108731): the row's own description opens "CLUB DE
 *     NUIT WOMAN - LUXURY FRENCH PERFUME OIL 20ML" and later repeats "This
 *     20ml elixir" — 20ml, the title's first number, is the only ml figure
 *     the description ever states; "18ml" appears nowhere in it.
 *
 *   - "Full Speed Eau de Toilette - 100ml 75ml" (retailerSku F1569640): the
 *     row's own description's "Product specification" bullet list states
 *     plainly "100ml." — again the title's first number, and again the only
 *     one the description states. Corroborated by price: this row is £13,
 *     matching every other 100ml Full Speed Eau de Toilette in the same
 *     feed (Max Turbo, Sky Jump, both £13), while Full Speed's own smaller
 *     30ml Eau de Toilette is £8.50 — a sensible smaller-costs-less curve
 *     that a same-size misreading would erase, and a mismatched one
 *     (reading this row as 75ml, cheaper than the confirmed 100ml lines at
 *     the same £13) would not disturb, since 75ml at £13 is not obviously
 *     wrong either — the description bullet is the real evidence here, the
 *     price is only corroborating it.
 *
 * The other five SIZE_CONFLICT_RE titles — Hamidi Maison Luxe's four lines
 * and Red Velvet — are deliberately not in this map. Hamidi's own
 * description text does distinguish its four rows (Patchouli Imperial and
 * Gypsy Rose confirm 110ml, Midnight Amber and Elixir confirm 100ml — see
 * sizeMl's own comment and tests/fragranceFilter.test.ts), but the title's
 * first number is right for two of the four and wrong for the other two, so
 * unlike the pair above there is no way to fold that fact into a rule keyed
 * on anything sizeMl actually receives (it takes only the title string, not
 * retailerSku or description) without hardcoding all four by name — a
 * fundamentally different, per-product fact each of these two entries
 * happens to share with its own title's first number, not a general "first
 * number wins" rule. Red Velvet's own description never states a size at
 * all (checked the same way, retailerSku ARF32121252): nothing to read.
 * Both stay unresolved.
 */
const SIZE_CONFLICT_RESOLVED: ReadonlyMap<string, number> = new Map([
  ['Club De Nuit Woman Luxury French Perfume Oil 20ml 18ml', 20],
  ['Full Speed Eau de Toilette - 100ml 75ml', 100],
]);

/**
 * Whether a title states two different sizes with nothing between them but
 * whitespace, and so has a size fact that is present but cannot be read as
 * one number *from the title alone* — see SIZE_CONFLICT_RE's own comment for
 * the shape and the measurement. Still true for all seven of that comment's
 * titles, including the two SIZE_CONFLICT_RESOLVED now resolves: this
 * function is about what the title itself states, not about whether some
 * other field happens to settle it — see sizeMl's own comment for why the
 * two answers no longer always agree.
 *
 * Exported so a caller that needs to know *why* sizeMl came back null can
 * tell "this title never said" apart from "this title said two different
 * things" without re-deriving the shape itself — isFragrance below is the
 * first such caller, and the reasoning for why it needs to is on that
 * function.
 */
export function sizeConflict(title: string): boolean {
  if (/[,+&]/.test(title)) return false;
  const m = title.match(SIZE_CONFLICT_RE);
  return m !== null && m[1] !== m[2];
}

/**
 * Size in millilitres, needed before two listings can be compared at all.
 *
 * Null means one of two different things, and sizeConflict above is what
 * tells them apart: a title that names no size at all (silence), or one of
 * the seven titles named on SIZE_CONFLICT_RE's own comment that states two
 * and disagrees with itself (a live but unreadable fact). This function does
 * not choose between the two conflicting numbers by guessing from the title;
 * earlier versions returned the first one, which was confidently wrong for
 * two of Hamidi Maison Luxe's four lines (checked against armaf.uk's own
 * description text — see tests/fragranceFilter.test.ts). A wrong number that
 * looks exactly like a right one is worse than an honest null, once every
 * downstream consumer can actually represent one — see productMatch.ts's
 * MatchableProduct, wasPriceCredibility.ts's CredibilityOffer and
 * demo/volumeBands.ts, all of which treat a null size as "cannot compare"
 * rather than "matches" or "zero". Two of the seven — see
 * SIZE_CONFLICT_RESOLVED's own comment for the evidence — are the exception:
 * not a guess from the title, but a real field (the row's own description)
 * this function does not otherwise read, checked and recorded by exact title
 * rather than re-derived here.
 */
export function sizeMl(title: string): number | null {
  // Checked ahead of the ordinary first-token rule below, not instead of it —
  // see SIZE_MENU_THEN_VARIANT_RE's own comment for why only this specific,
  // narrow shape is allowed to override "the first size mentioned wins".
  const menu = title.match(SIZE_MENU_THEN_VARIANT_RE);
  if (menu) return Math.round(Number.parseFloat(menu[1]!));
  // A genuine bundle or gift-with-purchase always carries a ",", "+" or "&"
  // — see SIZE_RESTATED_THEN_VARIANT_RE's own comment — so checking for
  // their absence first, rather than folding it into the pattern, is what
  // keeps that regex from ever having to also rule out every bundle shape
  // itself.
  if (!/[,+&]/.test(title)) {
    const restated = title.match(SIZE_RESTATED_THEN_VARIANT_RE);
    if (restated) return Math.round(Number.parseFloat(restated[1]!));
    // See SIZE_CONFLICT_RE's own comment. Checked after the restated-variant
    // rule just above (which requires a word between the two sizes) so the
    // two patterns can never both match the same title — one requires a word
    // between the sizes, this requires there be none.
    const conflict = title.match(SIZE_CONFLICT_RE);
    if (conflict && conflict[1] !== conflict[2]) {
      // See SIZE_CONFLICT_RESOLVED's own comment: two of these seven titles
      // are settled by the row's own description text, not guessed from the
      // title. Looked up by exact title rather than folded into the regex
      // above because the distinguishing fact is per-product, not a pattern
      // that generalises across the shape the way SIZE_RESTATED_THEN_VARIANT_RE's
      // does.
      const resolved = SIZE_CONFLICT_RESOLVED.get(title.trim());
      return resolved ?? null;
    }
  }
  const ml = title.match(ML_SIZE_RE);
  if (ml) return Math.round(Number.parseFloat(ml[1]!));
  const oz = title.match(OZ_SIZE_RE);
  if (oz) return Math.round(Number.parseFloat(oz[1]!) * OZ_TO_ML);
  return null;
}

/**
 * A title selling several bottles at once rather than one.
 *
 * Only consulted for a `fragranceOnlyCatalogue` shop, and it has to be,
 * because `sizeMl` reads the first size it finds: "Molecule 01 ATOM.iser. Set
 * 3 x 8.5ml" is an £80 set of three, and taking it at face value would list
 * it as a single 8.5ml bottle at £80 — the most overpriced thing on the site,
 * and wrong. The concentration test happened to keep these out before; once
 * that is relaxed something has to.
 *
 * The `>= 2 sizes` half of this is why this is not applied site-wide. Emirates
 * Oud repeats the size in its own titles ("Odyssey Aqua Perfume 100ml EDP
 * Armaf 100ml" is one bottle, listed twice over), so as a global rule it would
 * drop genuine single bottles. Measured before scoping it: 118 currently-kept
 * listings across all shops would have gone, most of them real.
 */
const MULTI_ITEM = /\bset\b|\b\d+\s*x\b|\bx\s*\d+\b/i;

/**
 * A quantity multiplied by a size — "3x10ml", "4 x 7.5ml", "5X20ml".
 *
 * This is the half of the multi-pack question that is safe to ask everywhere,
 * and it is asked everywhere, because the damage it prevents is not confined to
 * fragrance-only shops. `sizeMl` reads the first size in a title, so "Parfums de
 * Marly Delina Exclusif Parfum 3x10 ml Travel Set + Case" at £205 publishes as a
 * 10ml bottle at £205 and "Franck Boclet Cocaine Extrait de Parfum 4x20 ml" at
 * £114 as a 20ml. Those land at £14-£20/ml: expensive rather than impossible,
 * so nothing downstream flags them, and a reader comparing 10ml bottles is
 * quietly shown the price of thirty millilitres. Measured across the live
 * catalogue: 44 kept listings match this, and all 44 were read by hand — every
 * one is a genuine multi-pack, discovery set or travel-refill trio.
 *
 * Why this and not the `>= 2 sizes` rule above, which would also catch them.
 * Re-measured today, that rule would drop 47 kept listings this one does not,
 * and they are mostly real single bottles: Emirates Oud simply repeats the size
 * in its own titles ("Odyssey Aqua Perfume 100ml EDP Armaf 100ml", "Marwa
 * Perfume 100ml EDP Arabiyat Prestige 100ml"), Escentual writes "I Want Choo
 * Eau de Parfum 100ml - Collector's Edition 100ml", Oud Arabian writes
 * "Bujairami Only Ever 100ml 100ml Eau De Parfum". One bottle each. The
 * difference is that a repeated size states the same fact twice, whereas a
 * quantity sitting directly against a size states a count — which is the thing
 * actually being asked.
 *
 * A bare `\bset\b` is not safe globally either, for the same class of reason:
 * "Tommy Bahama Set Sail Cologne St. Barts Eau de Cologne 100ml Spray" is one
 * 100ml bottle whose own name contains the word, and Fragrance Click's "Burberry
 * Her 100ml Eau de Parfum + 10ml Set" really is a 100ml bottle with a
 * miniature beside it — the headline size `sizeMl` reads is the right one, so
 * there is nothing to fix and dropping it would lose a real offer.
 *
 * The count must be 2 or more. "1 x 5ml" names a single bottle, and while every
 * such title in the catalogue today is already rejected for other reasons (all
 * 5 checked), a rule that says "several" should not quietly mean "one or more".
 */
const MULTI_PACK = /\b([2-9]|[1-9]\d)\s*[x×]\s*\d{1,4}(?:\.\d)?\s*ml\b/i;

function sellsOnlyFragrance(retailerId: string): boolean {
  return getRetailer(retailerId)?.fragranceOnlyCatalogue === true;
}

/**
 * Drop diacritics so an accented spelling matches the plain one.
 *
 * "eau fraiche" has been in CONCENTRATION from the start, but a shop writing
 * the word properly — "Eau Fraîche" — did not match it, and the listing was
 * rejected as not a fragrance. That silently dropped seven real bottles from
 * Nicchia Luxury UK, including Kilian Good Girl Gone Bad at £205 and Robert
 * Piguet Fracas: the exact opposite of what a fragrance comparison is for,
 * decided by a circumflex.
 *
 * Applied to the whole title before matching rather than by adding accented
 * alternatives to the pattern, because the next European shop will spell
 * "extrait de parfum" or "Crème" its own way too, and a list of accepted
 * spellings only ever covers the ones already seen. NFD splits a letter into
 * base + combining mark; the range stripped here is exactly the combining
 * diacritics block, so nothing but accents is removed.
 */
function fold(title: string): string {
  return repairMojibake(title).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Undo UTF-8 that was decoded as Latin-1 somewhere upstream.
 *
 * MyBeauty.Boutique's feed arrives this way: "Rosé" reaches us as "RosÃ©",
 * "Légère" as "LÃ©gÃ¨re". 156 of its listings carry it, and 114 of those were
 * already live on the site — a reader browsing today sees "212 VIP RosÃ©".
 *
 * It also broke classification in a way that only showed up once titles were
 * accent-folded. "ParfumÃ©e" happens to match `\bparfum\b`, because "Ã" is
 * not a word character and so supplies the boundary; repair or fold it and
 * that accidental boundary goes, taking a real Roger & Gallet bottle with it.
 * So the repair belongs here, ahead of folding, rather than only at display
 * time: the same text has to drive both the decision and the label.
 *
 * Deliberately conservative. Only a substring that is actually, provably a
 * CP1252 misreading of valid UTF-8 is ever replaced — a legitimate "Ã" or
 * "Â" is left exactly as it is.
 *
 * ── Why the reverse step is CP1252 and not Latin-1 ──────────────────────────
 * The upstream decoder was a Windows one, and Windows-1252 is not Latin-1 in
 * the range 0x80-0x9F: where Latin-1 has control characters, CP1252 has
 * typography. So the UTF-8 byte 0x89 — the second byte of "É" — came back as
 * "‰" (U+2030), not as a control character, and `Buffer.from(s, 'latin1')`
 * cannot put it back: it truncates U+2030 to 0x30, the digit "0". "Ã‰clat"
 * became "�0clat", a whole-string guard would see the U+FFFD and refuse the
 * entire title, and real titles stayed broken because the reversal was using
 * the wrong table rather than because they were unrepairable.
 *
 * Mapping those 27 characters back to the bytes they came from is not a
 * guess — it is the exact inverse of the decoding that broke them. It
 * recovers "Atelier Cologne Éclat De Tubéreuse", "Caron Rose Ébène", "Miller
 * Harris Étui Noir", "Giorgio Armani SÌ" and "Benetton TRIBÙ".
 *
 * ── Why the repair runs per two-character cluster, not on the whole string ──
 * A first version of this function round-tripped the *entire* title through
 * CP1252 at once, and that broke on exactly the titles that most needed
 * fixing: "Hermès Terre d'Hermès Eau GivrÃ©e" carries one *correct* UTF-8
 * accent ("Hermès", byte 0xC3 0xA8) sitting right next to one *broken* one
 * ("GivrÃ©e"). A whole-string reversal has no way to treat those two
 * differently — reading "è" back as a CP1252 byte and continuing into "s"
 * (not a valid continuation byte) invalidates the decode, and the guard then
 * refuses the *entire* title, "Hermès" included, leaving the one part that
 * needed fixing untouched along with the part that never did.
 *
 * Repairing `/[ÃÂ][\s\S]/` clusters one at a time instead means each
 * candidate mojibake pair stands or falls on its own two characters. "GivrÃ©e"
 * repairs to "Givrée" while the neighbouring "Hermès" is never even examined,
 * because it does not start with "Ã" or "Â" in the first place. This is what
 * recovers "Lancôme Ã”ff Now" → "Lancôme Ôff Now", "Lancôme La Vie Est Belle
 * IntensÃ©ment" → "...Intensément", and the Hermès title above — all three
 * previously left broken by the whole-string version — without touching a
 * single correctly-encoded character anywhere else in the same title.
 *
 * ── The one case handled by pattern, not by byte reversal ──────────────────
 * "Coty PrÃªt Ã Porter", "Gloria Vanderbilt Minuit Ã New York", "...Jardin Ã
 * New York": the "êt" in each of these repairs by ordinary cluster reversal
 * ("Ãª" → "ê"), but the bare "Ã" that follows does not — it should be
 * followed by 0xA0, the second byte of "à", and something upstream collapsed
 * that non-breaking space into an ordinary one, so 0xC3 0x20 is left, which
 * is not valid UTF-8 and never was: there is no byte sequence to reverse.
 *
 * A bare "Ã" standing as its own whitespace-delimited word is nonetheless
 * repaired to "à", and this is evidence, not a guess dressed up as one: 0xA0
 * is the *only* byte a two-byte UTF-8 sequence starting 0xC3 can end in that
 * CP1252 maps to something whitespace — every other continuation byte in that
 * lead byte's range (0x80-0xBF) becomes a visible character (€, ª, ©, ¨...),
 * which would still be sitting right there if that were what had happened. So
 * a lone "Ã" between spaces cannot have come from any other accented letter —
 * the same corpus confirms it directly: "Jeanne Arthes Balade Ã  Paris"
 * and "Leonor Greyl Masque Ã  l'Orchidée" carry the identical corruption
 * with the non-breaking space still intact, and ordinary cluster reversal
 * already turns those into "à" with zero special-casing. The isolated-word
 * rule below only supplies the byte that a whitespace normaliser deleted
 * elsewhere in the very same feed — it names no character this function
 * cannot already prove.
 *
 * ── What is still left alone, on purpose ────────────────────────────────────
 * "Liquides Imaginaires Âme de Fleur" is correct French — âme, soul — and
 * only trips the `Â.` marker that decides whether to look at all. "Â" is
 * followed by "m", 0x6D is not a valid UTF-8 continuation byte for lead byte
 * 0xC2, the per-cluster decode is invalid, and the cluster is left exactly as
 * written. Declining it is this function working, not failing.
 */

/**
 * Windows-1252's 0x80-0x9F block, inverted: the character a byte was decoded
 * into, back to the byte. Every other code point below 0x100 is its own byte
 * in both encodings, so only these 27 need naming. 0x81, 0x8D, 0x8F, 0x90 and
 * 0x9D are unassigned in CP1252 and so cannot appear here.
 */
const CP1252_HIGH_BYTES: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

/**
 * The bytes a CP1252 decoder would have been handed to produce this string,
 * or null if some character could not have come from a single byte — in which
 * case the string was never a CP1252 misreading and there is nothing to undo.
 */
function cp1252Bytes(s: string): Buffer | null {
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) {
      bytes.push(cp);
      continue;
    }
    const byte = CP1252_HIGH_BYTES.get(cp);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/**
 * The one correct character a two-character `[ÃÂ][\s\S]` cluster stands for,
 * or null if this specific pairing could not have come from a CP1252
 * misreading of valid UTF-8 — in which case there is nothing to undo and the
 * two characters are left exactly as they are.
 */
function cp1252Pair(pair: string): string | null {
  const bytes = cp1252Bytes(pair);
  if (bytes === null || bytes.length !== 2) return null;
  const repaired = bytes.toString('utf8');
  if (repaired.length !== 1 || repaired.includes('�')) return null;
  return repaired;
}

export function repairMojibake(title: string): string {
  if (!/Ã.|â€|Â./.test(title)) return title;
  let out = title.replace(/[ÃÂ][\s\S]/g, (pair) => cp1252Pair(pair) ?? pair);
  // See "The one case handled by pattern, not by byte reversal" above: the
  // only whitespace-delimited word a bare "Ã" can be is "à" losing its
  // non-breaking-space second byte to a later normaliser.
  out = out.replace(/(^|\s)Ã(?=\s|$)/g, (_match, lead: string) => `${lead}à`);
  return out;
}

export function isFragrance(l: StoredListing): boolean {
  const t = fold(l.rawTitle);
  if (NOT_A_FRAGRANCE.test(t)) return false;
  // A null size means one of two different facts — see sizeMl's own comment
  // — and only one of them is a reason to reject a listing here. Silence
  // (no size stated at all) is the load-bearing rule this gate exists for:
  // it is what keeps "Fragrance-free baby nappy cream" and every other
  // non-perfume a sitemap walk turns up out of the catalogue, because
  // nothing that is actually a bottled fragrance is sold with no size ever
  // mentioned. A conflict (two sizes stated, disagreeing — sizeConflict)
  // is a different fact about the same listing: the shop said, twice, that
  // this is a real, sized bottle, and simply cannot be read as one number
  // by a title-only rule. Rejecting that would delist seven real,
  // correctly-priced fragrances (Hamidi Maison Luxe's four Armaf lines, Red
  // Velvet, Club De Nuit Woman's perfume oil, Avon's Full Speed) over a fact
  // this file already knows how to state honestly downstream — see
  // src/catalogue/productMatch.ts's MatchableProduct and
  // src/catalogue/wasPriceCredibility.ts's CredibilityOffer, both of which
  // already treat a null sizeMl as "cannot compare", never "matches" or
  // "not a fragrance".
  if (sizeMl(t) === null && !sizeConflict(t)) return false;
  if (l.priceGbp === null || l.priceGbp <= 0) return false;
  // Asked of every shop, unlike the two rules inside the branch below — see
  // MULTI_PACK for why a quantity against a size is the one multi-pack signal
  // that survives contact with the whole catalogue.
  if (MULTI_PACK.test(t)) return false;

  // A shop whose whole catalogue is fragrance does not have to say so in every
  // title — see Retailer.fragranceOnlyCatalogue for why this is an explicit
  // per-shop statement rather than anything inferred. Everywhere else the
  // concentration word stays required, because it is what keeps a broad
  // beauty retailer's skincare out of a fragrance comparison.
  if (sellsOnlyFragrance(l.retailerId)) {
    return !MULTI_ITEM.test(t) && (t.match(/\d{1,4}(?:\.\d)?\s*ml\b/gi) ?? []).length < 2;
  }

  return CONCENTRATION.test(t);
}

/**
 * EAN groups the same bottle across shops. Without one a listing can only
 * stand alone, which is honest: we cannot claim two titles are the same
 * product until the matcher exists.
 *
 * `untrustworthy`, when given, is the set productMatch.ts's untrustworthyEans
 * computed over every listing this build is considering — the EANs one
 * retailer's own feed has printed on two or more different products (19 of
 * them measured in data/catalogue/nicchia-luxury-uk.json; see
 * productMatch.ts's header for the actual titles). A listing carrying one of
 * those falls back to its retailer-sku identity exactly as a listing with no
 * EAN at all would, because that is what it is being asked to prove is a
 * shared identity and it cannot: two of Nicchia's own listings — "Bois 1920
 * Cannabis Dolce" and "...Cannabis Salata" — both key to `ean-8055277283900`
 * under the plain rule below, so the second one silently absorbs into the
 * first's product record the moment it is read, before findDuplicateGroups
 * (src/catalogue/productMatch.ts) or any name/size/concentration check ever
 * runs. Omitting the argument keeps today's behaviour exactly as it was,
 * which is safe only because every caller now passes it — see
 * scripts/build-demo-catalogue.ts and scripts/build-price-history.ts, which
 * must compute and pass the identical set or the two builds' ids drift, the
 * failure this file's own header warns about.
 */
export function fragranceId(l: StoredListing, untrustworthy?: ReadonlySet<string>): string {
  const ean = untrustworthy ? trustworthyEan(l, untrustworthy) : l.ean;
  return ean
    ? `ean-${ean}`
    : `${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
