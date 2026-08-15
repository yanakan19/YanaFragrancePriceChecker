/**
 * Ask one shop's storefront, from a machine that can reach it, what currency
 * it is quoting — and print every raw signal rather than a conclusion.
 *
 *   npm run currency:probe -- --shop=escentual
 *   npm run currency:probe -- --shop=escentual --products=3
 *   npm run currency:probe -- --shop=escentual --product=https://escentual.com/products/x
 *   npm run currency:probe -- --shop=escentual --require-gbp   # exit 1 unless proven
 *
 * ── Why this exists as its own script ────────────────────────────────────────
 * Six retailers sit in `CURRENCY_UNCONFIRMED` in src/config/retailers.ts, off
 * the site, each waiting on the same single fact: what the shop actually
 * charges in. Nothing in this repo could go and find out. `price:verify` gets
 * close — it reads a storefront's currency on the way past — but its answer is
 * a by-product of a drift measurement it can only make when there are stored
 * prices to compare, it needs a per-shop time budget in the minutes, and when
 * the currency turns out to be foreign it stops, which is the exact moment the
 * question gets interesting.
 *
 * This asks the currency question on its own: ten ways of asking, a few
 * documents each, under a minute, no snapshot required, and it runs against a
 * retailer whose `enabled` is false, which every one of the six is.
 *
 * ── Why it must run in CI, not here ──────────────────────────────────────────
 * The environment this script was written in has no outbound network — every
 * request 403s at its proxy before it leaves (docs/INGESTION.md). A currency
 * guessed from here would be a number someone made up applied to thousands of
 * listings in front of shoppers, which is the one thing this repo must never
 * do. So the script is built to be run by .github/workflows/price-verify.yml,
 * on a runner that does have network, and `--require-gbp` makes that run's own
 * green tick the evidence: the step fails unless the storefront served
 * sterling to a request we know how to make.
 *
 * That is the same standard demo/virtualYanny.ts already records for the
 * chatbot's backend URL — a CI job's check, cited by job id, standing in for a
 * request this machine cannot make.
 *
 * ── The catch a runner introduces, and why the script says it out loud ───────
 * A GitHub runner is not in the UK. Under Shopify Markets the market — and so
 * the price list — is chosen by where the visitor is, so "quotes GBP" from
 * Virginia and "quotes USD" from Virginia mean quite different things, and
 * only the first transfers. That is why every line below names the request
 * that produced it, and why the summary distinguishes "this shop has no
 * sterling list" from "no request we know how to make reached it". Escentual
 * is the second case: run 31880073037 found it settling in GBP while quoting
 * this runner USD at 1.38605.
 *
 * ── What it does not do ──────────────────────────────────────────────────────
 * Writes nothing. Commits nothing. Converts nothing. It cannot re-enable a
 * shop; it can only produce the evidence a human would need before doing so
 * by hand.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import {
  parseRobots,
  isAllowed,
  NO_RESTRICTIONS,
  UNREACHABLE_ROBOTS,
  type RobotsRules,
} from '../src/catalogue/robots.js';
import {
  probeMarkets,
  summariseMarketProbe,
  readJsonLdOffers,
  ukMarketCandidates,
  candidateUrl,
  type MarketReading,
} from '../src/catalogue/marketProbe.js';
import { isShopifyProductsPayload } from '../src/catalogue/shopifyJson.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const shopId = arg('shop');
const productSample = Number.parseInt(arg('products') ?? '0', 10);
const productUrl = arg('product');
const requireGbp = process.argv.includes('--require-gbp');

if (!shopId) {
  console.error(
    'usage: npm run currency:probe -- --shop=<retailer id> [--products=N] [--product=URL] [--require-gbp]',
  );
  process.exit(2);
}

// Not `enabledRetailers()`. Every shop this script is for is switched off —
// that is why its currency is in doubt — so filtering by `enabled` would make
// the tool refuse the only cases it was built for.
const retailer = RETAILERS.find((r) => r.id === shopId);
if (!retailer) {
  console.error(`no retailer with id "${shopId}" in src/config/retailers.ts`);
  process.exit(2);
}

const http: Http = createHttp({ timeoutMs: 20_000 });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const domain = retailer.domain.replace(/^www\./, '');
const origin = `https://${domain}`;

async function robotsFor(base: string): Promise<RobotsRules> {
  const res = await http(`${base}/robots.txt`, BROWSER_HEADERS);
  if (!res.ok) return res.status === 404 ? NO_RESTRICTIONS : UNREACHABLE_ROBOTS;
  return parseRobots(res.body);
}

const robots = await robotsFor(origin);
if (robots.unavailable) {
  console.log(
    `robots.txt could not be read at ${origin} — holding off rather than assuming we are welcome`,
  );
  process.exit(requireGbp ? 1 : 0);
}

const gap = Math.max(
  retailer.catalogue?.minRequestGapMs ?? 0,
  (robots.crawlDelaySeconds ?? 0) * 1000,
);

console.log('');
console.log(`Currency probe: ${retailer.name} (${retailer.id})`);
console.log(`origin    ${origin}`);
console.log(`enabled   ${retailer.enabled}`);
console.log(
  `gap       ${gap}ms (registry ${retailer.catalogue?.minRequestGapMs ?? 0}, robots ${robots.crawlDelaySeconds ?? 0}s)`,
);
console.log('');

const readings = await probeMarkets(ukMarketCandidates(origin), http, BROWSER_HEADERS, {
  allow: (url) => isAllowed(robots, url),
  gapMs: gap,
  sleep,
});

const verdict = summariseMarketProbe(readings);

console.log('──────── what each way of asking published ────────');
for (const line of verdict.lines) console.log(`  ${line}`);
console.log('');
console.log(`  ${verdict.reading}`);
console.log('');

/** Candidates worth spending product requests on: the ones that answered. */
function answered(all: readonly MarketReading[]): MarketReading[] {
  return all.filter((r) => r.homeStatus !== null && r.homeStatus < 400);
}

/**
 * Products whose first variant carries a price that is not zero.
 *
 * A free gift is 0.00 in every currency there has ever been, so a sample made
 * of them cannot tell one price list from another — and escentual.com's
 * products.json opens with two of them, which is how the first run of this
 * probe spent six requests proving nothing.
 */
function priced(
  products: readonly Record<string, unknown>[],
): Array<{ handle: string; price: string; compareAt: string }> {
  const out: Array<{ handle: string; price: string; compareAt: string }> = [];
  for (const product of products) {
    const variants = Array.isArray(product['variants'])
      ? (product['variants'] as Array<Record<string, unknown>>)
      : [];
    const first = variants[0];
    const price = Number.parseFloat(String(first?.['price'] ?? ''));
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      handle: String(product['handle']),
      price: String(first?.['price']),
      compareAt: String(first?.['compare_at_price'] ?? '—'),
    });
  }
  return out;
}

// ── The numbers themselves ───────────────────────────────────────────────────
// A currency code is a claim about a price list. Printing a few of that list's
// actual figures beside it is what turns the claim into something checkable by
// a person who knows what the shop charges: if two ways of asking return the
// same numbers there is one price list behind both, whatever their themes say,
// and if they differ there are two.
if (productSample > 0) {
  console.log('──────── prices served to each way of asking ────────');
  for (const reading of answered(readings)) {
    const limit = Math.max(1, Math.min(productSample, 250));
    const candidate = reading.candidate;
    const url = candidate.query
      ? `${candidate.base}/products.json${candidate.query}&limit=${limit}`
      : `${candidate.base}/products.json?limit=${limit}`;
    if (!isAllowed(robots, url)) {
      console.log(`  ${candidate.label.padEnd(24)} robots.txt disallows ${url}`);
      continue;
    }
    const res = await http(url, { ...BROWSER_HEADERS, ...candidate.headers });
    await sleep(gap);
    if (!res.ok) {
      console.log(
        `  ${candidate.label.padEnd(24)} HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`,
      );
      continue;
    }
    if (!isShopifyProductsPayload(res.body)) {
      console.log(`  ${candidate.label.padEnd(24)} not a Shopify products payload`);
      continue;
    }
    const payload = JSON.parse(res.body) as { products: Array<Record<string, unknown>> };
    console.log(
      `  ${candidate.label.padEnd(24)} quotes ${reading.currency.presented ?? 'nothing'} — ` +
        `${payload.products.length} products`,
    );
    const rows = priced(payload.products).slice(0, productSample);
    if (rows.length === 0) console.log('      no priced product in this page');
    for (const row of rows) {
      console.log(
        `      ${row.handle.slice(0, 52).padEnd(52)} ` +
          `price ${row.price.padStart(9)}  compare_at ${row.compareAt.padStart(9)}`,
      );
    }
  }
  console.log('');
}

// ── The one field on the page that is about its own number ───────────────────
// `/products.json` carries a bare price string and no unit. A product page's
// schema.org block carries `priceCurrency`, written by the shop, in a
// vocabulary with a published meaning — so where a shop serves JSON-LD this is
// the strongest single signal available without a checkout, and reading the
// *same* product under every way of asking puts the candidate price lists side
// by side with their own labels on.
if (productUrl) {
  const host = new URL(productUrl).hostname.replace(/^www\./, '');
  if (host !== domain) {
    // Never fetch an address that is not the shop's own. An affiliate
    // deeplink is a click reported to the merchant as a real customer, and
    // this script must not be a way to fire one.
    console.log(`refusing --product: ${host} is not ${retailer.domain}`);
  } else {
    console.log('──────── what one product page labels its price ────────');
    console.log(`  ${productUrl}`);
    const path = new URL(productUrl).pathname;
    for (const reading of answered(readings)) {
      const candidate = reading.candidate;
      const url = candidateUrl(candidate, path);
      if (!isAllowed(robots, url)) {
        console.log(`  ${candidate.label.padEnd(24)} robots.txt disallows it`);
        continue;
      }
      const res = await http(url, { ...BROWSER_HEADERS, ...candidate.headers });
      await sleep(gap);
      if (!res.ok) {
        console.log(
          `  ${candidate.label.padEnd(24)} HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`,
        );
        continue;
      }
      const offers = readJsonLdOffers(res.body);
      const shown =
        offers.length === 0
          ? 'no JSON-LD priceCurrency'
          : offers
              .slice(0, 4)
              .map((o) => `${o.price ?? '—'} ${o.currency ?? '—'}`)
              .join(', ');

      // And the same product through `/products/<handle>.json` — the endpoint
      // crawlViaShopifyProducts actually reads. The HTML page and the JSON
      // beside it are different documents and need not agree; finding that out
      // after wiring the harvest rather than before is exactly the mistake
      // this whole exercise is a correction of.
      const jsonUrl = candidateUrl(candidate, `${path}.json`);
      let variantPrices = 'not read';
      if (isAllowed(robots, jsonUrl)) {
        const jsonRes = await http(jsonUrl, { ...BROWSER_HEADERS, ...candidate.headers });
        await sleep(gap);
        if (!jsonRes.ok) {
          variantPrices = `HTTP ${jsonRes.status}`;
        } else {
          try {
            const parsed = JSON.parse(jsonRes.body) as {
              product?: { variants?: Array<Record<string, unknown>> };
            };
            const variants = parsed.product?.variants ?? [];
            variantPrices =
              variants
                .slice(0, 4)
                .map((v) => `${String(v['title'])} ${String(v['price'])}`)
                .join(' | ') || 'no variants';
          } catch {
            variantPrices = 'not JSON';
          }
        }
      }
      console.log(`  ${candidate.label.padEnd(24)} page ${shown.padEnd(18)} .json ${variantPrices}`);
    }
    console.log('');
  }
}

if (verdict.sterling) {
  console.log(
    `PASS: sterling price list served to "${verdict.sterling.label}" at ${verdict.sterling.base}`,
  );
  console.log(
    'This proves what the storefront quotes THIS machine when asked that way. Before removing ' +
      'the id from CURRENCY_UNCONFIRMED, record the run and job id in the registry, the way ' +
      'demo/virtualYanny.ts records its own CI-sourced fact — and make the harvest ask the same ' +
      'way, or it will go on reading whichever market a runner is geolocated into.',
  );
} else if (requireGbp) {
  console.error(
    `FAIL: ${retailer.id} served no sterling price list to any request tried. ` +
      'Its prices must not be published as pounds, and its id must stay in CURRENCY_UNCONFIRMED.',
  );
  process.exit(1);
}
