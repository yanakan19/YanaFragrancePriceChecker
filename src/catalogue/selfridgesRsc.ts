import type { RawListing } from './types.js';

/**
 * Selfridges category pages: read the grid out of the React Server Components
 * payload the page streams to itself.
 *
 * ── The conclusion this replaces ──────────────────────────────────────────
 * Selfridges has been recorded as the hardest of the actor-tier shops and,
 * latterly, as a probable dead end: no JSON-LD, no client-hydration blob, an
 * RSC-streamed page with nothing machine-readable in it. The first two of
 * those are true. The third is not.
 *
 * State probe run 32505063770, job 96843269238, 2026-08-21T16:51Z, one
 * rendered page of /GB/en/cat/beauty/fragrance/?pn=1, 964,069 bytes:
 *
 *     JSON-LD blocks: 1; parseListings(): 0 listing(s)
 *     Script blocks carrying an id: 3
 *       #breadcrumb-schema type=application/ld+json 273 bytes
 *     ### RSC flight stream: 19 chunk(s), 459,936 chars assembled
 *       "\"price\"": first at 398417
 *       "sku": first at 398478
 *
 * The one JSON-LD block on the page is a breadcrumb. But the 19
 * `self.__next_f.push([1,"…"])` chunks concatenate into 460 kB of flight
 * stream, and at offset 398,417 of it sits a typed GraphQL result set:
 *
 *     "products":[{"__typename":"Product",
 *       "name":"Atelier des Fleurs Cedrus de Nuit Eau de Parfum 150ml",
 *       "seoKey":"chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-150ml_R04693967",
 *       "brand":"CHLOE","productId":"R04693967",
 *       "defaultImageUrl":"//images.selfridges.com/is/image/selfridges/R04693967_M",
 *       "lowestPrice":[{"__typename":"LowestPrice","currency":"GBP","price":231,
 *         "markdownPrice":null,"prevMarkdownPrice":null}],
 *       "ratingAndReviews":{…},"id":"178ee7d0-29e7-4131-a8a8-2ac16f2fb045"},…
 *
 * Name, brand, id, image, and a price that states its own currency. Two more
 * records in the same window: the 50ml sibling R04693968 at £115 and AMOUAGE
 * Essence Elsewhere 100ml R04676357 at £375.
 *
 * ── Where the URL came from, since the record has none ────────────────────
 * The product objects carry a `seoKey` and no address. Constructing one from
 * the seoKey would have been a guess, and this project already knows what a
 * wrong stored URL costs — jsonld.ts records 49 Glorious Beauty listings
 * whose site-relative hrefs resolved against pricesniffs.space, giving every
 * one of them a Buy button pointing at a 404 on our own domain.
 *
 * So it was measured instead, off the same grid's own anchors, state probe
 * run 32505707116, job 96845282753, 2026-08-21T16:59Z:
 *
 *     /GB/en/product/chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-150ml_R04693967/
 *     /GB/en/product/chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-50ml_R04693968/
 *     /GB/en/product/amouage-essence-elsewhere-essence-elsewhere-100ml_R04676357/
 *
 * `/GB/en/product/` + the seoKey verbatim + a trailing slash, confirmed
 * against all three of the products whose records had already been read, and
 * against twelve more in the same list. Worth having measured: the obvious
 * guess from this shop's own category URLs would have been `/GB/en/cat/`,
 * which is what its category pages use and is not what its products use.
 *
 * ── What is deliberately not read ─────────────────────────────────────────
 * `inStock` stays null. The strings "inStock" and "availab" are both absent
 * from all 459,936 characters of that stream — this grid does not publish
 * availability, and null is what "not published" means. It is not "in stock".
 *
 * A product carrying a markdown is stored UNPRICED, and this is the one
 * decision here most likely to need revisiting. `lowestPrice[0]` has three
 * money fields — `price`, `markdownPrice`, `prevMarkdownPrice` — and in every
 * record captured so far the second and third are null, which fixes the
 * meaning of `price` only for unreduced products. Whether a reduced product
 * puts today's price in `price` or in `markdownPrice` is unobserved, and the
 * two readings differ by exactly the size of the discount. Reading `price`
 * regardless would show the pre-sale figure as the shelf price on every
 * reduced item, which is the single worst error a price-comparison site can
 * make. So a record with either markdown field set is carried as a listing
 * with `priceGbp: null` until one real markdown record settles it — the same
 * shape John Lewis's variant ranges are handled in, for the same reason.
 *
 * `wasPriceGbp` stays null for the same reason: a reference price cannot be
 * read off fields whose roles are not yet established.
 *
 * `ean` stays null; nothing in the record carries a GTIN. `ratingAndReviews`
 * does carry `rating.score` and `rating.totalReviews`, which RawListing now
 * has a home for — left for whoever owns that field, since this module's job
 * is price and identity.
 */

export interface SelfridgesParseOptions {
  sectionId: string;
  pageUrl: string;
}

/**
 * Reassemble the flight stream from the chunks the page pushes to itself.
 *
 * Next.js App Router serves an RSC payload as many
 * `self.__next_f.push([1,"…"])` calls whose string arguments concatenate into
 * one document. A chunk that will not unescape is skipped rather than
 * abandoning the rest: the useful part of a 460 kB stream is one array in the
 * middle of it, and losing one chunk of nineteen is not a reason to lose the
 * other eighteen.
 */
export function rscFlightStream(html: string): string {
  let stream = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      stream += JSON.parse(`"${m[1]}"`) as string;
    } catch {
      /* one unreadable chunk; the rest of the stream still is */
    }
  }
  return stream;
}

/** Fields this module reads. The record carries a good deal more. */
interface SelfridgesProduct {
  productId?: unknown;
  seoKey?: unknown;
  name?: unknown;
  brand?: unknown;
  defaultImageUrl?: unknown;
  lowestPrice?: unknown;
}

/**
 * Every `"products":[…]` array of GraphQL Product objects in a flight stream.
 *
 * The stream is not JSON — it is a sequence of numbered flight rows, most of
 * which are React element trees — so it cannot be parsed whole. What can be
 * done honestly is find the array by its own key, scan to its matching
 * bracket with a string-aware counter, and hand that slice to `JSON.parse`,
 * which either accepts it as the well-formed JSON it is or rejects it and is
 * skipped. No regex ever pulls a field out of the raw text.
 */
export function productArraysIn(stream: string): SelfridgesProduct[] {
  const products: SelfridgesProduct[] = [];
  const marker = '"products":[';

  for (let from = stream.indexOf(marker); from !== -1; from = stream.indexOf(marker, from + 1)) {
    const open = from + marker.length - 1;
    const close = matchingBracket(stream, open);
    if (close === -1) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stream.slice(open, close + 1));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      // A page carries several `products` arrays — recommendation rails and
      // recently-viewed among them. Only the typed Product objects are read,
      // which is the flight payload's own label for what this is.
      if (record['__typename'] === 'Product') products.push(record as SelfridgesProduct);
    }
  }

  return products;
}

/**
 * Index of the `]` closing the `[` at `open`, or -1.
 *
 * String-aware, because a product name may perfectly well contain a bracket
 * and a naive depth count would stop in the middle of one.
 */
function matchingBracket(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parse every product Selfridges streamed into a rendered category page. */
export function parseSelfridgesListings(
  html: string,
  options: SelfridgesParseOptions,
): RawListing[] {
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const product of productArraysIn(rscFlightStream(html))) {
    const sku = str(product.productId);
    const title = str(product.name);
    const seoKey = str(product.seoKey);
    if (!sku || !title || !seoKey) continue;
    if (seen.has(sku)) continue;
    seen.add(sku);

    const url = absolute(`/GB/en/product/${seoKey}/`, options.pageUrl);
    if (!url) continue;

    listings.push({
      retailerSku: sku,
      url,
      rawTitle: title,
      rawBrand: str(product.brand),
      ean: null,
      imageUrl: absolute(str(product.defaultImageUrl), options.pageUrl),
      priceGbp: unreducedSterlingPrice(product.lowestPrice),
      wasPriceGbp: null,
      promoEndsAt: null,
      // Nothing in this payload states availability. See the header.
      inStock: null,
      sectionId: options.sectionId,
    });
  }

  return listings;
}

/**
 * The price, only where the record states GBP and carries no markdown whose
 * meaning has not been established. See this module's header.
 */
function unreducedSterlingPrice(lowestPrice: unknown): number | null {
  if (!Array.isArray(lowestPrice) || lowestPrice.length === 0) return null;
  const entry = lowestPrice[0];
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;

  if (row['currency'] !== 'GBP') return null;
  if (row['markdownPrice'] != null || row['prevMarkdownPrice'] != null) return null;

  const price = row['price'];
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Selfridges publishes its images protocol-relative
 * ("//images.selfridges.com/is/image/selfridges/R04693967_M") and its product
 * paths site-relative. Both resolve against the address the markup came from,
 * which is what a browser does with them.
 */
function absolute(raw: string | null, pageUrl: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}
