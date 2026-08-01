import type { RawListing } from './types.js';

/**
 * schema.org/Product extraction from a retailer page.
 *
 * The Phase 0 bet: most UK retail product pages embed a JSON-LD Product block
 * with price, availability, image and often a GTIN. Where that holds, a plain
 * fetch plus this parser costs about fifty milliseconds and nothing per
 * request, and a managed scraper is only needed for the awkward minority.
 *
 * Real markup is messier than the specification suggests, so this handles the
 * shapes that actually turn up: top level arrays, `@graph` wrappers, `Offer`
 * against `AggregateOffer`, prices as strings with currency symbols, brand as
 * either a string or an object, and images as string, array or object.
 */

interface JsonValue {
  [key: string]: unknown;
}

/** Pull every JSON-LD block out of an HTML document. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(re)) {
    const body = match[1];
    if (!body) continue;
    try {
      blocks.push(JSON.parse(stripJsonComments(body)));
    } catch {
      // A malformed block is common and never fatal. Skip it and carry on with
      // the others rather than losing the whole page.
    }
  }
  return blocks;
}

/** Some CMSs wrap the payload in CDATA or leave trailing commas. */
function stripJsonComments(raw: string): string {
  return raw
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim();
}

/** Walk arrays and `@graph` wrappers into a flat list of nodes. */
function flatten(node: unknown, out: JsonValue[] = []): JsonValue[] {
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as JsonValue;
    out.push(obj);
    if (obj['@graph']) flatten(obj['@graph'], out);
    // ItemList pages nest the products one level down.
    if (obj['itemListElement']) flatten(obj['itemListElement'], out);
    if (obj['item']) flatten(obj['item'], out);
  }
  return out;
}

function isProduct(node: JsonValue): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type.toLowerCase().includes('product');
  if (Array.isArray(type)) return type.some((t) => String(t).toLowerCase().includes('product'));
  return false;
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

/** Prices arrive as 62.95, "62.95", "£62.95" and "GBP 62.95". */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  // Strip everything that is not a digit, dot or comma, then handle the
  // European decimal comma only when there is no dot present.
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const normalised =
    cleaned.includes('.') && cleaned.includes(',')
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');

  const n = Number.parseFloat(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Availability comes with and without the schema.org prefix, in any case. */
export function parseAvailability(value: unknown): boolean | null {
  const s = str(value);
  if (!s) return null;
  const tail = s.split('/').pop()!.toLowerCase();
  if (tail.includes('outofstock') || tail.includes('soldout') || tail.includes('discontinued')) {
    return false;
  }
  if (tail.includes('instock') || tail.includes('instoreonly') || tail.includes('preorder')) {
    return true;
  }
  return null;
}

function firstOffer(node: JsonValue): JsonValue | null {
  const offers = node['offers'];
  const list = flatten(offers);
  return list.length > 0 ? list[0]! : null;
}

function brandName(node: JsonValue): string | null {
  const brand = node['brand'];
  if (typeof brand === 'string') return brand.trim() || null;
  if (brand && typeof brand === 'object') {
    return str((brand as JsonValue)['name']);
  }
  return null;
}

function imageUrl(node: JsonValue): string | null {
  const image = node['image'];
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && image.length > 0) {
    const first = image[0];
    return typeof first === 'string' ? first : str((first as JsonValue)?.['url']);
  }
  if (image && typeof image === 'object') return str((image as JsonValue)['url']);
  return null;
}

/** Any of the identifier fields a retailer might expose, best first. */
function gtin(node: JsonValue): string | null {
  for (const key of ['gtin13', 'gtin', 'gtin12', 'gtin14', 'gtin8', 'ean', 'productID']) {
    const raw = str(node[key]);
    if (!raw) continue;
    const digits = raw.replace(/\D/g, '');
    // A GTIN is 8, 12, 13 or 14 digits. Anything else is a different identifier
    // wearing the wrong field name, and using it as an EAN would mismatch.
    if ([8, 12, 13, 14].includes(digits.length)) return digits;
  }
  return null;
}

export interface ParseOptions {
  /** Section the page was crawled from, recorded on the listing. */
  sectionId: string;
  /** Page URL, used when the markup carries no canonical URL of its own. */
  pageUrl: string;
}

/**
 * Parse every Product on a page into listings.
 *
 * Category pages yield many, a product page usually one. Returns an empty array
 * when the page carries no usable Product, which is the signal that this
 * retailer needs a different adapter.
 */
export function parseListings(html: string, options: ParseOptions): RawListing[] {
  const nodes = extractJsonLdBlocks(html).flatMap((b) => flatten(b));
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (!isProduct(node)) continue;

    const title = str(node['name']);
    if (!title) continue;

    const offer = firstOffer(node);
    const url = str(node['url']) ?? str(offer?.['url']) ?? options.pageUrl;
    const sku = str(node['sku']) ?? str(node['mpn']) ?? gtin(node) ?? skuFromUrl(url);
    if (!sku) continue;

    // The same product can appear twice on a page, for example as both an
    // ItemList entry and a standalone block.
    if (seen.has(sku)) continue;
    seen.add(sku);

    const price =
      parsePrice(offer?.['price']) ??
      parsePrice(offer?.['lowPrice']) ??
      parsePrice((offer?.['priceSpecification'] as JsonValue)?.['price']);

    // A reference price only counts when the retailer published one and it sits
    // above what they are charging. Anything else is a stale RRP.
    const listed = listPrice(offer);
    const wasPriceGbp = listed !== null && price !== null && listed > price ? listed : null;

    listings.push({
      retailerSku: sku,
      url,
      rawTitle: title,
      rawBrand: brandName(node),
      ean: gtin(node),
      imageUrl: imageUrl(node),
      priceGbp: price,
      wasPriceGbp,
      promoEndsAt: isoDate(offer?.['priceValidUntil']),
      inStock: parseAvailability(offer?.['availability']),
      sectionId: options.sectionId,
    });
  }

  return listings;
}

/** The retailer's reference price, from whichever field it used. */
function listPrice(offer: JsonValue | null): number | null {
  if (!offer) return null;
  const direct = parsePrice(offer['highPrice']) ?? parsePrice(offer['listPrice']);
  if (direct !== null) return direct;

  for (const spec of flatten(offer['priceSpecification'])) {
    const type = String(spec['priceType'] ?? '').toLowerCase();
    if (type.includes('listprice') || type.includes('strikethrough')) {
      const p = parsePrice(spec['price']);
      if (p !== null) return p;
    }
  }
  return null;
}

/** A date we can trust enough to render a countdown against. */
function isoDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Last meaningful path segment, as a fallback identifier. */
function skuFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const seg = path.split('/').pop();
    return seg ? decodeURIComponent(seg) : null;
  } catch {
    return null;
  }
}
