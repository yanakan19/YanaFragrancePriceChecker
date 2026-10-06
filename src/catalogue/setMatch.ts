import { brandKey } from './brandName.js';
import { foldTitle } from './fragranceId.js';
import { parseContents, withoutItemWords } from './giftSetItems.js';

/**
 * The same set at two shops, the third tier (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * section 3.3, phase 4).
 *
 * Two tiers decide it already and stay exactly as they are: a trustworthy
 * barcode (`set-ean-<barcode>`), or an identical normalised title
 * (`set-<title>`). This adds a third, strictly conservative, run on sets alone
 * (nothing here can see a bottle or an oil): two sets are one set only when ALL
 * of these hold, and a group that fails one goes to a review list, never to the
 * page.
 *
 *   1. the same canonical brand, and one the title names (never "Unbranded");
 *   2. the same scent words once set words, strength words, item words and sizes
 *      are taken out, with every number in the name kept ("Collection 1" is not
 *      "Collection 2", "No. 5" is not "No. 3");
 *   3. the same full contents signature: every item's count, size and kind,
 *      sorted, so "50ml EDP + 10ml EDP" meets "50ml Eau de Parfum + 10ml Eau de
 *      Parfum" and never "50ml Eau de Parfum + 10ml Travel Spray", and never
 *      matches on a main bottle size alone;
 *   4. the same strength where both state one;
 *   5. no two different barcodes in the group;
 *   6. no shop twice (a shop listing two sets of one name is telling them apart);
 *   7. a price spread inside SPREAD_MAX, the dearest lowest price over the
 *      cheapest. Taken from the matches that existed before this tier (median
 *      1.12, 90th percentile 1.33, maximum 2.31): a group beyond it is two sets
 *      that look alike and cost differently, which is how a set with a lotion in
 *      it differs from one without.
 *
 * A set with no contents list is never matched here (its signature is null).
 */

export const SPREAD_MAX = 1.5;

export interface SetCandidate {
  id: string;
  brand: string;
  /** The shop's title less the brand (giftSetName). */
  name: string;
  concentration: string;
  /** The set's own barcode where a trustworthy one was printed, else null. */
  ean: string | null;
  contents: string[] | null;
  shops: string[];
  /** The lowest item price among its offers. */
  price: number | null;
}

export interface SetGroup {
  /** The survivor: the set with a barcode first, then the one at most shops, then the lowest id. */
  canonical: string;
  absorbed: string[];
}

export interface RefusedSetGroup {
  ids: string[];
  /** Every rule the group failed, in words. */
  reasons: string[];
}

export interface SetMatchResult {
  groups: SetGroup[];
  refused: RefusedSetGroup[];
}

const STRENGTH_WORDS = /\b(?:eau de parfum|eau de toilette|eau de cologne|extrait de parfum|parfum|perfume|perfumed|toilette|cologne|extrait|edp|edt|edc|fragrance|aftershave|spray|splash)\b/g;
const SET_WORDS = /\b(?:gift ?sets?|giftsets?|sets?|coffret|pack|boxed|for|him|her|men|women|mens|womens|unisex|the|and|with|of|a)\b/g;

/** The words of a set's name that say which scent and which edition it is, sorted: numbers kept, set and strength words gone. */
export function scentKey(name: string): string {
  let t = foldTitle(name).toLowerCase().replace(/&amp;/g, ' and ');
  t = t.replace(/['’`]s\b/g, '');
  t = t.replace(/(?<![\d.])\d{1,4}(?:\.\d{1,3})?\s*(?:ml|oz|g|l)\b/g, ' ');
  t = t.replace(/(?<![\d.])\d{1,2}\s*[x×*]\s*/g, ' ');
  t = t.replace(/(?<![\d.])\d{1,3}\s*(?:pcs|pc|pieces?|piece)\b/g, ' ');
  t = withoutItemWords(t);
  t = t.replace(STRENGTH_WORDS, ' ').replace(SET_WORDS, ' ');
  const words = t.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return [...new Set(words)].sort().join(' ');
}

/**
 * Every item's count, size and kind, sorted. Null where the contents are not
 * known well enough to compare: no list, or a fragrance item with no size.
 */
export function contentsSignature(contents: readonly string[] | null): string | null {
  if (!contents || contents.length === 0) return null;
  const parts: string[] = [];
  for (const item of parseContents(contents)) {
    if (item.pieces) {
      parts.push(`${item.count}p`);
      continue;
    }
    if ((item.kind === 'fragrance' || item.kind === 'travel') && item.ml === null) return null;
    parts.push(`${item.count ?? 1}x${item.ml ?? '?'}${item.kind ?? '?'}`);
  }
  return parts.sort().join('|');
}

const isStated = (c: string): boolean => c !== 'Not stated' && c !== 'Disputed';

/** Which sets are the same set. Groups of two or more that pass every rule, and those that failed one. */
export function matchSets(candidates: readonly SetCandidate[]): SetMatchResult {
  const buckets = new Map<string, SetCandidate[]>();
  for (const c of candidates) {
    if (!c.brand || /^unbranded$/i.test(c.brand)) continue;
    const signature = contentsSignature(c.contents);
    const scent = scentKey(c.name);
    if (signature === null || scent === '') continue;
    const key = `${brandKey(c.brand)}|${scent}|${signature}`;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const groups: SetGroup[] = [];
  const refused: RefusedSetGroup[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const reasons: string[] = [];
    const strengths = new Set(members.map((m) => m.concentration).filter(isStated));
    if (strengths.size > 1) reasons.push(`strengths differ: ${[...strengths].sort().join(', ')}`);
    // A UPC and its EAN-13 form differ only by leading zeros and are one code.
    const barcodes = new Set(members.map((m) => (m.ean === null ? null : m.ean.replace(/^0+/, ''))).filter((e): e is string => e !== null));
    if (barcodes.size > 1) reasons.push(`two different barcodes: ${[...barcodes].sort().join(', ')}`);
    const shops = members.flatMap((m) => m.shops);
    const twice = [...new Set(shops.filter((s, i) => shops.indexOf(s) !== i))];
    if (twice.length > 0) reasons.push(`a shop lists more than one: ${twice.sort().join(', ')}`);
    const prices = members.map((m) => m.price).filter((p): p is number => p !== null && p > 0);
    if (prices.length >= 2) {
      const spread = Math.max(...prices) / Math.min(...prices);
      if (spread > SPREAD_MAX) reasons.push(`price spread ${spread.toFixed(2)} is over ${SPREAD_MAX}`);
    }
    const ids = members.map((m) => m.id).sort();
    if (reasons.length > 0) {
      refused.push({ ids, reasons });
      continue;
    }
    const ordered = [...members].sort(
      (a, b) => Number(b.ean !== null) - Number(a.ean !== null) || b.shops.length - a.shops.length || a.id.localeCompare(b.id),
    );
    groups.push({ canonical: ordered[0]!.id, absorbed: ordered.slice(1).map((m) => m.id).sort() });
  }
  groups.sort((a, b) => a.canonical.localeCompare(b.canonical));
  refused.sort((a, b) => a.ids[0]!.localeCompare(b.ids[0]!));
  return { groups, refused };
}
