import type { DemoFragrance } from './data.js';
import type { Option, SelectFacet } from './tabLists.js';

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

/**
 * A dropdown whose options are whatever the list holds (its brands, its shops),
 * named in A to Z order. `labels` is read once, lazily, from the whole list: an
 * address may name only a value the list has.
 */
export function namedSelect<T>(
  id: string,
  label: string,
  any: string,
  values: (item: T) => readonly string[],
  labels: () => ReadonlyMap<string, string>,
): SelectFacet<T> {
  return {
    kind: 'select',
    id,
    label,
    any,
    values,
    options: (found) =>
      [...found.keys()]
        .map((value) => ({ value, label: labels().get(value) ?? value }))
        .sort((a, b) => a.label.localeCompare(b.label) || (a.value < b.value ? -1 : 1)),
    known: (value) => labels().has(value),
  };
}
