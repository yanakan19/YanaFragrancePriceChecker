/**
 * Harvest real listings via each shop's sitemap and write them to the catalogue.
 *
 *   npm run harvest                        # every shop, free routes only
 *   npm run harvest -- --max=120           # deeper
 *   npm run harvest -- --shop=allbeauty
 *   npm run harvest -- --allow-metered     # also try Apify proxy and actor for shops the free route can't reach
 *   npm run harvest -- --shop-minutes=15   # raise the per-shop wall-clock ceiling
 *   npm run harvest -- --refresh-share=0.8 # spend most of the budget re-pricing what we already hold
 *
 * This is the route the probe proved works for the sites that allow it.
 * Guessed section URLs returned nothing; asking the sitemap returned real
 * products. For shops that refuse every free route (see docs/SPIKE-RESULTS.md
 * and docs/INGESTION.md), --allow-metered adds two independent, separately
 * credentialed escalation tiers, each only tried when the tier before it
 * still returned zero priced listings:
 *
 *   1. Apify's residential proxy, when APIFY_PROXY_PASSWORD is set — the
 *      exact same sitemap walk and the exact same parser as the free route,
 *      only the transport changes. Fixes an IP-based refusal.
 *   2. An Apify actor (real headless browser), when APIFY_TOKEN is set —
 *      renders each configured catalogue section's first page through actual
 *      Chromium and parses whatever it painted with the same parser again.
 *      Fixes a shop whose grid needs JavaScript to exist at all, which no
 *      change of IP can — see src/catalogue/apifyActor.ts's own header, and
 *      the Harvey Nichols / John Lewis / Boots entries in retailers.ts for
 *      the evidence that this is a genuinely different failure from tier 1.
 *      Costs roughly ten times as much per page as tier 1, which is why it
 *      only ever fires after both the free route and tier 1 have failed, and
 *      why it stays capped far lower (MAX_ACTOR_PAGES_PER_RUN).
 *
 * Nothing here fabricates a listing. A shop that yields nothing is reported as
 * yielding nothing, whichever tier was tried.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { crawlViaSitemap, type SitemapCrawlResult } from '../src/catalogue/sitemapCrawl.js';
import { crawlViaShopifyProducts } from '../src/catalogue/shopifyProductsCrawl.js';
import { quarantinePrices } from '../src/catalogue/priceQuarantine.js';
import { BROWSER_HEADERS, BOT_HEADERS, type Http } from '../src/catalogue/attempt.js';
import { isAllowed, parseRobots } from '../src/catalogue/robots.js';
import {
  probeRobots, robotsHeaderVariants, robotsCandidateUrls, robotsTextFromRenderedHtml,
} from '../src/catalogue/robotsSource.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { parseRenderedState } from '../src/catalogue/renderedState.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { titleWithSizeFromUrl } from '../src/catalogue/sizeFromUrl.js';
import { checkApifyAccount } from '../src/catalogue/apifyAccount.js';
import { looksLikeTimeouts, SLOW_SHOP_TIMEOUT_MS } from '../src/catalogue/strategy.js';
import {
  apifyProxyConfigFromEnv, apifyProxyHttp, MAX_PROXIED_REQUESTS_PER_RUN,
} from '../src/catalogue/apifyProxy.js';
import {
  apifyActorConfigFromEnv, apifyActorRenderer, MAX_ACTOR_PAGES_PER_RUN,
} from '../src/catalogue/apifyActor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const maxPages = Number.parseInt(arg('max') ?? '40', 10);
const onlyShop = arg('shop');
const dryRun = process.argv.includes('--dry-run');
const allowMetered = process.argv.includes('--allow-metered');
// A floor on top of whatever the registry and robots.txt already require,
// not a replacement for either — see its use below. Exists for exactly the
// case that motivated it: run 135 hammered lookfantastic.com with 106
// requests at its normal 1500ms gap and came back with 1 priced listing out
// of 106 fetches (most silently empty, not HTTP errors), a request-rate
// problem the registry's own per-retailer gap has no way to express for a
// one-off deeper run without permanently slowing its every hourly pass too.
const gapMinMs = arg('gap-min') ? Number.parseInt(arg('gap-min')!, 10) : 0;

// Wall-clock ceiling per shop. crawlViaSitemap defaults this to 8 minutes,
// which is the real cap on a big shop rather than --max: run 139 asked for 200
// lookfantastic pages and got 107 because it hit that deadline, not the budget.
// Sized from the scheduled run rather than guessed — see the sweep arithmetic
// in .github/workflows/catalogue-daily.yml. Left unset here so the crawler's
// own default still applies to an ordinary local run.
const shopMinutes = arg('shop-minutes') ? Number.parseFloat(arg('shop-minutes')!) : null;

// Share of each shop's budget spent re-fetching listings we already hold,
// oldest first, rather than discovering new ones. The crawler's 0.3 default is
// tuned for growing a young catalogue; a shop whose catalogue is already
// substantially discovered needs the opposite bias, or its known prices age out
// faster than the sweep can come back to them.
const refreshShare = arg('refresh-share') ? Number.parseFloat(arg('refresh-share')!) : null;

if (shopMinutes !== null && !(shopMinutes > 0)) {
  console.error(`--shop-minutes must be a positive number, got "${arg('shop-minutes')}"`);
  process.exit(1);
}
if (refreshShare !== null && !(refreshShare >= 0 && refreshShare <= 1)) {
  console.error(`--refresh-share must be between 0 and 1, got "${arg('refresh-share')}"`);
  process.exit(1);
}

const proxyConfig = apifyProxyConfigFromEnv();
const useProxy = allowMetered && proxyConfig !== null;

if (allowMetered && !proxyConfig) {
  console.log('--allow-metered was passed but APIFY_PROXY_PASSWORD is not set. Skipping proxied retrieval.\n');
} else if (useProxy) {
  console.log(`Apify proxy available. Genuinely blocked shops get a metered retry, capped at ${MAX_PROXIED_REQUESTS_PER_RUN} requests each.\n`);
}

// A separate, independently gated escalation tier — see src/catalogue/
// apifyActor.ts's own header and this file's own header above for why a
// residential IP and a real browser fix different failures. Fails soft with
// its own clear log line, same shape as the proxy above, whether or not
// --allow-metered or APIFY_PROXY_PASSWORD were ever set.
const actorConfig = apifyActorConfigFromEnv();
const useActor = allowMetered && actorConfig !== null;
const actorRenderer = useActor ? apifyActorRenderer(actorConfig!) : null;

if (allowMetered && !actorConfig) {
  console.log('--allow-metered was passed but APIFY_TOKEN is not set. Skipping real-browser retrieval.\n');
} else if (useActor) {
  console.log(`Apify actor available. Shops still yielding nothing after the proxy retry get a real-browser render, capped at ${MAX_ACTOR_PAGES_PER_RUN} pages for the whole run.\n`);
}

// One free question, asked before any metered work: what does this account
// actually have? It costs no proxy traffic and no compute units, and it
// separates "the shop refused us" from "our credential is wrong" — a
// distinction the harvest cannot otherwise make, and one that was already
// costing every proxied request in every run. See apifyAccount.ts.
if (useActor) {
  for (const line of (await checkApifyAccount(actorConfig!.token, proxyConfig?.password ?? null)).lines) {
    console.log(line);
  }
  console.log('');
}

// A shop that will not hand its robots.txt to `pricesniffsbot` gets asked
// once more the way a browser would — for the file, and only for the file.
// See robotsHeaderVariants' own comment for the Harvey Nichols measurement
// behind this and for why reading a published crawl policy is the opposite of
// evading it.
const ROBOTS_FALLBACK_HEADERS = robotsHeaderVariants(BROWSER_HEADERS);

const http: Http = createHttp();

const store = new CatalogueStore(resolve(root, 'data/catalogue'));
const now = new Date().toISOString();
// A shop on 'affiliate-feed' has an approved feed as its ingestion route —
// scraping it anyway would be exactly the "improve it into a crawler"
// mistake docs/INGESTION.md warns against, on a partner who already handed
// the data over for free. npm run catalogue:feed is that route instead.
//
// `--shop=<id>` together with `--dry-run` asks about one named retailer and
// writes nothing, so it may ask about a disabled one — the same bypass, for
// the same reason, that scripts/catalogue-probe.ts's own `--shop` already
// documents: a candidate cannot be shown to have a working route without
// being asked, and switching it on to find out is exactly backwards. Four
// registry entries are currently off with "no working route" as the recorded
// reason (riiffs, perfumeo, bath-body-works-uk, lush), and at least one of
// those readings is now known to have come from the www-subdomain robots bug
// this file's robots probe fixes — see src/catalogue/attempt.ts's loadRobots
// comment. Without --dry-run the enabled flag is absolute, so nothing a
// disabled shop says can ever reach data/catalogue.
const askingAboutOneNamedShop = onlyShop !== null && dryRun;
const enabledShops = RETAILERS.filter(
  (r) =>
    (r.enabled || askingAboutOneNamedShop) &&
    r.adapter !== 'affiliate-feed' &&
    (!onlyShop || r.id === onlyShop),
);

if (askingAboutOneNamedShop && enabledShops.some((r) => !r.enabled)) {
  console.log(`${onlyShop} is disabled in the registry; asking anyway because this is a dry run that writes nothing.\n`);
}

// ── Registry order starves the shops that need a run most ───────────────────
// The harvest step in .github/workflows/catalogue-daily.yml is capped at 60
// minutes and run 261 (job 96314578076) used 60m12s of it — the cap landed
// mid-sweep, inside Emirates Oud. Every shop after that point in RETAILERS
// order was never attempted at all: kayali, zara, debenhams, lush,
// bath-body-works-uk and the rest simply do not appear in that run's output.
// They had been enabled for days and read as "harvested, found nothing" when
// the truth was "never asked".
//
// Registry order is alphabetical-ish by when a shop was added, which is
// unrelated to anything. Ordering by whether a shop has ever produced a live
// snapshot is not: a shop still on fixtures is the one whose result is
// unknown, and it is also the cheap one to ask, because a shop with no route
// fails in seconds while a shop with a working route spends its whole
// per-shop budget. Putting the unknowns first therefore costs the known-good
// shops almost nothing and is the difference between a never-live shop being
// measured every run and never being measured at all.
const neverLiveYet = (id: string) => store.read(id).source !== 'live';
const shops = [
  ...enabledShops.filter((r) => neverLiveYet(r.id)),
  ...enabledShops.filter((r) => !neverLiveYet(r.id)),
];

console.log(`\nSitemap harvest`);
console.log(`shops    ${shops.length}`);
console.log(`budget   ${maxPages} product pages each`);
if (shopMinutes !== null) console.log(`ceiling  ${shopMinutes} minutes each`);
if (refreshShare !== null) {
  console.log(`refresh  ${Math.round(refreshShare * 100)}% of each budget re-prices listings already held`);
}
if (dryRun) console.log(`mode     dry run, nothing written`);
console.log('');

let totalListings = 0;
let reached = 0;
// Tracked separately from the per-shop log line above because that line
// scrolls away. A shop stuck at zero looks identical, run after run, to a
// shop having one bad day — unless something rolls it up and says so at the
// end, which is exactly the gap docs/INGESTION-AUDIT.md found: eight shops
// sat on week-old fixture data with nothing ever surfacing that as a rollup.
const neverLive: string[] = [];
const zeroThisRun: string[] = [];

for (const retailer of shops) {
  // Not attempt.ts's `loadRobots`, which only ever asks `www.{domain}`. Two
  // enabled shops in this registry carry a subdomain in `domain`
  // (uk.shopfrenchavenue.com, uk.zimayaperfumes.com), so that address does not
  // resolve, the failure reads as "robots.txt unreachable", and every URL is
  // then treated as disallowed with no error line to show for it — see
  // src/catalogue/robotsSource.ts for the measurement.
  const robotsProbe = await probeRobots(retailer, http, BOT_HEADERS, ROBOTS_FALLBACK_HEADERS);
  const robots = robotsProbe.rules;
  // An unreachable robots.txt stops this shop dead — isAllowed treats it as
  // everything disallowed, which is the right call and is why the run has to
  // say what actually happened. Without this the shop reports "0 urls 0
  // fetched" and there is nothing at all to act on.
  if (robots.unavailable) {
    console.log(`      ${retailer.name}: robots.txt could not be read, so nothing may be fetched:`);
    for (const a of robotsProbe.attempts) {
      console.log(`        ${a.url}: HTTP ${a.status}${a.error ? ` — ${a.error}` : ''}`);
    }
  }
  const gapMs = Math.max(
    retailer.catalogue?.minRequestGapMs ?? 1500,
    (robots.crawlDelaySeconds ?? 0) * 1000,
    gapMinMs,
  );

  // What we already hold, so the walk can spend its budget on products it has
  // not seen instead of re-fetching the same head of the sitemap every hour.
  // Fixture listings are excluded: their URLs are invented and matching a real
  // sitemap against them would be meaningless.
  const prior = store.read(retailer.id);
  const knownUrls = new Map<string, string>(
    prior.source === 'live' ? prior.listings.map((l) => [l.url, l.lastSeenAt]) : [],
  );

  // onProgress fires on every fetch, not just at the end of this shop's run —
  // see the field's own comment in sitemapCrawl.ts. Plain console.log rather
  // than a carriage-return progress line: CI log capture is not a terminal,
  // and a `\r`-only update can sit in a buffer instead of reaching the log
  // stream, which would defeat the entire point of this. A line every 5
  // fetches is enough to keep the runner convinced the job is alive without
  // flooding the log — GitHub kills a job after 10 minutes of *no* output,
  // not after a lot of it. Without this, a shop whose fetches are all slow
  // (rather than erroring) can go silent long enough for the runner to decide
  // the job is stuck and kill it — which is exactly what happened to a run
  // against this exact codepath: no code change caused it, a slow shop just
  // went unnoticed for the same reason a slow shop always would have.
  const heartbeat = (fetched: number, found: number) => {
    if (fetched % 5 === 0) console.log(`      ${retailer.name}: ${fetched} pages fetched, ${found} found so far`);
  };

  // Retailers confirmed to run on Shopify get their official, paginated
  // /products.json catalogue tried first — no guessing which sitemap entries
  // are actually fragrance, the gap crawlViaSitemap has always had. Only
  // fall back to the sitemap walk if that endpoint turns out not to be
  // Shopify after all, or genuinely returns nothing.
  // Only override what was actually asked for: an absent flag has to leave
  // crawlViaSitemap's own defaults in place rather than pass undefined through
  // as if it were a value.
  const sweep = {
    ...(shopMinutes !== null ? { maxDurationMs: Math.round(shopMinutes * 60_000) } : {}),
    ...(refreshShare !== null ? { refreshShare } : {}),
  };

  let result: SitemapCrawlResult;
  if (retailer.shopifyStorefront) {
    const shopifyResult = await crawlViaShopifyProducts({
      retailer, http, robots, headers: BROWSER_HEADERS, maxPages, gapMs, onProgress: heartbeat,
    });

    // A storefront that is not established as quoting sterling is a different
    // outcome from a shop that yielded nothing, and it must not be allowed to
    // look like one. "Nothing this run" leaves the snapshot alone, which for a
    // currency refusal would mean the prices we have just refused to trust
    // stay on the site indefinitely. So this branch clears them and stops,
    // rather than falling through to the sitemap walk — that route reads the
    // same storefront and would put the same figures back through a different
    // parser.
    if (shopifyResult.isShopify && !shopifyResult.currency.isSterling) {
      // Clearing what we already hold needs evidence, not just an absence of
      // it. A shop that *named* a currency and it was not sterling, or named a
      // conversion, has told us the prices on file are the wrong unit, and
      // those have to come down. A shop that named nothing may simply have
      // failed to serve its homepage for a minute, and wiping thousands of
      // prices on a bad network minute is a self-inflicted outage — so that
      // case withholds the new read and leaves the snapshot for the next pass,
      // with the build-time scale audit (src/catalogue/priceScale.ts) as the
      // backstop for a shop that never names one and is genuinely foreign.
      const named = shopifyResult.currency.presented !== null;
      const quarantined = named
        ? quarantinePrices(
            prior.source === 'live' ? prior.listings : [],
            shopifyResult.currency.presented,
          )
        : { listings: [], cleared: 0 };
      console.log(
        `  ${retailer.name.padEnd(20)} ${String(shopifyResult.pagesFetched).padStart(5)} pages  ` +
          `no prices published — ${shopifyResult.currency.reason}`,
      );
      console.log(
        `::warning::${retailer.id}: ${shopifyResult.currency.reason}. ` +
          `${shopifyResult.listings.length} listings read, none priced; ` +
          (named
            ? `${quarantined.cleared} stored prices cleared.`
            : 'stored prices left in place pending a run that can establish the currency.'),
      );
      if (!dryRun && quarantined.cleared > 0) {
        store.write({
          retailerId: retailer.id,
          updatedAt: now,
          source: 'live',
          listings: quarantined.listings,
          runs: prior.source === 'live' ? prior.runs : [],
        });
      }
      zeroThisRun.push(retailer.id);
      continue;
    }

    // Which market produced these numbers, when it was not the obvious one.
    // A shop whose prices only appear under a particular request is a shop
    // whose prices can silently stop appearing — the day the storefront stops
    // honouring `?country=GB` it goes back to quoting a runner in dollars, the
    // currency guard withholds every price, and the run reports "no prices"
    // with nothing in the log to say what changed. This line is that
    // something.
    if (shopifyResult.market.label !== 'origin') {
      console.log(
        `  ${retailer.name.padEnd(20)} sterling market: ${shopifyResult.market.label} ` +
          `(${shopifyResult.market.why}) — the origin quotes this runner something else`,
      );
    }

    if (shopifyResult.isShopify && shopifyResult.listings.length > 0) {
      result = {
        listings: shopifyResult.listings,
        pagesFetched: shopifyResult.pagesFetched,
        urlsDiscovered: shopifyResult.listings.length,
        errors: shopifyResult.errors,
        sampledUrls: [],
      };
    } else {
      result = await crawlViaSitemap({
        retailer, http, robots, maxPages, gapMs, headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat, ...sweep,
      });
      // Whatever the /products.json attempt learned must survive the fallback.
      // It used not to: `result` was replaced wholesale by the sitemap walk's
      // own result, and with it went the only record of why the Shopify route
      // returned nothing. That is precisely how French Avenue and IBRAQ came
      // to report `0 urls  0 fetched  0 priced listings` with no error at all
      // on every run since they were enabled (run 261, job 96314578076) —
      // both routes had failed, and neither had left anything to read.
      result.errors.push(
        shopifyResult.isShopify
          ? `[products.json] Shopify payload but 0 listings from ${shopifyResult.pagesFetched} page(s)`
          : `[products.json] not a Shopify storefront (${shopifyResult.pagesFetched} page(s) tried)`,
        ...shopifyResult.errors.map((e) => `[products.json] ${e}`),
      );
    }
  } else {
    result = await crawlViaSitemap({
      retailer, http, robots, maxPages, gapMs, headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat, ...sweep,
    });
  }
  let withPrice = result.listings.filter((l) => l.priceGbp !== null);
  let viaProxy = false;
  let viaActor = false;
  // Set false only by the actor tier below, since that tier deliberately
  // fetches one page per section rather than walking a whole sitemap — see
  // its own comment on why `complete` cannot be allowed to follow from that.
  let actorPartial = false;

  // Only pay for retrieval where the free route genuinely found nothing.
  // Robots.txt itself is refetched through the proxy too: a shop that 403s
  // everything usually 403s that as well, and NO_RESTRICTIONS must never be
  // assumed just because the free fetch failed.
  let robotsForActor = robots;

  // ── Free tier 0.5: the shop was slow, not blocked ─────────────────────────
  // Tried before either metered tier and before them for a reason: a shop
  // whose every error is "HTTP 0" never refused us, it just had not answered
  // when createHttp's 25-second deadline fired. Neither a residential IP nor
  // a headless browser fixes a server that needs longer to think, so paying
  // for either would be money spent on the wrong diagnosis. See
  // `looksLikeTimeouts` in src/catalogue/strategy.ts for what qualifies and
  // for the John Lewis measurement that motivated it. One retry, one shop's
  // budget, no credential.
  let viaPatience = false;
  if (withPrice.length === 0 && looksLikeTimeouts(result.errors)) {
    console.log(`      ${retailer.name}: every failure was a timeout, retrying once at ${SLOW_SHOP_TIMEOUT_MS / 1000}s`);
    const patientHttp = createHttp({ timeoutMs: SLOW_SHOP_TIMEOUT_MS });
    const patientRobots = (await probeRobots(retailer, patientHttp, BOT_HEADERS, ROBOTS_FALLBACK_HEADERS)).rules;
    // Only if it is better than what we already have — see the note on the
    // proxied assignment below for the bug this shape prevents.
    if (!patientRobots.unavailable) robotsForActor = patientRobots;
    const retry = await crawlViaSitemap({
      retailer, http: patientHttp, robots: patientRobots, maxPages, gapMs,
      headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat, ...sweep,
    });
    const retryWithPrice = retry.listings.filter((l) => l.priceGbp !== null);
    if (retryWithPrice.length > 0) {
      result = retry;
      withPrice = retryWithPrice;
      viaPatience = true;
    } else {
      result.errors.push(...retry.errors.map((e) => `[patient] ${e}`));
    }
  }

  if (withPrice.length === 0 && useProxy) {
    const proxiedHttp = apifyProxyHttp(proxyConfig!);
    const proxiedProbe = await probeRobots(retailer, proxiedHttp, BOT_HEADERS, ROBOTS_FALLBACK_HEADERS);
    const proxiedRobots = proxiedProbe.rules;
    // Same reasoning as the direct probe above, and more urgent: a failure
    // here can be *ours* — a mistyped or wrong-kind credential answers 407,
    // which is nothing to do with the shop and would otherwise be reported as
    // the shop being unreachable. See apifyProxy.ts's own warning that the
    // proxy password and the API token are different secrets.
    if (proxiedRobots.unavailable) {
      console.log(`      ${retailer.name}: robots.txt unreadable through the Apify proxy too:`);
      for (const a of proxiedProbe.attempts) {
        console.log(`        [proxied] ${a.url}: HTTP ${a.status}${a.error ? ` — ${a.error}` : ''}`);
      }
    }
    // Adopted only when it actually says something. This used to be an
    // unconditional assignment, and it cost John Lewis the actor tier
    // entirely: that shop's robots.txt reads perfectly well from the runner,
    // the proxy tier then failed (as it fails everywhere — see
    // apifyAccount.ts), and its `unavailable` result overwrote the good rules
    // with "we know nothing". The actor block below then found every section
    // URL disallowed and rendered nothing, reporting "robots.txt unreachable"
    // about a shop whose robots.txt this very run had already read. Probe run
    // 10, job 96344415693: "Apify actor pages rendered this run: 0 of 10".
    // Knowledge must never be lost by a later, failed attempt to re-acquire
    // it.
    if (!proxiedRobots.unavailable) robotsForActor = proxiedRobots;
    const retry = await crawlViaSitemap({
      retailer, http: proxiedHttp, robots: proxiedRobots, maxPages, gapMs: 0,
      headers: BROWSER_HEADERS, knownUrls, onProgress: heartbeat,
    });
    const retryWithPrice = retry.listings.filter((l) => l.priceGbp !== null);
    if (retryWithPrice.length > 0) {
      result = retry;
      withPrice = retryWithPrice;
      viaProxy = true;
    } else {
      result.errors.push(...retry.errors.map((e) => `[proxied] ${e}`));
    }
  }

  // The third, most expensive tier: a real headless-browser render, for a
  // shop whose grid needs JavaScript to exist at all rather than an IP that
  // gets refused. Only ever tried once both cheaper tiers above have already
  // returned nothing, and only fetches each configured section's first page
  // — never a walk, never one request per product — for the same cost
  // reasoning docs/INGESTION.md sets out for every tier here, applied to a
  // route that costs roughly ten times as much per page.
  if (withPrice.length === 0 && useActor && retailer.catalogue) {
    // ── When the only way to read the rules is to render them ───────────────
    // A shop whose robots.txt neither the runner nor the proxy can fetch is a
    // shop this pipeline must treat as entirely forbidden, and rightly — but
    // that is a verdict reached on no evidence, and it is permanent. The
    // actor is a real browser on a residential IP and is the one route left
    // that can see the file. So it renders robots.txt first, at the cost of
    // one page, and then the file decides: parsed by the same parseRobots,
    // for the same pricesniffsbot, and a Disallow that covers a section URL
    // stops that URL exactly as it always would. See
    // robotsTextFromRenderedHtml's own comment for why reading a shop's
    // published crawl policy in order to obey it is the opposite of evading
    // it.
    if (robotsForActor.unavailable) {
      const robotsUrl = robotsCandidateUrls(retailer)[0]!;
      console.log(`      ${retailer.name}: robots.txt unreadable every other way, rendering it through the actor`);
      const renderedRobots = await actorRenderer!.render([robotsUrl]);
      const painted = renderedRobots.get(robotsUrl);
      const text = painted?.ok ? robotsTextFromRenderedHtml(painted.body) : null;
      if (text) {
        robotsForActor = parseRobots(text, 'pricesniffsbot');
        console.log(`      ${retailer.name}: robots.txt read through the actor, ${text.split('\n').length} lines`);
      } else {
        result.errors.push(
          `[actor] ${robotsUrl}: rendered but no robots.txt directives found` +
            (painted?.error ? ` — ${painted.error}` : ` (HTTP ${painted?.status ?? 0})`),
        );
      }
    }

    const targets = retailer.catalogue.sections.map((section) => ({
      id: section.id,
      url: section.urlTemplate.replace('{page}', String(retailer.catalogue!.firstPage)),
    }));
    const allowed = targets.filter((t) => isAllowed(robotsForActor, t.url));

    if (allowed.length === 0) {
      result.errors.push(
        robotsForActor.unavailable
          ? `[actor] robots.txt unreachable, so no section URL may be rendered`
          : `[actor] every section URL disallowed by robots.txt`,
      );
    } else {
      console.log(`      ${retailer.name}: rendering ${allowed.length} section page(s) through the Apify actor`);
      const rendered = await actorRenderer!.render(allowed.map((t) => t.url));
      let viaRenderedState = 0;
      const listings = allowed.flatMap(({ id, url }) => {
        const res = rendered.get(url);
        if (!res?.ok || !res.body) return [];

        const fromJsonLd = parseListings(res.body, { sectionId: id, pageUrl: url });
        if (fromJsonLd.length > 0) return fromJsonLd;

        // Only where the parser has already found nothing, and only for a shop
        // that has a reader registered. See src/catalogue/renderedState.ts for
        // why this second reading exists and how narrow it is meant to stay.
        const fromState = parseRenderedState(retailer.id, res.body, { sectionId: id, pageUrl: url });
        viaRenderedState += fromState.length;
        return fromState;
      });
      if (viaRenderedState > 0) {
        console.log(
          `      ${retailer.name}: ${viaRenderedState} listing(s) read from the rendered page's own` +
            ` state after JSON-LD found none`,
        );
      }
      const actorWithPrice = listings.filter((l) => l.priceGbp !== null);

      if (actorWithPrice.length > 0) {
        result = {
          listings, pagesFetched: allowed.length, urlsDiscovered: allowed.length, errors: [], sampledUrls: [],
        };
        withPrice = actorWithPrice;
        viaActor = true;
        actorPartial = true;
      } else {
        // The actor is the most expensive thing this pipeline can do, so when
        // it comes back with nothing the run has to say precisely what it got
        // — an API rejection, an empty render and an unrendered URL are three
        // different problems with three different fixes, and "0 priced
        // listings" alone distinguishes none of them.
        result.errors.push(
          `[actor] rendered ${allowed.length} section page(s), ` +
            `${listings.length} listings parsed, 0 priced`,
        );
        for (const { url } of allowed) {
          const res = rendered.get(url);
          result.errors.push(
            `[actor] ${url}: ` +
              (res
                ? `HTTP ${res.status}, ${res.body.length} bytes${res.error ? `, ${res.error}` : ''}`
                : 'no result returned'),
          );
        }
      }
    }
  }

  // A size the shop states in its own product URL but omits from the title,
  // put back where every consumer of a listing already looks for it. Recovery
  // of a stated fact, never a guess — see src/catalogue/sizeFromUrl.ts for
  // what qualifies and for the Zimaya measurement (84 priced listings, all 84
  // rejected for having no size, 50 of them carrying one in their URL).
  let sizesRecovered = 0;
  withPrice = withPrice.map((l) => {
    const titled = titleWithSizeFromUrl(l.rawTitle, l.url);
    if (titled === l.rawTitle) return l;
    sizesRecovered++;
    return { ...l, rawTitle: titled };
  });

  totalListings += withPrice.length;
  if (withPrice.length > 0) reached++;

  console.log(
    `  ${retailer.name.padEnd(20)} ${String(result.urlsDiscovered).padStart(5)} urls  ` +
      `${String(result.pagesFetched).padStart(3)} fetched  ` +
      `${String(withPrice.length).padStart(3)} priced listings` +
      (viaPatience ? '  [via longer timeout]' : '') +
      (viaProxy ? '  [via Apify proxy]' : '') +
      (viaActor ? '  [via Apify actor]' : '') +
      (sizesRecovered ? `  [${sizesRecovered} sizes read from product URLs]` : '') +
      (result.errors.length ? `  (${result.errors.length} errors)` : ''),
  );
  // Metered-tier errors first, then the rest. A shop that failed through
  // every tier accumulates one error per tier and the free tier's come first
  // in the array, so a plain "print the first few" buries exactly the lines
  // that cost money to produce — which is what happened to John Lewis on
  // probe run 13 (job 96347018835): the actor ran for 47 seconds, wrote five
  // per-URL diagnostics, and every one of them was cut off by the cheaper
  // tiers' four.
  const metered = result.errors.filter((e) => e.startsWith('[actor]'));
  const rest = result.errors.filter((e) => !e.startsWith('[actor]'));
  for (const e of [...metered, ...rest].slice(0, 8)) console.log(`      ${e}`);

  // A shop that fetched its full budget and priced nothing, with no errors to
  // read, is the one failure this log used to be unable to describe. Show what
  // was actually asked for: "70 fetched, 0 priced" against /about-us and
  // /delivery-information is a completely different problem from the same line
  // against real product pages, and the URLs are the only thing that tells them
  // apart. Three shops sat in the first state for weeks without it being
  // visible here — see the pathOf comment in src/catalogue/sitemapCrawl.ts.
  if (withPrice.length === 0 && result.pagesFetched > 0 && result.sampledUrls.length > 0) {
    console.log(`      fetched but nothing priced, e.g.:`);
    for (const u of result.sampledUrls.slice(0, 3)) console.log(`        ${u}`);
  }

  // A shop that DID price is exactly the one a currency probe needs a real
  // product page from — `npm run currency:probe -- --product=<url>` refuses
  // any host that is not the retailer's own domain, so guessing is not an
  // option. This was previously only ever logged for the zero-priced case
  // above, so proving sterling on a shop that already harvests (riiffs,
  // perfumeo) meant reading source to find sampledUrls existed at all.
  //
  // Deliberately `withPrice[0]!.url`, not `result.sampledUrls[0]`: sampledUrls
  // is every fetched URL in fetch order regardless of outcome, so its first
  // entry can be the one page in the batch that was a category/index URL
  // rather than a product — riiffs' own first run printed
  // uk.riiffsperfumes.com/shop/ this way, which carries no JSON-LD Product
  // node to probe. withPrice is already filtered to listings a real price was
  // parsed from, so its URL is guaranteed to be a genuine product page.
  if (withPrice.length > 0) {
    console.log(`      sample priced URL: ${withPrice[0]!.url}`);
  }

  if (withPrice.length === 0) {
    zeroThisRun.push(retailer.id);
    if (prior.source !== 'live') neverLive.push(retailer.id);
  }

  if (dryRun || withPrice.length === 0) continue;

  // Live data and fixture data must never be reconciled against each other.
  const existing = prior.source === 'live' ? prior.listings : [];

  // A cost-capped sample is not evidence of absence.
  //
  // This used to pass `complete: true` unconditionally, which told reconcile()
  // that everything it did not see had gone off sale. But `maxPages` stops the
  // walk long before a real shop's catalogue ends — 60 pages out of Beauty
  // Base's 829 — so "not in this run" overwhelmingly meant "not sampled this
  // run", not "withdrawn". Every hourly run therefore delisted the entire
  // previous run's findings in one stroke: Beauty Base held 300 distinct SKUs
  // but only ever 60 active, and LOOKFANTASTIC's stored listings all carried
  // the same delistedAt to the millisecond. The stored catalogue could never
  // exceed one run's sample no matter how often it ran.
  //
  // Absence only means withdrawal when the walk actually reached the end of
  // what it discovered, which is the case for a genuinely small catalogue and
  // not for a budgeted sample of a large one.
  //
  // The actor tier is never "complete" by this test even though it sets
  // pagesFetched equal to urlsDiscovered: it deliberately renders only page
  // one of each configured section, on purpose, for the cost reasons in its
  // own comment above — that is a fixed-size sample of an unknown-size
  // catalogue, exactly the shape this whole guard exists to catch, and it
  // would trivially pass the >= test above without actorPartial's override.
  const complete = result.pagesFetched >= result.urlsDiscovered && !actorPartial;

  const outcome = reconcile({
    existing, crawled: withPrice, retailerId: retailer.id, now, complete,
  });

  store.write({
    retailerId: retailer.id,
    updatedAt: now,
    source: 'live',
    listings: outcome.listings,
    runs: prior.source === 'live' ? prior.runs : [],
  });

  // The stored total is the number that actually matters now: a run's own
  // count only ever reports one budget's worth, so growth is invisible without
  // it.
  const active = outcome.listings.filter((l) => l.status === 'active').length;
  console.log(
    `      stored: ${active} active of ${outcome.listings.length} known` +
      `  (+${outcome.newIds.length} new` +
      (outcome.delistedIds.length ? `, -${outcome.delistedIds.length} delisted` : '') +
      `${complete ? '' : ', partial walk so nothing delisted'})`,
  );
}

console.log(`\n${reached} of ${shops.length} shops yielded real priced listings`);
console.log(`${totalListings} listings total`);
if (zeroThisRun.length) console.log(`zero this run: ${zeroThisRun.join(', ')}`);
if (neverLive.length) console.log(`never once live: ${neverLive.join(', ')} — still on fixtures, excluded from the site`);
if (actorRenderer) console.log(`Apify actor pages rendered this run: ${actorRenderer.used()} of ${MAX_ACTOR_PAGES_PER_RUN} budgeted`);
console.log('');

if (reached === 0) {
  console.error('Nothing harvested. Not writing anything rather than showing an empty app.');
  process.exit(1);
}
