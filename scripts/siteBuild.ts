/**
 * The developer dashboard's part in building the site: reading the owner's
 * list of hidden and removed brands and shops (demo/siteOverrides.ts), deciding
 * whether the visitor counter is on, and what that means for the page.
 *
 *   scripts/bundle-demo.ts   calls resolveSiteBuild() first, which writes
 *                            dist-demo/site.json, and leaves removed brands
 *                            and shops out of the data files (pruneMovedBlobs)
 *   scripts/build-demo.ts    writes siteHeadScript() into the page's <head>
 *   scripts/build-sitemap.ts leaves hidden and removed ones out of the
 *                            sitemap (scripts/siteApply.ts)
 *   scripts/catalogue-harvest.ts and scripts/storefront-reprice.ts skip a
 *                            removed shop (removedRetailerIds)
 *
 * ── Only the deploy asks the database ────────────────────────────────────────
 * The list is fetched only when SITE_OVERRIDES_FETCH=1, which the deploy and
 * the crawl's harvest step set (.github/workflows/deploy-pages.yml,
 * catalogue-daily.yml). Every other build (a local `npm run demo`, `npm test`,
 * the crawl's own rebuild) has no list and the counter off, so it builds
 * exactly the page it built before the dashboard existed, and no test depends
 * on what the owner has hidden today. SITE_OVERRIDES_FILE=<path> stands in a
 * JSON file for the database, for tests.
 *
 * ── What the deploy decides from the answer ──────────────────────────────────
 *   the table answers       counter on, and the list as it stands
 *   the table is missing    migration 0007 has not been run: counter off, no
 *                           list, the site exactly as before
 *   no answer at all        counter on (the database exists; a page that finds
 *                           it missing stops by itself), no list, and a
 *                           warning in the log. The page still fetches the
 *                           list itself on every load, so hidden things stay
 *                           hidden; only the build's own copy is missing.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../demo/supabase.js';
import { brandOverrideKey, keysOf, overridesFrom, parseOverrideRows, type OverrideRow } from '../demo/siteOverrides.js';

/** What dist-demo/site.json holds, and what the page's `window.__psSite` starts as. */
export interface SiteBuild {
  /** Whether the visitor counter runs on this build. */
  stats: boolean;
  overrides: OverrideRow[];
  /** Where the answer came from, for the build log. */
  source: 'off' | 'file' | 'fetched' | 'not set up' | 'unreachable';
}

export const SITE_BUILD_PATH = 'dist-demo/site.json';

export const SITE_OFF: SiteBuild = { stats: false, overrides: [], source: 'off' };

/** The public list's address: kind, key and state of every row. */
export const OVERRIDES_ENDPOINT = `${SUPABASE_URL}/rest/v1/site_overrides?select=kind,key,state,name`;

export type FetchOutcome =
  | { status: 'ok'; rows: OverrideRow[] }
  | { status: 'missing' }
  | { status: 'failed'; reason: string };

/**
 * Reads the list with the public key, as any visitor's browser may. A 404 is
 * PostgREST saying the table does not exist (migration 0007 not run); anything
 * else that is not a 200 is retried, then reported as a failure.
 */
export async function fetchOverrideRows(
  fetchImpl: typeof fetch = fetch,
  { tries = 3, timeoutMs = 10_000, waitMs = 2_000 }: { tries?: number; timeoutMs?: number; waitMs?: number } = {},
): Promise<FetchOutcome> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { status: 'missing' };
  let reason = 'no attempt';
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetchImpl(OVERRIDES_ENDPOINT, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return { status: 'missing' };
      if (res.ok) return { status: 'ok', rows: parseOverrideRows(await res.json()) };
      reason = `HTTP ${res.status}`;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, waitMs));
  }
  return { status: 'failed', reason };
}

/** The build decision from one fetch outcome. */
export function siteBuildFrom(outcome: FetchOutcome): SiteBuild {
  switch (outcome.status) {
    case 'ok': return { stats: true, overrides: outcome.rows, source: 'fetched' };
    case 'missing': return { stats: false, overrides: [], source: 'not set up' };
    case 'failed': return { stats: true, overrides: [], source: 'unreachable' };
  }
}

/** Reads a stand in list: `{ "stats": true, "overrides": [...] }`. */
export function siteBuildFromFile(path: string): SiteBuild {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { stats?: unknown; overrides?: unknown };
  return { stats: raw.stats === true, overrides: parseOverrideRows(raw.overrides), source: 'file' };
}

/**
 * Decides this build's switches (see the header), writes them to
 * dist-demo/site.json for the scripts after this one, and returns them.
 */
export async function resolveSiteBuild(root: string, env: NodeJS.ProcessEnv = process.env): Promise<SiteBuild> {
  let site: SiteBuild = SITE_OFF;
  if (env.SITE_OVERRIDES_FILE) {
    site = siteBuildFromFile(resolve(root, env.SITE_OVERRIDES_FILE));
  } else if (env.SITE_OVERRIDES_FETCH === '1') {
    const outcome = await fetchOverrideRows();
    if (outcome.status === 'failed') {
      console.log(`::warning::The hidden and removed list could not be read (${outcome.reason}). Building with none; the page still reads it on every load.`);
    }
    site = siteBuildFrom(outcome);
  }
  const out = resolve(root, SITE_BUILD_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(site, null, 2)}\n`);
  return site;
}

/** dist-demo/site.json as the bundle step left it, or the switches off when there is none. */
export function readSiteBuild(root: string): SiteBuild {
  const path = resolve(root, SITE_BUILD_PATH);
  if (!existsSync(path)) return SITE_OFF;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<SiteBuild>;
    return {
      stats: raw.stats === true,
      overrides: parseOverrideRows(raw.overrides),
      source: raw.source ?? 'off',
    };
  } catch {
    return SITE_OFF;
  }
}

/**
 * How long the page waits for the live list once its price data is in. The
 * list is asked for at the very top of the page, in parallel with the data,
 * which takes far longer on any first visit; this only bounds the wait on a
 * repeat visit whose data comes from the browser's cache. A list that misses
 * it is used from the next page load, and until then the deploy's own copy
 * applies.
 */
export const LIVE_WAIT_MS = 300;

/**
 * The inline <head> script: `window.__psSite`, and, when the counter is on,
 * the fetch of the live list, chained onto the data loader's promise
 * (scripts/dataFiles.ts) so the app starts once both are in or the wait is
 * up. It must run after the loader script. With the counter off and nothing
 * hidden there is no script at all, and the page is the one built before.
 *
 * The fetch carries no credentials (no cookie is sent or stored) and the
 * public key only, the same one the bundle holds.
 */
export function siteHeadScript(site: SiteBuild): string {
  if (!site.stats && site.overrides.length === 0) return '';
  const value = JSON.stringify({ stats: site.stats, overrides: site.overrides }).replace(/</g, '\\u003c');
  if (!site.stats) return `window.__psSite=${value};`;
  return `(function () {
  var site = window.__psSite = ${value};
  if (typeof fetch !== 'function' || !window.__psReady) return;
  var live = fetch(${JSON.stringify(OVERRIDES_ENDPOINT)}, {
    headers: { apikey: ${JSON.stringify(SUPABASE_ANON_KEY)}, Authorization: ${JSON.stringify(`Bearer ${SUPABASE_ANON_KEY}`)} },
    credentials: 'omit',
    cache: 'no-store'
  }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) { if (Array.isArray(rows)) site.live = rows; })
    .catch(function () {});
  window.__psReady = window.__psReady.then(function () {
    return Promise.race([live, new Promise(function (done) { setTimeout(done, ${LIVE_WAIT_MS}); })]);
  });
})();`;
}

/** Brand keys and shop ids marked removed, the ones left out of the build. */
export function removedSets(site: SiteBuild): { brands: Set<string>; retailers: Set<string> } {
  const o = overridesFrom(site.overrides);
  return { brands: keysOf(o.brands, 'removed'), retailers: keysOf(o.retailers, 'removed') };
}

/** Shops the crawl must not read: removed ones. */
export function removedRetailerIds(rows: readonly OverrideRow[]): Set<string> {
  return keysOf(overridesFrom(rows).retailers, 'removed');
}

/**
 * The removed shops for a crawl step, read from the database when the
 * workflow sets SITE_OVERRIDES_FETCH=1 and from SITE_OVERRIDES_FILE in tests.
 * An empty set otherwise, and when the list cannot be read (a warning says
 * so): skipping nothing is how the crawl ran before the dashboard existed.
 */
export async function removedShopsForCrawl(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<Set<string>> {
  let rows: OverrideRow[] = [];
  if (env.SITE_OVERRIDES_FILE) {
    rows = siteBuildFromFile(env.SITE_OVERRIDES_FILE).overrides;
  } else if (env.SITE_OVERRIDES_FETCH === '1') {
    const outcome = await fetchOverrideRows(fetchImpl);
    if (outcome.status === 'ok') rows = outcome.rows;
    else if (outcome.status === 'failed') {
      console.log(`::warning::The removed shops list could not be read (${outcome.reason}); no shop is skipped this run.`);
    }
  }
  const removed = removedRetailerIds(rows);
  if (removed.size > 0) console.log(`Skipping ${removed.size} shop(s) removed in the developer dashboard: ${[...removed].sort().join(', ')}\n`);
  return removed;
}

/** Carried between the literals of one build: the products a removed brand took out. */
export interface PruneContext {
  removedIds: Set<string>;
  dropped: { products: number; offers: number };
}

export function pruneContext(): PruneContext {
  return { removedIds: new Set(), dropped: { products: 0, offers: 0 } };
}

type Offerish = { retailerId?: unknown };

/** Offers keyed by product, without removed products and removed shops. In place. */
function pruneOffers(value: unknown, removed: { retailers: Set<string> }, ctx: PruneContext): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const byId = value as Record<string, unknown>;
  for (const id of Object.keys(byId)) {
    const offers = byId[id];
    if (ctx.removedIds.has(id)) {
      ctx.dropped.offers += Array.isArray(offers) ? offers.length : 0;
      delete byId[id];
      continue;
    }
    if (!Array.isArray(offers) || removed.retailers.size === 0) continue;
    const kept = offers.filter((o: Offerish) => !(typeof o?.retailerId === 'string' && removed.retailers.has(o.retailerId)));
    ctx.dropped.offers += offers.length - kept.length;
    byId[id] = kept;
  }
}

/**
 * Leaves removed brands and shops out of one generated module's data, as
 * scripts/bundle-demo.ts moves it into the data files. `names[i]` is the
 * constant whose value is `blobs[start + i]`, in the module's source order,
 * which puts the catalogue's products before the offers keyed on them.
 *
 *   catalogue  CATALOGUE chunks: a removed brand's products go, and their
 *              ids are remembered; CRAWLED and OLDER_OFFERS: those products'
 *              offers and every removed shop's offers go; HOUSE_PRODUCTS
 *              chunks: a removed brand's house products go
 *   deals      DEALS_RAW: a removed shop's deals go (a deal of a removed
 *              product finds no product on the page and is dropped there)
 *
 * A product left with no offer at all is taken off the page as it loads
 * (applySiteOverrides), since the page carries the same list.
 */
export function pruneMovedBlobs(
  module: string,
  names: readonly string[],
  blobs: unknown[],
  start: number,
  removed: { brands: Set<string>; retailers: Set<string> },
  ctx: PruneContext,
): void {
  if (removed.brands.size === 0 && removed.retailers.size === 0) return;
  names.forEach((name, i) => {
    const value = blobs[start + i];
    if (module === 'catalogue' && /^CATALOGUE(_CHUNK_\d+)?$/.test(name) && Array.isArray(value)) {
      blobs[start + i] = value.filter((e: { id?: unknown; brand?: unknown }) => {
        const out = typeof e?.brand === 'string' && removed.brands.has(brandOverrideKey(e.brand));
        if (out && typeof e.id === 'string') {
          ctx.removedIds.add(e.id);
          ctx.dropped.products++;
        }
        return !out;
      });
    } else if (module === 'catalogue' && (name === 'CRAWLED' || name === 'OLDER_OFFERS')) {
      pruneOffers(value, removed, ctx);
    } else if (module === 'catalogue' && /^HOUSE_PRODUCTS(_CHUNK_\d+)?$/.test(name) && Array.isArray(value)) {
      blobs[start + i] = value.filter(
        (p: { brand?: unknown; house?: unknown }) =>
          !(typeof p?.brand === 'string' && removed.brands.has(brandOverrideKey(p.brand))) &&
          !(typeof p?.house === 'string' && removed.brands.has(brandOverrideKey(p.house))),
      );
    } else if (module === 'deals' && /^DEALS_RAW(_CHUNK_\d+)?$/.test(name) && Array.isArray(value)) {
      blobs[start + i] = value.filter(
        (d: { retailerId?: unknown }) => !(typeof d?.retailerId === 'string' && removed.retailers.has(d.retailerId)),
      );
    }
  });
}
