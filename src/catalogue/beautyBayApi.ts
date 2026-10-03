import type { RawListing } from './types.js';

/**
 * Beauty Bay's own product API, read for the sterling price list.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Beauty Bay's product pages are an empty app shell: a plain request for
 * /p/ariana-grande/cloud-eau-de-parfum-spray/cloud-eau-de-parfum-spray-50/
 * answers 12,609 bytes with no price and no JSON-LD. The page's own script
 * then asks pdp-api.public.prd.beautybay.com for the product, and that answer
 * is what this reads.
 *
 * Checked before building it, 2026-10-03, robots.txt first:
 *   - www.beautybay.com/robots.txt permits /p/ product pages and names
 *     /.sitemaps/sitemap-p.xml (2,755 product URLs, 56 naming a perfume);
 *   - pdp-api.public.prd.beautybay.com/robots.txt answers HTTP 404, which
 *     RFC 9309 reads as no restrictions;
 *   - one ordinary request, as PriceSniffsBot with no cookies, for
 *     /product/ariana-grande-cloud-eau-de-parfum-spray?variant=cloud-eau-de-parfum-spray-50&locale=en-GB
 *     answered HTTP 200 with JSON whose variants each carry their own price
 *     in GBP: 30ml £35.00, 50ml £45.00, 100ml £55.00, every one
 *     `itemCurrency: "GBP"`. The same product asked with locale=en-US answers
 *     in dollars ($52.50 for 50ml, read on the same day), which is why the
 *     locale is pinned and why every variant's own currency is checked.
 *
 * The harvest asks this API again for that robots.txt on every run before
 * asking it anything else (see crawlViaSitemap), and asks nothing if the host
 * answers with a server error.
 *
 * One request per product, not per size: the answer lists every size, in
 * stock and out of stock, each with its own sku, address and price.
 */

export const BEAUTY_BAY_API = 'https://pdp-api.public.prd.beautybay.com';

/** /p/<brand>/<product>/<variant>/ split into its three parts, or null. */
export function beautyBayParts(
  productUrl: string,
): { brand: string; product: string; variant: string } | null {
  try {
    const u = new URL(productUrl);
    if (u.hostname !== 'www.beautybay.com') return null;
    const m = /^\/p\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/i.exec(u.pathname);
    return m ? { brand: m[1]!, product: m[2]!, variant: m[3]! } : null;
  } catch {
    return null;
  }
}

/** The API address that answers for one product page, sterling price list pinned. */
export function beautyBayApiUrl(productUrl: string): string | null {
  const p = beautyBayParts(productUrl);
  if (!p) return null;
  return (
    `${BEAUTY_BAY_API}/product/${p.brand}-${p.product}` +
    `?variant=${encodeURIComponent(p.variant)}&locale=en-GB`
  );
}

interface BbPrice {
  itemPrice?: unknown;
  itemCurrency?: unknown;
  originalItemPrice?: unknown;
}
interface BbVariant {
  name?: unknown;
  sku?: unknown;
  url?: unknown;
  measurement?: unknown;
  price?: BbPrice | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Every size in one product answer, as listings.
 *
 * A price is kept only where that variant's own `itemCurrency` is GBP; any
 * other currency is carried as `nativePrice` and the listing stays unpriced.
 * The product's gtin is attached only to the variant the answer was asked
 * for (its top-level sku), since the answer names no gtin for the others.
 */
export function parseBeautyBayProduct(body: string, productUrl: string): RawListing[] {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return [];
  }
  const parts = beautyBayParts(productUrl);
  if (!parts || !data || typeof data !== 'object') return [];

  const brand = text((data['brand'] as Record<string, unknown> | undefined)?.['name']);
  const askedSku = text(data['sku']);
  const gtin = text(data['gtin']);
  const images = (data['media'] as { images?: unknown[] } | undefined)?.images;
  const image = Array.isArray(images) ? text(images[0]) : null;
  const description = text(data['description']);
  const variants = (data['variants'] ?? {}) as { inStock?: BbVariant[]; outOfStock?: BbVariant[] };

  const out: RawListing[] = [];
  const seen = new Set<string>();
  const groups: [BbVariant[] | undefined, boolean][] = [
    [variants.inStock, true],
    [variants.outOfStock, false],
  ];
  for (const [list, inStock] of groups) {
    for (const v of list ?? []) {
      const sku = text(v.sku);
      const slug = text(v.url);
      const size = text(v.measurement);
      // Some products name each variant by its size alone ("30ml" on Cloud
      // Pink); then the product's own name is the name.
      const own = text(v.name);
      const name = own && own !== size && !/^\s*\d+(\.\d+)?\s*ml\s*$/i.test(own) ? own : text(data['name']);
      if (!sku || !slug || !name || seen.has(sku)) continue;
      seen.add(sku);
      const amount = num(v.price?.itemPrice);
      const currency = text(v.price?.itemCurrency);
      const sterling = currency === 'GBP' ? amount : null;
      const original = num(v.price?.originalItemPrice);
      out.push({
        retailerSku: sku,
        url: `https://www.beautybay.com/p/${parts.brand}/${parts.product}/${slug}/`,
        rawTitle: [brand, name, size].filter(Boolean).join(' '),
        rawBrand: brand,
        ean: sku === askedSku && gtin && /^\d{8}(\d{4,6})?$/.test(gtin) ? gtin : null,
        imageUrl: text((v as { imageUrl?: unknown }).imageUrl) ?? image,
        description,
        priceGbp: sterling,
        wasPriceGbp: sterling !== null && original !== null && original > sterling ? original : null,
        promoEndsAt: null,
        inStock,
        sectionId: 'sitemap',
        ...(sterling === null && amount !== null
          ? { nativePrice: { amount, currency: currency ?? 'unknown' } }
          : {}),
      });
    }
  }
  return out;
}
