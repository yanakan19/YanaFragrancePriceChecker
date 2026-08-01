import type { RawOffer } from '../src/types/offer.js';
import type { RetailerTier } from '../src/types/retailer.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO DATA — NOT REAL PRICES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There is no fetching layer yet (that is the Phase 0 spike), so these offers
 * are hand-written to exercise the presentation logic. They are plausible but
 * invented, and must never be presented to an end user as live pricing.
 *
 * The demo page labels this prominently. On a site whose entire value is price
 * honesty, showing fabricated numbers without that label would be the exact
 * failure the codebase is built to prevent.
 *
 * Each scenario below is chosen to exercise a specific rule — see `note`.
 */

export interface DemoFragrance {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  tier: RetailerTier;
  /** What this scenario is designed to demonstrate. */
  note: string;
  offers: RawOffer[];
}

/** Offers are captured at varying ages to exercise the staleness label. */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function offer(
  retailerId: string,
  price: number,
  stock: RawOffer['stock'],
  ageMinutes: number,
  extra: Partial<RawOffer> = {},
): Omit<RawOffer, 'variantId'> {
  return {
    retailerId,
    price,
    currency: 'GBP',
    stock,
    url: `https://example-demo.invalid/${retailerId}`,
    fetchedAt: ago(ageMinutes),
    ...extra,
  };
}

function build(
  id: string,
  rows: Omit<RawOffer, 'variantId'>[],
): RawOffer[] {
  return rows.map((r) => ({ ...r, variantId: id }));
}

export const DEMO_FRAGRANCES: DemoFragrance[] = [
  {
    id: 'sauvage-edp-100',
    brand: 'Dior',
    name: 'Sauvage',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'designer',
    note:
      'The delivered-price case. Boots has the lowest item price at £24.99 but ' +
      'misses its own £25 free-delivery threshold by a penny, so it finishes last.',
    offers: build('sauvage-edp-100', [
      offer('boots', 24.99, 'inStock', 4),
      offer('lookfantastic', 26.0, 'inStock', 12),
      offer('superdrug', 25.5, 'inStock', 3),
      offer('the-perfume-shop', 27.95, 'inStock', 41),
      offer('notino-uk', 23.9, 'inStock', 8),
      offer('john-lewis', 22.5, 'outOfStock', 19),
    ]),
  },
  {
    id: 'bleu-edp-100',
    brand: 'Chanel',
    name: 'Bleu de Chanel',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'designer',
    note:
      'Discount presentation. The Fragrance Shop published a was/now pair with a ' +
      'real end time, so a countdown is allowed. Justmylook has a stale RRP at or ' +
      'below its selling price, so no badge is drawn at all.',
    offers: build('bleu-edp-100', [
      offer('the-fragrance-shop', 88.4, 'inStock', 6, {
        wasPrice: 110.0,
        promoEndsAt: new Date(Date.now() + 62 * 3_600_000).toISOString(),
      }),
      offer('justmylook', 94.0, 'inStock', 22, { wasPrice: 94.0 }),
      offer('john-lewis', 108.0, 'inStock', 9),
      offer('boots', 105.0, 'lowStock', 15),
      offer('allbeauty', 91.75, 'inStock', 2, { wasPrice: 99.0 }),
      offer('the-perfume-shop', 99.99, 'unknown', 88),
    ]),
  },
  {
    id: 'aventus-100',
    brand: 'Creed',
    name: 'Aventus',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'niche',
    note:
      'Tier filtering. Boots and Superdrug do not stock niche houses, so they are ' +
      'never queried. Harvey Nichols carries delivery because its £300 free ' +
      'threshold is unreachable on a single bottle.',
    offers: build('aventus-100', [
      // Present in the raw capture but withheld by the tier filter: neither
      // retailer stocks niche houses, so these are batch-fetch noise.
      offer('boots', 310.0, 'inStock', 10),
      offer('superdrug', 305.0, 'inStock', 10),
      offer('selfridges', 335.0, 'inStock', 11),
      offer('harvey-nichols', 330.0, 'inStock', 27),
      offer('beautybase', 289.0, 'inStock', 5),
      offer('allbeauty', 295.5, 'lowStock', 13),
      offer('notino-uk', 284.0, 'inStock', 7),
      offer('justmylook', 279.0, 'outOfStock', 33),
    ]),
  },
  {
    id: 'khamrah-100',
    brand: 'Lattafa',
    name: 'Khamrah',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'mideast',
    note:
      'A thin market. Only three retailers carry the Middle Eastern tier, and one ' +
      'of them could not be parsed — unknown stock ranks below confirmed ' +
      'availability but above an explicit out-of-stock signal.',
    offers: build('khamrah-100', [
      offer('notino-uk', 21.9, 'inStock', 5),
      offer('the-fragrance-shop', 24.99, 'inStock', 17, { wasPrice: 32.0 }),
      offer('allbeauty', 23.45, 'unknown', 64),
    ]),
  },
  {
    id: 'libre-edp-90',
    brand: 'Yves Saint Laurent',
    name: 'Libre',
    concentration: 'Eau de Parfum',
    sizeMl: 90,
    tier: 'designer',
    note:
      'Free-delivery shortfall. Several listings sit just under their retailer ' +
      "threshold, so each row shows how much more the basket needs to clear it.",
    offers: build('libre-edp-90', [
      offer('boots', 78.0, 'inStock', 3, { wasPrice: 92.0 }),
      offer('john-lewis', 46.5, 'inStock', 21),
      offer('superdrug', 23.75, 'lowStock', 9),
      offer('lookfantastic', 24.4, 'inStock', 14),
      offer('the-perfume-shop', 82.0, 'inStock', 30),
      offer('beautybase', 43.0, 'inStock', 52),
    ]),
  },
  {
    id: 'wood-sage-100',
    brand: 'Jo Malone London',
    name: 'Wood Sage & Sea Salt',
    concentration: 'Cologne',
    sizeMl: 100,
    tier: 'niche',
    note:
      'Nothing buyable. Every listing is explicitly out of stock, so there is no ' +
      'best offer — the app says so rather than headlining a price nobody can pay.',
    offers: build('wood-sage-100', [
      offer('selfridges', 112.0, 'outOfStock', 25),
      offer('lookfantastic', 105.0, 'outOfStock', 40),
      offer('beautybase', 99.0, 'outOfStock', 16),
    ]),
  },
];
