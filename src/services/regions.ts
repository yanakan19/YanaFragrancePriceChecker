/**
 * The country and currency selector in the top bar.
 *
 * PriceSniffs is UK only and GBP only. The selector shows that fact and lists
 * the regions the owner has in mind, each greyed out with a plain "Coming
 * Soon" and no date. Choosing nothing changes nothing: no cookie, no storage,
 * no price converts. Kept free of the DOM so the order, the currencies and
 * the disabled flags are pinned by a unit test (tests/regions.test.ts); the
 * flags are drawn in demo/flags.ts and the menu in demo/app.ts.
 */

export type RegionId = 'GB' | 'US' | 'DE' | 'IN' | 'FR' | 'IT';

export interface Region {
  id: RegionId;
  /** The name as the menu shows it. */
  name: string;
  /** The ISO 4217 currency code, as shown and as read out. */
  currency: string;
  /** True for the one region the site works in today. */
  available: boolean;
  /** The short description under a disabled region, null for the active one. */
  note: string | null;
}

/** The one description a region that cannot be chosen yet carries. */
export const COMING_SOON = 'Coming Soon';

/** In the order the menu lists them. The first is the current choice. */
export const REGIONS: readonly Region[] = [
  { id: 'GB', name: 'United Kingdom', currency: 'GBP', available: true, note: null },
  { id: 'US', name: 'USA', currency: 'USD', available: false, note: COMING_SOON },
  { id: 'DE', name: 'Germany', currency: 'EUR', available: false, note: COMING_SOON },
  { id: 'IN', name: 'India', currency: 'INR', available: false, note: COMING_SOON },
  { id: 'FR', name: 'France', currency: 'EUR', available: false, note: COMING_SOON },
  { id: 'IT', name: 'Italy', currency: 'EUR', available: false, note: COMING_SOON },
];

/** The region the site is in, and the only one that can be chosen. */
export const CURRENT_REGION: Region = REGIONS[0]!;

/** What a screen reader says for the button: the region and its currency. */
export function regionButtonLabel(region: Region = CURRENT_REGION): string {
  return `Region and currency: ${region.name}, ${region.currency}`;
}
