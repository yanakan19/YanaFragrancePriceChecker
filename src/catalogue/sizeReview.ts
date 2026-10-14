/**
 * Sizes a shop states that the house's own list contradicts (14 Oct 2026,
 * docs/SIZE-REVIEW-2026-10-14.md).
 *
 * Emirates Oud titled and described Swiss Arabian's Shaghaf Oud Marine and
 * Shaghaf Nectar Blush "100ml". The house sells every Shaghaf in 75ml (and 25ml
 * minis); swissarabian.com's own product list (read 14 Oct 2026, robots allow)
 * has no 100ml, the shop's £44.99 and £49.99 are 75ml prices, and every other
 * shop selling Nectar Blush states 75ml. Emirates Oud had already corrected its
 * Vanilla Toffee page from 100ml to 75ml. The crawl read the page correctly; the
 * shop's copy was wrong, so no reader change helps. The size is settled here.
 *
 * HOUSE_SIZES_REVIEWED: sizes a house makes of a named family, read from the
 * house's own list. SIZE_CORRECTIONS_REVIEWED: the listing (shop and retailer
 * sku) whose stated size is read as the given one instead, as an outvoted
 * barcode size is (settleBarcodeSizes). SIZE_REVIEW_PENDING: listings the rule
 * flags that nobody could settle; they are only flagged. Append only.
 *
 * The rule (findHouseSizeContradictions) is deliberately narrow so a genuine new
 * size cannot trip it: a size the house list does not show, stated by one shop
 * only. A size two shops state is a new bottle, not a slip.
 */
import { isGiftSet } from './giftSet.js';
import { ML_SIZE_RE } from './fragranceId.js';
import type { StoredListing } from './types.js';

export interface HouseSizes {
  house: string;
  /** The house names the family in the listing's brand or title. */
  houseIn: RegExp;
  family: RegExp;
  /** Full bottle and mini sizes; anything up to `sampleMax` ml is a vial. */
  sizes: readonly number[];
  evidence: string;
}
export const SAMPLE_MAX_ML = 10;

export const HOUSE_SIZES_REVIEWED: readonly HouseSizes[] = [
  {
    house: 'Swiss Arabian',
    houseIn: /swiss\s*arabian/i,
    family: /sha+gha?f/i,
    sizes: [25, 75],
    evidence: "swissarabian.com/collections/shaghaf/products.json (read 14 Oct 2026): every Shaghaf is 75 ML, 25 ML minis; none is 100ml",
  },
];

export interface SizeCorrection { retailerId: string; retailerSku: string; ml: number; evidence: string }
export const SIZE_CORRECTIONS_REVIEWED: readonly SizeCorrection[] = [
  { retailerId: 'emirates-oud', retailerSku: '16594941837702-Default Title', ml: 75, evidence: 'Shaghaf Oud Marine: house list has 75 ML only; £49.99 is the 75ml price; shop title and copy say 100ml' },
  { retailerId: 'emirates-oud', retailerSku: '15915665031517-Default Title', ml: 75, evidence: 'Shaghaf Nectar Blush: house list has 75 ML only; six other shops state 75ml; shop title and copy say 100ml' },
];

/** Flagged by the rule, not settled (listed in docs/SIZE-REVIEW-2026-10-14.md). Key: `retailerId|retailerSku`. */
export const SIZE_REVIEW_PENDING: readonly string[] = [
  'justmylook|SHAG0009', // Shaghaf Tobacco 01 Extrait 50ml: the house sells a Tobacco 01 (£68), size unread, not a Shaghaf
];

export function correctionKey(retailerId: string, retailerSku: string): string {
  return `${retailerId}|${retailerSku}`;
}

/** The corrections as the map the build reads beside the barcode sizes. */
export function reviewedSizeMap(): Map<string, number> {
  return new Map(SIZE_CORRECTIONS_REVIEWED.map((c) => [correctionKey(c.retailerId, c.retailerSku), c.ml]));
}

const statedSize = (l: StoredListing): number | null => {
  const m = ML_SIZE_RE.exec(l.rawTitle);
  return m ? Number.parseFloat(m[1]!) : null;
};

export interface HouseSizeContradiction { key: string; title: string; stated: number; house: string; allowed: readonly number[] }

/** Active single bottles whose one-shop size the house's list does not show. */
export function findHouseSizeContradictions(listings: readonly StoredListing[], houses: readonly HouseSizes[] = HOUSE_SIZES_REVIEWED): HouseSizeContradiction[] {
  const out: HouseSizeContradiction[] = [];
  const active = listings.filter((l) => l.status === 'active');
  for (const h of houses) {
    const mine = active.filter((l) => (h.houseIn.test(l.rawBrand ?? '') || h.houseIn.test(l.rawTitle)) && h.family.test(l.rawTitle) && !isGiftSet(l));
    const shopsBySize = new Map<number, Set<string>>();
    for (const l of mine) {
      const ml = statedSize(l);
      if (ml !== null) (shopsBySize.get(ml) ?? shopsBySize.set(ml, new Set()).get(ml)!).add(l.retailerId);
    }
    for (const l of mine) {
      const ml = statedSize(l);
      if (ml === null || ml <= SAMPLE_MAX_ML || h.sizes.includes(ml)) continue;
      if ((shopsBySize.get(ml)?.size ?? 0) >= 2) continue;
      out.push({ key: correctionKey(l.retailerId, l.retailerSku), title: l.rawTitle, stated: ml, house: h.house, allowed: h.sizes });
    }
  }
  return out;
}
