import type { RawListing } from './types.js';
import { ML_SIZE_RE, OZ_SIZE_RE } from './fragranceId.js';

/**
 * John Lewis category pages: read the grid out of the page's own
 * `__NEXT_DATA__` props payload.
 *
 * ── Why a second extraction format exists at all ───────────────────────────
 * "One parser, one truth" — `parseListings` in jsonld.ts reads schema.org
 * Product nodes and nothing else — is the rule that makes every retrieval
 * route in this repo produce comparable data, and it is not being relaxed
 * lightly. src/catalogue/apifyActor.ts's header states the position plainly:
 * teaching the pipeline a second extraction format "is a decision about 'one
 * parser, one truth' and not one to take quietly inside a retailer entry."
 * This module is that decision taken out loud, for one shop, with the
 * measurement that forces it.
 *
 * State probe run 32503415608, job 96838106561, 2026-08-21T16:32Z. One
 * rendered category page — `/browse/beauty/womens-fragrance/_/N-a63?page=1`,
 * 1,060,957 bytes, the JavaScript run and the grid painted:
 *
 *     JSON-LD blocks: 4; parseListings(): 0 listing(s)
 *     "£" price-shaped strings in the rendered markup: 477 (83 distinct)
 *     #__NEXT_DATA__ type=application/json 216,448 bytes
 *     candidate product array:
 *         props.pageProps.productListingData.products[] — 74 object(s)
 *
 * Four JSON-LD blocks and not one Product among them, against 74 fully
 * described products sitting in the props payload the page hydrates from.
 * There is no version of `parseListings` that reaches those, because they are
 * not schema.org markup and never will be. The alternatives were rendering
 * this shop's *product* pages one metered browser page at a time, which
 * docs/INGESTION.md's cost reasoning forbids, or leaving a proven-retrievable
 * shop permanently dark. So: a second format, confined to one module, one
 * shop, and one call site — the actor block in scripts/catalogue-harvest.ts,
 * tried only after `parseListings` has already come back with nothing.
 *
 * ── The false negative this corrects ───────────────────────────────────────
 * This shop's entry in src/config/retailers.ts records, from two earlier
 * probes, "__NEXT_DATA__: FOUND, 215,243 bytes — price-shaped keys: false,
 * name-shaped keys: true, currency key: false", and reasons from it that the
 * payload is "consistent with a props payload built for the page chrome …
 * rather than one carrying this shop's own priced catalogue". That reading was
 * wrong, and the entry itself flagged why it might be: the test behind it
 * (scripts/apify-blob-probe.ts) matches an exact quoted key from a six-name
 * list. John Lewis prices are at `variantPriceRange.value.min` / `.max`, under
 * a parent that regex was never going to see. The data was there both times.
 *
 * ── The record shape, as measured ─────────────────────────────────────────
 * All 74 products in that render carried, per the same job's key-presence
 * count: `productId`, `title`, `brand`, `image`, `url`, `variantPriceRange`,
 * `outOfStock`, `isAvailableToOrder`, `attributes`, `defaultSkuId`. One real
 * record, printed in full by that job and saved as the fixture this module's
 * tests run against:
 *
 *     "productId": "115419487",
 *     "title": "CHANEL Coco Mademoiselle Crush Absolu Eau de Parfum",
 *     "brand": "CHANEL",
 *     "url": "/chanel-coco-mademoiselle-crush-absolu-eau-de-parfum/p115419487",
 *     "variantPriceRange": {
 *       "display": { "max": "£160.00", "min": "£117.00" },
 *       "reductionHistory": [],
 *       "value":   { "max": "160.00",  "min": "117.00" }, "for": "ITEM" },
 *     "outOfStock": false, "isAvailableToOrder": true, "multiSku": true,
 *     "attributes": [ …, { "key": "volume", "values": ["50ml", "100ml"] } ]
 *
 * ── Why a two-size product is stored unpriced ─────────────────────────────
 * `variantPriceRange` is a range across the variants behind one card, and the
 * record above is the ordinary case: one product page, 50ml at £117 and 100ml
 * at £160, one title naming neither. Picking either end of that range and
 * calling it the price of "CHANEL Coco Mademoiselle Crush Absolu Eau de
 * Parfum" would put a number on this site that no customer can pay for the
 * thing the title describes.
 *
 * jsonld.ts already refuses exactly this, in `parseListings`'s own comment:
 * falling back to any offer's url is safe where "falling back to any offer's
 * price or stock" is not, because of "the mismatched-variant risk". Same risk,
 * same answer. A price is set only when `min` and `max` agree, which is the
 * single-price case where the range is not a range at all. Everything else is
 * stored as a listing with `priceGbp: null` — known to be sold here, not
 * known at what price — which is a state src/catalogue/types.ts's own
 * `RawListing` doc describes as intended, and which
 * scripts/catalogue-harvest.ts already filters out of its priced set without
 * discarding the listing.
 *
 * ── What is deliberately not read ─────────────────────────────────────────
 *   - `wasPriceGbp` stays null. `reductionHistory` is the only plausible home
 *     for a reference price and every instance seen so far has been empty, so
 *     its populated shape is unobserved. Guessing at it would be inventing a
 *     saving.
 *   - `ean` stays null. Nothing in the record carries a GTIN.
 *   - `promoEndsAt` stays null. `messaging[]` carries promotional copy
 *     ("Receive the Jo Malone London … 10ml for free when you…") but no end
 *     date in any record seen.
 *   - `pricePerUnit.display` (£1,600.00 on one record) is a per-litre unit
 *     price, not a shelf price, and is never read.
 */

/** Fields this module reads. Everything else in the record is ignored. */
interface JohnLewisProduct {
  productId?: unknown;
  defaultSkuId?: unknown;
  title?: unknown;
  brand?: unknown;
  image?: unknown;
  url?: unknown;
  outOfStock?: unknown;
  isAvailableToOrder?: unknown;
  attributes?: unknown;
  variantPriceRange?: unknown;
}

export interface JohnLewisParseOptions {
  /** Section the page was crawled from, recorded on the listing. */
  sectionId: string;
  /** Page URL the markup was served from; relative URLs resolve against it. */
  pageUrl: string;
}

/**
 * The `__NEXT_DATA__` payload of a rendered page, parsed, or null.
 *
 * Next.js serves it as `<script id="__NEXT_DATA__" type="application/json">`,
 * so its body is JSON and not a JavaScript expression — no evaluation is
 * needed or done here.
 */
export function extractNextData(html: string): unknown {
  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Parse every product in a John Lewis category page's props payload. */
export function parseJohnLewisListings(html: string, options: JohnLewisParseOptions): RawListing[] {
  const products = productsIn(extractNextData(html));
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const product of products) {
    const sku = str(product.productId) ?? str(product.defaultSkuId);
    const title = str(product.title);
    const url = absolute(str(product.url), options.pageUrl);
    if (!sku || !title || !url) continue;

    // The same product can be listed twice in one grid — a sponsored slot and
    // its ordinary position — and `productId` is what makes them one product.
    if (seen.has(sku)) continue;
    seen.add(sku);

    listings.push({
      retailerSku: sku,
      url,
      rawTitle: titleWithVolume(title, product.attributes),
      rawBrand: str(product.brand),
      ean: null,
      imageUrl: absolute(str(product.image), options.pageUrl),
      priceGbp: unambiguousPrice(product.variantPriceRange),
      wasPriceGbp: null,
      promoEndsAt: null,
      inStock: stockOf(product),
      sectionId: options.sectionId,
    });
  }

  return listings;
}

/** `props.pageProps.productListingData.products`, when the payload has one. */
function productsIn(data: unknown): JohnLewisProduct[] {
  const pageProps = prop(prop(data, 'props'), 'pageProps');
  const products = prop(prop(pageProps, 'productListingData'), 'products');
  if (!Array.isArray(products)) return [];
  return products.filter((p): p is JohnLewisProduct => Boolean(p) && typeof p === 'object');
}

function prop(node: unknown, key: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  return (node as Record<string, unknown>)[key];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The price, only where the card's variants all carry the same one.
 *
 * Both halves of the range must agree *and* the shop's own display string must
 * be in sterling before a number reaches `priceGbp`. The second condition is
 * not defensive padding: `value.min` is a bare "117.00" with no currency on
 * it, and the only place this record states a currency at all is the `£` in
 * `display.min`. Reading the number without reading that would be assuming
 * sterling, which is the one assumption this project's own currency
 * quarantine exists to stop.
 */
function unambiguousPrice(range: unknown): number | null {
  const value = prop(range, 'value');
  const display = prop(range, 'display');
  const min = str(prop(value, 'min'));
  const max = str(prop(value, 'max'));
  if (!min || !max || min !== max) return null;

  const displayMin = str(prop(display, 'min'));
  const displayMax = str(prop(display, 'max'));
  if (!displayMin?.startsWith('£') || !displayMax?.startsWith('£')) return null;

  const price = Number(min.replace(/,/g, ''));
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Whether this card can be bought.
 *
 * Two fields say it, and they are not redundant: `outOfStock` is about the
 * shelf and `isAvailableToOrder` is about whether an order can be placed at
 * all (a discontinued or in-store-only line is neither). Both must agree
 * before this reports true; either one alone saying no is enough to report
 * false. Null only when the record carries neither, which no observed record
 * has done.
 */
function stockOf(product: JohnLewisProduct): boolean | null {
  const out = product.outOfStock;
  const orderable = product.isAvailableToOrder;
  if (typeof out !== 'boolean' && typeof orderable !== 'boolean') return null;
  if (out === true || orderable === false) return false;
  return out === false || orderable === true;
}

/**
 * The title with the shop's own stated volume appended, where the title omits
 * it and the shop names exactly one.
 *
 * The same recovery `sizeFromUrl.ts` performs from a URL slug, from a better
 * source: `attributes[]` with `key: "volume"` is John Lewis stating the size
 * as structured data rather than leaving it in a slug to be pattern-matched
 * out. The conservatism is copied verbatim from that module and for the same
 * reasons — a title that already states a size always wins, and a product
 * naming two volumes ("50ml", "100ml") is a multi-variant card whose single
 * size is not a fact anybody holds. Such a card is also, necessarily, one
 * `unambiguousPrice` has already refused to price.
 */
function titleWithVolume(title: string, attributes: unknown): string {
  if (ML_SIZE_RE.test(title) || OZ_SIZE_RE.test(title)) return title;
  if (!Array.isArray(attributes)) return title;

  for (const attr of attributes) {
    if (str(prop(attr, 'key'))?.toLowerCase() !== 'volume') continue;
    const values = prop(attr, 'values');
    if (!Array.isArray(values) || values.length !== 1) return title;
    const volume = str(values[0]);
    return volume ? `${title} ${volume}` : title;
  }
  return title;
}

/**
 * A product or image URL we can store.
 *
 * John Lewis publishes both site-relative ("/chanel-…/p115419487") and
 * protocol-relative ("//media.johnlewiscontent.com/i/JohnLewis/115419468?")
 * addresses in the same record. Resolving against the page the markup was
 * served from is what a browser does with both, and is the same reasoning
 * `parseListings` records for its own `absolute()` — a stored site-relative
 * href resolves against pricesniffs.space and points a Buy button at our own
 * 404.
 */
function absolute(raw: string | null, pageUrl: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}
