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
    // A CollectionPage (Notino's category pages, confirmed 2026-08-27 against
    // data/render-capture/notino-uk/fragrance.html) lists its Products
    // straight under `mainEntity` as an array, with no ItemList wrapper at
    // all. Without this the whole page parsed as zero listings: the outer
    // node is a CollectionPage, which isProduct() rightly rejects, and
    // nothing ever looked inside it for the Products it was carrying.
    if (obj['mainEntity']) flatten(obj['mainEntity'], out);
    // A ProductGroup (THG's sites: Cult Beauty, LOOKFANTASTIC; seen
    // 2026-10-03 on cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml)
    // carries one Product per size under `hasVariant`, each with its own sku
    // and GBP offer but every one named with the page's own size ("Chloé Eau
    // de Parfum For Her 50ml" at £71, £98 and £135). Reading them all would
    // publish three prices for one bottle size. Only the variant whose sku is
    // the group's own productGroupID is the product the page and its name
    // describe; the other sizes have pages of their own in the sitemap.
    const variants = obj['hasVariant'];
    const groupId = obj['productGroupID'];
    const own =
      Array.isArray(variants) && groupId != null
        ? variants.find(
            (v) => v && typeof v === 'object' && String((v as JsonValue)['sku'] ?? '') === String(groupId),
          )
        : undefined;
    if (own) {
      flatten(own, out);
    } else if (Array.isArray(variants) && sizesOfTheirOwn(variants)) {
      // ── Every size, each with its own price (2026-10-03) ──────────────────
      // Space NK and Parfumdreams also publish a ProductGroup, but no variant's
      // sku is the group id: Space NK's Young Rose page is group MUK200031967
      // with variants UK200031967 "Byredo Young Rose Eau de Parfum 100ml" at
      // 225.00 GBP and UK200033403 "... 50ml" at 155.00 GBP; Parfumdreams'
      // Gucci Bloom page is group 122330 with skus 1087866 "... 30 ml" at
      // 54.95, 1087867 "... 50 ml" at 73.65 and so on. Unlike THG's variants
      // above, each of these names its own size, so each is a real listing of
      // its own and all of them are read. The group's brand, image,
      // description and rating are lent to a variant that carries none.
      for (const v of variants as JsonValue[]) {
        const lent: JsonValue = {};
        for (const key of ['brand', 'image', 'description', 'aggregateRating', 'url']) {
          if (v[key] == null && obj[key] != null) lent[key] = obj[key];
        }
        flatten({ ...lent, ...v }, out);
      }
    }
  }
  return out;
}

/**
 * The size each variant of a multi size page is for, by variant sku, read off
 * the page's size buttons: `<button data-sku="13319984" ... data-size="30ml">`.
 * THG's sites (Cult Beauty) put one of these on every size they sell.
 */
export function sizeButtons(html: string): Map<string, string> {
  const sizes = new Map<string, string>();
  for (const m of html.matchAll(/<button\b[^>]*?\bdata-sku="(\d+)"[^>]*?\bdata-size="([^"]{1,30})"/gi)) {
    if (!sizes.has(m[1]!)) sizes.set(m[1]!, m[2]!.trim());
  }
  return sizes;
}

/**
 * A ProductGroup whose variants are sizes of one fragrance that the markup
 * does not tell apart: every variant carries the group's own name, and none has
 * the group's productGroupID for its sku (Byredo Mojave Ghost Eau de Parfum
 * "various sizes", Frederic Malle Portrait of a Lady Eau de Parfum: three
 * variants, three prices, all named "Frederic Malle Portrait of a Lady Eau de
 * Parfum"). Read as they stand they are no listing at all, because the walk
 * cannot say which price is which size; and for a product the shop sells only
 * on a page of this shape that is the whole product missing.
 *
 * Where the page's size buttons give a size for every variant, each variant
 * takes it after the name ("... Eau de Parfum 30ml"), and each is then a
 * listing of its own with its own sku, price and stock. Nothing is guessed: a
 * group with any variant that has no size button, two variants with the same
 * size, a size the name already states, or a variant that is the group's own
 * product is left exactly as it was.
 */
function withVariantSizes(blocks: unknown[], html: string): unknown[] {
  const sizes = sizeButtons(html);
  if (sizes.size === 0) return blocks;
  const relabel = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(relabel);
    if (!node || typeof node !== 'object') return node;
    const obj = node as JsonValue;
    const out: JsonValue = { ...obj };
    if (out['@graph']) out['@graph'] = relabel(out['@graph']);
    const variants = obj['hasVariant'];
    const groupId = obj['productGroupID'];
    if (!Array.isArray(variants) || variants.length < 2 || groupId == null) return out;
    const nodes = variants.filter((v): v is JsonValue => Boolean(v) && typeof v === 'object' && !Array.isArray(v));
    if (nodes.length !== variants.length) return out;
    if (nodes.some((v) => String(v['sku'] ?? '') === String(groupId))) return out;
    const names = new Set(nodes.map((v) => str(v['name'])));
    if (names.size !== 1 || names.has(null)) return out;
    const labels = nodes.map((v) => sizes.get(String(v['sku'] ?? '')));
    if (labels.some((l) => !l) || new Set(labels).size !== nodes.length) return out;
    // The shop's own "(Various Sizes)" on such a page says what the page is,
    // not what the bottle is called; each variant now states its own size.
    const name = [...names][0]!.replace(/\s*[(\[]?\s*various sizes\s*[)\]]?/i, '').replace(/\s+/g, ' ').trim();
    const renamed = nodes.map((v, i) => {
      const label = labels[i]!;
      return name.toLowerCase().includes(label.toLowerCase()) ? { ...v, name } : { ...v, name: `${name} ${label}` };
    });
    // Variants still sharing a name (the name already states one size and the
    // others added theirs) are no better read than before.
    if (new Set(renamed.map((v) => str(v['name']))).size !== renamed.length) return out;
    out['hasVariant'] = renamed;
    return out;
  };
  return relabel(blocks) as unknown[];
}

/** The identity a node carries itself, never one read off a URL. */
function ownIdentity(node: JsonValue): string | null {
  return str(node['sku']) ?? str(node['mpn']) ?? gtin(node);
}

/**
 * True when a list of variants (or offers) can each stand as a listing of its
 * own: every one has a name and an identity of its own, and no two share
 * either. That is what separates Space NK's "...100ml" and "...50ml" from
 * THG's three variants all named "...50ml", where reading them all would
 * publish three prices for one bottle. Anything less and the caller keeps
 * its old behaviour.
 */
function sizesOfTheirOwn(items: unknown[]): boolean {
  const nodes = items.filter((v): v is JsonValue => Boolean(v) && typeof v === 'object' && !Array.isArray(v));
  if (nodes.length < 2 || nodes.length !== items.length) return false;
  const names = nodes.map((n) => str(n['name']));
  const ids = nodes.map(ownIdentity);
  if (names.some((n) => !n) || ids.some((i) => !i)) return false;
  return new Set(names).size === nodes.length && new Set(ids).size === nodes.length;
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

/**
 * Whether a schema.org availability value is the shop saying the bottle is a
 * pre-order: PreOrder, PreSale or BackOrder. These are the shop's explicit
 * words for "sold, but not shipping yet", and nothing else counts.
 */
export function isPreOrderAvailability(value: unknown): boolean {
  const s = str(value);
  if (!s) return false;
  const tail = s.split('/').pop()!.toLowerCase();
  return tail.includes('preorder') || tail.includes('presale') || tail.includes('backorder');
}

/**
 * Availability comes with and without the schema.org prefix, in any case.
 *
 * A pre-order is `false` here: it is not in stock today. This used to return
 * `true` for PreOrder, which is how a Pre-Order bottle came to be counted as
 * stock on every JSON-LD shop. `isPreOrderAvailability` is the separate
 * question that lets a caller say Preorder instead of Sold Out.
 */
export function parseAvailability(value: unknown): boolean | null {
  const s = str(value);
  if (!s) return null;
  const tail = s.split('/').pop()!.toLowerCase();
  if (isPreOrderAvailability(s)) return false;
  if (tail.includes('outofstock') || tail.includes('soldout') || tail.includes('discontinued')) {
    return false;
  }
  if (tail.includes('instock') || tail.includes('instoreonly')) {
    return true;
  }
  return null;
}

/** The listing fields a schema.org availability value sets: the flag, and Preorder where stated. */
function stockFields(value: unknown): Pick<RawListing, 'inStock'> & { availability?: 'preOrder' } {
  return {
    inStock: parseAvailability(value),
    ...(isPreOrderAvailability(value) ? { availability: 'preOrder' as const } : {}),
  };
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
  /**
   * Keep a price only where the page names sterling for it: the offer's own
   * `priceCurrency`, or failing that the page's `og:price:currency` /
   * `product:price:currency` meta. A price the page does not establish as
   * pounds is carried as `nativePrice` instead, never as `priceGbp`. Set by
   * the sitemap walk for shops whose route asks for it (`requireGbp` on
   * `SitemapRoute`).
   */
  requireGbp?: boolean;
  /**
   * Also read schema.org microdata (`itemscope`/`itemprop`) when the page has
   * no JSON-LD Product. Off unless asked for: it is set only for shops with a
   * pinned sitemap route, so no other shop's output changes.
   */
  microdata?: boolean;
  /**
   * Read the size of each variant of a ProductGroup off the page's size
   * buttons, where the group's variants all carry one name and none of them is
   * the page's own product: see `withVariantSizes`. Set by the sitemap walk for
   * a route that asks for it (`variantSizesFromPage` on `SitemapRoute`).
   */
  variantSizesFromPage?: boolean;
  /**
   * Read every size a product page offers, where each offer has a name and an
   * address of its own: see `offersWithOwnAddress`. Set only by the import of
   * pages the owner saved (src/catalogue/importPages.ts), so no crawled shop's
   * output changes.
   */
  everyOffer?: boolean;
}

/**
 * A currency code as published, normalised. "£" is sterling's symbol and is
 * read as GBP; anything else is upper-cased and trimmed, and an empty value is
 * null ("not stated"), never assumed.
 */
function currencyCode(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  if (s === '£') return 'GBP';
  return s.toUpperCase();
}

/** The currency an offer names for its own price, if it names one. */
function offerCurrency(offer: JsonValue | null): string | null {
  if (!offer) return null;
  const direct = currencyCode(offer['priceCurrency']);
  if (direct) return direct;
  for (const spec of flatten(offer['priceSpecification'])) {
    const c = currencyCode(spec['priceCurrency']);
    if (c) return c;
  }
  return null;
}

/** `og:price:currency` or `product:price:currency`, where a page carries one. */
export function pageCurrency(html: string): string | null {
  const m =
    /<meta[^>]+property=["'](?:og|product):price:currency["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["'](?:og|product):price:currency["']/i.exec(html);
  return m ? currencyCode(m[1]) : null;
}

/**
 * Parse every Product on a page into listings.
 *
 * Category pages yield many, a product page usually one. Returns an empty array
 * when the page carries no usable Product, which is the signal that this
 * retailer needs a different adapter.
 */
export function parseListings(html: string, options: ParseOptions): RawListing[] {
  const blocks = extractJsonLdBlocks(html);
  let nodes = (options.variantSizesFromPage ? withVariantSizes(blocks, html) : blocks).flatMap((b) => flatten(b));
  if (options.microdata && !nodes.some(isProduct)) {
    // A microdata product with no identifier of its own falls back to its
    // address. One shop's are all /shop/products/view.asp?brand=...&name=...,
    // whose last path segment is "view.asp" for every product, so there the
    // query string is the identity, not the script name.
    const queryId = queryIdentity(options.pageUrl);
    nodes = extractMicrodataProducts(html).map((n) =>
      queryId && !ownIdentity(n) && !str(n['url']) ? { ...n, sku: queryId } : n,
    ).flatMap((b) => flatten(b));
  }
  const listings: RawListing[] = [];
  const seen = new Set<string>();
  const metaCurrency = options.requireGbp ? pageCurrency(html) : null;

  /**
   * The sterling price of one offer, or the reason there is none.
   *
   * A price whose own offer names a currency other than GBP is never stored
   * as pounds, for any shop: that is a page telling us in so many words that
   * the figure is something else (a Shopify storefront showing a US runner
   * dollars says `"priceCurrency": "USD"`). For a shop whose route sets
   * `requireGbp`, silence is not enough either: the page must name GBP, on
   * the offer or in its price meta.
   */
  const sterling = (
    price: number | null,
    offer: JsonValue | null,
  ): { priceGbp: number | null; nativePrice?: { amount: number; currency: string } } => {
    if (price === null) return { priceGbp: null };
    const named = offerCurrency(offer) ?? metaCurrency;
    if (named === 'GBP') return { priceGbp: price };
    if (named !== null) return { priceGbp: null, nativePrice: { amount: price, currency: named } };
    if (options.requireGbp) return { priceGbp: null, nativePrice: { amount: price, currency: 'unknown' } };
    return { priceGbp: price };
  };

  for (const node of nodes) {
    if (!isProduct(node)) continue;
    // A ProductGroup is the wrapper, not a product: it has no offer of its
    // own, and on a real page its sku (read from the page URL) is its own
    // variant's, so letting it through would claim that sku with no price
    // and push the real variant out as a duplicate. flatten() hands on the
    // one variant the page describes.
    if (String(node['@type']).toLowerCase() === 'productgroup') continue;

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

    // ── Several sizes as several offers (2026-10-03) ─────────────────────────
    // A Product whose offers are one per size, each with its own name and
    // identity, and none of them this node's own sku: selectOffer cannot pick
    // one, and used to leave the whole product unpriced. Where every offer
    // names itself distinctly (the same test the ProductGroup variants pass),
    // each is a listing of its own. The same goes for an AggregateOffer that
    // carries its per-size offers inside it. Anything less keeps the old
    // behaviour exactly.
    const ownAddress = options.everyOffer ? offersWithOwnAddress(node, options.pageUrl) : null;
    const perSize = ownAddress ?? offersOfTheirOwn(node, sku);
    if (perSize) {
      for (const o of perSize) {
        const oSku = ownAddress ? skuFromUrl(absolute(str(o['url']), options.pageUrl))! : ownIdentity(o)!;
        if (seen.has(oSku)) continue;
        seen.add(oSku);
        const oPrice = parsePrice(o['price']) ?? parsePrice((o['priceSpecification'] as JsonValue)?.['price']);
        const money = sterling(oPrice, o);
        const oListed = listPrice(o);
        listings.push({
          retailerSku: oSku,
          url: absolute(str(o['url']), url),
          rawTitle: str(o['name'])!,
          rawBrand: brandName(node),
          ean: gtin(o),
          imageUrl: imageUrl(o) ?? imageUrl(node),
          // A saved product page's own category ("eau de parfum for men" on
          // Notino) says what the bottle is, in the words its list pages use
          // as their description; the marketing copy is the fallback.
          description: ownAddress ? (str(node['category']) ?? description(node)) : description(node),
          priceGbp: money.priceGbp,
          wasPriceGbp:
            oListed !== null && money.priceGbp !== null && oListed > money.priceGbp ? oListed : null,
          promoEndsAt: isoDate(o['priceValidUntil']),
          ...stockFields(o['availability']),
          sectionId: options.sectionId,
          rating: aggregateRating(node),
          ...(money.nativePrice ? { nativePrice: money.nativePrice } : {}),
        });
      }
      continue;
    }

    const offer = selectOffer(node, sku);

    const price =
      parsePrice(offer?.['price']) ??
      parsePrice(offer?.['lowPrice']) ??
      parsePrice((offer?.['priceSpecification'] as JsonValue)?.['price']);
    const money = sterling(price, offer);

    // A reference price only counts when the retailer published one and it sits
    // above what they are charging. Anything else is a stale RRP.
    const listed = listPrice(offer);
    const wasPriceGbp =
      listed !== null && money.priceGbp !== null && listed > money.priceGbp ? listed : null;

    listings.push({
      retailerSku: sku,
      url,
      rawTitle: title,
      rawBrand: brandName(node),
      ean: gtin(node),
      imageUrl: imageUrl(node),
      description: description(node),
      priceGbp: money.priceGbp,
      wasPriceGbp,
      promoEndsAt: isoDate(offer?.['priceValidUntil']),
      ...stockFields(offer?.['availability']),
      sectionId: options.sectionId,
      rating: aggregateRating(node),
      ...(money.nativePrice ? { nativePrice: money.nativePrice } : {}),
    });
  }

  return listings;
}

/**
 * A product's offers, when they are one per size and each names itself — see
 * the "several sizes as several offers" note in parseListings. Null whenever
 * the ordinary single-offer path should run instead, including the case where
 * one offer is this product's own (selectOffer handles that one already).
 */
function offersOfTheirOwn(node: JsonValue, sku: string): JsonValue[] | null {
  let offers = flatten(node['offers']);
  if (offers.length === 1 && offers[0]!['offers'] != null) {
    offers = flatten(offers[0]!['offers']);
  }
  if (offers.length < 2) return null;
  if (offers.some((o) => offerIdentity(o) === sku)) return null;
  if (sizesOfTheirOwn(offers)) return offers;
  return namedBySizeList(node, offers);
}

/**
 * A product page's offers when each is a size with an address of its own:
 * Notino's product page lists "Armani Emporio Stronger With You Intensely
 * 150 ml" at /armani/.../p-16286591/ and the 50 ml at /armani/.../p-15802387/,
 * one offer each, and the Product's own sku is one of them, so neither
 * selectOffer nor offersOfTheirOwn reads more than that one size.
 *
 * The same page lists a size twice when a discount code applies: once at the
 * shelf price, once at the code's price with a `priceValidUntil`. A visitor
 * pays the shelf price unless they find the code, so the shelf price is the
 * one kept. Two offers for one address that cannot be told apart that way
 * make the page unreadable here, and the ordinary path runs instead.
 *
 * The Product's own barcode is not given to any of them: on the Armani page
 * its sku is the 100 ml's but its gtin13 is the 150 ml's.
 *
 * Every offer must have a name and an address, and after that clean-up no two
 * may share either; an address must not be the saved page itself, since an
 * offer for the page it sits on is not a size of its own.
 */
function offersWithOwnAddress(node: JsonValue, productUrl: string): JsonValue[] | null {
  const offers = flatten(node['offers']);
  if (offers.length < 2) return null;
  const byAddress = new Map<string, JsonValue>();
  for (const o of offers) {
    const raw = str(o['url']);
    const address = raw ? absolute(raw, productUrl) : null;
    if (!address || !str(o['name']) || address === productUrl || !skuFromUrl(address)) return null;
    const held = byAddress.get(address);
    if (!held) {
      byAddress.set(address, o);
      continue;
    }
    const heldIsCode = o['priceValidUntil'] == null && held['priceValidUntil'] != null;
    const thisIsCode = o['priceValidUntil'] != null && held['priceValidUntil'] == null;
    if (heldIsCode) byAddress.set(address, o);
    else if (!thisIsCode) return null;
  }
  const kept = [...byAddress.values()];
  if (kept.length < 2) return null;
  const names = kept.map((o) => str(o['name']));
  const skus = [...byAddress.keys()].map(skuFromUrl);
  if (new Set(names).size !== kept.length || new Set(skus).size !== kept.length) return null;
  return kept;
}

/** A size such as "50ml" or "7.5 ml" in millilitres, or null. */
function millilitres(size: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*ml\s*$/i.exec(size);
  return m ? Number.parseFloat(m[1]!) : null;
}

/**
 * John Lewis's shape: one Product, its offers one per size with a sku and a
 * gtin each but no name, and the sizes as a list on the Product itself, in
 * the same order. "Aesop Marrakech Intense Eau de Parfum" lists `"size":
 * ["50ml","100ml"]` and offers 239826498 at 150.00 GBP and 112363992 at
 * 196.00 GBP; the same page names sku 239826498 "Aesop Marrakech Intense Eau
 * de Parfum, 50ml". Checked the same way on four more of its pages on
 * 2026-10-03 (Ralph Lauren, Byredo, Acqua di Parma, Carolina Herrera's four
 * sizes from 30ml at 67.00 to 150ml at 166.00): the order always matched.
 *
 * Read only when the lists are the same length, the sizes are distinct, every
 * offer has an identity of its own, and the prices never fall as the bottle
 * grows: a list that is out of step with its offers would show up as a larger
 * bottle priced below a smaller one, and then nothing is read rather than a
 * size attached to the wrong price.
 */
function namedBySizeList(node: JsonValue, offers: JsonValue[]): JsonValue[] | null {
  const sizes = node['size'];
  const name = str(node['name']);
  if (!name || !Array.isArray(sizes) || sizes.length !== offers.length) return null;
  const labels = sizes.map(str);
  if (labels.some((l) => !l) || new Set(labels).size !== labels.length) return null;
  const ids = offers.map(ownIdentity);
  if (ids.some((i) => !i) || new Set(ids).size !== ids.length) return null;

  const ml = labels.map((l) => millilitres(l!));
  if (ml.some((v) => v === null)) return null;
  const prices = offers.map((o) => parsePrice(o['price']));
  if (prices.some((p) => p === null)) return null;
  const order = ml.map((_, i) => i).sort((a, b) => ml[a]! - ml[b]!);
  for (let k = 1; k < order.length; k++) {
    if (prices[order[k]!]! < prices[order[k - 1]!]!) return null;
  }
  return offers.map((o, i) => ({ ...o, name: `${name} ${labels[i]}` }));
}

/** HTML entities a microdata text value commonly carries. */
function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€',
  };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return named[body.toLowerCase()] ?? whole;
  });
}

/** Elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

interface MicroItem {
  type: string;
  props: Map<string, (string | MicroItem)[]>;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  if (!m) return new RegExp(`(?:^|\\s)${name}(?:\\s|$|/)`, 'i').test(attrs) ? '' : null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

/**
 * schema.org microdata, read into the same node shape JSON-LD gives, so one
 * parser decides what a listing is whichever way a page marks it up.
 *
 * Added 2026-10-03 for two shops whose product pages carry microdata and no
 * JSON-LD at all: the first (`<div itemscope itemtype=".../Product">` with
 * `itemprop="name"`, `"brand"`, an Offer holding `itemprop="priceCurrency"
 * content="GBP"` and `itemprop="price"` 195.00) and Niche Beauty (the same
 * shape, its price in a `content` attribute). A small tag scanner rather than
 * an HTML parser, because this repo has none and needs only this: which
 * itemprop belongs to which itemscope, and each one's value (its `content`,
 * `href` or `src` attribute where the element carries one, else its text).
 * `<a itemprop="brand">` is read by its text, not its href, since a brand is a
 * name.
 */
export function extractMicrodataProducts(html: string): JsonValue[] {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  const elements: string[] = [];
  const scopes: { item: MicroItem; depth: number }[] = [];
  const captures: { item: MicroItem; prop: string; depth: number; text: string }[] = [];
  const top: MicroItem[] = [];
  let last = 0;

  const add = (item: MicroItem, prop: string, value: string | MicroItem) => {
    for (const p of prop.split(/\s+/).filter(Boolean)) {
      const list = item.props.get(p) ?? [];
      list.push(value);
      item.props.set(p, list);
    }
  };
  const closeTo = (depth: number) => {
    for (let i = captures.length - 1; i >= 0; i--) {
      const c = captures[i]!;
      if (c.depth >= depth) {
        add(c.item, c.prop, decodeEntities(c.text).replace(/\s+/g, ' ').trim());
        captures.splice(i, 1);
      }
    }
    while (scopes.length && scopes[scopes.length - 1]!.depth >= depth) scopes.pop();
  };

  for (const m of body.matchAll(tagRe)) {
    const text = body.slice(last, m.index);
    last = m.index! + m[0].length;
    if (captures.length && text) for (const c of captures) c.text += text;

    const closing = m[1] === '/';
    const name = m[2]!.toLowerCase();
    const attrs = m[3] ?? '';

    if (closing) {
      const at = elements.lastIndexOf(name);
      if (at === -1) continue;
      closeTo(at);
      elements.length = at;
      continue;
    }

    const selfClosing = VOID_ELEMENTS.has(name) || /\/\s*$/.test(attrs);
    const depth = elements.length;
    const prop = attr(attrs, 'itemprop');
    const scoped = attr(attrs, 'itemscope') !== null;
    const parent = scopes.length ? scopes[scopes.length - 1]!.item : null;

    if (scoped) {
      const item: MicroItem = { type: attr(attrs, 'itemtype') ?? '', props: new Map() };
      if (prop && parent) add(parent, prop, item);
      else top.push(item);
      if (!selfClosing) scopes.push({ item, depth });
    } else if (prop && parent) {
      const content = attr(attrs, 'content');
      const href = attr(attrs, 'href');
      const src = attr(attrs, 'src');
      const byText = name === 'a' && !/^(url|image)$/i.test(prop);
      const value = content ?? (byText ? null : (href ?? src ?? attr(attrs, 'datetime')));
      if (value !== null) add(parent, prop, value);
      else if (!selfClosing) captures.push({ item: parent, prop, depth, text: '' });
      // A price held in `content` is usually also printed inside the same
      // element ("£ 155.00"). That printed symbol is the page's own statement
      // of this price's currency, kept for toNode below.
      if (value !== null && /^price$/i.test(prop) && !selfClosing) {
        captures.push({ item: parent, prop: 'priceText', depth, text: '' });
      }
    }
    if (!selfClosing) elements.push(name);
  }
  closeTo(0);

  const all: MicroItem[] = [];
  const walk = (item: MicroItem) => {
    all.push(item);
    for (const values of item.props.values()) for (const v of values) if (typeof v !== 'string') walk(v);
  };
  top.forEach(walk);

  return all.filter((i) => /schema\.org\/Product$/i.test(i.type)).map(toNode);
}

/** A microdata item as the JSON-LD node it describes. */
function toNode(item: MicroItem): JsonValue {
  const node: JsonValue = { '@type': item.type.split('/').pop() ?? '' };
  const printed = item.props.get('priceText')?.[0];
  if (!item.props.has('priceCurrency') && typeof printed === 'string') {
    // Only a symbol printed directly before the figure counts, and only these
    // three, whose meaning is not in doubt.
    const symbol = /^\s*([£$€])\s*\d/.exec(printed)?.[1];
    const code = symbol === '£' ? 'GBP' : symbol === '€' ? 'EUR' : symbol === '$' ? 'USD' : null;
    if (code) node['priceCurrency'] = code;
  }
  for (const [key, values] of item.props) {
    if (key === 'priceText') continue;
    const first = values[0]!;
    if (typeof first === 'string') {
      node[key] = first;
    } else if (key === 'offers') {
      node[key] = values.filter((v): v is MicroItem => typeof v !== 'string').map(toNode);
    } else {
      node[key] = toNode(first);
    }
  }
  return node;
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

/** A URL's last path segment plus its query, when it has one; else null. */
function queryIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.search) return null;
    const seg = u.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    return decodeURIComponent(`${seg}${u.search}`);
  } catch {
    return null;
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
