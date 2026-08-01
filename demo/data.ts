import type { RetailerTier } from '../src/types/retailer.js';
import type { BottleArt } from './art.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO DATA — NOT REAL PRICES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file holds only what a fragrance IS: identity, artwork and the EAN that
 * joins it to crawled listings. Prices live in catalogue.generated.ts and come
 * out of the crawl, so there is exactly one source of truth for a number.
 *
 * The prices currently shown were produced by crawling saved retailer pages
 * rather than live shops, so they are illustrative and the app says so.
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
  /** Joins a demo fragrance to the crawled listings. Real EANs. */
  ean: string;
  tier: RetailerTier;
  /** Higher ranks earlier in the popular scroller. Hand-seeded. */
  popularity: number;
  art: BottleArt;
  /** One line for the detail page. */
  blurb: string;
}

export const DEMO_FRAGRANCES: DemoFragrance[] = [
  {
    id: 'sauvage-edp-100',
    brand: 'Dior',
    name: 'Sauvage',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '3348901486958',
    tier: 'designer',
    popularity: 100,
    blurb: 'Bergamot and pepper over a warm amber base.',
    art: { shape: 'classic', glass: ['#5C7FB8', '#1E3560'], cap: '#22304A', collar: '#9AA6B8', label: '#DCE4F0' },
  },
  {
    id: 'bleu-edp-100',
    brand: 'Chanel',
    name: 'Bleu de Chanel',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '3145891073607',
    tier: 'designer',
    popularity: 96,
    blurb: 'Citrus opening, dry cedar and sandalwood underneath.',
    art: { shape: 'classic', glass: ['#3A4356', '#12161F'], cap: '#0C0F15', label: '#E8EAEE' },
  },
  {
    id: 'aventus-100',
    brand: 'Creed',
    name: 'Aventus',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '3508441001152',
    tier: 'niche',
    popularity: 92,
    blurb: 'Smoky pineapple and birch over musk.',
    art: { shape: 'crest', glass: ['#4A4F55', '#181B1F'], cap: '#101215', label: '#C9CDD3' },
  },
  {
    id: 'baccarat-540-70',
    brand: 'Maison Francis Kurkdjian',
    name: 'Baccarat Rouge 540',
    concentration: 'Eau de Parfum',
    sizeMl: 70,
    ean: '3700559608579',
    tier: 'niche',
    popularity: 88,
    blurb: 'Saffron and jasmine over ambergris and cedar.',
    art: { shape: 'flat', glass: ['#E8846B', '#A32E2A'], cap: '#2B1512', collar: '#C8A24E', label: '#F6E4D6' },
  },
  {
    id: 'eros-edt-100',
    brand: 'Versace',
    name: 'Eros',
    concentration: 'Eau de Toilette',
    sizeMl: 100,
    ean: '8011003809202',
    tier: 'designer',
    popularity: 84,
    blurb: 'Mint and green apple with vanilla and tonka.',
    art: { shape: 'classic', glass: ['#4FA8D8', '#15497C'], cap: '#C8A24E', collar: '#C8A24E', label: '#CFE6F4' },
  },
  {
    id: 'one-million-100',
    brand: 'Paco Rabanne',
    name: '1 Million',
    concentration: 'Eau de Toilette',
    sizeMl: 100,
    ean: '3349668528813',
    tier: 'designer',
    popularity: 80,
    blurb: 'Blood mandarin and cinnamon over leather.',
    art: { shape: 'ingot', glass: ['#E6C463', '#A87B21'], cap: '#6E4E12', label: '#FBF0CE' },
  },
  {
    id: 'acqua-profumo-75',
    brand: 'Giorgio Armani',
    name: 'Acqua di Giò Profumo',
    concentration: 'Parfum',
    sizeMl: 75,
    ean: '3614270282492',
    tier: 'designer',
    popularity: 74,
    blurb: 'Marine bergamot over smoky incense and patchouli.',
    art: { shape: 'pebble', glass: ['#5E7C86', '#16262E'], cap: '#0E1A20', label: '#BFD2D8' },
  },
  {
    id: 'libre-edp-90',
    brand: 'Yves Saint Laurent',
    name: 'Libre',
    concentration: 'Eau de Parfum',
    sizeMl: 90,
    ean: '3614272648616',
    tier: 'designer',
    popularity: 70,
    blurb: 'Lavender and orange blossom over vanilla.',
    art: { shape: 'flat', glass: ['#F0DFAE', '#C39A3F'], cap: '#15130F', collar: '#C8A24E', label: '#FAF2DC' },
  },
  {
    id: 'khamrah-100',
    brand: 'Lattafa',
    name: 'Khamrah',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '6291108736258',
    tier: 'mideast',
    popularity: 66,
    blurb: 'Cinnamon and dates over tonka and praline.',
    art: { shape: 'ornate', glass: ['#8A5C36', '#3A2013'], cap: '#C8A24E', collar: '#C8A24E', label: '#EBD9BF' },
  },
  {
    id: 'wood-sage-100',
    brand: 'Jo Malone London',
    name: 'Wood Sage & Sea Salt',
    concentration: 'Cologne',
    sizeMl: 100,
    ean: '690251037339',
    tier: 'niche',
    popularity: 62,
    blurb: 'Sea salt and sage over driftwood.',
    art: { shape: 'column', glass: ['#F2EDE3', '#D5CBB8'], cap: '#1C1A16', label: '#FFFFFF' },
  },
  {
    id: 'lavieestbelle-100',
    brand: 'Lancome',
    name: 'La Vie Est Belle',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '3605532612836',
    tier: 'designer',
    popularity: 78,
    blurb: 'Iris and patchouli over praline sweetness.',
    art: { shape: 'ornate', glass: ['#F4C9D6', '#C4657F'], cap: '#B9985A', collar: '#C8A24E', label: '#FBEAF0' },
  },
  {
    id: 'blackopium-90',
    brand: 'Yves Saint Laurent',
    name: 'Black Opium',
    concentration: 'Eau de Parfum',
    sizeMl: 90,
    ean: '3614272050334',
    tier: 'designer',
    popularity: 76,
    blurb: 'Black coffee and vanilla over white flowers.',
    art: { shape: 'flat', glass: ['#4A4048', '#141013'], cap: '#12100F', label: '#D8CFD4' },
  },
  {
    id: 'oudwood-50',
    brand: 'Tom Ford',
    name: 'Oud Wood',
    concentration: 'Eau de Parfum',
    sizeMl: 50,
    ean: '888066008075',
    tier: 'niche',
    popularity: 72,
    blurb: 'Rare oud with sandalwood and vanilla.',
    art: { shape: 'crest', glass: ['#6B5B45', '#241C13'], cap: '#15110C', label: '#CFC3AE' },
  },
  {
    id: 'santal33-50',
    brand: 'Le Labo',
    name: 'Santal 33',
    concentration: 'Eau de Parfum',
    sizeMl: 50,
    ean: '3660549000330',
    tier: 'niche',
    popularity: 68,
    blurb: 'Sandalwood and cardamom over leather.',
    art: { shape: 'column', glass: ['#D9CDB6', '#9C8A6B'], cap: '#22201B', label: '#F2ECDF' },
  },
  {
    id: 'erbapura-100',
    brand: 'Xerjoff',
    name: 'Erba Pura',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '8033488154332',
    tier: 'niche',
    popularity: 64,
    blurb: 'Sicilian citrus over amber and musk.',
    art: { shape: 'pebble', glass: ['#F0D98C', '#B8862C'], cap: '#2A2115', collar: '#C8A24E', label: '#FBF3DA' },
  },
  {
    id: 'asad-100',
    brand: 'Lattafa',
    name: 'Asad',
    concentration: 'Eau de Parfum',
    sizeMl: 100,
    ean: '6291108738900',
    tier: 'mideast',
    popularity: 60,
    blurb: 'Tobacco and bergamot over vanilla.',
    art: { shape: 'ornate', glass: ['#4A4E56', '#181B20'], cap: '#B08D3E', collar: '#C8A24E', label: '#DDD6C6' },
  },
];

/** Popular listing order — highest hand-seeded score first. */
export const BY_POPULARITY: DemoFragrance[] = [...DEMO_FRAGRANCES].sort(
  (a, b) => b.popularity - a.popularity,
);
