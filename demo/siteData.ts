/**
 * The site switches the deploy decided on, and the owner's hidden and removed
 * brands and shops applied to the shipped data. demo/app.ts imports this
 * FIRST, before anything else reads the catalogue, so that every list, count,
 * page and price the site works out afterwards never sees what was taken off.
 * See demo/siteOverrides.ts for the rules.
 *
 * ── Where the values come from ───────────────────────────────────────────────
 * scripts/build-demo.ts writes a small script into the page's <head> that sets
 * `window.__psSite` (scripts/siteBuild.ts):
 *
 *   stats      true once the database has migration 0007, as the deploy found
 *              it. Until then nothing is counted and nothing is fetched: the
 *              site works exactly as it did before the dashboard existed.
 *   overrides  the list as the deploy read it.
 *   live       the list as it stands now, fetched by that same script while
 *              the price data loads, when it arrives in time (it waits at
 *              most a moment after the data). This is what makes a brand
 *              hidden after the last deploy vanish on the next page load.
 *
 * A page built without that script (a local build, the artifact copy, a test
 * under Node) has no `__psSite`: no counting, no overrides.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { CATALOGUE, CRAWLED, OLDER_OFFERS, HOUSE_PRODUCTS } from './catalogue.generated.js';
import { DEALS_RAW } from './deals.generated.js';
import { applySiteOverrides, overridesFrom, parseOverrideRows, type OverrideRow } from './siteOverrides.js';

interface SiteGlobal {
  stats?: unknown;
  overrides?: unknown;
  live?: unknown;
}

const site = (globalThis as { __psSite?: SiteGlobal }).__psSite;

/** Whether the visitor counter runs on this build (demo/siteCounter.ts). */
export const SITE_STATS_ON = site?.stats === true;

/** True when the list below is the one fetched on this page load, not the deploy's copy. */
export const SITE_OVERRIDES_ARE_LIVE = Array.isArray(site?.live);

/** The overrides in force on this page. */
export const SITE_OVERRIDE_ROWS: OverrideRow[] = parseOverrideRows(SITE_OVERRIDES_ARE_LIVE ? site?.live : site?.overrides);

/** What applying them took off the page, for the dashboard's counts. */
export const SITE_STASH = applySiteOverrides(
  {
    retailers: RETAILERS,
    catalogue: CATALOGUE,
    crawled: CRAWLED,
    older: OLDER_OFFERS,
    houseProducts: HOUSE_PRODUCTS,
    deals: DEALS_RAW,
  },
  overridesFrom(SITE_OVERRIDE_ROWS),
);
