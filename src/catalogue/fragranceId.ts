import type { StoredListing } from './types.js';
import { getRetailer } from '../config/retailers.js';

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
 */
export const NOT_A_FRAGRANCE =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|body cream|shampoo|conditioner|deodorant|shower gel|body wash|candle|diffuser|reed|gift ?set|set of|bundle|tester|sample|refill|travel spray|decant|hand wash|moisturis|lotion|balm|scrub|talc|hair)\b/i;

/** Size in millilitres, needed before two listings can be compared at all. */
export function sizeMl(title: string): number | null {
  const ml = title.match(/(\d{1,4}(?:\.\d)?)\s*ml\b/i);
  if (ml) return Math.round(Number.parseFloat(ml[1]!));
  const oz = title.match(/(\d{1,2}(?:\.\d)?)\s*(?:fl\.?\s*)?oz\b/i);
  if (oz) return Math.round(Number.parseFloat(oz[1]!) * 29.5735);
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
 * Deliberately conservative. The round trip only replaces the title when the
 * result is strictly better — no U+FFFD replacement characters, and the
 * tell-tale sequences actually present — so a title containing a legitimate
 * "Ã" is left exactly as it is.
 */
export function repairMojibake(title: string): string {
  if (!/Ã.|â€|Â./.test(title)) return title;
  try {
    const repaired = Buffer.from(title, 'latin1').toString('utf8');
    if (repaired.includes('�')) return title;
    return repaired;
  } catch {
    return title;
  }
}

export function isFragrance(l: StoredListing): boolean {
  const t = fold(l.rawTitle);
  if (NOT_A_FRAGRANCE.test(t)) return false;
  if (sizeMl(t) === null) return false;
  if (l.priceGbp === null || l.priceGbp <= 0) return false;

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
 */
export function fragranceId(l: StoredListing): string {
  return l.ean
    ? `ean-${l.ean}`
    : `${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
