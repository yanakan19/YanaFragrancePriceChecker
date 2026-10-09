/**
 * The country and currency selector in the top bar.
 *
 * The list comes from the region config (src/config/regions.ts): the United
 * Kingdom, the United States and India, in that order (owner decision 3,
 * 9 October 2026; Germany, France and Italy left the menu until they are
 * planned). A region that is not live yet is greyed out with a plain "Coming
 * Soon" and no date, and cannot be chosen. Choosing the region the page is
 * already in changes nothing: no cookie, no storage, no price moves. Kept free
 * of the DOM so the order, the currencies and the disabled flags are pinned
 * by a unit test (tests/regions.test.ts); the flags are drawn in
 * demo/flags.ts and the menu in demo/app.ts.
 */

import { REGION_CONFIGS, activeRegion, type RegionConfig, type RegionId } from '../config/regions.js';

export type { RegionId } from '../config/regions.js';

export interface Region {
  id: RegionId;
  /** The name as the menu shows it. */
  name: string;
  /** The ISO 4217 currency code, as shown and as read out. */
  currency: string;
  /** True for a region that is live and so can be chosen. */
  available: boolean;
  /** The short description under a disabled region, null for a live one. */
  note: string | null;
  /** The region's full config. */
  config: RegionConfig;
}

/** The one description a region that cannot be chosen yet carries. */
export const COMING_SOON = 'Coming Soon';

function toRegion(c: RegionConfig): Region {
  return { id: c.id, name: c.name, currency: c.currency, available: c.live, note: c.live ? null : COMING_SOON, config: c };
}

/** In the order the menu lists them. */
export const REGIONS: readonly Region[] = REGION_CONFIGS.map(toRegion);

/** The region the page is in: the United Kingdom on every address today. */
export const CURRENT_REGION: Region = REGIONS.find((r) => r.id === activeRegion().id) ?? REGIONS[0]!;

/** What a screen reader says for the button: the region and its currency. */
export function regionButtonLabel(region: Region = CURRENT_REGION): string {
  return `Region and currency: ${region.name}, ${region.currency}`;
}
