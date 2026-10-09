/**
 * The region shops by region, and the small piece of region config the region
 * crawl needs (docs/INTERNATIONAL-PLAN.md, Phase 1, step one).
 *
 * `REGION_CRAWL` is read from the one region config (src/config/regions.ts,
 * Phase 0): the region's currency and its address prefix, which is also its
 * data folder under data/regions/. tests/regionRetailers.test.ts holds the
 * two together.
 */
import type { RegionCode, RegionCurrency, RegionRetailer } from '../types/regionRetailer.js';
import { regionById } from './regions.js';
import { US_RETAILERS } from './retailers.us.js';
import { IN_RETAILERS } from './retailers.in.js';

export interface RegionCrawlConfig {
  id: RegionCode;
  /** The data folder under data/regions/, and the address prefix the plan gives the region. */
  folder: 'us' | 'in';
  currency: RegionCurrency;
}

function crawlConfig(id: RegionCode): RegionCrawlConfig {
  const cfg = regionById(id);
  if (!cfg || cfg.pathPrefix === '' || cfg.currency === 'GBP') throw new Error(`No region config for ${id}`);
  return { id, folder: cfg.pathPrefix, currency: cfg.currency };
}

export const REGION_CRAWL: Readonly<Record<RegionCode, RegionCrawlConfig>> = {
  US: crawlConfig('US'),
  IN: crawlConfig('IN'),
};

export const REGION_RETAILERS: Readonly<Record<RegionCode, readonly RegionRetailer[]>> = {
  US: US_RETAILERS,
  IN: IN_RETAILERS,
};

/** The region named by a folder or code ('us', 'US', 'in', 'IN'), or null. */
export function regionFromArg(arg: string | null | undefined): RegionCrawlConfig | null {
  if (!arg) return null;
  const up = arg.toUpperCase();
  return up === 'US' || up === 'IN' ? REGION_CRAWL[up] : null;
}

export function regionRetailer(region: RegionCode, id: string): RegionRetailer | undefined {
  return REGION_RETAILERS[region].find((r) => r.id === id);
}
