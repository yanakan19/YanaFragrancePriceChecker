/**
 * Manual page import: a shop whose site refuses our crawler can still be read
 * from pages a person saved in their own browser.
 *
 * The owner opens a product or listing page, saves the page source, and drops
 * the file in `data/manual-pages/<shopId>/`. This module reads those files and
 * merges what they list into the shop's snapshot, the way a crawl would. It
 * only parses files on disk. It never fetches anything, and nothing here tries
 * to get past a bot wall: a saved file that is itself a challenge page is
 * refused.
 *
 * What is reused, not copied:
 *   - `parseListings` (src/catalogue/jsonld.ts) turns the HTML into listings.
 *   - `markTitlePreOrders` and `titleWithSizeFromUrl` are the same two
 *     listing clean-ups scripts/catalogue-harvest.ts runs on every route.
 *   - `reconcile` (src/catalogue/reconcile.ts) is the merge: first seen, last
 *     seen, relisted, NEW badge and status rules. `CatalogueStore.write`
 *     writes the file, with its currency quarantine and atomic rename.
 *   - `renderRefusal` (src/catalogue/renderRefusal.ts) judges a page too
 *     small to be real.
 *
 * Merge rules specific to a hand saved page:
 *   - `complete` is always false. A few saved pages are never evidence that
 *     anything else left the shop, so nothing is delisted.
 *   - The time a page was captured is the time the listing was last seen, not
 *     the time of the import. A page captured earlier than what the snapshot
 *     already holds for a listing is left out for that listing, so an old
 *     file can never overwrite a newer price.
 *   - Files are applied oldest capture first, so the newest price wins.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseListings } from './jsonld.js';
import { reconcile } from './reconcile.js';
import { renderRefusal } from './renderRefusal.js';
import { markTitlePreOrders } from './listingAvailability.js';
import { titleWithSizeFromUrl } from './sizeFromUrl.js';
import { CatalogueStore } from './store.js';
import type { RawListing, StoredListing } from './types.js';
import { listingKey } from './types.js';

/** A capture dated further ahead than this is a typo, not a capture. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** How much of the top of a file is searched for the `saved` and `url` comments. */
const HEADER_BYTES = 8_192;

/** What the caller must say about the shop: a subset of the registry entry. */
export interface ImportShop {
  id: string;
  name: string;
  domain: string;
  catalogue?: { sections?: ReadonlyArray<{ id: string }> } | null;
}

export type MissingField = 'price' | 'image' | 'brand' | 'barcode' | 'size' | 'stock';

export interface ParsedPage {
  capturedAt: string;
  capturedFrom: 'header' | 'mtime';
  /** The page's own address: canonical link, og:url, JSON-LD url, then the header comment. */
  canonicalUrl: string | null;
  listings: RawListing[];
  /** Listings dropped because their address is not on the shop's own domain. */
  offDomain: number;
  /** How many listings lack each field. Absence is reported, never filled in. */
  missing: Record<MissingField, number>;
  notes: string[];
}

export type PageOutcome =
  | { ok: true; page: ParsedPage }
  | { ok: false; reason: string };

/** The markers of a Cloudflare style interstitial. Only read when no listing parsed. */
const CHALLENGE_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/<title>\s*Just a moment/i, 'its title is "Just a moment..."'],
  [/<title>\s*Attention Required!?\s*\|\s*Cloudflare/i, 'its title is Cloudflare\'s "Attention Required"'],
  [/\bcf-chl-widget\b/i, 'it carries the cf-chl-widget challenge markup'],
  [/\b_cf_chl_opt\b/, 'it carries Cloudflare\'s challenge options'],
  [/Enable JavaScript and cookies to continue/i, 'it asks for JavaScript and cookies to continue'],
  [/\/\.well-known\/sgcaptcha\//i, 'it is a SiteGround captcha page'],
  [/<title>\s*Access Denied/i, 'its title is "Access Denied"'],
];

/** The reason a page is a bot wall rather than a shop page, or null. */
export function challengeReason(html: string, listingsParsed: number): string | null {
  // Products disprove a challenge: a real page can mention Turnstile in its footer.
  if (listingsParsed > 0) return null;
  for (const [re, why] of CHALLENGE_MARKERS) if (re.test(html)) return `a bot challenge page, not the shop: ${why}`;
  const small = renderRefusal({ url: '', status: 200, bytes: html.length, listingsParsed });
  return small ? `a bot wall or an empty page: ${small.reason}` : null;
}

function metaContent(html: string, key: string, value: string): string | null {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = tag[0];
    const named = new RegExp(`\\b${key}\\s*=\\s*["']${value}["']`, 'i').test(t);
    if (!named) continue;
    const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t);
    if (c) return (c[1] ?? c[2] ?? '').trim() || null;
  }
  return null;
}

function canonicalLink(html: string): string | null {
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const t = tag[0];
    if (!/\brel\s*=\s*["']?canonical["']?/i.test(t)) continue;
    const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t);
    if (h) return (h[1] ?? h[2] ?? '').trim() || null;
  }
  return null;
}

function jsonLdUrl(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const block = JSON.parse(m[1] ?? '') as unknown;
      const nodes = Array.isArray(block) ? block : [block];
      for (const n of nodes) {
        const u = (n as { url?: unknown } | null)?.url;
        if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
      }
    } catch {
      // A malformed block is skipped, as extractJsonLdBlocks does.
    }
  }
  return null;
}

/** `<!-- saved: ... -->` and `<!-- url: ... -->`, plus the comment Chrome writes itself. */
export function readHeader(html: string): { saved: string | null; url: string | null } {
  const top = html.slice(0, HEADER_BYTES);
  const saved = /<!--\s*saved\s*:\s*([^>]*?)\s*-->/i.exec(top)?.[1] ?? null;
  const url =
    /<!--\s*url\s*:\s*(\S+?)\s*-->/i.exec(top)?.[1] ??
    /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(top)?.[1] ??
    null;
  return { saved, url };
}

function onDomain(address: string, domain: string): boolean {
  try {
    const host = new URL(address).hostname.toLowerCase();
    const d = domain.toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

function hasSize(l: RawListing): boolean {
  return /\b\d+(?:\.\d+)?\s?(?:ml|cl|l|oz|fl\.?\s?oz|g)\b/i.test(`${l.rawTitle} ${l.description ?? ''}`);
}

/**
 * Reads one saved page. `mtime` is the file's modification time, ISO 8601,
 * used when the file has no `saved` comment. `now` is injected for tests.
 */
export function parseSavedPage(
  html: string,
  shop: ImportShop,
  mtime: string,
  now: Date = new Date(),
): PageOutcome {
  const header = readHeader(html);
  const notes: string[] = [];

  let capturedAt = mtime;
  let capturedFrom: ParsedPage['capturedFrom'] = 'mtime';
  if (header.saved !== null) {
    const t = Date.parse(header.saved);
    if (Number.isNaN(t)) notes.push(`the "saved" comment "${header.saved}" is not a date, so the file's own time is used`);
    else {
      capturedAt = new Date(t).toISOString();
      capturedFrom = 'header';
    }
  }
  if (Date.parse(capturedAt) > now.getTime() + FUTURE_SLACK_MS) {
    return { ok: false, reason: `captured ${capturedAt}, which is in the future; fix the "saved" comment` };
  }

  const canonicalUrl = canonicalLink(html) ?? metaContent(html, 'property', 'og:url') ?? jsonLdUrl(html) ?? header.url;
  if (canonicalUrl !== null && !onDomain(canonicalUrl, shop.domain)) {
    return { ok: false, reason: `the page is from ${canonicalUrl}, not ${shop.domain}; it was saved in the wrong shop's folder` };
  }

  const sectionId = shop.catalogue?.sections?.[0]?.id ?? 'manual';
  const parsed = parseListings(html, {
    sectionId,
    pageUrl: canonicalUrl ?? `https://www.${shop.domain}/`,
    // A page that does not name sterling is not stored as pounds.
    requireGbp: true,
    microdata: true,
    // A saved product page: every size it offers, not only the first.
    everyOffer: true,
  });

  const challenge = challengeReason(html, parsed.length);
  if (challenge) return { ok: false, reason: challenge };

  const onShop = parsed.filter((l) => onDomain(l.url, shop.domain));
  const offDomain = parsed.length - onShop.length;
  if (offDomain > 0) notes.push(`${offDomain} listing(s) left out: their address is not on ${shop.domain}`);

  // The same two clean-ups the harvest applies on every route.
  const marked = markTitlePreOrders(onShop).listings as RawListing[];
  const listings = marked.map((l) => {
    const titled = titleWithSizeFromUrl(l.rawTitle, l.url);
    return titled === l.rawTitle ? l : { ...l, rawTitle: titled };
  });

  const missing: Record<MissingField, number> = { price: 0, image: 0, brand: 0, barcode: 0, size: 0, stock: 0 };
  for (const l of listings) {
    if (l.priceGbp === null) missing.price++;
    if (!l.imageUrl) missing.image++;
    if (!l.rawBrand) missing.brand++;
    if (!l.ean) missing.barcode++;
    if (!hasSize(l)) missing.size++;
    if (l.inStock === null) missing.stock++;
  }

  return { ok: true, page: { capturedAt, capturedFrom, canonicalUrl, listings, offDomain, missing, notes } };
}

export interface MergeStats {
  added: number;
  refreshed: number;
  /** Left out because the snapshot already holds a newer sighting of the listing. */
  olderThanStored: number;
  /** Listings with no price: not stored, as the harvest stores only priced listings. */
  unpriced: number;
}

/**
 * Merges one page's listings into a snapshot's listings, as of the page's
 * capture time. Pure: returns the new listing array.
 */
export function mergePage(
  existing: readonly StoredListing[],
  page: Pick<ParsedPage, 'capturedAt' | 'listings'>,
  retailerId: string,
): { listings: StoredListing[]; stats: MergeStats } {
  const held = new Map(existing.map((l) => [listingKey(l.retailerId, l.retailerSku), l]));
  const stats: MergeStats = { added: 0, refreshed: 0, olderThanStored: 0, unpriced: 0 };
  const crawled: RawListing[] = [];
  for (const l of page.listings) {
    // The harvest keeps only listings a price was read for; the same here.
    if (l.priceGbp === null) {
      stats.unpriced++;
      continue;
    }
    const prior = held.get(listingKey(retailerId, l.retailerSku));
    if (prior && prior.lastSeenAt > page.capturedAt) {
      stats.olderThanStored++;
      continue;
    }
    crawled.push(l);
    if (prior) stats.refreshed++;
    else stats.added++;
  }
  if (crawled.length === 0) return { listings: [...existing], stats };
  const outcome = reconcile({ existing, crawled, retailerId, now: page.capturedAt, complete: false });
  return { listings: outcome.listings, stats };
}

export interface FileReport {
  file: string;
  status: 'imported' | 'refused' | 'nothing';
  reason?: string;
  capturedAt?: string;
  capturedFrom?: ParsedPage['capturedFrom'];
  canonicalUrl?: string | null;
  listingsFound: number;
  missing?: Record<MissingField, number>;
  notes: string[];
  stats?: MergeStats;
}

export interface ImportResult {
  shopId: string;
  files: FileReport[];
  written: boolean;
}

export interface ImportOptions {
  shop: ImportShop;
  /** Folder of saved `.html` files. */
  dir: string;
  /** The catalogue folder: where `<shopId>.json` lives. */
  catalogueDir: string;
  dryRun?: boolean;
  now?: Date;
}

/** Every `.html` or `.htm` file directly in a folder, by name. Nothing is fetched. */
export function savedFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort();
}

/** Reads every saved file in `dir` and merges the good ones into the shop's snapshot. */
export function importPages(options: ImportOptions): ImportResult {
  const { shop, dir, catalogueDir, dryRun = false } = options;
  const now = options.now ?? new Date();
  const store = new CatalogueStore(catalogueDir);
  const prior = store.read(shop.id);
  // Fixture data is never merged with live data, as in the harvest.
  let listings: StoredListing[] = prior.source === 'live' ? [...prior.listings] : [];

  const reports: FileReport[] = [];
  const good: Array<{ report: FileReport; page: ParsedPage }> = [];
  for (const file of savedFiles(dir)) {
    const path = join(dir, file);
    const mtime = statSync(path).mtime.toISOString();
    const outcome = parseSavedPage(readFileSync(path, 'utf8'), shop, mtime, now);
    if (!outcome.ok) {
      reports.push({ file, status: 'refused', reason: outcome.reason, listingsFound: 0, notes: [] });
      continue;
    }
    const { page } = outcome;
    const report: FileReport = {
      file,
      status: page.listings.length > 0 ? 'imported' : 'nothing',
      ...(page.listings.length === 0 ? { reason: 'no product with a name and a price was found in it' } : {}),
      capturedAt: page.capturedAt,
      capturedFrom: page.capturedFrom,
      canonicalUrl: page.canonicalUrl,
      listingsFound: page.listings.length,
      missing: page.missing,
      notes: page.notes,
    };
    reports.push(report);
    if (page.listings.length > 0) good.push({ report, page });
  }

  // Oldest capture first, so the newest price is the one left standing.
  good.sort((a, b) => a.page.capturedAt.localeCompare(b.page.capturedAt));
  let latest = prior.updatedAt;
  for (const { report, page } of good) {
    const merged = mergePage(listings, page, shop.id);
    listings = merged.listings;
    report.stats = merged.stats;
    if (page.capturedAt > latest) latest = page.capturedAt;
  }

  const changed = good.some(({ report }) => (report.stats?.added ?? 0) + (report.stats?.refreshed ?? 0) > 0);
  if (changed && !dryRun) {
    store.write({
      retailerId: shop.id,
      updatedAt: latest,
      source: 'live',
      listings,
      runs: prior.source === 'live' ? prior.runs : [],
    });
  }
  return { shopId: shop.id, files: reports, written: changed && !dryRun };
}
