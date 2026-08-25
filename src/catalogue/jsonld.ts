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

/**
 * An offer's own identity — whichever of these fields it happens to carry —
 * checked against the listing's already-computed sku so a multi-offer block
 * can be resolved to the one offer that actually is this listing, not just
 * whichever came first.
 */
function offerIdentity(offer: JsonValue): string | null {
  return str(offer['sku']) ?? str(offer['mpn']) ?? gtin(offer) ?? skuFromUrl(str(offer['url']) ?? '');
}

/**
 * Picks the offer that actually is this listing, not whichever the retailer
 * happened to list first.
 *
 * A Product block with more than one Offer underneath it is almost always
 * several size or variant offers bundled together — routine on Shopify
 * storefronts (Allbeauty among them) — and only one of them is genuinely the
 * variant this listing's own sku refers to. The previous version of this
 * function took `offers[0]` unconditionally, which attributed a random
 * sibling variant's price and stock state to every listing: a real,
 * currently-in-stock bottle could get recorded as out of stock purely
 * because some other size of the same fragrance happened to sort first in
 * the retailer's own markup. That is exactly the bug a reader found on
 * Allbeauty — the fragrance was genuinely purchasable, the stored listing
 * said otherwise, because it was never that listing's own offer to begin
 * with.
 *
 * Where the correct offer cannot be identified — no offer's own sku matches,
 * because the retailer's markup gives variant offers no identity of their
 * own to check — this returns null rather than guessing. A listing with no
 * resolvable offer gets no price and an unknown stock state (see the
 * `offer === null` handling in parseListings), which is the honest answer:
 * unknown is a real, supported state in this app, and reusing the arbitrary
 * "any offer will do" logic to force it into false would only trade a
 * proven bug for a plausible-looking one.
 */
function selectOffer(node: JsonValue, sku: string): JsonValue | null {
  const offers = flatten(node['offers']);
  if (offers.length === 0) return null;
  if (offers.length === 1) return offers[0]!;
  return offers.find((o) => offerIdentity(o) === sku) ?? null;
}

function brandName(node: JsonValue): string | null {
  const brand = node['brand'];
  if (typeof brand === 'string') return brand.trim() || null;
  if (brand && typeof brand === 'object') {
    return str((brand as JsonValue)['name']);
  }
  return null;
}

/**
 * The retailer's own product copy, where the Product node carries one.
 *
 * schema.org names this `description` and shops fill it in routinely, but this
 * parser never read it, so every retailer ingested through the sitemap route
 * reached the catalogue with `description: undefined` — while the Awin-feed and
 * Shopify routes, which do capture it, reached it with real copy.
 *
 * That asymmetry was quietly costing fragrance notes. Notes are parsed out of
 * `description` at display-build time (see scripts/build-demo-catalogue.ts's
 * pickNotes), so a shop with no description can never contribute a note however
 * carefully its pages are written. Measured 2026-08-25 across the stored
 * catalogue: of 53,777 active listings, 36,137 carried a description and 17,640
 * did not — and 5,716 of those blanks are Beauty Base, Justmylook and Perfumeo,
 * three sitemap-route shops whose pages were never asked for the field.
 *
 * HTML is stripped rather than kept. Shops commonly put markup in this field,
 * and pickNotes reads prose; a `<br>` between "Top notes" and the list is the
 * difference between reading it and not. Entities are left alone — decoding
 * them is jsonld.ts's caller's business, and the note parser handles them.
 */
function description(node: JsonValue): string | null {
  const raw = str(node['description']);
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A description of a handful of characters is a placeholder, not copy, and
  // carrying it costs a row in the store for nothing.
  return text.length > 2 ? text : null;
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

/**
 * A retailer's own `aggregateRating`, read straight off the same Product node
 * the price comes from — never computed, never defaulted, never carried over
 * from a different listing of the same fragrance.
 *
 * `ratingValue` is required: a review count with no star value is not a
 * rating anyone could show. `reviewCount` (the schema.org name most sites
 * use) and `ratingCount` (seen on a handful of sites instead, meaning the
 * same thing) are both accepted, in that order; either can be absent without
 * discarding a real `ratingValue` — a shop that publishes "4.6 stars" but not
 * how many reviews back it is still publishing a real rating, just an
 * incomplete one, and the caller decides whether that is enough to show.
 */
function aggregateRating(node: JsonValue): { value: number; count: number | null } | null {
  const blocks = flatten(node['aggregateRating']);
  const rating = blocks[0];
  if (!rating) return null;

  const value = parsePrice(rating['ratingValue']);
  if (value === null) return null;

  const countRaw = str(rating['reviewCount']) ?? str(rating['ratingCount']);
  const count = countRaw !== null ? Number.parseInt(countRaw, 10) : null;

  return { value, count: count !== null && Number.isFinite(count) ? count : null };
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

    // Computed from the product node itself, never from a *selected* offer —
    // selectOffer below needs this identity already settled so it has
    // something fixed to match candidate offers against, rather than a sku
    // that could itself shift depending on which offer got picked. Falling
    // back to any offer's url (when the node has none of its own) is still
    // safe here, unlike falling back to any offer's price or stock: variant
    // offers overwhelmingly share one canonical product url regardless of
    // size, so picking among them for a url carries none of the
    // mismatched-variant risk picking among them for price or stock does.
    //
    // Resolved against the page it was read from, because schema.org permits a
    // relative URL and some themes emit one. Taking it verbatim put 49 of
    // Glorious Beauty's listings into the catalogue with `url:
    // "/products/..."`, and a site-relative href on *our* pages resolves
    // against pricesniffs.space — so every one of that shop's live offers had
    // a Buy button pointing at a 404 on our own domain instead of at the shop.
    // Resolution is not a guess: `pageUrl` is the address the markup was
    // served from, which is exactly what a browser would resolve it against.
    const url = absolute(
      str(node['url']) ?? str(flatten(node['offers'])[0]?.['url']),
      options.pageUrl,
    );
    const sku = str(node['sku']) ?? str(node['mpn']) ?? gtin(node) ?? skuFromUrl(url);
    if (!sku) continue;

    // The same product can appear twice on a page, for example as both an
    // ItemList entry and a standalone block.
    if (seen.has(sku)) continue;
    seen.add(sku);

    const offer = selectOffer(node, sku);

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
      description: description(node),
      priceGbp: price,
      wasPriceGbp,
      promoEndsAt: isoDate(offer?.['priceValidUntil']),
      inStock: parseAvailability(offer?.['availability']),
      sectionId: options.sectionId,
      rating: aggregateRating(node),
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

/**
 * A product URL we can put behind a Buy button.
 *
 * `raw` is whatever the markup said, which may be absolute, protocol-relative
 * or site-relative; `pageUrl` is where that markup was served from. Anything
 * that will not resolve — including a `pageUrl` that is not itself absolute —
 * falls back to `pageUrl` unchanged, which is the same behaviour this had
 * before and never worse than it.
 */
function absolute(raw: string | null, pageUrl: string): string {
  if (!raw) return pageUrl;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return pageUrl;
  }
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
