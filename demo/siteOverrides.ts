/**
 * Brands and shops the owner has hidden or removed from the developer
 * dashboard (/developer), applied on top of the code's own lists.
 *
 * ── A layer, not a second registry ───────────────────────────────────────────
 * src/config/retailers.ts stays the source of truth for code: which shops
 * exist, how they are read, whether they are switched on. The overrides are a
 * short list kept in the database (`site_overrides`, supabase/migrations/
 * 0007_site_stats.sql) that the owner changes from the dashboard without a
 * code change, and every reader of it applies the same rules from here:
 *
 *   hidden   off the site at once, on the next page load: no tile, no price,
 *            no page, no count. The data is kept, so Show Again brings it
 *            back on the next page load too.
 *   removed  everything hidden does, and also left out of the build: the
 *            deploy leaves a removed brand's products and a removed shop's
 *            prices out of the data files and the sitemap
 *            (scripts/siteBuild.ts), and the crawl stops reading a removed
 *            shop (scripts/catalogue-harvest.ts). Show Again brings it back
 *            with the next deploy, which runs after every crawl.
 *
 * Where it is applied: demo/siteData.ts, first thing in the page, before any
 * other module has read the catalogue; scripts/siteBuild.ts at deploy time;
 * the crawl. Until migration 0007 is run there is no list and nothing here
 * does anything.
 *
 * ── Keys ─────────────────────────────────────────────────────────────────────
 * A brand is keyed by its address word, the slug of /brands/<slug>, so the
 * key is the one the site already uses to tell brands apart (two spellings
 * that share an address are one brand page, and one override). A shop is
 * keyed by its registry id.
 */
import { slugify } from './router.js';

export type OverrideKind = 'brand' | 'retailer';
export type OverrideState = 'hidden' | 'removed';

/** One row of `site_overrides`, as the API returns it. */
export interface OverrideRow {
  kind: OverrideKind;
  key: string;
  state: OverrideState;
  /** The dashboard's name for it. Never read by the site. */
  name?: string;
}

export interface SiteOverrides {
  /** Brand key to state. */
  brands: ReadonlyMap<string, OverrideState>;
  /** Retailer id to state. */
  retailers: ReadonlyMap<string, OverrideState>;
}

/** The same pattern the table's check constraint holds keys to. */
export const OVERRIDE_KEY_RE = /^[a-z0-9-]{1,120}$/;

/** A brand's override key: its address word. */
export function brandOverrideKey(brand: string): string {
  return slugify(brand);
}

/**
 * The rows of an API answer that have the table's shape, and nothing else.
 * The answer comes from the network; a row that is not one is dropped rather
 * than trusted.
 */
export function parseOverrideRows(raw: unknown): OverrideRow[] {
  if (!Array.isArray(raw)) return [];
  const out: OverrideRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const { kind, key, state, name } = r as Record<string, unknown>;
    if (kind !== 'brand' && kind !== 'retailer') continue;
    if (state !== 'hidden' && state !== 'removed') continue;
    if (typeof key !== 'string' || !OVERRIDE_KEY_RE.test(key)) continue;
    out.push({ kind, key, state, ...(typeof name === 'string' && name ? { name: name.slice(0, 120) } : {}) });
  }
  return out;
}

/** Rows as two lookups. A key listed twice takes the stronger state. */
export function overridesFrom(rows: readonly OverrideRow[]): SiteOverrides {
  const brands = new Map<string, OverrideState>();
  const retailers = new Map<string, OverrideState>();
  for (const r of rows) {
    const map = r.kind === 'brand' ? brands : retailers;
    if (map.get(r.key) !== 'removed') map.set(r.key, r.state);
  }
  return { brands, retailers };
}

export const NO_OVERRIDES: SiteOverrides = { brands: new Map(), retailers: new Map() };

/** The keys of one kind in one state, or in any state when `state` is left out. */
export function keysOf(map: ReadonlyMap<string, OverrideState>, state?: OverrideState): Set<string> {
  return new Set([...map].filter(([, s]) => state === undefined || s === state).map(([k]) => k));
}

/** What the overrides act on: the shipped data, in the shapes the generated modules use. */
export interface OverrideTarget {
  retailers: readonly { id: string; enabled: boolean }[];
  catalogue: { id: string; brand: string }[];
  crawled: Record<string, { retailerId: string }[]>;
  older?: Record<string, { retailerId: string }[]>;
  houseProducts?: { brand: string; house: string }[];
  deals?: { fragranceId: string; retailerId: string }[];
}

/**
 * What applying took off the site, kept so the dashboard can still count a
 * hidden brand's or shop's listings and offer Show Again beside them.
 */
export interface OverrideStash {
  entries: { id: string; brand: string }[];
  offers: Record<string, { retailerId: string }[]>;
  /** Shops an override switched off on this page. */
  retailers: string[];
}

export function emptyStash(): OverrideStash {
  return { entries: [], offers: {}, retailers: [] };
}

/** Drops in place every element `keep` refuses, handing each to `dropped`. */
function keepInPlace<T>(arr: T[], keep: (x: T) => boolean, dropped?: (x: T) => void): void {
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const x = arr[r]!;
    if (keep(x)) arr[w++] = x;
    else dropped?.(x);
  }
  arr.length = w;
}

/**
 * Takes hidden and removed brands and shops out of the data, in place.
 *
 * In place because the page's other modules hold these very arrays and
 * objects: run before any of them has read the catalogue (demo/siteData.ts is
 * the page's first import), every list, count, search, page and price the
 * site works out afterwards simply never sees what was taken out. A shop is
 * also switched off in the registry object itself, which is what already
 * takes a switched off shop's page, its place in the Shops list and its rows
 * in every comparison away (priceService.ts skips a disabled retailer).
 *
 * A product left with no price once a shop's prices are gone leaves the
 * catalogue too, the same as a product no shop sells today.
 *
 * With no overrides it touches nothing and costs nothing.
 */
export function applySiteOverrides(target: OverrideTarget, o: SiteOverrides): OverrideStash {
  const stash = emptyStash();
  if (o.brands.size === 0 && o.retailers.size === 0) return stash;

  for (const r of target.retailers) {
    if (o.retailers.has(r.id) && r.enabled) {
      (r as { enabled: boolean }).enabled = false;
      stash.retailers.push(r.id);
    }
  }

  const gone = new Set<string>();
  const takeEntry = (e: { id: string; brand: string }) => {
    stash.entries.push(e);
    gone.add(e.id);
    const offers = target.crawled[e.id];
    if (offers) {
      stash.offers[e.id] = [...(stash.offers[e.id] ?? []), ...offers];
      delete target.crawled[e.id];
    }
    if (target.older) delete target.older[e.id];
  };

  if (o.brands.size > 0) {
    const keyOf = new Map<string, string>();
    const hiddenBrand = (brand: string) => {
      let k = keyOf.get(brand);
      if (k === undefined) keyOf.set(brand, (k = brandOverrideKey(brand)));
      return o.brands.has(k);
    };
    keepInPlace(target.catalogue, (e) => !hiddenBrand(e.brand), takeEntry);
    if (target.houseProducts) keepInPlace(target.houseProducts, (p) => !hiddenBrand(p.brand) && !hiddenBrand(p.house));
  }

  if (o.retailers.size > 0) {
    const shopGone = (x: { retailerId: string }) => o.retailers.has(x.retailerId);
    for (const id of Object.keys(target.crawled)) {
      const offers = target.crawled[id]!;
      keepInPlace(offers, (x) => !shopGone(x), (x) => {
        (stash.offers[id] ??= []).push(x);
      });
    }
    if (target.older) for (const offers of Object.values(target.older)) keepInPlace(offers, (x) => !shopGone(x));
    // A product with no price left anywhere is not a product the site lists.
    keepInPlace(target.catalogue, (e) => (target.crawled[e.id]?.length ?? 0) > 0, (e) => {
      stash.entries.push(e);
      gone.add(e.id);
    });
  }

  if (target.deals) keepInPlace(target.deals, (d) => !gone.has(d.fragranceId) && !o.retailers.has(d.retailerId));
  return stash;
}

/** One brand as the dashboard lists it. */
export interface BrandListing {
  key: string;
  name: string;
  /** Products of this brand in the catalogue, hidden ones included. */
  products: number;
  /** Prices from shops across those products. */
  listings: number;
}

/**
 * Listings per brand and per shop, counted over what the page shows plus what
 * an override took off it, so a hidden brand or shop still shows its numbers.
 * One listing is one shop's price for one product.
 */
export function countListings(
  catalogue: readonly { id: string; brand: string }[],
  crawled: Readonly<Record<string, readonly { retailerId: string }[]>>,
  stash: OverrideStash = emptyStash(),
): { brands: Map<string, BrandListing>; retailers: Map<string, number> } {
  const brands = new Map<string, BrandListing>();
  const retailers = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of [...catalogue, ...stash.entries]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const offers = [...(crawled[e.id] ?? []), ...(stash.offers[e.id] ?? [])];
    const key = brandOverrideKey(e.brand);
    const b = brands.get(key) ?? { key, name: e.brand, products: 0, listings: 0 };
    b.products += 1;
    b.listings += offers.length;
    brands.set(key, b);
    for (const x of offers) retailers.set(x.retailerId, (retailers.get(x.retailerId) ?? 0) + 1);
  }
  return { brands, retailers };
}
