import type { RawListing } from './types.js';
import type { ShopifyVariantRule } from '../types/retailer.js';

/**
 * Read a Shopify storefront's catalogue without an API, a key or a browser.
 *
 * ── Why this route exists ────────────────────────────────────────────────────
 * The Middle Eastern houses (Rasasi, Afnan, Armaf, French Avenue, Al Haramain
 * and friends) mostly sell direct rather than through the UK retailers this
 * project already walks, so nothing in the sitemap harvest reaches them. Asking
 * each house for API access is not a route we control the timing of, and the
 * brief was explicitly to find a way in that does not depend on one.
 *
 * Shopify is that way in. Every Shopify storefront serves `/products.json` to
 * anonymous visitors — no key, no OAuth, no headless browser. It is the same
 * catalogue the shop renders from, already structured, and it carries the
 * product photography as CDN URLs. Where a house is on Shopify (a large share
 * of this segment is) this yields a complete, clean catalogue in a handful of
 * requests instead of a page fetch per product.
 *
 * It is a published part of a storefront, served to anyone who asks and linked
 * from Shopify's own docs. `robots.txt` is still honoured before it is called —
 * that check lives in the caller, exactly as it does for the sitemap walk.
 *
 * ── What it deliberately does not give us ────────────────────────────────────
 * Two fields the sitemap route gets from JSON-LD are simply absent here, and
 * both are left null rather than reconstructed:
 *
 *   - **Barcode/EAN.** Shopify exposes `barcode` only through the authenticated
 *     Admin API. Without it these listings cannot be grouped with a UK
 *     retailer's copy of the same bottle, so each stands alone. That is the
 *     honest outcome: claiming two titles are the same product without an
 *     identifier is exactly the guess the catalogue builder refuses to make.
 *     A shop whose products' own `/products/<handle>.js` files carry the
 *     barcode has it read from there instead (`Retailer.barcodeFromProductJs`,
 *     src/catalogue/barcodeFromProductJs.ts: Perfume Direct, 2026-10-05, where
 *     this feed has none and the file has one for every variant).
 *   - **Currency.** `/products.json` gives a bare `price` string with no
 *     currency anywhere in the payload. A house pricing in AED or USD would
 *     otherwise land in the app as though those were pounds, which is the one
 *     class of error this project must never commit — so the currency is
 *     resolved separately and a non-sterling price is carried as
 *     `nativePrice` with `priceGbp` left null, never converted at a rate we
 *     made up.
 */

interface JsonValue {
  [key: string]: unknown;
}

/** A Shopify variant, once we have checked it looks like one. */
interface Variant {
  /** Shopify's own id for the variant (a number in the payload, kept as text). */
  id: string | null;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  available: boolean | null;
  title: string | null;
  /** option1 to option3, in the product's own option order. */
  optionValues: (string | null)[];
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

/** Shopify writes money as a decimal string: "295.00". */
function money(value: unknown): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The shop's currency, which `/products.json` does not carry.
 *
 * Checked against the two places a Shopify storefront actually publishes it:
 * the `/meta.json` document, and the `Shopify.currency` object the theme
 * inlines into every page. Returns null when neither is present, and null must
 * be treated as "unknown", never as "probably sterling".
 */
export function parseShopCurrency(metaJson: string | null, homepageHtml: string | null): string | null {
  if (metaJson) {
    try {
      const meta = JSON.parse(metaJson) as JsonValue;
      const code = str(meta['currency']);
      if (code && /^[A-Z]{3}$/i.test(code)) return code.toUpperCase();
    } catch {
      // A shop that does not serve meta.json serves an HTML 404 here. Fall
      // through to the theme rather than treating it as a hard failure.
    }
  }

  if (homepageHtml) {
    const inline = homepageHtml.match(/Shopify\.currency\s*=\s*(\{[^}]*\})/i);
    if (inline?.[1]) {
      const active = inline[1].match(/"active"\s*:\s*"([A-Z]{3})"/i);
      if (active?.[1]) return active[1].toUpperCase();
    }
    const bare = homepageHtml.match(/["']currency["']\s*:\s*["']([A-Z]{3})["']/);
    if (bare?.[1]) return bare[1].toUpperCase();
  }

  return null;
}

/** Whether a payload is actually a Shopify products document. */
export function isShopifyProductsPayload(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as JsonValue;
    return Array.isArray(parsed['products']);
  } catch {
    return false;
  }
}

/**
 * How many products a `/products.json` page carried, priced or not.
 *
 * The walk's end has to be read off this, not off the listings parsed from
 * the page: a page whose every variant is unpriced parses to no listings and
 * is still not the end of the catalogue. Zero for anything that is not a
 * products payload.
 */
export function shopifyProductCount(body: string): number {
  try {
    const parsed = JSON.parse(body) as JsonValue;
    const products = parsed['products'];
    return Array.isArray(products) ? products.length : 0;
  } catch {
    return 0;
  }
}

function variantsOf(product: JsonValue): Variant[] {
  const raw = product['variants'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is JsonValue => Boolean(v) && typeof v === 'object')
    .map((v) => ({
      id: str(v['id']),
      sku: str(v['sku']),
      price: money(v['price']),
      compareAtPrice: money(v['compare_at_price']),
      available: typeof v['available'] === 'boolean' ? v['available'] : null,
      title: str(v['title']),
      optionValues: [str(v['option1']), str(v['option2']), str(v['option3'])],
    }));
}

/** The product's option names, in order ("Package", "Concentration", "Info"). */
function optionNamesOf(product: JsonValue): string[] {
  const raw = product['options'];
  if (!Array.isArray(raw)) return [];
  return raw.map((o) =>
    o && typeof o === 'object' ? (str((o as JsonValue)['name']) ?? '') : '',
  );
}

/**
 * The value Shopify gives the one variant of a product that has no options
 * ("Default Title"), and the "0" a department store's feed (Fenwick) puts in a
 * Colour option it does not use. Neither says anything about the bottle, so
 * neither goes into a title built from option values.
 */
const PLACEHOLDER_OPTION_VALUE = /^(?:default title|0)$/i;

/** One size, in plain millilitres: "50 ml", "7.5ml", "50  ml". Nothing else. */
const PLAIN_ML = /^(\d+(?:\.\d+)?)\s*ml$/i;

/**
 * Whether a product passes a retailer's variant rule at product level: its
 * type, and that it has the options the rule's other tests will read.
 */
export function productPassesVariantRule(product: JsonValue, rule: ShopifyVariantRule): boolean {
  if (rule.productTypes) {
    const type = (str(product['product_type']) ?? '').toLowerCase();
    if (!rule.productTypes.some((t) => t.toLowerCase() === type)) return false;
  }
  if (rule.excludeTitle && new RegExp(rule.excludeTitle, 'i').test(str(product['title']) ?? '')) return false;
  const names = optionNamesOf(product).map((n) => n.toLowerCase());
  if (rule.requiredOptions && !rule.requiredOptions.every((r) => names.includes(r.toLowerCase()))) return false;
  if (rule.marketOption && !names.includes(rule.marketOption.name.toLowerCase())) return false;
  if (rule.sizeOption && !names.includes(rule.sizeOption.name.toLowerCase())) return false;
  return true;
}

/**
 * Whether one variant is an ordinary UK retail bottle under a rule, given
 * a product that already passed `productPassesVariantRule`.
 */
export function variantPassesVariantRule(
  names: readonly string[],
  optionValues: readonly (string | null)[],
  rule: ShopifyVariantRule,
): boolean {
  const lower = names.map((n) => n.toLowerCase());
  if (rule.marketOption) {
    const at = lower.indexOf(rule.marketOption.name.toLowerCase());
    const value = (optionValues[at] ?? '').trim().toLowerCase();
    if (!rule.marketOption.keep.some((k) => k.toLowerCase() === value)) return false;
  }
  if (rule.minVariantMl !== undefined) {
    const named = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(optionValues.filter((v): v is string => v !== null).join(' '));
    if (named && Number.parseFloat(named[1]!) < rule.minVariantMl) return false;
  }
  if (rule.sizeOption) {
    const at = lower.indexOf(rule.sizeOption.name.toLowerCase());
    const m = PLAIN_ML.exec((optionValues[at] ?? '').trim());
    if (!m || Number.parseFloat(m[1]!) < rule.sizeOption.minMl) return false;
  }
  return true;
}

/**
 * The photo for a variant, preferring the product's own first image.
 *
 * These are the house's own CDN URLs, linked rather than copied — the same
 * arrangement every other image in this project runs on (see demo/photo.ts):
 * nothing is downloaded or rehosted here.
 */
function imageOf(product: JsonValue): string | null {
  const images = product['images'];
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (img && typeof img === 'object') {
      const src = str((img as JsonValue)['src']);
      if (src) return src;
    }
  }
  return null;
}

/**
 * Shopify's `body_html` is marketing copy wrapped in tags. The note parser
 * downstream reads plain prose, so the tags come off here. Entities are
 * decoded for the handful that actually appear in product copy.
 */
function plainText(html: unknown): string | null {
  const s = str(html);
  if (!s) return null;
  const text = s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text || null;
}

/**
 * A bracket holding nothing but sizes: "(30ml, 50ml, 100ml)", "(100ml)", and the
 * shop's own slips, "(30m, 50ml)" and "(15ml 30ml, 50ml)". It may end with the
 * name of a pack the shop lists beside the sizes, "(30ml, 60ml, 90ml Refillable
 * Talisman)" and "(30ml, 50ml, 100ml, Refill)": the words say nothing about the
 * row's own size, which is the one after the bracket.
 */
const SIZE_LIST = /\(\s*\d+(?:\.\d+)?\s*ml?(?:(?:\s*,\s*|\s+)\d+(?:\.\d+)?\s*ml?)*(?:(?:\s*,\s*|\s+)(?:refillable\s+talisman|refill))?\s*\)/i;

/**
 * The same list with its closing bracket missing, which the shop does on a few
 * titles: "(30ml, 50ml, 80ml 30ml". Only at the very end of the title, so the
 * last number is the row's own size.
 */
const UNCLOSED_SIZE_LIST = /\(\s*\d+(?:\.\d+)?\s*ml(?:\s*,\s*\d+(?:\.\d+)?\s*ml)+\s+(\d+(?:\.\d+)?)\s*ml\s*$/i;

/**
 * A product title that lists every size its page sells, with the variant's own
 * size after it: "Bvlgari Splendida Eau de Parfum Spray (30ml, 50ml, 100ml)
 * 50ml". Perfume Direct titles a product that way, one Shopify product with a
 * variant per size, and this parser appends the variant's name to the title.
 *
 * The catalogue reads a title's size as its first number, so all three rows
 * read 30ml: the 50ml bottle at 59.99 and the 100ml at 89.99 were published as
 * 30ml prices, in a product of their own named "(, )" because the list is
 * stripped from a name, apart from the 50ml and 100ml pages they belong on.
 * Measured 2026-10-04 on data/catalogue/perfume-direct.json: 2,166 rows have
 * this shape and 1,355 of them (on 841 product pages) read a size that is not
 * their own. No other shop's title has it.
 *
 * The size is the variant's: Shopify's own name for the row, "50ml", beside the
 * price that same variant carries (read against the live pages of ten products
 * on 2026-10-04: every variant's size and price matched the stored row). So the
 * list is replaced by that one size, in the same brackets a single size product
 * of this shop already wears ("Jennifer Lopez Live Luxe ... (100ml) 100ml"), and
 * the rest of the title is untouched ("10ml Splash" keeps its Splash).
 *
 * The variant's size need not be in the list. A title's list is the shop's
 * summary and is not kept in step: Azzaro Chrome Legend's reads "(75ml, 125ml)"
 * and has a 100ml variant at 29.99 of its own. Only a variant that names no size
 * (a title with the list and nothing after it) is left as it was, which is
 * nothing this function can read.
 *
 * Idempotent, so it is safe to run again over a title it has already made.
 */
export function ownSizeTitle(title: string): string {
  const unclosed = UNCLOSED_SIZE_LIST.exec(title);
  if (unclosed) return `${title.slice(0, unclosed.index)}(${unclosed[1]}ml) ${unclosed[1]}ml`;
  const list = SIZE_LIST.exec(title);
  if (!list) return title;
  const tail = title.slice(list.index + list[0].length);
  const own = /^\s+(\d+(?:\.\d+)?)\s*ml\b/i.exec(tail);
  if (!own) return title;
  // One size listed and it is the row's own: already what this function makes.
  const listed = list[0].match(/\d+(?:\.\d+)?/g) ?? [];
  if (listed.length === 1 && Number.parseFloat(listed[0]!) === Number.parseFloat(own[1]!)) return title;
  return `${title.slice(0, list.index)}(${own[1]}ml)${tail}`;
}

export interface ShopifyParseOptions {
  /** Storefront origin, e.g. `https://www.rasasi.com`, for building product URLs. */
  origin: string;
  /** Section recorded on each listing. */
  sectionId: string;
  /**
   * The storefront's currency, as resolved by `parseShopCurrency`.
   *
   * `null` means we could not establish it. Anything other than GBP — including
   * null — leaves `priceGbp` null and puts the figure in `nativePrice` instead,
   * because a number shown as sterling that is not sterling is worse than no
   * number at all.
   */
  currency: string | null;
  /**
   * Which variants are the shop's ordinary UK retail bottles, for a shop whose
   * variants are not all that. Unset reads every variant, as before.
   */
  variantRule?: ShopifyVariantRule;
  /**
   * Put Shopify's own variant id on each listing (`shopVariantId`), for a shop
   * whose barcodes are read from each product's own file and tied to the
   * variant they were read for (`Retailer.barcodeFromProductJs`). Off, the
   * listing carries no such field, so no other shop's stored rows change.
   */
  keepVariantId?: boolean;
}

/**
 * Turn a `/products.json` payload into listings.
 *
 * One listing per variant, because a house's 50ml and 100ml of the same scent
 * are different things to buy at different prices, and the catalogue keys on
 * size. Variants without a price are dropped: an unbuyable row is not an offer.
 */
export function parseShopifyProducts(body: string, options: ShopifyParseOptions): RawListing[] {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(body) as JsonValue;
  } catch {
    return [];
  }

  const products = parsed['products'];
  if (!Array.isArray(products)) return [];

  const isGbp = options.currency === 'GBP';
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue;
    const product = raw as JsonValue;

    const title = str(product['title']);
    const handle = str(product['handle']);
    if (!title || !handle) continue;
    const rule = options.variantRule;
    if (rule && !productPassesVariantRule(product, rule)) continue;
    const optionNames = rule ? optionNamesOf(product) : [];

    const productId = str(product['id']);
    const vendor = str(product['vendor']);
    const image = imageOf(product);
    const description = plainText(product['body_html']);
    const productType = str(product['product_type']);
    const url = `${options.origin.replace(/\/+$/, '')}/products/${handle}`;

    for (const variant of variantsOf(product)) {
      if (variant.price === null) continue;
      if (rule && !variantPassesVariantRule(optionNames, variant.optionValues, rule)) continue;

      // A house that leaves SKU blank still needs a stable key, and the
      // variant title is what distinguishes 50ml from 100ml on the same handle.
      const sku = variant.sku ?? `${productId ?? handle}-${variant.title ?? 'default'}`;
      if (seen.has(sku)) continue;
      seen.add(sku);

      // The size lives on the variant ("100ml"), the name on the product, and
      // the catalogue's fragrance test needs to see both in one string.
      // Under a rule the market option is not part of the name: "50 ml /
      // Extrait de Parfum / ol" reads "50 ml Extrait de Parfum", so the
      // shop's own code for the price list never reaches a shopper.
      const ruleTitle = rule
        ? optionNames
            .map((name, i) =>
              rule.marketOption && name.toLowerCase() === rule.marketOption.name.toLowerCase()
                ? null
                : (variant.optionValues[i] ?? null),
            )
            .filter((v): v is string => v !== null)
            .map((v) => v.replace(/\s+/g, ' ').trim())
            .filter((v) => !PLACEHOLDER_OPTION_VALUE.test(v))
            .join(' ')
        : null;
      // Under a rule the options are the name, and a product whose options were all
      // placeholders keeps its plain title rather than falling back to the variant's.
      const variantTitle = ruleTitle
        ? `${title} ${ruleTitle}`
        : rule
          ? title
          : variant.title && !/^default/i.test(variant.title)
            ? `${title} ${variant.title}`
            : title;

      // A product whose title lists its sizes names each variant by its own
      // (see ownSizeTitle): without it every row reads the first size listed.
      const sizedTitle = ownSizeTitle(variantTitle);

      const wasPrice =
        variant.compareAtPrice !== null && variant.compareAtPrice > variant.price
          ? variant.compareAtPrice
          : null;

      listings.push({
        retailerSku: sku,
        url,
        rawTitle: sizedTitle,
        rawBrand: vendor,
        // Not in /products.json, which has no barcode for any variant (Perfume
        // Direct, read 2026-10-05; the header comment says why Shopify keeps it
        // out). A shop whose product files carry one has it read from there:
        // see src/catalogue/barcodeFromProductJs.ts.
        ean: null,
        ...(options.keepVariantId ? { shopVariantId: variant.id } : {}),
        imageUrl: image,
        priceGbp: isGbp ? variant.price : null,
        wasPriceGbp: isGbp ? wasPrice : null,
        promoEndsAt: null,
        inStock: variant.available,
        sectionId: options.sectionId,
        description,
        productType,
        nativePrice: isGbp
          ? null
          : { amount: variant.price, currency: options.currency ?? 'unknown' },
        // The same shop's compare at price in the same (non sterling) currency,
        // kept as published for the region crawl; absent for a sterling shop.
        ...(!isGbp && wasPrice !== null ? { nativeWasPrice: wasPrice } : {}),
      });
    }
  }

  return listings;
}
