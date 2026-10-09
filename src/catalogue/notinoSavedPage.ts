/**
 * Read a Notino UK page the owner saved from their own browser.
 *
 * This is route 3 of docs/NOTINO-PLAN.md: a bridge while Notino blocks bots.
 * Nothing here fetches anything. The owner opens Notino as a customer, saves
 * the page, drops the file in the inbox, and `npm run notino:import` reads it.
 *
 * ── An allow list, not a clean up ───────────────────────────────────────────
 * A saved page holds far more than product facts: cookies, a logged in
 * account's name and email, tokens, session ids, the visitor's own IP, tracking
 * scripts. This file never tries to remove those. It reads the page's schema.org
 * JSON-LD product data only, and builds each listing from named fields it
 * copies one by one. Every other byte of the page is never looked at, so it
 * cannot reach the output. As a second line, every string that is copied is
 * tested by `looksSecret`, and a listing carrying one is dropped whole.
 *
 * Nothing from the page is ever returned in an error message or a log line:
 * reasons are fixed sentences.
 *
 * ── What is deliberately not read ──────────────────────────────────────────
 *  - Any RRP, "was" or "Converted" price: not a price Notino charged
 *    (`wasPriceGbp` is always null; see wasPriceCredibility.ts).
 *  - Prices in another currency: dropped, never converted.
 *  - Query strings and fragments on URLs (session ids and campaign tags).
 *  - The page's free text. Fragrance notes are read only from labelled
 *    properties, and the description field of the listing is rebuilt from
 *    allow listed pieces.
 */
import { extractJsonLdBlocks, parseAvailability, isPreOrderAvailability, parsePrice } from './jsonld.js';
import { readBarcode } from './barcode.js';
import { CONCENTRATION } from './fragranceId.js';
import type { RawListing } from './types.js';

export const NOTINO_HOST = 'notino.co.uk';
export const NOTINO_SECTION_ID = 'saved-page';

export type SavedPageRefusal =
  | 'challenge-page'
  | 'not-notino'
  | 'no-products'
  | 'no-read-date'
  | 'read-date-in-future';

export interface DeliveryRead {
  name: string | null;
  priceGbp: number | null;
  minDays: number | null;
  maxDays: number | null;
}

export interface SavedPageResult {
  /** Why the whole file was refused, or null. */
  refusal: SavedPageRefusal | null;
  /** ISO 8601, the day the owner read the page. Null only on a refusal. */
  readAt: string | null;
  listings: RawListing[];
  /** Variants dropped: no usable GBP price, off host, or carrying a secret. */
  skipped: number;
  delivery: DeliveryRead[];
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function text(v: unknown): string | null {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Whether a string looks like something that must never be stored: an email,
 * a JWT, a bearer or key style token, an IPv4 or IPv6 address, or a long
 * unbroken run of token characters. Product names and notes never look like
 * any of these. A false positive costs one listing, which is the safe side.
 */
export function looksSecret(value: string): boolean {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(value)) return true;
  if (/\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/.test(value)) return true;
  if (/\b(?:bearer|token|apikey|api[_-]key|secret|password|passwd|session(?:id)?|csrf|auth)\b\s*[:=]/i.test(value)) return true;
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) return true;
  if (/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/i.test(value)) return true;
  if (/[A-Za-z0-9_-]{32,}/.test(value.replace(/https?:\/\/\S+/g, ''))) return true;
  return false;
}

/** A string safe to copy, or null. */
function safe(v: unknown): string | null {
  const s = text(v);
  return s !== null && !looksSecret(s) ? s : null;
}

function isChallenge(html: string): boolean {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  if (/just a moment|attention required|access denied/i.test(title)) return true;
  const markup = /\bcf-chl-|challenges\.cloudflare\.com\/cdn-cgi\/challenge/i.test(html.slice(0, 200_000));
  return markup && !/application\/ld\+json/i.test(html);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const isNotinoHost = (h: string | null): boolean => h !== null && (h === NOTINO_HOST || h.endsWith(`.${NOTINO_HOST}`));

/** Where the page says it came from: the browser's own comment or the page's canonical link. */
function sourceHosts(html: string): string[] {
  const head = html.slice(0, 400_000);
  const urls: string[] = [];
  const saved = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/i.exec(head)?.[1];
  if (saved) urls.push(saved);
  const captured = /<!--\s*captured \S+ from (\S+)\s*-->/i.exec(head)?.[1];
  if (captured) urls.push(captured);
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(head)?.[1]
    ?? /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(head)?.[1];
  if (canonical) urls.push(canonical);
  const og = /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i.exec(head)?.[1];
  if (og) urls.push(og);
  return urls.map(hostOf).filter((h): h is string => h !== null);
}

/**
 * The date the page was read: a `captured <ISO> from <url>` comment (the
 * format this repo's own captures use) when the page has one, otherwise the
 * file's saved time the caller passes in. Never the import date.
 */
export function readDateOf(html: string, fileTime: Date | null): Date | null {
  const m = /<!--\s*captured (\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?) from /i.exec(html.slice(0, 400_000));
  if (m) {
    const d = new Date(m[1]!);
    if (Number.isFinite(d.getTime())) return d;
  }
  return fileTime && Number.isFinite(fileTime.getTime()) ? fileTime : null;
}

// ── JSON-LD walk ───────────────────────────────────────────────────────────

function typeOf(n: Json): string[] {
  return arr(n['@type']).map((t) => String(t).toLowerCase());
}

/** Every Product-like node anywhere in a JSON-LD tree, with its group parent if any. */
function collectProducts(node: unknown, out: { node: Json; parent: Json | null }[], parent: Json | null = null, depth = 0): void {
  if (depth > 12) return;
  if (Array.isArray(node)) {
    for (const n of node) collectProducts(n, out, parent, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  const types = typeOf(node);
  const isGroup = types.includes('productgroup');
  const isProduct = types.includes('product') || isGroup;
  if (isProduct && !isGroup) out.push({ node, parent });
  if (isGroup) {
    const variants = arr(node['hasVariant']);
    if (variants.length === 0) out.push({ node, parent });
    for (const v of variants) collectProducts(v, out, node, depth + 1);
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
    if (node[key] !== undefined) collectProducts(node[key], out, parent, depth + 1);
  }
}

function brandName(n: Json, parent: Json | null): string | null {
  for (const src of [n, parent]) {
    if (!src) continue;
    const b = src['brand'];
    const name = isObj(b) ? safe(b['name']) : safe(b);
    if (name) return name;
  }
  return null;
}

/** Look a labelled value up in a node's `additionalProperty` list. */
function property(n: Json, parent: Json | null, ...names: string[]): unknown {
  for (const src of [n, parent]) {
    if (!src) continue;
    for (const p of arr(src['additionalProperty'])) {
      if (!isObj(p)) continue;
      const label = text(p['name'])?.toLowerCase();
      if (label && names.includes(label)) return p['value'];
    }
  }
  return undefined;
}

function sizeLabel(n: Json, parent: Json | null, name: string): string | null {
  const raw = n['size'] ?? property(n, parent, 'size', 'volume', 'capacity');
  let candidate: string | null = null;
  if (isObj(raw)) {
    const v = text(raw['value']);
    const u = text(raw['unitText'] ?? raw['unitCode']);
    candidate = v ? `${v} ${u ?? ''}`.trim() : null;
  } else candidate = text(raw);
  const pick = (s: string | null): string | null => {
    const m = s ? /(\d{1,4}(?:[.,]\d{1,2})?)\s*(ml|g)\b/i.exec(s) : null;
    return m ? `${m[1]!.replace(',', '.')} ${m[2]!.toLowerCase()}`.replace(/ g$/, ' g') : null;
  };
  return pick(candidate) ?? pick(name);
}

const CONCENTRATIONS = [
  'Eau de Parfum', 'Eau de Toilette', 'Eau de Cologne', 'Parfum', 'Extrait de Parfum', 'Eau Fraiche', 'Perfume Oil',
];

/** The page's own category, "eau de parfum for men" on a Notino product page. */
function categoryOf(n: Json, parent: Json | null): string | null {
  return safe(n['category']) ?? (parent ? safe(parent['category']) : null);
}

function concentrationOf(n: Json, parent: Json | null, name: string): string | null {
  const prop = safe(property(n, parent, 'concentration', 'type', 'fragrance type'));
  // Notino names the strength only in its category ("eau de parfum for men").
  const hay = `${prop ?? ''} ${categoryOf(n, parent) ?? ''} ${name}`;
  for (const c of CONCENTRATIONS) if (new RegExp(`\\b${c}\\b`, 'i').test(hay)) return c;
  return null;
}

function genderOf(n: Json, parent: Json | null, name: string): string | null {
  const aud = isObj(n['audience']) ? n['audience'] : isObj(parent?.['audience']) ? (parent!['audience'] as Json) : null;
  const hay = `${safe(aud?.['suggestedGender']) ?? ''} ${safe(property(n, parent, 'gender', 'for')) ?? ''} ${categoryOf(n, parent) ?? ''} ${name}`.toLowerCase();
  if (/\bunisex\b/.test(hay)) return 'unisex';
  if (/\b(women|woman|female|ladies|her)\b/.test(hay)) return 'women';
  if (/\b(men|man|male|him)\b/.test(hay)) return 'men';
  return null;
}

function noteList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  return parts.map((p) => safe(p)).filter((p): p is string => p !== null && p.length <= 40).slice(0, 12);
}

/** Notes only from labelled properties, never mined out of free text. */
function notesOf(n: Json, parent: Json | null): string | null {
  const groups: [string, string[]][] = [
    ['Top notes', ['top notes', 'top note', 'top']],
    ['Middle notes', ['heart notes', 'middle notes', 'heart', 'middle']],
    ['Base notes', ['base notes', 'base note', 'base']],
  ];
  const lines: string[] = [];
  for (const [label, keys] of groups) {
    const list = noteList(property(n, parent, ...keys));
    if (list.length) lines.push(`${label}: ${list.join(', ')}.`);
  }
  return lines.length ? lines.join(' ') : null;
}

function offersOf(n: Json): Json[] {
  const out: Json[] = [];
  for (const o of arr(n['offers'])) {
    if (!isObj(o)) continue;
    const inner = arr(o['offers']).filter(isObj);
    if (inner.length > 0) out.push(...inner);
    else out.push(o);
  }
  return out;
}

/**
 * A product page's offers with each size once, at its shelf price. Notino lists
 * a size twice when a discount code applies: once at the code's price with a
 * `priceValidUntil` ("Armani Emporio Stronger With You Intensely 100 ml" at
 * £65.36 until 11 Oct), once at the price a shopper pays without it (£76.90).
 * The code's price comes first, so reading the first offer per size published
 * a price nobody pays unless they find the code.
 */
function shelfOffers(offers: Json[]): Json[] {
  const kept = new Map<string, Json>();
  offers.forEach((o, i) => {
    const key = text(o['sku']) ?? text(o['url']) ?? `#${i}`;
    const held = kept.get(key);
    if (!held || (held['priceValidUntil'] != null && o['priceValidUntil'] == null)) kept.set(key, o);
  });
  return [...kept.values()];
}

/**
 * One size's barcode from that size's own photo address, which Notino names by
 * it: the 100 ml above is pictured at
 * cdn.notinoimg.com/order_2k/armani/3614272225718_01-o/..., and 3614272225718 is
 * the barcode the same page's own data gives that size (all nine sizes of the
 * three pages the owner saved on 2026-10-07 match). Only a code that passes
 * readBarcode's checks.
 */
export function barcodeFromVariantImage(image: unknown): string | null {
  const url = text(isObj(image) ? image['url'] ?? image['contentUrl'] : arr(image)[0]);
  const m = url ? /^https:\/\/cdn\.notinoimg\.com\/[^?#]*\/(\d{12,14})_\d{2}(?:-o)?\//.exec(url) : null;
  return m ? readBarcode(m[1]).ean : null;
}

function offerPrice(o: Json): { price: number | null; currency: string | null } {
  const spec = arr(o['priceSpecification']).find(isObj) as Json | undefined;
  const price = parsePrice(o['price'] ?? spec?.['price']);
  const currency = text(o['priceCurrency'] ?? spec?.['priceCurrency'])?.toUpperCase() ?? null;
  return { price, currency };
}

function cleanUrl(raw: unknown, base: string): string | null {
  const s = text(raw);
  if (!s) return null;
  try {
    const u = new URL(s, base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `https://${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return null;
  }
}

function imageOf(n: Json, parent: Json | null): string | null {
  for (const src of [n, parent]) {
    if (!src) continue;
    for (const i of arr(src['image'])) {
      const url = isObj(i) ? i['url'] ?? i['contentUrl'] : i;
      const clean = cleanUrl(url, 'https://www.notino.co.uk/');
      if (clean && clean.startsWith('https://')) return clean;
    }
  }
  return null;
}

function deliveryOf(o: Json, out: DeliveryRead[]): void {
  for (const d of arr(o['shippingDetails'])) {
    if (!isObj(d)) continue;
    const rate = isObj(d['shippingRate']) ? d['shippingRate'] : null;
    const cur = text(rate?.['currency'])?.toUpperCase();
    const price = rate && (cur === 'GBP' || cur === null) ? parsePrice(rate['value']) : null;
    const t = isObj(d['deliveryTime']) ? d['deliveryTime'] : null;
    const transit = isObj(t?.['transitTime']) ? (t!['transitTime'] as Json) : null;
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const read: DeliveryRead = {
      name: safe(d['name']),
      priceGbp: price,
      minDays: num(transit?.['minValue']),
      maxDays: num(transit?.['maxValue']),
    };
    if (!out.some((x) => JSON.stringify(x) === JSON.stringify(read))) out.push(read);
  }
}

function slugOf(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() ?? url;
}

export interface ParseSavedPageOptions {
  /** The file's saved time, used when the page carries no date of its own. */
  fileTime: Date | null;
  /** The moment of the import, only to refuse a read date in the future. */
  now: Date;
}

export function parseNotinoSavedPage(html: string, options: ParseSavedPageOptions): SavedPageResult {
  const refuse = (refusal: SavedPageRefusal): SavedPageResult => ({
    refusal, readAt: null, listings: [], skipped: 0, delivery: [],
  });

  if (isChallenge(html)) return refuse('challenge-page');
  const hosts = sourceHosts(html);
  if (hosts.some((h) => !isNotinoHost(h))) return refuse('not-notino');

  const read = readDateOf(html, options.fileTime);
  if (!read) return refuse('no-read-date');
  // A small allowance for clock differences between the owner's computer and this one.
  if (read.getTime() > options.now.getTime() + 24 * 3600 * 1000) return refuse('read-date-in-future');
  const readAt = read.toISOString();

  const found: { node: Json; parent: Json | null }[] = [];
  collectProducts(extractJsonLdBlocks(html), found);

  const base = 'https://www.notino.co.uk/';
  const listings: RawListing[] = [];
  const delivery: DeliveryRead[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let sawOffHost = false;

  for (const { node, parent } of found) {
    const name = safe(node['name']) ?? (parent ? safe(parent['name']) : null);
    const pageUrl = cleanUrl(node['url'], base) ?? (parent ? cleanUrl(parent['url'], base) : null);
    const offers = shelfOffers(offersOf(node));
    // One variant per own sku, so a Product carrying several sized offers is
    // read as several listings, each with its own barcode.
    const units = offers.length > 1 && offers.every((o) => text(o['sku']) || text(o['gtin13']))
      ? offers
      : [offers[0] ?? null];

    for (const offer of units) {
      const own = offer && units.length > 1 ? offer : null;
      const url = cleanUrl(own?.['url'], base) ?? cleanUrl(offer?.['url'], base) ?? pageUrl;
      const title = name;
      if (!title || !url || !offer) { skipped++; continue; }
      if (!isNotinoHost(hostOf(url))) { sawOffHost = true; skipped++; continue; }

      const { price, currency } = offerPrice(offer);
      if (price === null || price <= 0 || currency !== 'GBP') { skipped++; continue; }

      // One size of several takes only its own barcode, never the product's:
      // on Notino the product's gtin13 is one size's (the 150 ml on the Armani
      // page, whose sku is the 100 ml's), and giving it to every size put all
      // five onto the 150 ml's product.
      const ean = own
        ? readBarcode(own['gtin13'] ?? own['gtin']).ean ?? barcodeFromVariantImage(own['image'])
        : readBarcode(node['gtin13'] ?? node['gtin'] ?? node['gtin14'] ?? node['gtin12'] ?? node['gtin8'] ?? node['ean']
          ?? offer['gtin13'] ?? offer['gtin']).ean;
      const label = own ? safe(own['name']) : null;
      const size = sizeLabel(own ? { ...node, ...own } : node, parent, label ?? title);
      const sku = safe(own?.['sku'] ?? node['sku'] ?? offer['sku']);

      const sizeCompact = size ? size.replace(' ', '') : null;
      const sizeInTitle = size !== null && new RegExp(`\\b${size.split(' ')[0]!.replace('.', '\\.')}\\s*${size.split(' ')[1]!}\\b`, 'i').test(title);
      // The strength goes in the title where it is missing: the catalogue only
      // takes a bottle whose title names one (isFragrance in fragranceId.ts),
      // and Notino's never do.
      const strength = concentrationOf(node, parent, title);
      const named = strength && !CONCENTRATION.test(title) ? `${title} ${strength}` : title;
      const rawTitle = size && !sizeInTitle ? `${named} ${sizeCompact}` : named;
      if (looksSecret(rawTitle)) { skipped++; continue; }

      const retailerSku = sku ?? ean ?? `${slugOf(url)}${sizeCompact ? `-${sizeCompact}` : ''}`;
      if (looksSecret(retailerSku) && !/^\d+$/.test(retailerSku)) { skipped++; continue; }
      if (seen.has(retailerSku)) continue;
      seen.add(retailerSku);

      const availability = offer['availability'];
      const description = [
        concentrationOf(node, parent, title),
        genderOf(node, parent, title) ? `For ${genderOf(node, parent, title)}.` : null,
        notesOf(node, parent),
      ].filter((p): p is string => !!p).join(' ') || null;

      listings.push({
        retailerSku,
        url,
        rawTitle,
        rawBrand: brandName(node, parent),
        ean,
        imageUrl: (own && imageOf(own, null)) || imageOf(node, parent),
        priceGbp: price,
        // An RRP, "was" or "Converted" price is never read: not a price Notino charged.
        wasPriceGbp: null,
        promoEndsAt: null,
        inStock: parseAvailability(availability),
        ...(isPreOrderAvailability(availability) ? { availability: 'preOrder' as const } : {}),
        sectionId: NOTINO_SECTION_ID,
        description,
      });
      deliveryOf(offer, delivery);
    }
  }

  if (listings.length === 0) return refuse(sawOffHost ? 'not-notino' : 'no-products');
  return { refusal: null, readAt, listings, skipped, delivery };
}
