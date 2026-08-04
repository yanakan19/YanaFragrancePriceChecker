import type { RawListing } from './types.js';

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
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  available: boolean | null;
  title: string | null;
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

function variantsOf(product: JsonValue): Variant[] {
  const raw = product['variants'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is JsonValue => Boolean(v) && typeof v === 'object')
    .map((v) => ({
      sku: str(v['sku']),
      price: money(v['price']),
      compareAtPrice: money(v['compare_at_price']),
      available: typeof v['available'] === 'boolean' ? v['available'] : null,
      title: str(v['title']),
    }));
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

    const productId = str(product['id']);
    const vendor = str(product['vendor']);
    const image = imageOf(product);
    const description = plainText(product['body_html']);
    const url = `${options.origin.replace(/\/+$/, '')}/products/${handle}`;

    for (const variant of variantsOf(product)) {
      if (variant.price === null) continue;

      // A house that leaves SKU blank still needs a stable key, and the
      // variant title is what distinguishes 50ml from 100ml on the same handle.
      const sku = variant.sku ?? `${productId ?? handle}-${variant.title ?? 'default'}`;
      if (seen.has(sku)) continue;
      seen.add(sku);

      // The size lives on the variant ("100ml"), the name on the product, and
      // the catalogue's fragrance test needs to see both in one string.
      const variantTitle =
        variant.title && !/^default/i.test(variant.title)
          ? `${title} ${variant.title}`
          : title;

      const wasPrice =
        variant.compareAtPrice !== null && variant.compareAtPrice > variant.price
          ? variant.compareAtPrice
          : null;

      listings.push({
        retailerSku: sku,
        url,
        rawTitle: variantTitle,
        rawBrand: vendor,
        // Admin-API only. See the header comment.
        ean: null,
        imageUrl: image,
        priceGbp: isGbp ? variant.price : null,
        wasPriceGbp: isGbp ? wasPrice : null,
        promoEndsAt: null,
        inStock: variant.available,
        sectionId: options.sectionId,
        description,
        nativePrice: isGbp
          ? null
          : { amount: variant.price, currency: options.currency ?? 'unknown' },
      });
    }
  }

  return listings;
}
