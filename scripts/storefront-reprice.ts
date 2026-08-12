/**
 * Re-price an affiliate-feed retailer from its own storefront.
 *
 *   npm run storefront:reprice                          # every flagged retailer
 *   npm run storefront:reprice -- --shop=mybeauty-boutique
 *   npm run storefront:reprice -- --dry-run             # report, write nothing
 *
 * Runs against every retailer whose registry entry sets
 * `storefrontIsPriceAuthority: true` — today that is MyBeauty.Boutique alone,
 * and only because a verification run measured its feed wrong on 6,245 of
 * 8,902 keyed listings, one-sidedly. See src/catalogue/feedPriceRepair.ts for
 * the numbers and the reasoning; see the field's doc comment in
 * src/types/retailer.ts for what has to be true before another retailer gets
 * the flag.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 * This must run *after* `npm run awin:feed-sync` in the same job, and before
 * the rebuild. The sync overwrites the snapshot with whatever the feed
 * currently says, so a correction applied before it would simply be thrown
 * away — and thrown away silently, since both steps report success.
 *
 * ── What it will not do ─────────────────────────────────────────────────────
 * It reads the merchant's public `/products.json` and nothing else: no
 * affiliate deeplink is ever fetched, no secret is read, and robots.txt is
 * honoured before the first request. It never invents a price — a listing the
 * storefront does not carry has its price cleared rather than guessed, which
 * the demo build then skips.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { BROWSER_HEADERS } from '../src/catalogue/attempt.js';
import { parseRobots, isAllowed, NO_RESTRICTIONS, UNREACHABLE_ROBOTS } from '../src/catalogue/robots.js';
import { emptyPriceIndex, indexShopifyPage, type ShopifyPriceIndex } from '../src/catalogue/shopifyPriceIndex.js';
import { parseShopCurrency } from '../src/catalogue/shopifyJson.js';
import { repairFeedPrices } from '../src/catalogue/feedPriceRepair.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');
const dryRun = process.argv.includes('--dry-run');
const gapMs = Number.parseInt(arg('gap-ms') ?? '1200', 10);

const http = createHttp({ timeoutMs: 25_000 });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Below this, the storefront read is treated as a failure and the snapshot is
 * left untouched.
 *
 * A partial `/products.json` walk — a shop rate-limiting us halfway, a page
 * timing out — looks exactly like a shop that has withdrawn everything it did
 * not return. Without this floor, one bad network minute would clear the price
 * of thousands of listings and the site would show a retailer with almost
 * nothing for sale. 80% is well under the 99.93% (8,902/8,908) a healthy run
 * has actually keyed, so it fails on a genuinely broken read rather than on a
 * merchant reshuffling their catalogue.
 */
const MIN_KEYED_SHARE = 0.8;

interface Outcome {
  retailerId: string;
  ok: boolean;
  reason: string;
  products: number;
  /** What the storefront says it prices in. Must be GBP before anything is written. */
  storefrontCurrency: string | null;
  active: number;
  keyed: number;
  agreed: number;
  corrected: number;
  wasOverstated: number;
  wasUnderstated: number;
  overstatementRemovedGbp: number;
  cleared: number;
}

async function buildIndex(
  origin: string,
): Promise<{ index: ShopifyPriceIndex; products: number; currency: string | null; error: string | null }> {
  const robotsRes = await http(`${origin}/robots.txt`, BROWSER_HEADERS);
  const robots = robotsRes.ok && robotsRes.body
    ? parseRobots(robotsRes.body, 'pricesniffsbot')
    : robotsRes.status >= 400 && robotsRes.status < 500
      ? NO_RESTRICTIONS
      : UNREACHABLE_ROBOTS;

  if (robots.unavailable) {
    return { index: emptyPriceIndex(), products: 0, currency: null, error: 'robots.txt unreachable — held off' };
  }

  // Currency first, and required to be explicitly GBP — not merely "not
  // obviously something else".
  //
  // Everything below writes numbers straight into `priceGbp`. If this
  // storefront is answering a CI runner with a different market's price list,
  // that write turns euros into pounds silently, on 8,908 listings, with no
  // step downstream able to notice. Nicchia Luxury's verification run showed
  // exactly this shape against a *different* merchant — 6,844 listings, not
  // one agreeing, every difference the same way, a stored £5 against a live 6.
  //
  // So the writer is stricter than the verifier here on purpose: the verifier
  // may compare a shop whose currency is unpublished and say so, because being
  // wrong there costs a misleading report. Being wrong here costs a wrong
  // price in front of a customer.
  const meta = await http(`${origin}/meta.json`, BROWSER_HEADERS);
  const home = await http(`${origin}/`, BROWSER_HEADERS);
  const currency = parseShopCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null);
  if (currency !== null && currency !== 'GBP') {
    return {
      index: emptyPriceIndex(),
      products: 0,
      currency,
      error: `storefront publishes prices in ${currency}, not GBP — refusing to write them as pounds`,
    };
  }
  // A storefront that publishes no currency at all is not settled here — see
  // the agreement corroboration in repriceShop, which needs the keyed counts
  // this function has not produced yet.

  const gap = Math.max(gapMs, (robots.crawlDelaySeconds ?? 0) * 1000);
  const index = emptyPriceIndex();
  let products = 0;

  for (let page = 1; page <= 200; page++) {
    const url = `${origin}/products.json?limit=250&page=${page}`;
    if (!isAllowed(robots, url)) {
      return { index, products, currency, error: `robots.txt disallows ${url}` };
    }

    const res = await http(url, BROWSER_HEADERS);
    if (!res.ok) {
      return { index, products, currency, error: `page ${page}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}` };
    }

    const page_ = indexShopifyPage(res.body, origin, index);
    if (!page_.isShopify) {
      return { index, products, currency, error: `page ${page} was not a Shopify products payload` };
    }
    products += page_.products;
    if (page_.products === 0) break;

    if (page % 10 === 0) console.log(`      page ${page}: ${products} products so far`);
    await sleep(gap);
  }

  return { index, products, currency, error: null };
}

async function repriceShop(retailer: Retailer): Promise<Outcome> {
  const outcome: Outcome = {
    retailerId: retailer.id,
    ok: false,
    reason: '',
    products: 0,
    storefrontCurrency: null,
    active: 0,
    keyed: 0,
    agreed: 0,
    corrected: 0,
    wasOverstated: 0,
    wasUnderstated: 0,
    overstatementRemovedGbp: 0,
    cleared: 0,
  };

  const store = new CatalogueStore(resolve(root, 'data/catalogue'));
  const snapshot = store.read(retailer.id);
  const active = snapshot.listings.filter((l) => l.status === 'active');
  outcome.active = active.length;

  if (active.length === 0) {
    outcome.reason = 'no active listings to re-price';
    return outcome;
  }

  const origin = `https://${retailer.domain.replace(/^www\./, '')}`;
  const { index, products, currency, error } = await buildIndex(origin);
  outcome.products = products;
  outcome.storefrontCurrency = currency;

  if (error !== null) {
    outcome.reason = `storefront read failed: ${error} — snapshot left untouched`;
    return outcome;
  }

  // Count first, decide second. Applying the repair and then discovering the
  // read was short would mean deciding whether to trust it after already
  // having thrown the old prices away.
  const probe = repairFeedPrices(active, index, { clearUnkeyed: false });
  outcome.keyed = active.length - probe.unkeyed;

  // Where the storefront publishes no currency, exact agreement is the
  // evidence instead.
  //
  // Two different currencies do not agree to the penny in bulk. MyBeauty's
  // feed and storefront agree exactly on 2,613 listings, which settles that
  // both are sterling far more firmly than a `meta.json` field would; Nicchia
  // Luxury, the case that prompted this whole guard, agreed on zero of 6,844.
  // So an unpublished currency is acceptable only against a floor of genuine
  // penny-level agreements, and refused otherwise.
  if (outcome.storefrontCurrency === null) {
    const floor = Math.max(100, Math.round(outcome.keyed * 0.05));
    if (probe.agreed < floor) {
      outcome.reason =
        `storefront publishes no currency, and only ${probe.agreed} of ${outcome.keyed} keyed ` +
        `listings agree with it to the penny (need ${floor}). Two price lists in the same ` +
        'currency agree in bulk; these do not, so this is not established as sterling. ' +
        'Snapshot left untouched.';
      return outcome;
    }
    console.log(
      `      currency unpublished, corroborated by ${probe.agreed} penny-exact agreements ` +
        `(floor ${floor})`,
    );
  }

  const share = outcome.keyed / active.length;
  if (share < MIN_KEYED_SHARE) {
    outcome.reason =
      `only ${outcome.keyed}/${active.length} listings (${(share * 100).toFixed(1)}%) keyed to a live ` +
      `variant, under the ${MIN_KEYED_SHARE * 100}% floor — treating this as a bad read, not a ` +
      'shrunken catalogue. Snapshot left untouched.';
    return outcome;
  }

  const repaired = repairFeedPrices(snapshot.listings, index, { clearUnkeyed: true });
  outcome.agreed = repaired.agreed;
  outcome.corrected = repaired.corrected;
  outcome.wasOverstated = repaired.wasOverstated;
  outcome.wasUnderstated = repaired.wasUnderstated;
  outcome.overstatementRemovedGbp = repaired.overstatementRemovedGbp;
  outcome.cleared = repaired.cleared;
  outcome.ok = true;
  outcome.reason = 'repriced from the storefront';

  if (!dryRun) {
    store.write({ ...snapshot, updatedAt: new Date().toISOString(), listings: repaired.listings });
  }

  return outcome;
}

const shops = RETAILERS.filter(
  (r) => r.enabled && r.storefrontIsPriceAuthority && (!onlyShop || r.id === onlyShop),
);

console.log('\nStorefront re-price');
console.log(`shops    ${shops.length}`);
if (dryRun) console.log('mode     dry run, report only, nothing written');
console.log('');

if (shops.length === 0) {
  console.log('No enabled retailer sets storefrontIsPriceAuthority. Nothing to do.\n');
  process.exit(0);
}

const outcomes: Outcome[] = [];
for (const retailer of shops) {
  console.log(`  ${retailer.id}`);
  const outcome = await repriceShop(retailer);
  outcomes.push(outcome);
  console.log(`      ${outcome.reason}`);
  if (outcome.ok) {
    console.log(
      `      ${outcome.products} storefront products, ${outcome.keyed}/${outcome.active} listings keyed`,
    );
    console.log(
      `      ${outcome.agreed} already agreed, ${outcome.corrected} corrected ` +
        `(${outcome.wasOverstated} had been overstated, ${outcome.wasUnderstated} understated), ` +
        `${outcome.cleared} cleared as uncorroborated`,
    );
    console.log(
      `      £${outcome.overstatementRemovedGbp.toFixed(2)} of overstatement removed across the retailer`,
    );
  }
}

writeFileSync(
  resolve(root, 'data/storefront-reprice-report.json'),
  `${JSON.stringify({ repricedAt: new Date().toISOString(), dryRun, outcomes }, null, 2)}\n`,
);

const failed = outcomes.filter((o) => !o.ok);
console.log(`\n${outcomes.length - failed.length} of ${outcomes.length} retailers repriced.`);
if (failed.length > 0) {
  // Not a job failure: leaving yesterday's prices in place is the designed
  // response to a bad read, and failing the step here would also abandon the
  // retailers that did succeed.
  for (const o of failed) console.log(`::warning::${o.retailerId} not repriced — ${o.reason}`);
}
console.log('Report: data/storefront-reprice-report.json\n');
