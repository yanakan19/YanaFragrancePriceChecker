/**
 * Find each disabled retailer's standard delivery cost, and report the evidence.
 *
 *   npm run shipping:discover
 *   npm run shipping:discover -- --shop=armaf
 *   npm run shipping:discover -- --all      # include already-enabled shops too
 *
 * Retailers are disabled purely because `shipping.standardGbp` is null: the
 * free-over threshold is findable by research, the flat rate below it usually
 * is not. Two tiers, cheapest first:
 *
 *   1. Read the shop's own delivery policy page and parse what it states.
 *   2. Where that says nothing usable, ask the shop's own checkout estimator
 *      what it would charge to deliver one cheap bottle to a London postcode.
 *      See src/catalogue/shippingQuote.ts for exactly what that exchange is.
 *
 * Findings go to data/shipping-discovery-report.json with the sentence or the
 * quoted rate each figure came from.
 *
 * ── What this deliberately does not do ───────────────────────────────────────
 * It does not edit the registry. It does not enable anybody. `standardGbp` is
 * the one field where a confidently wrong value is worse than a null, because
 * delivered price is the comparison's default sort and a too-low figure makes
 * a shop win it falsely. So this gathers evidence and quotes it; a human reads
 * the quote and types the number. That division is the point of the tool, not
 * a limitation of it.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { loadRobots } from '../src/catalogue/attempt.js';
import { isAllowed } from '../src/catalogue/robots.js';
import { SHIPPING_PAGE_PATHS, readShippingTerms } from '../src/catalogue/shippingTerms.js';
import { quoteShipping, QUOTE_POSTCODE } from '../src/catalogue/shippingQuote.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');
const includeEnabled = process.argv.includes('--all');

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

const http = createHttp();

const shops = RETAILERS.filter(
  (r) =>
    (onlyShop ? r.id === onlyShop : true) &&
    // The point is the shops we cannot enable. --all overrides for spot-checks
    // against a shop whose figures we already believe.
    (includeEnabled || r.shipping.standardGbp === null),
);

interface PageFinding {
  url: string;
  status: number;
  standardGbp: number | null;
  freeOverGbp: number | null;
  caveats: string[];
  evidence: { kind: string; amountGbp: number; sentence: string; isUpgradeTier: boolean }[];
}

interface ShopOutcome {
  retailerId: string;
  name: string;
  homepage: string;
  currentStandardGbp: number | null;
  currentFreeOverGbp: number | null;
  enabled: boolean;
  pagesTried: number;
  findings: PageFinding[];
  /** What the shop's own checkout estimator quoted, when the page could not say. */
  quote: {
    ok: boolean;
    postcode: string;
    quotedAgainst: string | null;
    basketGbp: number | null;
    rates: { name: string; priceGbp: number; currency: string }[];
    error: string | null;
    steps: string[];
  } | null;
  errors: string[];
  /** What a human should do next, in one line. */
  verdict: string;
}

console.log('\nShipping terms discovery');
console.log(`shops    ${shops.length}`);
console.log(`target   the flat standard rate, which research could not reach\n`);

const outcomes: ShopOutcome[] = [];

for (const retailer of shops) {
  const origin = retailer.homepage.replace(/\/$/, '');
  const outcome: ShopOutcome = {
    retailerId: retailer.id,
    name: retailer.name,
    homepage: retailer.homepage,
    currentStandardGbp: retailer.shipping.standardGbp,
    currentFreeOverGbp: retailer.shipping.freeOverGbp,
    enabled: retailer.enabled,
    pagesTried: 0,
    findings: [],
    quote: null,
    errors: [],
    verdict: '',
  };

  const robots = await loadRobots(retailer, http);

  for (const path of SHIPPING_PAGE_PATHS) {
    const url = `${origin}${path}`;
    if (!isAllowed(robots, url)) {
      outcome.errors.push(`${url}: disallowed by robots.txt — not fetched`);
      continue;
    }

    outcome.pagesTried++;
    const res = await http(url, BROWSER_HEADERS);
    if (!res.ok) {
      // A 404 here is ordinary: these are candidate paths, most will not exist.
      if (res.status !== 404) outcome.errors.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      continue;
    }

    const reading = readShippingTerms(res.body);
    if (reading.claims.length === 0) continue;

    outcome.findings.push({
      url,
      status: res.status,
      standardGbp: reading.standardGbp,
      freeOverGbp: reading.freeOverGbp,
      caveats: reading.caveats,
      evidence: reading.claims.map((c) => ({
        kind: c.kind,
        amountGbp: c.amountGbp,
        sentence: c.evidence,
        isUpgradeTier: c.isUpgradeTier,
      })),
    });

    // Politeness between requests to the same shop.
    await new Promise((r) => setTimeout(r, 1200));
  }

  const withStandard = outcome.findings.filter((f) => f.standardGbp !== null);
  const clean = withStandard.filter((f) => f.caveats.length === 0);

  // Second tier, only where the policy page could not answer cleanly: ask the
  // shop's own checkout estimator what it would charge to send one cheap
  // bottle to a London postcode. See src/catalogue/shippingQuote.ts for exactly
  // what that exchange is and why it stops short of a real checkout.
  if (clean.length === 0 && isAllowed(robots, `${origin}/cart/shipping_rates.json`)) {
    const q = await quoteShipping(origin);
    outcome.quote = {
      ok: q.ok,
      postcode: QUOTE_POSTCODE,
      quotedAgainst: q.productTitle,
      basketGbp: q.productPriceGbp,
      rates: q.rates,
      error: q.error,
      steps: q.steps,
    };
  }

  const quotedRates = outcome.quote?.ok ? outcome.quote.rates : [];
  // The cheapest quoted rate is the standard one by definition: everything
  // dearer is an upgrade the buyer opts into.
  const quotedStandard = quotedRates[0] ?? null;

  if (clean.length === 0 && quotedStandard && quotedStandard.currency === 'GBP') {
    outcome.verdict =
      `CONFIRM (checkout): £${quotedStandard.priceGbp.toFixed(2)} quoted as "${quotedStandard.name}" ` +
      `on a £${outcome.quote!.basketGbp?.toFixed(2)} basket to ${QUOTE_POSTCODE} — ` +
      `${quotedRates.length} rate(s) offered`;
  } else if (clean.length === 0 && quotedStandard) {
    outcome.verdict =
      `CURRENCY MISMATCH: checkout quoted ${quotedStandard.currency} ${quotedStandard.priceGbp.toFixed(2)}, not GBP — this shop may not sell in sterling`;
  } else if (clean.length > 0) {
    outcome.verdict =
      `CONFIRM: £${clean[0]!.standardGbp!.toFixed(2)} standard, from ${clean[0]!.url} — read the quoted sentence, then set standardGbp and enable`;
  } else if (withStandard.length > 0) {
    outcome.verdict =
      `AMBIGUOUS: candidate £${withStandard[0]!.standardGbp!.toFixed(2)} but the page is unclear — ${withStandard[0]!.caveats.join('; ')}`;
  } else if (outcome.findings.length > 0) {
    outcome.verdict = 'NO RATE STATED: the delivery page was read but never names a flat standard charge';
  } else if (outcome.errors.length > 0) {
    outcome.verdict = 'UNREACHABLE: no delivery page could be fetched — see errors';
  } else {
    outcome.verdict = 'NO PAGE FOUND: none of the candidate paths exist on this shop';
  }

  const mark = outcome.verdict.split(':')[0]!;
  console.log(
    `  ${retailer.name.padEnd(24)} ${String(outcome.findings.length).padStart(2)} pages` +
      `${outcome.quote ? (outcome.quote.ok ? '  +quote' : '  +quote(x)') : '        '}   ${mark}`,
  );
  if (outcome.quote && !outcome.quote.ok) console.log(`      quote: ${outcome.quote.error}`);
  for (const e of outcome.errors.slice(0, 2)) console.log(`      ${e}`);

  outcomes.push(outcome);
}

const reportPath = resolve(root, 'data/shipping-discovery-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  `${JSON.stringify({ checkedAt: new Date().toISOString(), outcomes }, null, 2)}\n`,
);

const confirmable = outcomes.filter((o) => o.verdict.startsWith('CONFIRM')).length;
const viaCheckout = outcomes.filter((o) => o.verdict.startsWith('CONFIRM (checkout)')).length;
console.log(
  `\n${confirmable} of ${outcomes.length} shops produced an unambiguous standard rate` +
    (viaCheckout ? ` (${viaCheckout} of them from the checkout estimator)` : ''),
);
console.log('Nothing was written to the registry — confirm each quoted sentence first.');
console.log(`Report: data/shipping-discovery-report.json\n`);
