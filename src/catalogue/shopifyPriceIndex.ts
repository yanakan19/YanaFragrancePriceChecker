/**
 * A live price per variant, keyed by every spelling of a SKU this repo writes.
 *
 * ── Why an alias table rather than one key ───────────────────────────────────
 * A stored `retailerSku` was written by whichever ingestion route produced it,
 * and those routes disagree about what a SKU is:
 *
 *   awinFeed.ts             `merchant_product_id`, which a Shopify merchant's
 *                           Awin export writes as
 *                           `shopify_GB_<productId>_<variantId>`
 *   shopifyJson.ts          the variant's own `sku`, or
 *                           `<productId>-<variantTitle>` where the shop left
 *                           it blank
 *   jsonld.ts               whatever the page's markup called it
 *
 * Registering all of those spellings against the same variant is what lets one
 * route speak about listings another route created — which is the whole point.
 * Without it, an Awin feed listing and the same bottle on the merchant's own
 * storefront are two unrelated rows with no way to line them up, and the feed's
 * price can never be checked against anything.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 * It is not a matcher. Every key here is an identifier one side actually
 * published — a Shopify product id, a variant id, a merchant SKU — never a
 * title, a size or a similarity score. If a listing does not key, the honest
 * answer is that we have nothing to say about it, and callers are expected to
 * treat "unkeyed" as "unknown" rather than "unchanged".
 */

/** What the storefront currently charges for one variant. */
export interface LiveVariantPrice {
  price: number;
  /** Shopify's `compare_at_price`, kept only when it is genuinely above price. */
  compareAt: number | null;
  available: boolean | null;
  /** The merchant's own product page, so a caller can cite where this came from. */
  productUrl: string;
}

export type ShopifyPriceIndex = Map<string, LiveVariantPrice>;

export function emptyPriceIndex(): ShopifyPriceIndex {
  return new Map();
}

function money(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface IndexPageResult {
  /** Products seen on this page. Zero means the catalogue has ended. */
  products: number;
  /** Priced variants registered from this page. */
  variants: number;
  /** False when the payload was not a Shopify products document at all. */
  isShopify: boolean;
}

/**
 * Fold one `/products.json` page into the index.
 *
 * First writer wins for any given key: Shopify ids are unique, so a collision
 * can only come from two merchant SKUs sharing a string, and in that case
 * neither is a safe answer — keeping the first at least makes the outcome
 * deterministic across runs rather than dependent on page order.
 */
export function indexShopifyPage(
  body: string,
  origin: string,
  index: ShopifyPriceIndex,
): IndexPageResult {
  let parsed: { products?: unknown };
  try {
    parsed = JSON.parse(body) as { products?: unknown };
  } catch {
    return { products: 0, variants: 0, isShopify: false };
  }
  if (!Array.isArray(parsed.products)) return { products: 0, variants: 0, isShopify: false };

  const base = origin.replace(/\/+$/, '');
  const add = (key: string | null | undefined, value: LiveVariantPrice) => {
    if (!key) return 0;
    const k = key.trim();
    if (!k || index.has(k)) return 0;
    index.set(k, value);
    return 1;
  };

  let products = 0;
  let variants = 0;

  for (const raw of parsed.products) {
    if (!raw || typeof raw !== 'object') continue;
    const product = raw as Record<string, unknown>;
    products++;

    const productId = product['id'] === undefined ? null : String(product['id']);
    const handle = typeof product['handle'] === 'string' ? product['handle'] : null;
    const productUrl = handle ? `${base}/products/${handle}` : base;
    const list = Array.isArray(product['variants']) ? product['variants'] : [];

    for (const rawVariant of list) {
      if (!rawVariant || typeof rawVariant !== 'object') continue;
      const v = rawVariant as Record<string, unknown>;
      const price = money(v['price']);
      if (price === null) continue;

      const compare = money(v['compare_at_price']);
      const live: LiveVariantPrice = {
        price,
        compareAt: compare !== null && compare > price ? compare : null,
        available: typeof v['available'] === 'boolean' ? v['available'] : null,
        productUrl,
      };
      variants++;

      const variantId = v['id'] === undefined ? null : String(v['id']);
      const vSku = typeof v['sku'] === 'string' ? v['sku'] : null;
      const vTitle = typeof v['title'] === 'string' ? v['title'] : null;

      add(variantId, live);
      add(vSku, live);
      if (productId && variantId) {
        add(`${productId}_${variantId}`, live);
        // The spelling an Awin export of a Shopify shop uses.
        add(`shopify_GB_${productId}_${variantId}`, live);
      }
      if (productId) add(`${productId}-${vTitle ?? 'default'}`, live);
      if (handle) add(`${handle}-${vTitle ?? 'default'}`, live);
    }
  }

  return { products, variants, isShopify: true };
}

/**
 * Find the live price for one stored listing, or null.
 *
 * Ordered most-specific first. `productUrl` is consulted only as a last
 * resort and only through the `<handle>-Default Title` alias, which exists
 * exactly once per handle — a product with several sized variants never
 * registers it, so this can never quietly answer with the wrong size.
 */
export function lookupLivePrice(
  retailerSku: string,
  storedUrl: string | null,
  index: ShopifyPriceIndex,
): LiveVariantPrice | null {
  const direct = index.get(retailerSku);
  if (direct) return direct;

  const parts = retailerSku.split('_');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const pair = `${parts[parts.length - 2]!}_${last}`;
    const byPair = index.get(pair);
    if (byPair) return byPair;
    const byVariant = index.get(last);
    if (byVariant) return byVariant;
  }

  if (storedUrl) {
    try {
      const path = new URL(storedUrl, 'https://placeholder.invalid').pathname;
      const m = /\/products\/([^/?#]+)/.exec(path);
      if (m) {
        const byHandle = index.get(`${m[1]!}-Default Title`);
        if (byHandle) return byHandle;
      }
    } catch {
      // A stored URL we cannot parse is a separate defect, not this lookup's.
    }
  }

  return null;
}
