/**
 * Find, for every perfume in the catalogue, its own page on Fragrantica and
 * its own page on the brand's official website, and record only the ones that
 * were checked against the perfume.
 *
 *   npm run links:resolve -- --minutes 30       # the daily job: stop cleanly inside 30 minutes
 *   npm run links:resolve -- --minutes=120      # a longer manual run
 *   npm run links:resolve -- --offline          # only the sources that need no network
 *   npm run links:resolve -- --emit-only        # rebuild demo/fragranceLinks.generated.ts, no lookups
 *   npm run links:resolve -- --brand=Lattafa    # one house
 *   npm run links:resolve -- --limit=2000       # or stop after 2000 search queries
 *   npm run links:resolve -- --official-search=500   # also ask a search engine for the brand's own page
 *
 * ── Resumable, and built to run unattended ───────────────────────────────────
 * Every run reads data/fragrance-links.json and data/fragrance-links-seen.json,
 * adds to them and writes them back (every 25 perfumes, and again on the way
 * out), so the next run carries on where this one stopped. The "cursor" is the
 * `tried` timestamps in the links file: a perfume whose Fragrantica search was
 * already done is skipped until --retry-days (default 60) have passed, and is
 * then re-checked only after every never-checked perfume has had its turn.
 *
 * Order (src/catalogue/linkPriority.ts): what the site shows first — the front
 * page rail, the Top 50, the deals page — then the leading entries of every
 * brand's, note's and shop's list round-robin, then everything else by number
 * of shop offers.
 *
 * It does not prompt, does not throw on network trouble (a 429, a challenge
 * page, a timeout or a dead host backs off and, if it persists, ends the run
 * with what was found saved), stops WRAP_UP_MS before the --minutes budget,
 * saves and exits 0 on SIGINT/SIGTERM, and exits 0 when it simply ran out of
 * time. Only an unexpected bug exits non-zero.
 *
 * Files written: data/fragrance-links.json, data/fragrance-links-seen.json,
 * demo/fragranceLinks.generated.ts. The page only changes once `npm run demo`
 * has been run, because the generated file is bundled into it.
 *
 * ── Where each link comes from, best first ──────────────────────────────────
 * Official page (must be on the brand's own domain, see isOfficialHost):
 *   house-storefront        the catalogue's own copy of the house's storefront
 *                           (HOUSE_PRODUCTS, harvested from the brand's shop).
 *   brand-storefront-offer  an offer from a retailer that exists to sell only
 *                           this brand's own line (retailers.ts singleBrandOnly):
 *                           the catalogue product *is* that listing.
 *   sitemap                 the brand site's own sitemap.xml (honouring its
 *                           robots.txt), matched to the perfume by slug.
 *   bing-search             a Bing result on the brand's own domain, matched
 *                           by slug. Only from queries already made for
 *                           Fragrantica, or --official-search.
 * Fragrantica page:
 *   bing-search / bing-seen Bing results pointing at fragrantica.com/perfume/,
 *                           matched by slug. "Seen" is a Fragrantica URL some
 *                           earlier query happened to return, kept in
 *                           data/fragrance-links-seen.json and matched again
 *                           for free.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 * It never requests a Fragrantica page. Fragrantica sits behind a Cloudflare
 * challenge (every direct request from here returns 403 "Just a moment...")
 * and its terms forbid automated access; docs/SCRAPING.md already says so.
 * The only thing that touches it is a search engine's own listing of its
 * address. For the same reason the match is made on the URL's slug, not on
 * the page: the slug is the page's own name for itself, and a link whose slug
 * is not the perfume's name is rejected whatever the search engine claimed.
 * See src/catalogue/fragranceLinkMatch.ts for the exact rule.
 *
 * Search is a polite, slow, single stream (default one query every 3 seconds)
 * and backs off, then stops, if Bing starts refusing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvHttpProxyAgent, fetch, type Dispatcher } from 'undici';
import { CATALOGUE, CRAWLED, HOUSE_PRODUCTS } from '../demo/catalogue.generated.js';
import { officialSiteFor } from '../demo/brandSites.js';
import { BY_POPULARITY, DEALS, NOTE_INDEX, fragrancesAt, fragrancesWithNote } from '../demo/data.js';
import type { DemoFragrance } from '../demo/data.js';
import { RETAILERS } from '../src/config/retailers.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { decodeBody } from '../src/catalogue/httpFetch.js';
import { BOT_USER_AGENT, BOT_HEADERS } from '../src/catalogue/botIdentity.js';
import { isAllowed, parseRobots, NO_RESTRICTIONS, type RobotsRules } from '../src/catalogue/robots.js';
import {
  bestMatch,
  bestOfficialMatch,
  brandMatchesFolder,
  marketRank,
  canonicalName,
  cleanUrl,
  fold,
  fragranceBaseKey,
  fragranceLinkKey,
  isOfficialHost,
  looksBlocked,
  matchOfficialUrl,
  parseBingResults,
  parseFragranticaUrl,
  parseSitemap,
  type UrlMatch,
  type WantedFragrance,
} from '../src/catalogue/fragranceLinkMatch.js';
import {
  indexReview,
  matchFragranticaChecked,
  NO_REVIEW_INDEX,
  parseReview,
  type CheckedWanted,
  type ReviewIndex,
} from '../src/catalogue/fragranticaReview.js';
import { checkOrder, checkState, interleave, priorityOrder, type CheckState } from '../src/catalogue/linkPriority.js';
import {
  compactTable,
  renderGeneratedModule,
  renderLinksFile,
  type LinkEntry,
  type LinksFile,
} from '../src/catalogue/fragranceLinkStore.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINKS_FILE = resolve(ROOT, 'data/fragrance-links.json');
const SEEN_FILE = resolve(ROOT, 'data/fragrance-links-seen.json');
const REVIEW_FILE = resolve(ROOT, 'data/fragrantica-link-review.json');
const GENERATED = resolve(ROOT, 'demo/fragranceLinks.generated.ts');

// ── command line ───────────────────────────────────────────────────────────

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  // "--minutes 30" as well as "--minutes=30".
  const i = process.argv.indexOf(`--${name}`);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next !== undefined && !next.startsWith('--') ? next : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const numArg = (name: string, dflt: number): number => {
  const raw = argValue(name);
  const v = Number(raw);
  return raw !== undefined && Number.isFinite(v) ? v : dflt;
};

const OPTS = {
  limit: numArg('limit', 100_000),
  // The whole run's time budget. --max-minutes is the older spelling.
  minutes: numArg('minutes', numArg('max-minutes', 90)),
  sleepMs: numArg('sleep-ms', 2500),
  // Perfumes already checked are left alone for this long, then re-checked
  // after everything never checked has had its turn.
  retryDays: numArg('retry-days', 60),
  officialSearch: numArg('official-search', 0),
  sitemapBrands: numArg('sitemap-brands', 150),
  // Share of the budget the brand-sitemap pass may use before search starts.
  sitemapShare: numArg('sitemap-share', 0.35),
  attempts: numArg('attempts', 2),
  brand: argValue('brand'),
  offline: flag('offline'),
  emitOnly: flag('emit-only'),
  noSitemaps: flag('no-sitemaps'),
  retryMisses: flag('retry-misses'),
};

const STARTED = Date.now();
/** Stop this long before the budget so the final save and the generated file are written inside it. */
const WRAP_UP_MS = 20_000;
const remainingMs = (): number => OPTS.minutes * 60_000 - (Date.now() - STARTED) - WRAP_UP_MS;
const timeUp = (): boolean => remainingMs() <= 0;
const nowIso = (): string => new Date().toISOString();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── http ───────────────────────────────────────────────────────────────────

const dispatcher: Dispatcher | undefined =
  process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined;

/**
 * Every request here, Bing's included, is PriceSniffsBot (src/catalogue/botIdentity.ts).
 * Bing's results page used to be asked for with a desktop Chrome user agent;
 * since 2026-10-04 it is asked for as ourselves, after Bing's robots.txt, and if
 * Bing will not serve the bot (a challenge page) the existing back off applies
 * and the run ends: a refusal is not worked around.
 */
const BOT_UA = BOT_USER_AGENT;

interface Reply {
  status: number;
  body: string;
}

async function get(url: string, headers: Record<string, string>, timeoutMs = 25_000): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });
    return { status: res.status, body: decodeBody(new Uint8Array(await res.arrayBuffer())) };
  } catch {
    return { status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

// ── the perfumes ───────────────────────────────────────────────────────────

interface Variant {
  key: string;
  concentration: string;
  ids: string[];
  /** The catalogue's gender where its listings agree on one, else null. */
  gender: 'mens' | 'womens' | 'unisex' | null;
}

interface Perfume {
  brand: string;
  name: string;
  baseKey: string;
  /** Shop offers across every variant: the order we work in. */
  offers: number;
  variants: Map<string, Variant>;
}

function loadPerfumes(): Perfume[] {
  const byBase = new Map<string, Perfume>();
  const genders = new Map<string, Set<'mens' | 'womens' | 'unisex'>>();
  for (const e of CATALOGUE) {
    const baseKey = fragranceBaseKey(e.brand, e.name);
    let p = byBase.get(baseKey);
    if (!p) {
      p = { brand: e.brand, name: e.name, baseKey, offers: 0, variants: new Map() };
      byBase.set(baseKey, p);
    }
    p.offers += CRAWLED[e.id]?.length ?? 0;
    const key = fragranceLinkKey(e.brand, e.name, e.concentration);
    const v = p.variants.get(key) ?? { key, concentration: e.concentration, ids: [], gender: null };
    v.ids.push(e.id);
    genders.set(key, new Set([...(genders.get(key) ?? []), ...(e.gender ? [e.gender] : [])]));
    p.variants.set(key, v);
  }
  for (const p of byBase.values()) {
    for (const v of p.variants.values()) {
      const g = genders.get(v.key);
      v.gender = g && g.size === 1 ? [...g][0]! : null;
    }
  }
  return [...byBase.values()].sort((a, b) => b.offers - a.offers || a.baseKey.localeCompare(b.baseKey));
}

const wantedOf = (p: Perfume, v: Variant): CheckedWanted => ({
  brand: p.brand,
  name: p.name,
  concentration: v.concentration,
  gender: v.gender,
});

// ── the stores ─────────────────────────────────────────────────────────────

async function loadLinks(): Promise<LinksFile> {
  if (!existsSync(LINKS_FILE)) return { version: 1, generatedAt: nowIso(), entries: {} };
  return JSON.parse(await readFile(LINKS_FILE, 'utf8')) as LinksFile;
}

async function loadSeen(): Promise<Set<string>> {
  if (!existsSync(SEEN_FILE)) return new Set();
  return new Set(JSON.parse(await readFile(SEEN_FILE, 'utf8')) as string[]);
}

let links: LinksFile;
let seen: Set<string>;
let reviewIndex: ReviewIndex = NO_REVIEW_INDEX;
let dirty = false;

async function save(): Promise<void> {
  if (!dirty) return;
  links.generatedAt = nowIso();
  await mkdir(dirname(LINKS_FILE), { recursive: true });
  await writeFile(LINKS_FILE, renderLinksFile(links));
  await writeFile(SEEN_FILE, JSON.stringify([...seen].sort()) + '\n');
  dirty = false;
}

function entryFor(key: string): LinkEntry {
  let e = links.entries[key];
  if (!e) {
    e = { checkedAt: nowIso(), method: {} };
    links.entries[key] = e;
  }
  return e;
}

function daysSince(iso: string | undefined): number {
  return iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity;
}

function setFragrantica(key: string, m: UrlMatch, method: 'bing-search' | 'bing-seen'): boolean {
  const e = entryFor(key);
  const rank = { exact: 3, base: 2, loose: 1 } as const;
  if (e.fragrantica && e.fragranticaMatch && rank[e.fragranticaMatch] >= rank[m.quality]) return false;
  e.fragrantica = m.url;
  e.fragranticaMatch = m.quality;
  e.method.fragrantica = method;
  e.checkedAt = nowIso();
  dirty = true;
  return true;
}

function setOfficial(key: string, m: UrlMatch, method: NonNullable<LinkEntry['method']['official']>): boolean {
  const e = entryFor(key);
  const rank = { exact: 3, base: 2, loose: 1 } as const;
  if (e.official && e.officialMatch) {
    const better = rank[m.quality] > rank[e.officialMatch] || (rank[m.quality] === rank[e.officialMatch] && marketRank(m.url) < marketRank(e.official));
    if (!better) return false;
  }
  e.official = m.url;
  e.officialMatch = m.quality;
  e.method.official = method;
  e.checkedAt = nowIso();
  dirty = true;
  return true;
}

function markTried(key: string, source: 'fragrantica' | 'official'): void {
  const e = entryFor(key);
  e.tried = { ...e.tried, [source]: nowIso() };
  dirty = true;
}

const hasOfficial = (p: Perfume): boolean => [...p.variants.keys()].every((k) => links.entries[k]?.official);
const hasFragrantica = (p: Perfume): boolean => [...p.variants.keys()].every((k) => links.entries[k]?.fragrantica);
/**
 * Never checked, due for a re-check (older than --retry-days), or recent. The
 * oldest of a perfume's variants decides: one never-searched variant makes the
 * whole perfume "never".
 */
function stateOf(p: Perfume, source: 'fragrantica' | 'official'): CheckState {
  if (OPTS.retryMisses) return 'never';
  let oldest: string | undefined;
  for (const k of p.variants.keys()) {
    const t = links.entries[k]?.tried?.[source];
    if (!t) return 'never';
    if (oldest === undefined || t < oldest) oldest = t;
  }
  return checkState(oldest, OPTS.retryDays);
}
const fresh = (p: Perfume, source: 'fragrantica' | 'official'): boolean => stateOf(p, source) === 'fresh';

/**
 * What the site shows first, as lists of brand|name keys, best tier first —
 * see src/catalogue/linkPriority.ts. Read from the same data and the same
 * orderings demo/app.ts renders: the front-page rail (the first 12 of
 * BY_POPULARITY without oils) inside the Top 50 list, the deals page, and the
 * leading entries of each brand's, each note's and each shop's list, which all
 * default to BY_POPULARITY order.
 */
function siteTiers(): string[][] {
  const key = (f: DemoFragrance): string => fragranceBaseKey(f.brand, f.name);
  const dedupe = (fs: readonly DemoFragrance[]): string[] => [...new Set(fs.map(key))];
  const popular = dedupe(BY_POPULARITY.filter((f) => f.concentration !== 'Perfume Oil').slice(0, 80)).slice(0, 50);
  const deals = dedupe(DEALS.filter((d) => d.fragrance.photoUrl !== null).map((d) => d.fragrance));

  const byBrand = new Map<string, DemoFragrance[]>();
  for (const f of BY_POPULARITY) {
    const l = byBrand.get(f.brand) ?? [];
    l.push(f);
    byBrand.set(f.brand, l);
  }
  const brandLists = [...byBrand.values()].map(dedupe);
  const noteLists = [...NOTE_INDEX]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 60)
    .map((n) => dedupe(fragrancesWithNote(n.name, 'any').slice(0, 40)));
  const shopLists = RETAILERS.filter((r) => !r.singleBrandOnly).map((r) => dedupe(fragrancesAt(r.id).slice(0, 40)));
  const lists = [...brandLists, ...noteLists, ...shopLists];
  const head = (from: number, to: number): string[] => interleave(lists.map((l) => l.slice(from, to)));
  return [popular, deals, head(0, 3), head(3, 10)];
}

// ── official: what the catalogue already knows ─────────────────────────────

const HOUSE_BY_BRAND = new Map<string, typeof HOUSE_PRODUCTS>();
for (const hp of HOUSE_PRODUCTS) {
  for (const k of new Set([brandKey(hp.house), brandKey(hp.brand)])) {
    const list = HOUSE_BY_BRAND.get(k) ?? [];
    list.push(hp);
    HOUSE_BY_BRAND.set(k, list);
  }
}

const SINGLE_BRAND_RETAILERS = new Map(
  RETAILERS.filter((r) => r.singleBrandOnly).map((r) => [r.id, { brand: brandKey(r.singleBrandOnly!), domain: r.domain }]),
);

function resolveFromHouseStorefronts(p: Perfume): number {
  const candidates = HOUSE_BY_BRAND.get(brandKey(p.brand));
  if (!candidates) return 0;
  let n = 0;
  // A house's products can be harvested from a shop that is not the brand's
  // own (Maison Asrar's range sits on Gulf Orchid's shop). Where the registry
  // knows the brand's website the page must be on it; where it does not, the
  // house's own storefront is the best statement of "official" there is.
  const site = officialSiteFor(p.brand)?.url;
  for (const v of p.variants.values()) {
    const matches: UrlMatch[] = [];
    for (const hp of candidates) {
      const m = matchOfficialUrl(hp.url, wantedOf(p, v), site ?? new URL(hp.url).origin);
      if (m) matches.push(m);
    }
    const best = bestOfficialMatch(matches);
    if (best && setOfficial(v.key, best, 'house-storefront')) n++;
  }
  return n;
}

function resolveFromBrandOffers(p: Perfume): number {
  let n = 0;
  for (const v of p.variants.values()) {
    for (const id of v.ids) {
      const hit = (CRAWLED[id] ?? [])
        .filter((o) => {
          const r = SINGLE_BRAND_RETAILERS.get(o.retailerId);
          return r && r.brand === brandKey(p.brand);
        })
        .sort((a, b) => Number(b.stock === 'inStock') - Number(a.stock === 'inStock'))[0];
      if (!hit) continue;
      const u = cleanUrl(hit.url);
      const r = SINGLE_BRAND_RETAILERS.get(hit.retailerId)!;
      // The listing must be on the retailer's own domain, which is the
      // brand's storefront; nothing else is allowed through under this label.
      if (!u || !isOfficialHost(u.hostname, `https://${r.domain}`)) continue;
      if (setOfficial(v.key, { url: u.toString(), quality: 'exact' }, 'brand-storefront-offer')) n++;
      break;
    }
  }
  return n;
}

// ── official: the brand's own sitemap ──────────────────────────────────────

const lastRequestAt = new Map<string, number>();
async function politeGet(url: string, headers: Record<string, string>, gapMs = 1000): Promise<Reply> {
  const host = new URL(url).hostname;
  const wait = (lastRequestAt.get(host) ?? 0) + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
  return get(url, headers);
}

interface SiteIndex {
  /** Product-looking URLs from the site's sitemaps. */
  urls: string[];
  status: string;
}

const PRODUCTISH = /product|item|shop|perfume|fragrance|catalog|goods/i;
const NOT_PRODUCTS = /blog|post|article|news|page|image|video|collection|categor|tag|brand|store|locat|journal|author/i;

async function readSite(siteUrl: string): Promise<SiteIndex> {
  const origin = new URL(siteUrl).origin;
  const headers = { 'user-agent': BOT_UA, accept: 'application/xml,text/xml,*/*' };
  let rules: RobotsRules = NO_RESTRICTIONS;
  const robots = await politeGet(`${origin}/robots.txt`, headers);
  if (robots.status >= 200 && robots.status < 300) rules = parseRobots(robots.body, 'pricesniffsbot');
  else if (robots.status >= 500 || robots.status === 0) return { urls: [], status: 'robots-unreachable' };

  const roots = new Set<string>([`${origin}/sitemap.xml`, ...rules.sitemaps.filter((s) => s.startsWith('http'))]);
  const urls: string[] = [];
  const queue = [...roots];
  const done = new Set<string>();
  let fetched = 0;
  let status = 'no-sitemap';
  while (queue.length && fetched < 30) {
    const sm = queue.shift()!;
    if (done.has(sm)) continue;
    done.add(sm);
    if (!isAllowed(rules, sm)) {
      status = 'robots-disallow';
      continue;
    }
    const r = await politeGet(sm, headers);
    fetched++;
    if (r.status !== 200 || !/<(?:urlset|sitemapindex)[\s>]/i.test(r.body)) {
      if (status === 'no-sitemap') status = `http-${r.status}`;
      continue;
    }
    status = 'ok';
    const parsed = parseSitemap(r.body);
    if (parsed.kind === 'index') {
      const children = parsed.locs
        .filter((l) => !NOT_PRODUCTS.test(l.split('/').pop() ?? ''))
        .sort((a, b) => marketRank(a) - marketRank(b));
      const product = children.filter((l) => PRODUCTISH.test(l.split('/').pop() ?? ''));
      queue.push(...(product.length ? product : children.slice(0, 8)));
    } else {
      urls.push(...parsed.locs);
    }
  }
  return { urls, status };
}

/** The sitemap pass gets a share of the budget; search, which finds the most, gets the rest. */
const sitemapTimeUp = (): boolean => timeUp() || Date.now() - STARTED > OPTS.minutes * 60_000 * OPTS.sitemapShare;

async function resolveFromSitemaps(perfumes: Perfume[]): Promise<void> {
  const byBrand = new Map<string, Perfume[]>();
  for (const p of perfumes) {
    if (hasOfficial(p) || !officialSiteFor(p.brand) || fresh(p, 'official')) continue;
    const list = byBrand.get(brandKey(p.brand)) ?? [];
    list.push(p);
    byBrand.set(brandKey(p.brand), list);
  }
  const brands = [...byBrand.entries()]
    .sort((a, b) => b[1].reduce((s, p) => s + p.offers, 0) - a[1].reduce((s, p) => s + p.offers, 0))
    .slice(0, OPTS.sitemapBrands);
  console.log(`sitemaps: ${brands.length} brands with perfumes still lacking an official page`);

  const queue = [...brands];
  let done = 0;
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item && !sitemapTimeUp(); item = queue.shift()) {
      const [, list] = item;
      const site = officialSiteFor(list[0]!.brand)!.url;
      const index = await readSite(site);
      let found = 0;
      if (index.urls.length) {
        // slug -> urls, so each perfume is one lookup instead of a scan.
        const bySlug = new Map<string, string[]>();
        for (const url of index.urls) {
          const last = decodeURIComponentSafe(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
          const c = canonicalName(last.replace(/\.(?:html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' '), list[0]!.brand);
          if (!c) continue;
          const l = bySlug.get(c) ?? [];
          l.push(url);
          bySlug.set(c, l);
        }
        for (const p of list) {
          const cands = bySlug.get(canonicalName(p.name, p.brand));
          if (!cands) continue;
          for (const v of p.variants.values()) {
            const ms = cands.map((u) => matchOfficialUrl(u, wantedOf(p, v), site)).filter((m): m is UrlMatch => !!m);
            const best = bestOfficialMatch(ms);
            if (best && setOfficial(v.key, best, 'sitemap')) found++;
          }
        }
      }
      for (const p of list) for (const k of p.variants.keys()) markTried(k, 'official');
      done++;
      console.log(`  sitemap ${done}/${brands.length} ${list[0]!.brand}: ${index.status}, ${index.urls.length} urls, ${found} matched`);
      await save();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ── Fragrantica and the brand's page, from search ──────────────────────────

let consecutiveFailures = 0;
let queries = 0;
let lastQueryAt = 0;

/** Bing's robots.txt, asked for once, as the bot. Null until asked; false when /search is not ours to fetch. */
let bingAllowed: boolean | null = null;
async function bingMayBeAsked(): Promise<boolean> {
  if (bingAllowed !== null) return bingAllowed;
  const robots = await get('https://www.bing.com/robots.txt', BOT_HEADERS);
  // Unreachable is a hold off (the same rule as every other shop); a 4xx is no file, nothing forbidden.
  bingAllowed =
    robots.status >= 200 && robots.status < 300
      ? isAllowed(parseRobots(robots.body, 'pricesniffsbot'), 'https://www.bing.com/search?q=x')
      : robots.status >= 400 && robots.status < 500;
  if (!bingAllowed) console.log(`  bing: robots.txt does not allow /search for PriceSniffsBot (HTTP ${robots.status}); not asked`);
  return bingAllowed;
}

async function bing(q: string): Promise<{ url: string; title: string }[] | null> {
  if (!(await bingMayBeAsked())) return null;
  const wait = lastQueryAt + OPTS.sleepMs + Math.random() * 600 - Date.now();
  if (wait > 0) await sleep(Math.min(wait, Math.max(0, remainingMs())));
  for (let attempt = 0; attempt < 3; attempt++) {
    if (timeUp()) return null;
    lastQueryAt = Date.now();
    queries++;
    const r = await get(`https://www.bing.com/search?q=${encodeURIComponent(q)}`, { ...BOT_HEADERS, accept: 'text/html' });
    if (r.status === 200 && !looksBlocked(r.body)) {
      consecutiveFailures = 0;
      return parseBingResults(r.body);
    }
    // 429s, challenges, timeouts (status 0) and 5xx all mean "slow down":
    // wait, try again, and after repeated refusals end the run. Nothing here
    // throws, so a scheduled job that Bing turns away still exits 0 with
    // everything it had found saved.
    consecutiveFailures++;
    const backoff = 30_000 * 2 ** attempt;
    console.log(`  bing answered ${r.status || 'nothing'}${looksBlocked(r.body) ? ' (challenge)' : ''}; waiting ${backoff / 1000}s`);
    if (consecutiveFailures >= 5 || backoff > remainingMs()) return null;
    await sleep(backoff);
  }
  return null;
}

const folderGuess = (brand: string): string => fold(brand).replace(/\s+/g, '-');

/** Query shapes, tried in order until one yields a Fragrantica page for the perfume. */
function queriesFor(p: Perfume): string[] {
  return [
    `site:fragrantica.com/perfume ${p.brand} ${p.name}`,
    `site:fragrantica.com/perfume/${folderGuess(p.brand)} ${p.name}`,
  ].slice(0, OPTS.attempts);
}

/** Index of Fragrantica URLs seen so far, by the slug's compact name. */
let seenIndex = new Map<string, string[]>();
function indexSeen(url: string): void {
  const parts = parseFragranticaUrl(url);
  if (!parts) return;
  const slugText = decodeURIComponentSafe(parts.slug).replace(/-/g, ' ');
  // Filed twice: as the slug reads, and with the brand's own name taken off the
  // front ("Gucci-Bloom" under "bloom"), because the catalogue's names rarely
  // repeat the brand and Fragrantica's often do.
  for (const c of new Set([canonicalName(slugText, ''), canonicalName(slugText, decodeURIComponentSafe(parts.folder).replace(/-/g, ' '))])) {
    if (!c) continue;
    const l = seenIndex.get(c) ?? [];
    if (!l.includes(parts.url)) l.push(parts.url);
    seenIndex.set(c, l);
  }
}

/** Match stored Fragrantica URLs against a perfume, for free. */
function resolveFromSeen(p: Perfume, method: 'bing-seen' | 'bing-search' = 'bing-seen'): number {
  const cands = new Set<string>();
  for (const key of new Set([canonicalName(p.name, ''), canonicalName(p.name, p.brand)])) {
    for (const u of seenIndex.get(key) ?? []) cands.add(u);
  }
  if (!cands.size) return 0;
  let n = 0;
  for (const v of p.variants.values()) {
    const best = bestMatch([...cands].map((u) => matchFragranticaChecked(u, wantedOf(p, v), reviewIndex)).filter((m): m is UrlMatch => !!m));
    if (best && setFragrantica(v.key, best, method)) n++;
  }
  return n;
}

function absorb(results: { url: string; title: string }[], p: Perfume): void {
  for (const r of results) {
    const parts = parseFragranticaUrl(r.url);
    if (parts && !seen.has(parts.url)) {
      seen.add(parts.url);
      indexSeen(parts.url);
      dirty = true;
    }
  }
  const site = officialSiteFor(p.brand)?.url;
  if (!site) return;
  for (const v of p.variants.values()) {
    const best = bestOfficialMatch(
      results.map((r) => matchOfficialUrl(r.url, wantedOf(p, v), site)).filter((m): m is UrlMatch => !!m),
    );
    if (best) setOfficial(v.key, best, 'bing-search');
  }
}

async function searchFragrantica(perfumes: Perfume[]): Promise<void> {
  const todo = checkOrder(perfumes.filter((p) => !hasFragrantica(p)), (p) => stateOf(p, 'fragrantica'));
  console.log(`fragrantica: ${todo.length} perfumes to search (of ${perfumes.length}); budget ${OPTS.minutes} min`);
  let n = 0;
  for (const p of todo) {
    if (queries >= OPTS.limit || timeUp()) break;
    if (resolveFromSeen(p, 'bing-seen') && hasFragrantica(p)) {
      for (const k of p.variants.keys()) markTried(k, 'fragrantica');
      continue;
    }
    let aborted = false;
    for (const q of queriesFor(p)) {
      if (queries >= OPTS.limit || timeUp()) break;
      const results = await bing(q);
      if (results === null) {
        aborted = true;
        break;
      }
      absorb(results, p);
      // A page for this perfume may have come back in the results of an earlier
      // or a neighbouring query as well as this one.
      resolveFromSeen(p, 'bing-search');
      if (hasFragrantica(p)) break;
    }
    if (aborted) {
      console.log('stopping: search engine is refusing requests or time is up; rerun to continue');
      break;
    }
    if (queries >= OPTS.limit || timeUp()) {
      // The budget ran out mid-perfume: leave it untried rather than record a
      // miss that was never really searched for.
      if (!hasFragrantica(p)) continue;
    }
    for (const k of p.variants.keys()) markTried(k, 'fragrantica');
    n++;
    if (n % 25 === 0) {
      await save();
      console.log(`  ${n} perfumes searched, ${queries} queries, ${coverageLine(perfumes)}`);
    }
  }
}

async function searchOfficial(perfumes: Perfume[]): Promise<void> {
  if (OPTS.officialSearch <= 0) return;
  const todo = perfumes
    .filter((p) => !hasOfficial(p) && officialSiteFor(p.brand) && !fresh(p, 'official'))
    .slice(0, OPTS.officialSearch);
  console.log(`official search: ${todo.length} perfumes`);
  let n = 0;
  for (const p of todo) {
    if (timeUp()) break;
    const host = new URL(officialSiteFor(p.brand)!.url).hostname.replace(/^www\./, '');
    const results = await bing(`site:${host} ${p.name}`);
    if (results === null) break;
    absorb(results, p);
    for (const k of p.variants.keys()) markTried(k, 'official');
    if (++n % 25 === 0) await save();
  }
}

// ── reporting ──────────────────────────────────────────────────────────────

function coverageLine(perfumes: Perfume[]): string {
  const c = coverage(perfumes);
  return `fragrantica ${c.f}/${c.n} perfumes, official ${c.o}/${c.n}`;
}

function coverage(perfumes: Perfume[]) {
  let f = 0;
  let o = 0;
  let fo = 0;
  let variants = 0;
  let vf = 0;
  let vo = 0;
  let offers = 0;
  let offersF = 0;
  let offersO = 0;
  for (const p of perfumes) {
    const fAny = [...p.variants.keys()].some((k) => links.entries[k]?.fragrantica);
    const oAny = [...p.variants.keys()].some((k) => links.entries[k]?.official);
    if (fAny) f++;
    if (oAny) o++;
    if (fAny || oAny) fo++;
    offers += p.offers;
    if (fAny) offersF += p.offers;
    if (oAny) offersO += p.offers;
    for (const k of p.variants.keys()) {
      variants++;
      if (links.entries[k]?.fragrantica) vf++;
      if (links.entries[k]?.official) vo++;
    }
  }
  return { n: perfumes.length, f, o, fo, variants, vf, vo, offers, offersF, offersO };
}

function report(perfumes: Perfume[]): void {
  const c = coverage(perfumes);
  const pct = (a: number, b: number): string => `${((100 * a) / (b || 1)).toFixed(1)}%`;
  console.log('\ncoverage');
  console.log(`  perfumes (brand+name)   ${c.n}`);
  console.log(`  Fragrantica direct      ${c.f}  ${pct(c.f, c.n)}   (by offers: ${pct(c.offersF, c.offers)})`);
  console.log(`  Official page direct    ${c.o}  ${pct(c.o, c.n)}   (by offers: ${pct(c.offersO, c.offers)})`);
  console.log(`  either                  ${c.fo}  ${pct(c.fo, c.n)}`);
  console.log(`  product variants        ${c.variants}   Fragrantica ${c.vf}   official ${c.vo}`);
  const methods = new Map<string, number>();
  for (const e of Object.values(links.entries)) {
    for (const m of [e.method.fragrantica, e.method.official]) if (m) methods.set(m, (methods.get(m) ?? 0) + 1);
  }
  console.log(`  by method               ${[...methods].map(([k, v]) => `${k}:${v}`).join('  ')}`);
}

// ── main ───────────────────────────────────────────────────────────────────

/**
 * Hold every stored Fragrantica link to the rule a new one has to pass
 * (matchFragranticaChecked), and drop the ones that fail. The rule has
 * tightened since the earlier runs wrote them (audit of 2026-10-05: a Parfum
 * shown on the page of the Eau de Toilette, a men's perfume on the women's
 * page), and a link the rule refuses must not stay on the page. The dropped
 * perfume is searched again like any perfume without a link, and its
 * \`tried\` stamp is kept so it is not first in the queue.
 */
function revalidateFragrantica(perfumes: Perfume[]): number {
  let dropped = 0;
  for (const p of perfumes) {
    for (const v of p.variants.values()) {
      const e = links.entries[v.key];
      if (!e?.fragrantica) continue;
      if (matchFragranticaChecked(e.fragrantica, wantedOf(p, v), reviewIndex)) continue;
      console.log(`  dropped ${v.key}: ${e.fragrantica}`);
      delete e.fragrantica;
      delete e.fragranticaMatch;
      delete e.method.fragrantica;
      e.checkedAt = nowIso();
      dirty = true;
      dropped++;
    }
  }
  return dropped;
}

/**
 * A product with no Fragrantica page of its own shows its sibling strength's
 * main page (the "base" page of its brand and name) where the table has one.
 * Where that page is not fit for this product (it is for the other gender, it
 * was reviewed as wrong for it, or this product's strength has a page of its
 * own that this is not) the entry is marked, and the page shows a search.
 */
function refuseUnfitFallbacks(perfumes: Perfume[]): number {
  let marked = 0;
  for (const p of perfumes) {
    let baseUrl: string | null = null;
    for (const key of [...p.variants.keys()].sort()) {
      const e = links.entries[key];
      if (e?.fragrantica && e.fragranticaMatch === 'base') {
        baseUrl = e.fragrantica;
        break;
      }
    }
    for (const v of p.variants.values()) {
      const e = links.entries[v.key];
      if (e?.fragrantica) {
        if (e.fragranticaRefused) {
          delete e.fragranticaRefused;
          dirty = true;
        }
        continue;
      }
      const refuse = baseUrl !== null && !matchFragranticaChecked(baseUrl, wantedOf(p, v), reviewIndex);
      if (refuse && !e?.fragranticaRefused) {
        entryFor(v.key).fragranticaRefused = true;
        dirty = true;
        marked++;
      } else if (!refuse && e?.fragranticaRefused) {
        delete e.fragranticaRefused;
        dirty = true;
      }
    }
  }
  return marked;
}

async function main(): Promise<void> {
  links = await loadLinks();
  seen = await loadSeen();
  if (existsSync(REVIEW_FILE)) reviewIndex = indexReview(parseReview(readFileSync(REVIEW_FILE, 'utf8')));
  for (const u of seen) indexSeen(u);

  let perfumes = loadPerfumes();
  if (OPTS.brand) {
    const bk = brandKey(OPTS.brand);
    perfumes = perfumes.filter((p) => brandKey(p.brand) === bk || brandMatchesFolder(p.brand, OPTS.brand!));
    console.log(`restricted to ${OPTS.brand}: ${perfumes.length} perfumes`);
  }
  perfumes = priorityOrder(perfumes, siteTiers());
  console.log(`${perfumes.length} perfumes, ${perfumes.reduce((s, p) => s + p.variants.size, 0)} product variants`);

  if (!OPTS.emitOnly) {
    console.log(`revalidated stored Fragrantica links: ${revalidateFragrantica(perfumes)} dropped`);
    // Free sources first: no request is made for these.
    let house = 0;
    let offer = 0;
    for (const p of perfumes) {
      house += resolveFromHouseStorefronts(p);
      offer += resolveFromBrandOffers(p);
      resolveFromSeen(p, 'bing-seen');
    }
    console.log(`offline: ${house} variants from house storefronts, ${offer} from brand-direct offers`);

    if (!OPTS.offline) {
      if (!OPTS.noSitemaps) await resolveFromSitemaps(perfumes);
      await save();
      await searchFragrantica(perfumes);
      await searchOfficial(perfumes);
    }
    await save();
  }

  const refused = refuseUnfitFallbacks(perfumes);
  if (refused) console.log(`marked ${refused} variants whose sibling's Fragrantica page is not fit for them`);
  await save();

  const table = compactTable(links.entries);
  await writeFile(GENERATED, renderGeneratedModule(table, latestCheck()));
  console.log(`wrote ${GENERATED.replace(ROOT + '/', '')}: ${Object.keys(table).length} keys; ${queries} search queries this run`);
  report(perfumes);
}

// A job runner's SIGTERM/SIGINT (a cancelled workflow, a timeout) is a normal
// way for this to end: keep what was found and rebuild the generated file.
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log(`${sig}: saving and exiting`);
    void (async () => {
      await save();
      if (links) await writeFile(GENERATED, renderGeneratedModule(compactTable(links.entries), latestCheck()));
      process.exit(0);
    })();
  });
}

function latestCheck(): string {
  return Object.values(links.entries).reduce((m, e) => (e.checkedAt > m ? e.checkedAt : m), '1970-01-01T00:00:00.000Z');
}

main().catch(async (err) => {
  console.error(err);
  await save().catch(() => undefined);
  process.exitCode = 1;
});
