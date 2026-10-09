import { lowestPrice, type DemoFragrance } from './data.js';
import { formatMoneyFine } from '../src/services/money.js';
import type { Option } from './listFilters.js';

/**
 * What the Sets and Oils tabs filter on, as plain functions over a product
 * (docs/GIFT-SETS-AND-OILS-PLAN.md, sections 2.3 and 2.4). The facts themselves
 * are read at build time and stored on the product (`giftSet.box`, `.multi`,
 * `.mini`, `.items`, `.mainMl`, `.bundle`), so the page parses nothing.
 *
 * Every function returns what the product states and nothing it does not: a set
 * with no readable main bottle sits in no band, a set with no contents list is in
 * no "In the Box" option except Contents Not Stated.
 */

/* ── Kind ────────────────────────────────────────────────────────────────── */

export type SetKind = 'gift' | 'bundle' | 'miniature';

export const SET_KIND_OPTIONS: readonly Option[] = [
  { value: 'gift', label: 'Gift Set' },
  { value: 'bundle', label: 'Bundle of Full Bottles' },
  { value: 'miniature', label: 'Miniature or Discovery Set' },
];

/** A bundle is a bundle first; a miniature set is a gift set of small bottles; anything else is a gift set. */
export function setKindOf(f: Pick<DemoFragrance, 'giftSet'>): SetKind | null {
  const g = f.giftSet;
  if (!g) return null;
  if (g.bundle) return 'bundle';
  if (g.mini) return 'miniature';
  return 'gift';
}

/* ── In the Box ──────────────────────────────────────────────────────────── */

export const SET_BOX_OPTIONS: readonly Option[] = [
  { value: 'body', label: 'With Body Lotion, Cream or Balm' },
  { value: 'wash', label: 'With Shower Gel or Body Wash' },
  { value: 'deo', label: 'With Deodorant' },
  { value: 'multi', label: 'Two or More Fragrances' },
  { value: 'unknown', label: 'Contents Not Stated' },
];

/** Every In the Box option a set holds; a set with no contents list holds only Contents Not Stated. */
export function setBoxValues(f: Pick<DemoFragrance, 'giftSet'>): string[] {
  const g = f.giftSet;
  if (!g) return [];
  if (g.contents === null) return ['unknown'];
  const box = g.box ?? '';
  const out: string[] = [];
  if (box.includes('b')) out.push('body');
  if (box.includes('w')) out.push('wash');
  if (box.includes('d')) out.push('deo');
  if (g.multi) out.push('multi');
  return out;
}

/* ── Main Bottle ─────────────────────────────────────────────────────────── */

/** Lower bound inclusive, upper bound exclusive: the rule the main Size filter follows (demo/volumeBands.ts). */
export const MAIN_BOTTLE_BANDS: readonly { value: string; label: string; min: number; max: number | null }[] = [
  { value: 'u15', label: 'Under 15ml', min: 0, max: 15 },
  { value: '15-30', label: '15 to 30ml', min: 15, max: 30 },
  { value: '30-70', label: '30 to 70ml', min: 30, max: 70 },
  { value: '70-120', label: '70 to 120ml', min: 70, max: 120 },
  { value: '120+', label: '120ml and Over', min: 120, max: null },
];

export function mainBottleBand(ml: number | null | undefined): string | null {
  if (ml === null || ml === undefined) return null;
  return MAIN_BOTTLE_BANDS.find((b) => ml >= b.min && (b.max === null || ml < b.max))?.value ?? null;
}

/* ── Oils ────────────────────────────────────────────────────────────────── */

/** An oil's own size bands (oils run from 2ml to 50ml; the main Size bands would put most in one). Lower bound in, upper out. */
export const OIL_SIZE_BANDS: readonly { value: string; label: string; min: number; max: number | null }[] = [
  { value: 'u7', label: 'Under 7ml', min: 0, max: 7 },
  { value: '7-13', label: '7 to 13ml', min: 7, max: 13 },
  { value: '13-21', label: '13 to 21ml', min: 13, max: 21 },
  { value: '21-45', label: '21 to 45ml', min: 21, max: 45 },
  { value: '45+', label: '45ml and Over', min: 45, max: null },
];

export function oilSizeBand(ml: number | null | undefined): string | null {
  if (ml === null || ml === undefined) return null;
  return OIL_SIZE_BANDS.find((b) => ml >= b.min && (b.max === null || ml < b.max))?.value ?? null;
}

/** Only a format a shop stated: silence is never read as a bottle or a roll on. */
export const OIL_FORMAT_OPTIONS: readonly Option[] = [
  { value: 'roll-on', label: 'Roll On' },
  { value: 'dropper', label: 'Dropper' },
];

/** The cheapest shop's item price over the size, or null where either is not known. */
export function pricePerMl(f: Pick<DemoFragrance, 'id' | 'sizeMl'>): number | null {
  if (f.sizeMl === null || f.sizeMl <= 0) return null;
  const price = lowestPrice(f.id);
  return Number.isFinite(price) && price > 0 ? price / f.sizeMl : null;
}

/** "£0.80 per ml": under ten pence a millilitre is given to three places so two oils do not read alike. */
export function pricePerMlLabel(perMl: number): string {
  return `${formatMoneyFine(perMl, perMl < 0.1 ? 3 : 2)} per ml`;
}

/* ── a list of anything by name: Brand, Shop ─────────────────────────────── */

/** A lowercase, hyphenated form of a name, safe in an address. */
export const slugOf = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
