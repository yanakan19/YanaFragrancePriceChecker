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
 * "perfume" was a real gap here: a title reading "Chanel No 5 Perfume 100ml"
 * matched none of the French-derived terms and was silently rejected as not
 * a fragrance, despite being an obvious one — plain English listings (feeds
 * especially) favour "perfume" over "parfum". "attar" and "oud" cover the
 * concentrated-oil style Middle Eastern perfumery uses, relevant because the
 * registry already models a 'mideast' tier for three retailers.
 */
const CONCENTRATION =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|parfum|perfume|edp|edt|edc|aftershave|cologne|extrait|attar|oud)\b/i;

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

export function isFragrance(l: StoredListing): boolean {
  const t = l.rawTitle;
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
