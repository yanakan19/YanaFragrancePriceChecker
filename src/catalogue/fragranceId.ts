import type { StoredListing } from './types.js';
import { RETAILERS, getRetailer } from '../config/retailers.js';
import { trustworthyEan } from './productMatch.js';
import { giftSetId, isGiftSet } from './giftSet.js';

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
export const CONCENTRATION =
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
 *
 * Added 2026-10-03, from reading every offer the site showed for Home
 * Bargains, B&M and Morrisons by hand (data/catalogue/<shop>.json titles and
 * descriptions):
 *
 *   - "body ?wash" and "shower ?gel" were "body wash" and "shower gel", and
 *     Home Bargains writes the word joined: five "Firetrap ... Eau De Toilette
 *     50ml & Bodywash 150ml" sets were showing as lone 50ml bottles, and
 *     MyBeauty.Boutique's "Montblanc Explorer Ultra Blue EDP 60Ml &
 *     Showergel" the same way. No kept listing uses either joined word for
 *     anything else.
 *   - "socks": "Nicce Ladies 100ml Eau De Toilette & Ankle Socks", a gift set
 *     ("Perfect gift set", its own description). The only kept title with it.
 *   - "refillable perfume spray": an empty atomiser, not a perfume. Home
 *     Bargains' "Let's Travel Atomiser Refillable Perfume Spray 5ml" at £0.89
 *     and five of Beauty Base's "Travalo Classic Refillable Perfume Spray 5ml"
 *     colours. A refillable *perfume* writes the scent between the words
 *     ("Burberry Goddess Eau De Parfum 50ml Refillable Spray"); none of the
 *     238 kept "refillable" titles of that kind contains this phrase.
 *   - "pet care": B&M's "Pet Care Cologne 100ml - Dylan", "a deodorising
 *     spray for your dog". Dog colognes that do not say so in the title are
 *     caught from the description instead, see PET_PRODUCT below.
 *   - "empty perfume bottle", "travalo", "rechargeable perfume": containers,
 *     not perfume. Al Haramain's "Plain Empty Perfume Bottle 12 Pieces of
 *     50ml" (15 listings) and Beauty Base's Travalo Walzer and Perfume Pod
 *     "Rechargeable Perfume Bottle 5ml" were showing as perfume.
 *   - "N pcs" / "N pieces": a multi piece set, already excluded when called a
 *     gift set. Fragrance Click's "Lancome Idole 100ml Eau de Parfum 3 Pcs
 *     Set" showed as one 100ml bottle at £90.95. Measured 2026-10-03 across
 *     every kept listing: the five rules above remove 39, all containers or
 *     sets, no single bottle.
 */
export const NOT_A_FRAGRANCE =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|body cream|shampoo|conditioner|deodorant|shower ?gel|body ?wash|candle|diffuser|reed|gift ?set|set of|bundle|tester|sample|refill|travel spray|decant|hand wash|moisturis|lotion|balm|scrub|talc|hair|serum|air ?freshener|room spray|lamp fragrance|home spray|body spray|body mist|socks?|refillable perfume spray|pet care|empty (?:perfume )?bottles?|travalo|rechargeable perfume|\d+\s*(?:pcs|pieces))\b/i;

/**
 * A description that says the product is for an animal.
 *
 * "Bugalugs Baby Fresh Cologne 200ml" (Morrisons) and "Bugalugs Essentials
 * Long Lasting Cologne 200ml" (B&M) pass every title test, size and the word
 * cologne included, and were showing as fragrances at £6 and £3.99. Their own
 * descriptions say what they are: "An all over fragranced dog body spray ...
 * keep your dog's coat smelling great" and "leave your pet with that
 * professional salon scent". Measured 2026-10-03 across every kept listing:
 * this matches exactly those two and B&M's "Pet Care Cologne" ("for your
 * dog"), nothing else. "your" is required so a perfume described as "a
 * bottle shaped like a cat" (Katy Perry Purr) is not touched.
 */
export const PET_PRODUCT = /\byour (dog|pet)s?\b/i;

/** A barber shop range, by title or brand: see isFragrance. */
export const BARBER = /\bbarber\b/i;

/**
 * A description that calls the listing a gift set with a body wash or shower
 * gel in it, where the title names only the bottle.
 *
 * B&M titles two of its sets as a plain bottle: "Scent Favourites La Beauté
 * Shimmer EDT 100ml" at £4.99 (product 438025) is, in its own description,
 * "La Beauté Shimmer EDT and body wash gift set for her" (the bottle alone,
 * same title at £3.99, product 411449, is kept), and "Scent Favourites Flair De Bon EDT Set
 * 100ml" is a "2 piece fragrance gift set with 100ml EDT and 150ml body
 * wash". Both showed as one 100ml bottle. Gift set and the companion product
 * must sit in the same sentence: a perfume's copy suggesting you "create your
 * own perfume gift set" (most of Avon's) is not a set. Measured 2026-10-03
 * across every kept listing: those two B&M sets, plus two whose titles the
 * word lists above already catch (a Firetrap "& Bodywash" and the Montblanc
 * "& Showergel").
 */
export const DESCRIBED_AS_WASH_GIFT_SET =
  /gift set[^.]*\b(body ?wash|shower ?gel)\b|\b(body ?wash|shower ?gel)\b[^.]*gift set/i;

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
/**
 * The millilitre figure one ML_SIZE_RE capture states, exactly as the shop
 * wrote it (the pattern allows one decimal place).
 *
 * This used to be rounded to a whole number, which put a size on screen the
 * shop never stated: Kayali's 1.5ml sample vials read as "2ml" and Escentric
 * Molecules' 8.5ml travel sprays as "9ml" (both checked against the shops'
 * own product pages, 2026-10-03). It also let a 7.5ml and an 8ml bottle
 * compare as the same size. Ounce sizes are a conversion, not a stated
 * figure, and stay rounded to the whole millilitre.
 */
export function statedMl(capture: string): number {
  return Math.round(Number.parseFloat(capture) * 10) / 10;
}

/**
 * A word a shop writes directly against a bottle's size to say what kind of
 * small bottle it is: "10ml Miniature", "Mini 7ml", and, for a shop that says
 * so (see below), "10ml Travel Spray". It is the shop's label for the size,
 * not part of the perfume's name.
 *
 * ── The fault this exists for, measured 2026-10-04 ───────────────────────────
 * Kayali sells each perfume as 100ml, 50ml, "10ml Miniature", "10ml Travel
 * Spray" and 1.5ml, and writes the variant's own name after the size. The name
 * the catalogue builds from the title took the label with it, so the 10ml
 * bottle of "Vanilla | 28" was called "Vanilla | 28 Miniature" (and "Vanilla |
 * 28 Travel" for the travel spray, once `spray` was dropped as filler): a
 * different name from the 50ml and 100ml of the same perfume, so the mini was
 * not one of that perfume's sizes and could never meet another shop's 10ml of
 * it (Selfridges lists "Eden Sweet Peach 35 Eau de Parfum 10ml"). 34 of
 * Kayali's 35 perfumes carried the label, which made 69 names for 35
 * perfumes; the 14 travel sprays were not in the catalogue at all, because
 * `travel spray` is one of NOT_A_FRAGRANCE's words.
 *
 * ── What is a label, and what is not ─────────────────────────────────────────
 * Only a label directly against the size (nothing between them but spaces and
 * one of "- , :"), in a title that states exactly one size. That is what keeps
 * the words out of every title that means something else:
 *   - "Montblanc Explorer Eau De Parfum 100ml & Travel Spray 15ml & Shower Gel"
 *     names two sizes and the "&" sits between size and label: a set.
 *   - "Mini Collection Eau De Parfum 5.0ml Gift Set" and "Mini Perfume 50ml":
 *     "Mini" is not against the size.
 *   - "25ml Mini Size Travel Size Miniature" (one Maison Asrar bottle): a label
 *     followed by "size", "set", "collection", "kit", "duo", "trio" or "pack"
 *     is part of a longer phrase, so it is left alone.
 * A set never reaches this: isGiftSet is asked first, on the title as written.
 *
 * A mini is a size of its perfume, nothing else: it keeps its own size, so it
 * is never merged with the full bottle (productMatch.ts keys on size), and it
 * is compared with another shop's bottle of the same perfume at the same size.
 * Measured on the whole catalogue the same day, "Mini" and "Miniature" against
 * a size changed names outside Kayali only for minis at perfume-click, the
 * Beauty Store UK and Swiss Arabian ("I Want Choo Mini" and "I Want Choo" 4.5ml
 * were two products and are now one, at three shops).
 *
 * ── Why "Travel Spray" is only read where the shop says so ──────────────────
 * A travel spray is the same perfume in a small atomiser at Kayali, listed
 * beside its other sizes on the one page. Elsewhere it can be a different
 * article at the same size as a plain bottle: Nina Ricci's L'Air du Temps Eau
 * de Toilette is sold as a 30ml bottle (EAN 3137370207030) and as a 30ml
 * travel spray (EAN 3137370072744), and productMatch.ts, correctly, refuses
 * to merge any bucket holding two barcodes. Reading "Travel Spray" as a size
 * label everywhere split that perfume's four-shop comparison into four
 * products on the first measurement, so it is read only for a shop named in
 * the registry with `travelSizeIsASize` (Kayali), and every other shop's
 * travel sprays stay out exactly as they did.
 */
const SIZE_FIGURE = String.raw`\d{1,4}(?:\.\d)?\s*ml`;
const LABEL_NOT_FOLLOWED_BY = String.raw`(?!\s*(?:size|sized|set|sets|collection|kit|duo|trio|pack)\b)`;
function labelPatterns(travel: boolean): { sizeThenLabel: RegExp; labelThenSize: RegExp } {
  const words = travel ? '(?:miniature|mini|travel spray|travel size|travel sized)' : '(?:miniature|mini)';
  return {
    sizeThenLabel: new RegExp(String.raw`(${SIZE_FIGURE})\s*[-,:]?\s*${words}\b${LABEL_NOT_FOLLOWED_BY}`, 'i'),
    labelThenSize: new RegExp(String.raw`\b${words}\b${LABEL_NOT_FOLLOWED_BY}\s*[-,:]?\s*(\(?${SIZE_FIGURE}\)?)`, 'i'),
  };
}
const MINI_LABELS = labelPatterns(false);
const TRAVEL_LABELS = labelPatterns(true);

/**
 * The title with a size label directly against its one size removed, leaving
 * the size: "Vanilla | 28 10ml Miniature" -> "Vanilla | 28 10ml". Unchanged
 * for any title that does not state exactly one millilitre size, or whose
 * label is not against it. `travel` also reads "Travel Spray" and "Travel
 * Size" as labels: pass it only for a shop with `travelSizeIsASize`. See the
 * comment above for the rule and its measure.
 */
export function stripSizeLabel(title: string, travel = false): string {
  if ((title.match(new RegExp(SIZE_FIGURE, 'gi')) ?? []).length !== 1) return title;
  const { sizeThenLabel, labelThenSize } = travel ? TRAVEL_LABELS : MINI_LABELS;
  const after = title.replace(sizeThenLabel, '$1');
  if (after !== title) return after.replace(/\s{2,}/g, ' ').trim();
  const before = title.replace(labelThenSize, '$1');
  return before === title ? title : before.replace(/\s{2,}/g, ' ').trim();
}

/**
 * A single travel spray: one bottle of one perfume, sold on its own with a size
 * of its own, at any shop. "Ormonde Jayne Verano Eau de Parfum Travel Spray
 * 10ml" at Escentual, "Nina Ricci L'air Du Temps Eau de Toilette 30ml Travel
 * Spray" at Perfume Click.
 *
 * ── Why these were out, and why some are in now (2026-10-04) ─────────────────
 * "travel spray" is one of NOT_A_FRAGRANCE's words, and for good reason: most
 * titles that carry it are sets ("Eau De Parfum 100ml & Travel Spray 10ml &
 * Shower Gel") and the rest are empty atomisers. That also kept out 33 real
 * single bottles at eight shops, among them 17 of Escentual's (Ormonde Jayne,
 * Versace, Valentino), which are plain perfume in a small atomiser, a size of
 * that perfume the shops sell and shoppers look for.
 *
 * ── What is admitted ─────────────────────────────────────────────────────────
 * Only a title that states exactly one millilitre size and that does not join
 * the travel spray to anything else after that point: no "&", "+", ",", "and",
 * "with", "plus", "set", "kit", "duo", "trio", "pack", "collection" and no "x 3".
 * A set therefore stays a set, and a travel spray named as a component of one
 * ("... 100ml & Travel Spray 15ml") stays out. A travel spray that states no
 * size at all (John Lewis' "TOCCA Lucia Eau de Parfum Travel Spray") has no size
 * of its own to compare and stays out as before. A refill stays out too: the
 * word is still in NOT_A_FRAGRANCE once the phrase is taken away.
 *
 * ── Why it is kept apart from the plain bottle ───────────────────────────────
 * A travel spray is its own size of the perfume, and it is not the same article
 * as the bottle of that size: Nina Ricci's L'Air du Temps Eau de Toilette is
 * sold as a 30ml bottle (EAN 3137370207030) and as a 30ml travel spray (EAN
 * 3137370072744), and productMatch.ts, correctly, refuses to merge a group that
 * holds two barcodes. Reading "Travel Spray" as a size label for every shop
 * (what the Kayali change first tried) put both into one group, the matcher
 * refused the lot, and the perfume's four shops split into four products. So
 * here the words are taken out of the title and written back onto the end of the
 * product's name by displayName ("L'air Du Temps Travel Spray"): the travel
 * spray gets a name of its own, meets only other travel sprays of the same
 * perfume and size, and the plain bottle keeps its group untouched. Kayali is
 * the exception because its travel spray is one more size on the perfume's own
 * page (`travelSizeIsASize`).
 */
const TRAVEL_SPRAY_PHRASE = /\btravel[ -]spray\b/i;
export function isSingleTravelSpray(title: string): boolean {
  const t = fold(title);
  const phrase = TRAVEL_SPRAY_PHRASE.exec(t);
  if (!phrase) return false;
  if ((t.match(new RegExp(SIZE_FIGURE, 'gi')) ?? []).length !== 1) return false;
  const size = new RegExp(SIZE_FIGURE, 'i').exec(t)!;
  const tail = t.slice(Math.min(phrase.index, size.index));
  return !/[&+,]|\b(?:and|with|plus|set|kit|duo|trio|pack|collection)\b|\bx\s*\d/i.test(tail);
}

/** The title with the words "Travel Spray" taken out: see isSingleTravelSpray. */
export function withoutTravelSprayWords(title: string): string {
  return title.replace(new RegExp(TRAVEL_SPRAY_PHRASE.source, 'gi'), ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Whether the shop's own product type settles the strength: a listing typed
 * "Fragrance" at a shop with `fragranceTypeIsEauDeParfum` (Beauty Pie), whose
 * title names no strength of its own. See that field for the evidence.
 */
export function productTypeStatesEauDeParfum(l: Pick<StoredListing, 'retailerId' | 'productType'>): boolean {
  return getRetailer(l.retailerId)?.fragranceTypeIsEauDeParfum === true && /^\s*fragrance\s*$/i.test(l.productType ?? '');
}

/** Whether this shop's "Travel Spray" is a small size of the perfume beside it: see stripSizeLabel. */
export function travelSizeIsASize(retailerId: string): boolean {
  return getRetailer(retailerId)?.travelSizeIsASize === true;
}

/** 1 fl oz in millilitres — the imperial fluid ounce, which is what every oz size in the catalogue means. */
export const OZ_TO_ML = 29.5735;

/**
 * A size stated only in a listing's description, never its title — riiffs
 * (uk.riiffsperfumes.com) is the measured case: none of its 141 active
 * titles ever states a size ("Golden Elixir Reserve – Riiffs Perfumes"), so
 * `sizeMl` on the title alone always returns null for every one of them. 19
 * of the 141 do state one, but only inside a structured description the
 * product page itself writes as "NOTES: ... SIZE: 100 ml" — a real fact the
 * shop published, just in a field this function did not used to read.
 *
 * Deliberately a single strict labelled pattern rather than reusing
 * `ML_SIZE_RE` against the whole description: description text is free-form
 * marketing copy across the catalogue (notes lists, shipping blurbs, unrelated
 * numbers), and scanning it for any bare "<n>ml" the way a title is scanned
 * would risk reading a false size out of prose that was never stating one.
 * The literal "SIZE:" label is the one part of that shape that is actually a
 * size statement rather than incidental text; measured against the whole of
 * data/catalogue on 2026-09-03 it matches 497 listings with no title size
 * across six shops (riiffs among them) and nothing else.
 */
export const DESCRIPTION_SIZE_RE = /\bsize:\s*(\d{1,4}(?:\.\d)?)\s*ml\b/i;

/**
 * A sentence or bullet in a description that is a size and nothing else:
 * ". 50ml.", "• 75ml.", ": 100ml" at the end of the copy.
 *
 * Avon's titles never state a size ("Wild Country Eau de Toilette") and its
 * product copy never labels one, so 44 of its perfumes were rejected as
 * unsized. 38 of those state the size as its own line of the product
 * specification, read off data/catalogue/avon.json 2026-10-03:
 * "• Base note: sandalwood. • 75ml.. How to use me" (Wild Country), "...on
 * sensual woody vanilla base. . 50ml. Scent type:" (Viva La Vita). That is as
 * much a statement of size as "SIZE: 50 ml" is, and like that label it cannot
 * be mistaken for prose: a size alone between two full stops is not part of a
 * sentence about anything else.
 *
 * Strict on purpose, for the reason the labelled pattern is strict. A size
 * inside a sentence ("Also available as a 50ml", "Eau de Parfum, 50ml + Body
 * Lotion, 125ml") never matches, which is what keeps Avon's five perfume and
 * body lotion duos out: they name two sizes, neither standing alone. Where a
 * description has standalone sizes that disagree (Emirates Oud's gift sets
 * list 100/200/300ml lines), nothing is read. Measured 2026-10-03 across all
 * of data/catalogue: it admits 37 Avon perfumes and one MyBeauty.Boutique
 * listing ("Product Size : 100ml"), each at the size its own page states,
 * and nothing else. Imari Pulse ("50 ml Scent type:") stays out: its size
 * runs into the next sentence with no stop between.
 */
const DESCRIPTION_BARE_SIZE_RE = /(?:^|[.•:]\s*)(\d{1,4}(?:\.\d)?)\s*ml\s*(?=\.|$)/gim;

/**
 * The size a listing's own description states, or null: the labelled
 * `DESCRIPTION_SIZE_RE` first, then a standalone size line
 * (`DESCRIPTION_BARE_SIZE_RE`) when every such line agrees.
 */
function descriptionStatedSizeMl(description: string | null | undefined): number | null {
  if (!description) return null;
  const m = description.match(DESCRIPTION_SIZE_RE);
  if (m) return statedMl(m[1]!);
  const bare = new Set([...description.matchAll(DESCRIPTION_BARE_SIZE_RE)].map((b) => statedMl(b[1]!)));
  return bare.size === 1 ? [...bare][0]! : null;
}

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
 * difference matters to that function specifically. Six of these seven —
 * see SIZE_CONFLICT_RESOLVED just below — turn out not to be ambiguous once
 * a field the title itself never carries is read, either on the row (its own
 * `description`) or, for four of them, on the manufacturer's own separate
 * domain; this pattern still matches all seven titles (the shape it names is
 * unchanged), but sizeMl no longer returns null for those six. Red Velvet is
 * the one that stays genuinely unresolved — see SIZE_CONFLICT_RESOLVED's own
 * comment for what was checked and why.
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
 * Six of SIZE_CONFLICT_RE's seven titles, resolved by reading fields
 * SIZE_CONFLICT_RE itself never sees — the same method that solved Emirates
 * Oud's restated-headline shape (SIZE_RESTATED_THEN_VARIANT_RE above). Two
 * were settled 2026-08-27 by a field on the row itself
 * (data/catalogue/armaf.json's and data/catalogue/avon.json's own
 * `description`); four more were settled 2026-09-01 by going further than
 * the row itself — the manufacturer's own separate domain, via WebSearch —
 * once the row's own description turned out to be internally inconsistent
 * for two of the four. The distinguishing fact in every case lives outside
 * the title, not in a title-generalisable pattern or in `retailerSku`, so
 * each is recorded here as an exact-title lookup rather than a second regex.
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
 *   - Armaf's four Hamidi Maison Luxe lines ("...Eau De Parfum 100ml
 *     110ml"): a 2026-08-27 pass read armaf.uk's own description for each
 *     and took it at face value — Patchouli Imperial and Gypsy Rose read
 *     "...110ml", Midnight Amber and Elixir read "...100ml" — and left all
 *     four unresolved anyway because no title-only rule could get all four
 *     right from that split. What that pass never checked is whether
 *     armaf.uk's own description was itself correct. Hamidi is a real
 *     manufacturer with its own separate US storefront, hamidi.us, entirely
 *     outside armaf.uk's own feed — checked directly by WebSearch and
 *     WebFetch, 2026-09-01, and it names one, unambiguous size for every one
 *     of the four: "MAISON LUXE PATCHOULI IMPERIAL EAU DE PARFUM - 110ML",
 *     "MAISON LUXE GYPSY ROSE EAU DE PARFUM - 110ML", "MAISON LUXE MIDNIGHT
 *     AMBER EAU DE PARFUM - 110ML", "MAISON LUXE ELIXIR EAU DE PARFUM -
 *     110ML" — all four, including the two armaf.uk's own description called
 *     100ml. Independently corroborated by a long list of other retailers
 *     unrelated to armaf.uk or Hamidi's own site, unanimous 110ml for all
 *     four: Amazon, eBay, Jomashop, fragrancenet.com, intenseoud.com (and
 *     its own wholesale.intenseoud.com), Target, Walmart, makeupstore.com,
 *     rubnic.com, snoonu.com and anabis.com, between them. Exactly one
 *     dissenting source anywhere, for exactly one of the four: Elixir, where
 *     maisondesfragrances.fr's own title reads "...eau-de-parfum-100ml" —
 *     one French retailer mirror against ten-plus independent sources
 *     including the manufacturer's own domain is not the kind of even split
 *     that left the concentration disputes in productName.ts unresolved (see
 *     that file's own CONCENTRATION_RESOLUTIONS comment); armaf.uk's own
 *     100ml for Midnight Amber and Elixir reads, on this evidence, as a
 *     copy-paste error in its own feed, not a second true size. All four
 *     resolve to 110ml.
 *
 * Red Velvet is the one title left in this set of seven that stays
 * unresolved — see the comment on SIZE_CONFLICT_RE's own describe block in
 * tests/fragranceFilter.test.ts and the note at the end of this file's own
 * negative-result log below for what was checked across six passes on
 * 2026-09-01 and why it still fails. The sixth pass moved it from a
 * three-way split to 70ml against a single live dissenter, which is closer
 * but still not the standard the six above were held to.
 */
const SIZE_CONFLICT_RESOLVED: ReadonlyMap<string, number> = new Map([
  ['Club De Nuit Woman Luxury French Perfume Oil 20ml 18ml', 20],
  ['Full Speed Eau de Toilette - 100ml 75ml', 100],
  ['Hamidi Maison Luxe Patchouli Imperial Eau De Parfum 100ml 110ml', 110],
  ['Hamidi Maison Luxe Midnight Amber Eau De Parfum 100ml 110ml', 110],
  ['Hamidi Maison Luxe Gypsy Rose Eau De Parfum 100ml 110ml', 110],
  ['Hamidi Maison Luxe Elixir Eau De Parfum 100ml 110ml', 110],
]);

/*
 * Red Velvet ("Red Velvet Eau De Parfum 70ml 100ml", retailerSku
 * ARF32121252, rawBrand "Armaf - Delicacy"): checked from angles the
 * 2026-08-27 pass never used, 2026-09-01, and still left unresolved — a
 * genuine, not merely absent, conflict once it was actually looked for.
 *
 * Every field on the row itself beyond the title: description states no
 * size anywhere (confirmed again). The row's own `url`
 * ("armaf.uk/products/red-velvet-eau-de-parfum-70ml") states "70ml" — but
 * this is the same shape already seen and distrusted for the four Hamidi
 * titles above: armaf.uk's product-URL slugs there all read "...-100ml"
 * regardless of a product's real, manufacturer-confirmed size (110ml for
 * every one of the four), i.e. the slug appears to be auto-generated from
 * the title's own first number rather than independently verified — so
 * Red Velvet's matching "70ml" slug (also the title's own first number) is
 * not independent evidence either, just the same auto-generated echo.
 * `imageUrl` is a WhatsApp-shared photo with no legible size text reachable
 * by this project's tools. No `retailerSku`-keyed pattern, no variant field.
 *
 * armaf.com — the manufacturer's own domain, checked directly by WebFetch —
 * carries a "RED VELVET" product page that states no size at all, only a
 * price; the manufacturer's own word is silent here, unlike the Hamidi
 * case above where it was decisive.
 *
 * WebSearch surfaces a real, three-way size split across independent
 * retailers, not the "quiet apart from one auto-generated echo" shape the
 * Hamidi resolution had: several independent sources agree on 70ml (eBay,
 * boozyshop.com, intenseoud.com, orioudh.com), but a separate eBay listing
 * independently titles the same line "ARMAF DELIGHTS RED VELVET EDP
 * 3.4FL.OZ |100ML" (100ml) and shangrilaperfumes.com independently titles
 * it "75ml" — a real, title-level three-way disagreement from independent
 * sources, the same shape the evidence bar in productName.ts's
 * CONCENTRATION_RESOLUTIONS comment treats as disqualifying regardless of
 * how the majority leans. Left unresolved.
 *
 * Re-checked 2026-09-01 (later the same day) from angles this comment had
 * not yet used, and still left unresolved:
 *
 *   - This row's own `ean` field is `null` (data/catalogue/armaf.json,
 *     retailerSku ARF32121252) — no barcode exists to cross-reference
 *     against an independent barcode database. Not a route here, just
 *     confirmed absent rather than left unchecked.
 *   - Amazon.com's own listing ("Armaf Parfums Red Velvet EDP Unisex 2.37
 *     Fl Oz", B0G1Z3JRGX — a source not previously named for this specific
 *     product) states 2.37 fl oz, ≈70ml: one more independent source on the
 *     70ml side, not previously counted. It does not change the outcome —
 *     the disqualifying fact is not that 70ml lacks support, it is that
 *     100ml and 75ml each have independent, title-level support too, and
 *     one more voice for the majority does not un-say either dissent.
 *   - fragrantica.com, perfume.com and fragrancex.com all refused this
 *     project's fetch tool with HTTP 403 — not pursued further, consistent
 *     with this project's standing rule against evading a bot wall.
 *   - armaf.com's own product page, re-fetched rather than assumed
 *     unchanged: still states no size anywhere, and carries no link to a
 *     "Delicacies Collection" landing page that might have listed one in a
 *     size chart — its own listed collections are Club De Nuit, Odyssey,
 *     Tres Nuit, Checkmate, Eter, Bucephalus, Tag and Delights, not
 *     Delicacies.
 *
 * Nothing found here resolves it. The genuine three-way independent
 * disagreement stands exactly as before.
 *
 * Sixth pass, 2026-09-01, from a source type none of the five before it
 * used: this project's own catalogue, on the other side of the shop that
 * publishes the conflicting title. Still not resolved — but the shape of
 * the disagreement has changed enough to be worth recording precisely.
 *
 *   - This project already holds an independent UK retailer's listing for
 *     the same bottle, and it carries a barcode. data/catalogue/
 *     perfume-click.json, retailerSku 171683: "Armaf Red Velvet Eau de
 *     Parfum 70ml Spray", £27.50, ean 6295199815038. Every earlier pass
 *     recorded only that *armaf.uk's own row* has `ean: null` and treated a
 *     barcode as unavailable; nobody had asked whether another shop in this
 *     same catalogue publishes one. The code is well formed: 13 digits, GS1
 *     prefix 629 (United Arab Emirates, where Sterling Parfums/Armaf is
 *     based), and the check digit computes to the 8 it carries. No other
 *     listing anywhere in data/catalogue/ carries the same code, so
 *     untrustworthyEans (productMatch.ts) has nothing against it either.
 *   - Its consecutive neighbour in Armaf's own barcode block is the sibling
 *     product. 6295199815045 — the very next item reference — is "Armaf
 *     Delicacy Cotton Candy Eau de Parfum 70ml Spray", also at Perfume
 *     Click, also £27.50 to the penny. Both are from the Dubai Delicacies
 *     collection this row's own armaf.uk description names ("Part of the
 *     new Delicacies Collection"), and Cotton Candy's 70ml is independently
 *     corroborated (deloox.com "Armaf Delicacy Cotton Candy Eau de Parfum
 *     ... 70 ml", fetched directly; anabis.com and intenseoud.com likewise).
 *     That is the manufacturer's own numbering putting two members of one
 *     uniformly-priced collection side by side, both stated at 70ml —
 *     stronger than another retailer repeating a title, though still not
 *     the manufacturer stating a size.
 *   - The 100ml source is gone. eBay item 227173024780 ("ARMAF DELIGHTS RED
 *     VELVET EDP 3.4FL.OZ |100ML"), the only 100ml evidence on file, now
 *     returns HTTP 404 — the listing no longer exists. The same search that
 *     surfaces it also surfaces the same product from the same family of
 *     sellers at 2.37 fl oz (item 236575254327, "ARMAF DELIGHTS DUBAI
 *     DELICACY RED VELVET 2.37 EDP SPRAY"), which is 70ml. Recorded as a
 *     dead source, not as a refutation: a delisted eBay item is not the
 *     seller withdrawing a claim.
 *   - The 75ml source is not gone. shangrilaperfumes.com, re-fetched rather
 *     than assumed unchanged, still reads "Armaf Delights Dubai Delicacy
 *     Red Velvet Eau de Parfum 75ml / 2.5 oz Spray For Women - New" — and
 *     it is internally consistent (2.5 fl oz is 74ml, so this is not 70
 *     rounded up; 70ml is 2.37 fl oz, which is what every other source
 *     prints). An independent retailer's own title, still live, still
 *     saying a different number.
 *   - armaf.com's own page, fetched a third time: still states no size
 *     anywhere — no variant selector, no specification, nothing in the
 *     description. The manufacturer stays silent.
 *   - parfumo.com, a database this log had not tried (fragrantica,
 *     perfume.com and fragrancex were the three already refused), returns
 *     HTTP 403 to this project's fetch tool as well. Not pursued further,
 *     same standing rule.
 *
 * Left unresolved, and deliberately. The bar this file borrows from
 * productName.ts's CONCENTRATION_RESOLUTIONS is the manufacturer's own word
 * or overwhelming independent agreement *with no persisting title-level
 * contradiction*, and the second clause is exactly what still fails: 70ml is
 * now much better supported than it was — a valid manufacturer barcode, a
 * same-collection sibling at the adjacent code and the same price, and the
 * one dissenting 100ml listing dead — but shangrilaperfumes.com's 75ml is
 * live, independent, and stated in its own title. Resolving on "the majority
 * is bigger now" would be applying a different rule to this product than the
 * one the six Hamidi and Avon titles above were held to. The honest summary
 * is that this is no longer a three-way split; it is 70ml against one live
 * dissenter, and one live dissenter is still one too many for this bar.
 *
 * ── Seventh pass, 2026-09-02, under the owner's OR ruling. Still unresolved ──
 * The bar quoted just above was rewritten the same day (see the EVIDENCE BAR
 * block above CONCENTRATION_RESOLUTIONS in productName.ts): the owner ruled
 * that route (A), the manufacturer's own word about its own product, is
 * sufficient BY ITSELF, and that a contradicting retailer title is outranked
 * rather than weighed. That ruling settled fifteen of the twenty-five
 * concentration disputes in one pass.
 *
 * It does nothing for this one, and the reason is worth stating plainly rather
 * than leaving to be re-derived: the OR ruling widens what counts as decisive
 * evidence, it does not manufacture evidence that does not exist. Route (A)
 * needs the manufacturer to have said something. Armaf never has.
 *
 * The one question this pass asked — has the manufacturer stated a size
 * anywhere reachable, by any route not already tried:
 *
 *   - armaf.com/products/red-velvet, fetched directly for the fourth time
 *     across these passes and specifically re-checked for a size in the
 *     product title, a variant selector, a specifications table and the page
 *     title as well as the description. Product title is exactly "RED VELVET";
 *     no size in ml or fl oz appears anywhere on the page, and there is no
 *     variant selector at all. Search-result *summaries* for this URL do gloss
 *     it as "a 70ml Eau de Parfum" — that is prose about the product, not the
 *     page's own words, and it is precisely the kind of summary gloss the
 *     evidence bar has refused throughout.
 *   - Two manufacturer-controlled channels no earlier pass had tried.
 *     sterlingparfums.com — Sterling Perfumes Industries, the house that owns
 *     Armaf, confirmed on its own site ("Sterling Group, founded in 1998",
 *     Armaf listed among its brands, /brand/fragrance/armaf) — publishes no
 *     product catalogue with sizes at all, only brand pages. And
 *     sterlingmegastore.ae, the group's own retail storefront, does not stock
 *     this product: a search for "red velvet armaf" there returns 33 results,
 *     every one of them Armaf Marjan and Enchanted body sprays and mists, and
 *     no Dubai Delicacy Red Velvet.
 *
 * So the manufacturer is not merely unread here, it is silent across every
 * property it controls that this project can reach. Route (A) does not apply.
 *
 * Route (B) is unchanged and still fails on the same single fact, re-verified
 * this pass rather than assumed: shangrilaperfumes.com is still live, still
 * titles it "Armaf Delights Dubai Delicacy Red Velvet Eau de Parfum 75ml /
 * 2.5 oz Spray For Women - New", still in stock at $29.99, and is still
 * internally consistent (2.5 fl oz is 74ml, so it is not 70 rounded up — 70ml
 * is 2.37 fl oz, which is what every source on the other side prints).
 *
 * Seven passes, and the position is now precise enough to be worth stating as
 * a conclusion rather than a status: this product cannot be resolved by
 * evidence, only by a rule change. The OR ruling was the rule change that was
 * available, and it does not reach here. Anything that resolves this in future
 * is either Armaf finally publishing a size, or shangrilaperfumes.com's
 * listing changing or going away — both facts about the world, not angles left
 * unsearched. A future pass should check those two things and nothing else.
 */

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
 * description text, and later against hamidi.us's own domain directly — see
 * tests/fragranceFilter.test.ts). A wrong number that looks exactly like a
 * right one is worse than an honest null, once every downstream consumer can
 * actually represent one — see productMatch.ts's MatchableProduct,
 * wasPriceCredibility.ts's CredibilityOffer and demo/volumeBands.ts, all of
 * which treat a null size as "cannot compare" rather than "matches" or
 * "zero". Six of the seven — see SIZE_CONFLICT_RESOLVED's own comment for
 * the evidence, gathered across two passes — are the exception: not a guess
 * from the title, but a real field this function does not otherwise read
 * (the row's own description, or for four of them the manufacturer's own
 * separate domain), checked and recorded by exact title rather than
 * re-derived here. Red Velvet is the seventh, still genuinely unresolved.
 */
export function sizeMl(title: string, description?: string | null): number | null {
  // Checked ahead of the ordinary first-token rule below, not instead of it —
  // see SIZE_MENU_THEN_VARIANT_RE's own comment for why only this specific,
  // narrow shape is allowed to override "the first size mentioned wins".
  const menu = title.match(SIZE_MENU_THEN_VARIANT_RE);
  if (menu) return statedMl(menu[1]!);
  // A genuine bundle or gift-with-purchase always carries a ",", "+" or "&"
  // — see SIZE_RESTATED_THEN_VARIANT_RE's own comment — so checking for
  // their absence first, rather than folding it into the pattern, is what
  // keeps that regex from ever having to also rule out every bundle shape
  // itself.
  if (!/[,+&]/.test(title)) {
    const restated = title.match(SIZE_RESTATED_THEN_VARIANT_RE);
    if (restated) return statedMl(restated[1]!);
    // See SIZE_CONFLICT_RE's own comment. Checked after the restated-variant
    // rule just above (which requires a word between the two sizes) so the
    // two patterns can never both match the same title — one requires a word
    // between the sizes, this requires there be none.
    const conflict = title.match(SIZE_CONFLICT_RE);
    if (conflict && conflict[1] !== conflict[2]) {
      // See SIZE_CONFLICT_RESOLVED's own comment: six of these seven titles
      // are settled by a field outside the title itself, not guessed from
      // the title — the row's own description for two, the manufacturer's
      // own separate domain for four more. Looked up by exact title rather
      // than folded into the regex above because the distinguishing fact is
      // per-product, not a pattern that generalises across the shape the way
      // SIZE_RESTATED_THEN_VARIANT_RE's does.
      const resolved = SIZE_CONFLICT_RESOLVED.get(title.trim());
      return resolved ?? null;
    }
  }
  const ml = title.match(ML_SIZE_RE);
  if (ml) return statedMl(ml[1]!);
  const oz = title.match(OZ_SIZE_RE);
  if (oz) return Math.round(Number.parseFloat(oz[1]!) * OZ_TO_ML);
  // The title never states one. Before giving up, check the one other place
  // a shop's own page states it — see descriptionStatedSizeMl's own comment.
  return descriptionStatedSizeMl(description);
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
// "wardrobe": Kayali's name for a boxed set of full bottles (2026-10-03).
const MULTI_ITEM = /\bset\b|\bwardrobe\b|\b\d+\s*x\b|\bx\s*\d+\b/i;

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
 * 100ml bottle whose own name contains the word. (Fragrance Click's "Burberry
 * Her 100ml Eau de Parfum + 10ml Set" used to be kept here as its headline
 * 100ml bottle; since 2026-10-03 it is a gift set, its own product, see
 * src/catalogue/giftSet.ts.)
 *
 * The count must be 2 or more. "1 x 5ml" names a single bottle, and while every
 * such title in the catalogue today is already rejected for other reasons (all
 * 5 checked), a rule that says "several" should not quietly mean "one or more".
 */
const MULTI_PACK = /\b([2-9]|[1-9]\d)\s*[x×]\s*\d{1,4}(?:\.\d)?\s*ml\b/i;

/** A Shopify `product_type` that names several items sold as one. */
const BUNDLE_PRODUCT_TYPE = /^\s*bundles?\s*$/i;

/**
 * A Shopify `product_type` that names a scented body product rather than a
 * perfume. Nicchia Luxury files its catalogue in Italian: "Profumo in crema"
 * (a scented body cream, six Profumo di Firenze 200ml jars at 34 pounds) and
 * "Olio corpo profumato" (scented body oil, with a roll on variant, fifteen
 * Ortigia listings) both passed every title rule on 2026-10-03, because the
 * titles ("Buontalenti Cream", "Fico d'India roll-on") carry a size and no
 * word the lists above know. Read from data/catalogue/nicchia-luxury-uk.json:
 * no other shop's product type contains either phrase.
 */
const BODY_PRODUCT_TYPE = /\b(?:profumo in crema|olio corpo)\b/i;

export function sellsOnlyFragrance(retailerId: string): boolean {
  return getRetailer(retailerId)?.fragranceOnlyCatalogue === true;
}

/**
 * The words of each fragrance only house, as the registry already records
 * them: the `singleBrandOnly` name of every shop a human has also vouched for
 * with `fragranceOnlyCatalogue` (Escentric Molecules, Kayali, Zimaya, Riiffs).
 * Both statements have to be on the same entry. A single brand shop alone
 * proves nothing (LUSH and Bath & Body Works are single brand and sell soap),
 * and the flag alone says nothing about a house. Together they say what the
 * house makes: nothing but fragrance, none of it named by a strength.
 *
 * Derived from the registry rather than listed a second time here, so the
 * house's own shop and every other shop that resells it can never disagree
 * about what the house sells.
 */
const FRAGRANCE_ONLY_HOUSE_WORDS: readonly (readonly string[])[] = RETAILERS.filter(
  (r) => r.fragranceOnlyCatalogue === true && r.singleBrandOnly,
).map((r) => brandWords(r.singleBrandOnly!));

/** Lowercase letters and digits only, one entry per word: "ESCENTRIC MOLECULES - 01" is escentric, molecules, 01. */
function brandWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Whether a listing at a shop that sells much more than fragrance is a
 * bottle of a fragrance only house: the shop's own brand field names the
 * house, or the title opens with the house's whole name.
 *
 * This is what the concentration test cannot see. Cult Beauty lists
 * "Escentric Molecules Molecule 02 (100ml)" and "ESCENTRIC MOLECULES -
 * Molecule 01 - Portable (30ml)": the house names its products after
 * themselves ("Molecule 01", "Escentric 05"), never after a strength, so the
 * test rejected all seven of them, and the shop's own storefront (flagged
 * `fragranceOnlyCatalogue`) was the only place the products could appear.
 * The flag is a statement about what a shop sells, and for a single house
 * shop the same statement is true of the house wherever it is resold.
 *
 * Deliberately narrow, so it cannot become the skincare leak the test exists
 * to stop: the house name must be the WHOLE of the leading words or of the
 * brand field (never a substring, never a trailing mention), the house must
 * be one a human vouched for as fragrance only, and every other rule in
 * isFragrance still applies (the not a fragrance words, a stated single
 * size, no multi item set).
 */
export function isBottleOfFragranceOnlyHouse(l: Pick<StoredListing, 'rawTitle' | 'rawBrand'>): boolean {
  const title = brandWords(l.rawTitle);
  const brand = l.rawBrand ? brandWords(l.rawBrand) : [];
  const startsWith = (words: readonly string[], house: readonly string[]) =>
    words.length >= house.length && house.every((w, i) => words[i] === w);
  return FRAGRANCE_ONLY_HOUSE_WORDS.some(
    (house) =>
      house.length > 0 &&
      (startsWith(title, house) || (brand.length === house.length && startsWith(brand, house))),
  );
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

/** The same folding, for src/catalogue/giftSet.ts, so both read one text. */
export function foldTitle(title: string): string {
  return fold(title);
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

/**
 * Whether a listing is a single fragrance: one bottle, comparable with the
 * same bottle at another shop. A gift set never is (src/catalogue/giftSet.ts,
 * owner's decision 2026-10-03): it is its own product, never matched or
 * compared with a single bottle, so it is asked about first. 78 listings this
 * function used to keep as single bottles carry "Set" as a product word
 * ("Guerlain Shalimar 50ml Eau de Parfum Set") and now go to gift sets.
 */
export function isFragrance(l: StoredListing): boolean {
  if (isGiftSet(l)) return false;
  // A size label ("10ml Miniature", and "10ml Travel Spray" at a shop that
  // says its travel spray is a size) is the shop naming the size of a bottle
  // of this perfume, so it is read as the size and is not judged as a word of
  // the product: see stripSizeLabel. Only "travel spray" is in NOT_A_FRAGRANCE;
  // a travel spray named inside a set never gets here.
  const kayaliStyle = travelSizeIsASize(l.retailerId);
  let t = stripSizeLabel(fold(l.rawTitle), kayaliStyle);
  // A single travel spray at any other shop is judged without the two words
  // that would keep it out, and is named apart from the plain bottle further on
  // (displayName): see isSingleTravelSpray.
  if (!kayaliStyle && isSingleTravelSpray(l.rawTitle)) t = withoutTravelSprayWords(t);
  if (NOT_A_FRAGRANCE.test(t)) return false;
  // Barber shop colognes: Debenhams' "Barber Marmara" range (No.3 Turkish
  // Cologne 500ml, No.24 Eau De Cologne Aftershave Spray 400ml), splashes for
  // after a shave, not perfume. The owner's call, 2026-10-03: drop them.
  if (BARBER.test(t) || (l.rawBrand && BARBER.test(l.rawBrand))) return false;
  // What the shop's own copy says the product is, where the title does not:
  // see PET_PRODUCT and DESCRIBED_AS_WASH_GIFT_SET.
  if (l.description && (PET_PRODUCT.test(l.description) || DESCRIBED_AS_WASH_GIFT_SET.test(l.description))) {
    return false;
  }
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
  if (sizeMl(t, l.description) === null && !sizeConflict(t)) return false;
  if (l.priceGbp === null || l.priceGbp <= 0) return false;
  // The shop's own category, where it gives one — see RawListing.productType.
  // Kayali files its duos under "Bundles" with a title naming one size
  // ("Fruit Crush 100ml", two 100ml bottles at £187), so the title rules
  // below cannot see it.
  if (l.productType && BUNDLE_PRODUCT_TYPE.test(l.productType)) return false;
  if (l.productType && BODY_PRODUCT_TYPE.test(l.productType)) return false;
  // Asked of every shop, unlike the two rules inside the branch below — see
  // MULTI_PACK for why a quantity against a size is the one multi-pack signal
  // that survives contact with the whole catalogue.
  if (MULTI_PACK.test(t)) return false;

  // A shop whose whole catalogue is fragrance does not have to say so in every
  // title — see Retailer.fragranceOnlyCatalogue for why this is an explicit
  // per-shop statement rather than anything inferred. Everywhere else the
  // concentration word stays required, because it is what keeps a broad
  // beauty retailer's skincare out of a fragrance comparison.
  if (sellsOnlyFragrance(l.retailerId) || isBottleOfFragranceOnlyHouse(l)) {
    return !MULTI_ITEM.test(t) && (t.match(/\d{1,4}(?:\.\d)?\s*ml\b/gi) ?? []).length < 2;
  }

  // A perfume the shop itself types "Fragrance" at a shop that has said that
  // means Eau de Parfum names its strength by its type: see
  // productTypeStatesEauDeParfum.
  return CONCENTRATION.test(t) || productTypeStatesEauDeParfum(l);
}

/**
 * Whether a listing belongs in the catalogue at all: a single fragrance, or a
 * fragrance gift set (its own category; see src/catalogue/giftSet.ts). The
 * one gate scripts/build-demo-catalogue.ts and scripts/priceHistoryReplay.ts
 * both ask, so the two can never disagree about what is in it. A gift set
 * still needs a price.
 */
export function isCatalogueListing(l: StoredListing): boolean {
  if (isFragrance(l)) return true;
  return typeof l.priceGbp === 'number' && l.priceGbp > 0 && isGiftSet(l);
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
  // A gift set's own identity, never a single bottle's: see giftSetId.
  if (isGiftSet(l)) return giftSetId(l, untrustworthy);
  const ean = untrustworthy ? trustworthyEan(l, untrustworthy) : l.ean;
  return ean
    ? `ean-${ean}`
    : `${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
