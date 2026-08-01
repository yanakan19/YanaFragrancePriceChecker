import type { RawOffer } from '../src/types/offer.js';
import type { RetailerTier } from '../src/types/retailer.js';
import type { BottleArt } from './art.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO DATA — NOT REAL PRICES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There is no fetching layer yet (that is the Phase 0 spike), so these offers
 * are hand-written to exercise the presentation logic. They are plausible but
 * invented, and must never be presented to an end user as live pricing. The
 * demo page labels this on every screen.
 *
 * `popularity` stands in for the `search_events`-derived score in the data
 * model sketch. Seeded by hand here exactly as the plan intends: a manual
 * top-N list until there is real traffic to count.
 */

export interface DemoFragrance {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  tier: RetailerTier;
  /** Higher ranks earlier in the popular scroller. Hand-seeded. */
  popularity: number;
  art: BottleArt;
  /** One line for the detail page. */
  blurb: string;
  offers: RawOffer[];
}

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function o(
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

const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function build(id: string, rows: Omit<RawOffer, 'variantId'>[]): RawOffer[] {
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
    popularity: 100,
    blurb: 'Bergamot and pepper over a warm amber base.',
    art: { shape: 'classic', glass: ['#5C7FB8', '#1E3560'], cap: '#22304A', collar: '#9AA6B8', label: '#DCE4F0' },
    offers: build('sauvage-edp-100', [
      o('boots', 24.99, 'inStock', 4),
      o('lookfantastic', 26.0, 'inStock', 12),
      o('superdrug', 25.5, 'inStock', 3),
      o('the-perfume-shop', 27.95, 'inStock', 41),
      o('notino-uk', 23.9, 'inStock', 8),
      o('john-lewis', 22.5, 'outOfStock', 19),
    ]),
  },
  {
    id: 'bleu-edp-100',
    brand: 'Chanel',
    name: 'Bleu de Chanel',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'designer',
    popularity: 96,
    blurb: 'Citrus opening, dry cedar and sandalwood underneath.',
    art: { shape: 'classic', glass: ['#3A4356', '#12161F'], cap: '#0C0F15', label: '#E8EAEE' },
    offers: build('bleu-edp-100', [
      o('the-fragrance-shop', 88.4, 'inStock', 6, { wasPrice: 110.0, promoEndsAt: soon(62) }),
      o('justmylook', 94.0, 'inStock', 22, { wasPrice: 94.0 }),
      o('john-lewis', 108.0, 'inStock', 9),
      o('boots', 105.0, 'lowStock', 15),
      o('allbeauty', 91.75, 'inStock', 2, { wasPrice: 99.0 }),
      o('the-perfume-shop', 99.99, 'unknown', 88),
    ]),
  },
  {
    id: 'aventus-100',
    brand: 'Creed',
    name: 'Aventus',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'niche',
    popularity: 92,
    blurb: 'Smoky pineapple and birch over musk.',
    art: { shape: 'crest', glass: ['#4A4F55', '#181B1F'], cap: '#101215', label: '#C9CDD3' },
    offers: build('aventus-100', [
      o('boots', 310.0, 'inStock', 10),
      o('superdrug', 305.0, 'inStock', 10),
      o('selfridges', 335.0, 'inStock', 11),
      o('harvey-nichols', 330.0, 'inStock', 27),
      o('beautybase', 289.0, 'inStock', 5),
      o('allbeauty', 295.5, 'lowStock', 13),
      o('notino-uk', 284.0, 'inStock', 7),
      o('justmylook', 279.0, 'outOfStock', 33),
    ]),
  },
  {
    id: 'baccarat-540-70',
    brand: 'Maison Francis Kurkdjian',
    name: 'Baccarat Rouge 540',
    concentration: 'Eau de Parfum',
    sizeMl: 70,
    tier: 'niche',
    popularity: 88,
    blurb: 'Saffron and jasmine over ambergris and cedar.',
    art: { shape: 'flat', glass: ['#E8846B', '#A32E2A'], cap: '#2B1512', collar: '#C8A24E', label: '#F6E4D6' },
    offers: build('baccarat-540-70', [
      o('selfridges', 245.0, 'inStock', 9),
      o('harvey-nichols', 240.0, 'lowStock', 18),
      o('notino-uk', 219.0, 'inStock', 6),
      o('beautybase', 228.0, 'inStock', 24),
      o('allbeauty', 232.5, 'inStock', 31, { wasPrice: 255.0 }),
      o('lookfantastic', 249.0, 'outOfStock', 47),
    ]),
  },
  {
    id: 'eros-edt-100',
    brand: 'Versace',
    name: 'Eros',
    concentration: 'Eau de Toilette',
    sizeMl: 100,
    tier: 'designer',
    popularity: 84,
    blurb: 'Mint and green apple with vanilla and tonka.',
    art: { shape: 'classic', glass: ['#4FA8D8', '#15497C'], cap: '#C8A24E', collar: '#C8A24E', label: '#CFE6F4' },
    offers: build('eros-edt-100', [
      o('the-fragrance-shop', 42.5, 'inStock', 5, { wasPrice: 78.0, promoEndsAt: soon(19) }),
      o('boots', 55.0, 'inStock', 13),
      o('superdrug', 49.99, 'inStock', 7),
      o('notino-uk', 44.9, 'inStock', 11),
      o('the-perfume-shop', 58.0, 'lowStock', 29),
      o('justmylook', 47.25, 'inStock', 16),
    ]),
  },
  {
    id: 'one-million-100',
    brand: 'Paco Rabanne',
    name: '1 Million',
    concentration: 'Eau de Toilette',
    sizeMl: 100,
    tier: 'designer',
    popularity: 80,
    blurb: 'Blood mandarin and cinnamon over leather.',
    art: { shape: 'ingot', glass: ['#E6C463', '#A87B21'], cap: '#6E4E12', label: '#FBF0CE' },
    offers: build('one-million-100', [
      o('boots', 62.0, 'inStock', 8),
      o('superdrug', 59.99, 'inStock', 4),
      o('the-perfume-shop', 64.0, 'inStock', 22),
      o('lookfantastic', 57.5, 'inStock', 14, { wasPrice: 72.0 }),
      o('the-fragrance-shop', 55.0, 'lowStock', 35),
      o('john-lewis', 66.0, 'inStock', 26),
    ]),
  },
  {
    id: 'acqua-profumo-75',
    brand: 'Giorgio Armani',
    name: 'Acqua di Giò Profumo',
    concentration: 'Parfum',
    sizeMl: 75,
    tier: 'designer',
    popularity: 74,
    blurb: 'Marine bergamot over smoky incense and patchouli.',
    art: { shape: 'pebble', glass: ['#5E7C86', '#16262E'], cap: '#0E1A20', label: '#BFD2D8' },
    offers: build('acqua-profumo-75', [
      o('john-lewis', 78.0, 'inStock', 12),
      o('boots', 82.0, 'inStock', 20),
      o('allbeauty', 71.5, 'inStock', 6),
      o('notino-uk', 69.9, 'inStock', 9),
      o('lookfantastic', 74.0, 'unknown', 55),
      o('beautybase', 76.5, 'inStock', 40),
    ]),
  },
  {
    id: 'libre-edp-90',
    brand: 'Yves Saint Laurent',
    name: 'Libre',
    concentration: 'Eau de Parfum',
    sizeMl: 90,
    tier: 'designer',
    popularity: 70,
    blurb: 'Lavender and orange blossom over vanilla.',
    art: { shape: 'flat', glass: ['#F0DFAE', '#C39A3F'], cap: '#15130F', collar: '#C8A24E', label: '#FAF2DC' },
    offers: build('libre-edp-90', [
      o('boots', 78.0, 'inStock', 3, { wasPrice: 92.0 }),
      o('john-lewis', 46.5, 'inStock', 21),
      o('superdrug', 23.75, 'lowStock', 9),
      o('lookfantastic', 24.4, 'inStock', 14),
      o('the-perfume-shop', 82.0, 'inStock', 30),
      o('beautybase', 43.0, 'inStock', 52),
    ]),
  },
  {
    id: 'khamrah-100',
    brand: 'Lattafa',
    name: 'Khamrah',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    tier: 'mideast',
    popularity: 66,
    blurb: 'Cinnamon and dates over tonka and praline.',
    art: { shape: 'ornate', glass: ['#8A5C36', '#3A2013'], cap: '#C8A24E', collar: '#C8A24E', label: '#EBD9BF' },
    offers: build('khamrah-100', [
      o('notino-uk', 21.9, 'inStock', 5),
      o('the-fragrance-shop', 24.99, 'inStock', 17, { wasPrice: 32.0 }),
      o('allbeauty', 23.45, 'unknown', 64),
    ]),
  },
  {
    id: 'wood-sage-100',
    brand: 'Jo Malone London',
    name: 'Wood Sage & Sea Salt',
    concentration: 'Cologne',
    sizeMl: 100,
    tier: 'niche',
    popularity: 62,
    blurb: 'Sea salt and sage over driftwood.',
    art: { shape: 'column', glass: ['#F2EDE3', '#D5CBB8'], cap: '#1C1A16', label: '#FFFFFF' },
    offers: build('wood-sage-100', [
      o('selfridges', 112.0, 'outOfStock', 25),
      o('lookfantastic', 105.0, 'outOfStock', 40),
      o('beautybase', 99.0, 'outOfStock', 16),
    ]),
  },
];

/** Popular listing order — highest hand-seeded score first. */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort(
  (a, b) => b.popularity - a.popularity,
);
