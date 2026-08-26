/**
 * Asking a shop's own checkout what it would charge to deliver one bottle.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `shippingTerms.ts` reads the delivery *policy page*, which resolved two shops
 * out of twelve. The rest either publish no rate in prose at all, or publish a
 * free-delivery threshold and nothing about what falls below it. For those, the
 * figure genuinely only exists at checkout, computed against a delivery
 * address. So we ask for it the way the shop's own cart page asks.
 *
 * ── What this actually does, precisely ───────────────────────────────────────
 * Shopify serves an unauthenticated rate estimator at
 * `/cart/shipping_rates.json`, which is the endpoint behind the "estimate
 * delivery" widget on a Shopify cart page. It needs a cart to quote against, so
 * the sequence is:
 *
 *   1. GET /products.json          — public catalogue, already used elsewhere
 *                                    here, to find the cheapest in-stock variant
 *   2. GET /cart/{variantId}:1     — Shopify's permalink form, which creates an
 *                                    ephemeral session cart and returns a cookie
 *   3. GET /cart/shipping_rates.json?shipping_address[...]
 *                                  — the quote, for a real London postcode
 *
 * No order is placed. No payment details exist. No account is created. Nothing
 * is submitted to a payment processor. The cart is a session object that
 * expires on its own, and the whole exchange is three GETs, twice a day, per
 * shop that the cheaper policy-page route could not answer.
 *
 * This is deliberately not a headless browser driving a real checkout. That
 * would be heavier, far more brittle, and would push past "read what the shop
 * publishes" into operating their purchase flow. The estimator is the shop
 * telling us its own published rate through its own public interface, which is
 * the same standard the rest of this project holds itself to.
 *
 * ── Where it declines ────────────────────────────────────────────────────────
 * robots.txt is honoured by the caller before any of this runs. A shop that is
 * not on Shopify simply returns nothing here rather than being probed further,
 * and a shop that has disabled the estimator returns nothing too. Neither is
 * treated as a failure worth retrying harder.
 *
 * ── Why the non-Shopify shops in this registry got no equivalent, 2026-08-26 ──
 * Reviewed against every enabled shop still carrying `confidence: 'unverified'`
 * looking for a second, equally public, equally read-only estimator to add
 * alongside this one. Two real platforms turned up, and neither got one:
 *
 *   - SAP Commerce Cloud / Hybris (Superdrug's rendered pages name their own
 *     `spartacus-app-state` block — Spartacus is SAP's own storefront
 *     framework; The Perfume Shop's `/womens/womens-perfume/c/W2001`-style
 *     category paths are the same platform's canonical URL shape). Its public
 *     storefront API (OCC, `/occ/v2/{baseSite}/...`) is the mechanism a
 *     Spartacus frontend itself uses to price a basket, so it is the direct
 *     analogue of Shopify's estimator here — except that, unlike Shopify's
 *     estimator, essentially every OCC deployment requires exchanging a
 *     client id for a bearer token from its own `/authorizationserver/oauth/
 *     token` before any cart or delivery-mode call is accepted, even for an
 *     anonymous guest basket. That is an OAuth client-credentials exchange —
 *     an authentication step — regardless of how public the client id turns
 *     out to be, and this project's own hard limits rule that out categorically
 *     ("never authenticate"), not case by case. Building this route would also
 *     mean guessing each shop's `baseSiteId` and OCC host, neither of which is
 *     uniform across deployments the way Shopify's `/cart/shipping_rates.json`
 *     is — a second reason to leave it unbuilt rather than a merely
 *     theoretical one. Both of the shops above are additionally refused at
 *     the IP level before any of this would matter in practice: see their own
 *     registry entries.
 *   - A framework-native GraphQL/RSC data layer (Selfridges' and John Lewis's
 *     rendered category pages both embed a server-fetched product query
 *     result inside their Next.js React Server Components flight stream —
 *     see src/catalogue/selfridgesRsc.ts and src/catalogue/
 *     johnLewisNextData.ts). That data is fetched by the Next.js server
 *     itself during render, not by the browser after load, so there is no
 *     confirmed browser-callable endpoint here to ask for a delivery quote —
 *     inventing one (a URL, a query shape, required headers) without ever
 *     having watched a real browser's network tab against these shops would
 *     be exactly the kind of guessed request surface this project's own rule
 *     against inventing data exists to prevent.
 *
 * Every other non-Shopify shop in the unverified list (Boots, Notino UK, The
 * Fragrance Shop, John Lewis, Zara, Riiffs, B&M, Home Bargains among them) is
 * refused before serving any markup at all — see each one's own registry
 * entry for the measured evidence — so no estimator of any shape has anywhere
 * to reach on this project's current egress. This paragraph is the record of
 * that review, kept here rather than only in a chat transcript, so the next
 * person who reaches for "just add a Hybris route" finds the reason it wasn't
 * one and does not have to redo this pass to learn it.
 */
import { fetch as undiciFetch } from 'undici';

/** A real, central London residential postcode. Rates can vary by region, and
 *  a Highlands or islands postcode would quote a surcharged rate that is not
 *  what most buyers pay. London is the honest median for a UK-wide figure. */
export const QUOTE_POSTCODE = 'SW1A 1AA';

export interface ShippingRateQuote {
  /** The rate's own name, e.g. "Standard Delivery (3-5 days)". */
  name: string;
  /** Price in GBP. */
  priceGbp: number;
  /** Currency the shop quoted in. Anything but GBP is reported, never converted. */
  currency: string;
}

export interface QuoteResult {
  ok: boolean;
  /** Every rate the shop offered, cheapest first. */
  rates: ShippingRateQuote[];
  /** The variant the quote was taken against, for the evidence trail. */
  productTitle: string | null;
  productPriceGbp: number | null;
  /** Why nothing came back, when nothing did. */
  error: string | null;
  /** Each URL touched, so a human can repeat the exchange by hand. */
  steps: string[];
}

const HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-GB,en;q=0.9',
};

/** Collect Set-Cookie into a single Cookie header. Shopify's cart identity
 *  lives in `cart` / `_shopify_s`, and the estimator will not quote without it. */
function collectCookies(headers: Headers | undefined, jar: Map<string, string>): void {
  if (!headers) return;
  const raw = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

interface ShopifyVariant {
  id: number;
  price: string;
  available: boolean;
}
interface ShopifyProduct {
  title: string;
  variants: ShopifyVariant[];
}

/**
 * Cheapest genuinely purchasable variant in the shop's catalogue.
 *
 * Cheapest on purpose: a rate quote against a £300 bottle would clear every
 * free-delivery threshold the shop has and quote £0, which is the one answer
 * that tells us nothing. The cheapest item is the case where a delivery charge
 * actually applies.
 */
export function cheapestVariant(products: ShopifyProduct[]): { id: number; title: string; price: number } | null {
  let best: { id: number; title: string; price: number } | null = null;
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (!v.available) continue;
      const price = Number.parseFloat(v.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!best || price < best.price) best = { id: v.id, title: p.title, price };
    }
  }
  return best;
}

/** Shopify returns `{ shipping_rates: [{ name, price, currency }] }`, price as
 *  a decimal string in the shop's currency. */
export function parseRates(body: string): ShippingRateQuote[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const list = (parsed as { shipping_rates?: unknown[] })?.shipping_rates;
  if (!Array.isArray(list)) return [];
  const rates: ShippingRateQuote[] = [];
  for (const r of list) {
    const row = r as { name?: string; price?: string | number; currency?: string };
    const price = typeof row.price === 'number' ? row.price : Number.parseFloat(String(row.price));
    if (!Number.isFinite(price)) continue;
    rates.push({
      name: String(row.name ?? 'unnamed'),
      priceGbp: price,
      currency: String(row.currency ?? 'GBP'),
    });
  }
  return rates.sort((a, b) => a.priceGbp - b.priceGbp);
}

/**
 * Ask one shop's checkout what delivery costs on its cheapest bottle.
 *
 * Returns `ok: false` with a reason for anything that is not a usable answer,
 * including "not a Shopify shop", which is the common case rather than an error.
 */
/**
 * Whether asking the shop's own checkout is worth the request, given what the
 * page reading alone produced.
 *
 * ── The gate this replaces, and the two shops it was silently excluding ──────
 * The caller used to attempt this only when the page reading found *nothing
 * at all* — no clean rate and no confirmed absence either. That was too
 * strict, and it was measurably too strict against this registry's own data:
 *
 *   - Emirates Oud's shipping-policy page states, in as many words, "Shipping
 *     fees depend on the delivery destination and order size. The final
 *     price is calculated at checkout." That is not a gap in what the page
 *     reader could extract — it is the shop itself saying the flat rate
 *     lives at checkout and nowhere else, which is exactly the case this
 *     estimator exists for (see this file's own header). The old gate still
 *     skipped it, because the page's absence claim already counted as
 *     "found something", even though what it found conflicted with the
 *     registry's stored £3.99 and settled nothing.
 *   - KAYALI's refund-policy page names delivery terms with no flat rate,
 *     disagreeing with the £5.50 this registry already holds. A disagreement
 *     is never written automatically either way (see
 *     shippingRegistryPatch.ts) — but a human staring at two conflicting
 *     numbers is exactly who a third, independent reading from the shop's
 *     own checkout is for, and the old gate withheld it.
 *
 * So the only thing that should suppress the estimator is a *clean* rate — a
 * standard cost the page states outright, with no caveat attached. Silence,
 * an absence claim, a disagreement, or an unresolved caveat are all exactly
 * the situations a checkout quote might settle, so all of them still allow
 * it; only a page that already answered cleanly makes the extra request
 * pointless. This never changes what gets *written* — a quote result never
 * feeds proposeShippingUpdate — only what gets *asked*.
 */
export function shouldAttemptCheckoutQuote(cleanPageFindingCount: number): boolean {
  return cleanPageFindingCount === 0;
}

export async function quoteShipping(origin: string, postcode = QUOTE_POSTCODE): Promise<QuoteResult> {
  const steps: string[] = [];
  const jar = new Map<string, string>();
  const base = origin.replace(/\/$/, '');
  const fail = (error: string): QuoteResult =>
    ({ ok: false, rates: [], productTitle: null, productPriceGbp: null, error, steps });

  // 1. The public catalogue, to find something cheap and in stock.
  const productsUrl = `${base}/products.json?limit=250`;
  steps.push(productsUrl);
  let products: ShopifyProduct[];
  try {
    const res = await undiciFetch(productsUrl, { headers: HEADERS });
    collectCookies(res.headers as unknown as Headers, jar);
    if (!res.ok) {
      // A 404 really does mean "no Shopify catalogue here". A 403 does not:
      // it is equally bot mitigation, or an egress gateway between us and the
      // shop, and calling that "not Shopify" would put a wrong conclusion into
      // a report a human is meant to trust.
      const why =
        res.status === 404
          ? ' — no Shopify catalogue at this origin'
          : res.status === 403
            ? ' — refused before any catalogue was served (bot mitigation, or blocked egress from this runner)'
            : '';
      return fail(`products.json: HTTP ${res.status}${why}`);
    }
    const body = (await res.json()) as { products?: ShopifyProduct[] };
    products = body.products ?? [];
  } catch (e) {
    return fail(`products.json: ${(e as Error).message}`);
  }
  if (products.length === 0) return fail('products.json returned nothing — not a Shopify storefront');

  const variant = cheapestVariant(products);
  if (!variant) return fail('no purchasable variant found to quote against');

  // 2. Shopify's cart permalink. A GET, and the only step that touches server
  //    state: it creates a session cart that expires by itself.
  const cartUrl = `${base}/cart/${variant.id}:1`;
  steps.push(cartUrl);
  try {
    const res = await undiciFetch(cartUrl, { headers: { ...HEADERS, cookie: cookieHeader(jar) }, redirect: 'manual' });
    collectCookies(res.headers as unknown as Headers, jar);
  } catch (e) {
    return fail(`cart permalink: ${(e as Error).message}`);
  }

  // 3. The estimator itself.
  const q = new URLSearchParams({
    'shipping_address[zip]': postcode,
    'shipping_address[country]': 'United Kingdom',
    'shipping_address[province]': '',
  });
  const ratesUrl = `${base}/cart/shipping_rates.json?${q}`;
  steps.push(ratesUrl);
  try {
    const res = await undiciFetch(ratesUrl, { headers: { ...HEADERS, cookie: cookieHeader(jar) } });
    const body = await res.text();
    if (!res.ok) {
      // 422 is Shopify's "cannot ship there / no rates configured", which is a
      // real answer about this shop rather than a transport failure.
      return fail(`shipping_rates: HTTP ${res.status}${res.status === 422 ? ' (no rates offered to this address)' : ''}`);
    }
    const rates = parseRates(body);
    if (rates.length === 0) return fail('shipping_rates returned no rates');
    return {
      ok: true,
      rates,
      productTitle: variant.title,
      productPriceGbp: variant.price,
      error: null,
      steps,
    };
  } catch (e) {
    return fail(`shipping_rates: ${(e as Error).message}`);
  }
}
