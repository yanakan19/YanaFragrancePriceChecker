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
 * the site, each waiting on the same single fact: what does the shop actually
 * charge in. Nothing in this repo could go and find out. `price:verify` gets
 * close — it reads a storefront's currency on the way past — but its answer is
 * a by-product of a drift measurement it can only make when there are stored
 * prices to compare, it needs a per-shop time budget in the minutes, and when
 * the currency turns out to be foreign it stops, which is the exact moment the
 * question gets interesting.
 *
 * This asks the currency question on its own: five addresses, two documents
 * each, a few seconds, no snapshot required, and it runs against a retailer
 * whose `enabled` is false, which every one of the six is.
 *
 * ── Why it must run in CI, not here ──────────────────────────────────────────
 * The environment this script was written in has no outbound network — every
 * request 403s at its proxy before it leaves (docs/INGESTION.md). A currency
 * guessed from here would be a number someone made up applied to thousands of
 * listings in front of shoppers, which is the one thing this repo must never
 * do. So the script is built to be run by .github/workflows/price-verify.yml,
 * on a runner that does have network, and `--require-gbp` makes that run's
 * own green tick the evidence: the step fails unless the storefront published
 * sterling at an address we can read prices from.
 *
 * That is the same standard demo/virtualYanny.ts already records for the
 * chatbot's backend URL — a CI job's check, cited by job id, standing in for a
 * request this machine cannot make.
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
  UK_MARKET_PREFIXES,
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
  console.error('usage: npm run currency:probe -- --shop=<retailer id> [--products=N] [--product=URL] [--require-gbp]');
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

const origin = `https://${retailer.domain.replace(/^www\./, '')}`;

async function robotsFor(base: string): Promise<RobotsRules> {
  const res = await http(`${base}/robots.txt`, BROWSER_HEADERS);
  if (!res.ok) return res.status === 404 ? NO_RESTRICTIONS : UNREACHABLE_ROBOTS;
  return parseRobots(res.body);
}

const robots = await robotsFor(origin);
if (robots.unavailable) {
  console.log(`robots.txt could not be read at ${origin} — holding off rather than assuming we are welcome`);
  process.exit(requireGbp ? 1 : 0);
}

const gap = Math.max(retailer.catalogue?.minRequestGapMs ?? 0, (robots.crawlDelaySeconds ?? 0) * 1000);

console.log('');
console.log(`Currency probe: ${retailer.name} (${retailer.id})`);
console.log(`origin    ${origin}`);
console.log(`enabled   ${retailer.enabled}`);
console.log(`gap       ${gap}ms (registry ${retailer.catalogue?.minRequestGapMs ?? 0}, robots ${robots.crawlDelaySeconds ?? 0}s)`);
console.log('');

const readings = await probeMarkets(origin, http, BROWSER_HEADERS, {
  prefixes: UK_MARKET_PREFIXES,
  allow: (url) => isAllowed(robots, url),
  gapMs: gap,
  sleep,
});

const verdict = summariseMarketProbe(readings);

console.log('──────── what each address published ────────');
for (const line of verdict.lines) console.log(`  ${line}`);
console.log('');
console.log(`  ${verdict.reading}`);
console.log('');

// ── The numbers themselves ───────────────────────────────────────────────────
// A currency code is a claim about a price list. Printing a few of that list's
// actual figures beside it is what turns the claim into something checkable by
// a person who knows what the shop charges: if /products.json and
// /en-gb/products.json return the same numbers, there is one price list behind
// both addresses whatever their themes say, and if they differ there are two.
if (productSample > 0) {
  console.log('──────── prices served at each address ────────');
  for (const reading of readings) {
    const url = `${reading.base}/products.json?limit=${Math.max(1, Math.min(productSample, 250))}`;
    if (!isAllowed(robots, url)) {
      console.log(`  ${(reading.prefix || 'origin').padEnd(8)} robots.txt disallows ${url}`);
      continue;
    }
    const res = await http(url, BROWSER_HEADERS);
    await sleep(gap);
    if (!res.ok) {
      console.log(`  ${(reading.prefix || 'origin').padEnd(8)} HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      continue;
    }
    if (!isShopifyProductsPayload(res.body)) {
      console.log(`  ${(reading.prefix || 'origin').padEnd(8)} not a Shopify products payload`);
      continue;
    }
    const payload = JSON.parse(res.body) as { products: Array<Record<string, unknown>> };
    console.log(
      `  ${(reading.prefix || 'origin').padEnd(8)} quotes ${reading.currency.presented ?? 'nothing'} — ` +
        `${payload.products.length} products`,
    );
    for (const product of payload.products.slice(0, productSample)) {
      const variants = Array.isArray(product['variants']) ? (product['variants'] as Array<Record<string, unknown>>) : [];
      const first = variants[0];
      console.log(
        `      ${String(product['handle']).slice(0, 52).padEnd(52)} ` +
          `price ${String(first?.['price'] ?? '—').padStart(9)}  ` +
          `compare_at ${String(first?.['compare_at_price'] ?? '—').padStart(9)}`,
      );
    }
  }
  console.log('');
}

// ── The one field on the page that is about its own number ───────────────────
// `/products.json` carries a bare price string and no unit. A product page's
// schema.org block carries `priceCurrency`, written by the shop, in a
// vocabulary with a published meaning — so where a shop serves JSON-LD this is
// the strongest single signal available without a checkout.
if (productUrl) {
  const host = new URL(productUrl).hostname.replace(/^www\./, '');
  if (host !== retailer.domain.replace(/^www\./, '')) {
    // Never fetch an address that is not the shop's own. An affiliate
    // deeplink is a click reported to the merchant as a real customer, and
    // this script must not be a way to fire one.
    console.log(`refusing --product: ${host} is not ${retailer.domain}`);
  } else if (!isAllowed(robots, productUrl)) {
    console.log(`robots.txt disallows ${productUrl}`);
  } else {
    const res = await http(productUrl, BROWSER_HEADERS);
    console.log('──────── what the product page labels its price ────────');
    if (!res.ok) {
      console.log(`  HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
    } else {
      const offers = readJsonLdOffers(res.body);
      if (offers.length === 0) console.log('  the page publishes no JSON-LD priceCurrency');
      for (const offer of offers.slice(0, 12)) {
        console.log(`  price ${offer.price ?? '—'} labelled ${offer.currency ?? '—'}`);
      }
    }
    console.log('');
  }
}

if (requireGbp && verdict.sterlingBase === null) {
  console.error(
    `FAIL: ${retailer.id} did not publish a sterling price list at any address tried. ` +
      'Its prices must not be published as pounds, and its id must stay in CURRENCY_UNCONFIRMED.',
  );
  process.exit(1);
}

if (verdict.sterlingBase) {
  console.log(`PASS: sterling price list at ${verdict.sterlingBase}`);
  console.log(
    'This proves what the storefront quotes THIS machine. Before removing the id from ' +
      'CURRENCY_UNCONFIRMED, note the run and job id here and in the registry, the way ' +
      'demo/virtualYanny.ts records its own CI-sourced fact.',
  );
}
