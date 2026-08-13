/**
 * Read each shop's own delivery page, and record what it says.
 *
 *   npm run shipping:discover
 *   npm run shipping:discover -- --shop=boots
 *   npm run shipping:discover -- --write     # promote what the pages confirm
 *   npm run shipping:discover -- --all       # every retailer, confirmed ones too
 *
 * ── Who this runs for, and why that changed ──────────────────────────────────
 * It used to run only for shops with `shipping.standardGbp === null`, on the
 * reasoning that a missing flat rate was the only thing keeping a shop
 * disabled. That reasoning covered the wrong population. Measured on
 * 2026-08-13: of the 22 enabled shops carrying `confidence: 'unverified'`, 20
 * had never been fetched by this tool even once, because they *have* a figure —
 * researched, plausible, never checked against the shop. Those 20 sit behind
 * two thirds of the site's live listings and decide most of its "Cheapest"
 * labels. A tool for verifying delivery costs that skipped every shop with an
 * unverified delivery cost was, in effect, not running.
 *
 * The default population is now: every enabled shop whose delivery rule is not
 * confirmed, plus every shop of any kind with no rate at all.
 *
 * ── How a page is found ──────────────────────────────────────────────────────
 * Two routes, cheapest first, and the first is new: fetch the shop's own home
 * page and read the delivery links out of its footer
 * (src/catalogue/shippingPageFinder.ts). A shop always links its delivery terms
 * from its own footer. Guessing at sixteen conventional paths — which is all
 * this did before — returned "none of the candidate paths exist" for nine of
 * twenty-nine shops in the last run, every one of them a real shop with a real
 * delivery page at an address Shopify's conventions never predicted.
 *
 * ── What it may write ────────────────────────────────────────────────────────
 * With `--write`, and only then, it promotes `confidence` to `confirmed` for a
 * shop whose page agrees with the figure the registry already holds, and
 * records `standardRateNotPublished` for a shop whose page states delivery
 * terms in detail and names no flat rate. Both carry `source`: the URL, the
 * sentence, the date.
 *
 * It never writes a figure the registry does not already hold, and never picks
 * a side when the page and the registry disagree. Those come out as
 * PROPOSE and DISAGREES for a human, exactly as this tool has always behaved.
 * See src/catalogue/shippingRegistryPatch.ts for that line and the argument
 * for where it sits.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { loadRobots } from '../src/catalogue/attempt.js';
import { isAllowed } from '../src/catalogue/robots.js';
import { SHIPPING_PAGE_PATHS, readShippingTerms } from '../src/catalogue/shippingTerms.js';
import { deliveryLinksFrom, urlLooksLikeDeliveryPage } from '../src/catalogue/shippingPageFinder.js';
import {
  proposeShippingUpdate,
  applyShippingPatch,
  type PageEvidence,
  type ShippingPatch,
} from '../src/catalogue/shippingRegistryPatch.js';
import { quoteShipping, QUOTE_POSTCODE } from '../src/catalogue/shippingQuote.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');
const includeEverything = process.argv.includes('--all');
const shouldWrite = process.argv.includes('--write');
// Opt-in debug mode: record the full extracted text of every delivery page
// fetched for this one retailer, not just the regex-matched sentences. For
// diagnosing a shop whose page returns 200 but whose rate the parser missed
// because of unanticipated phrasing. Never runs on ordinary scheduled calls.
const rawShop = arg('raw');

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

/** Politeness between two requests to the same shop. */
const REQUEST_GAP_MS = 1200;
/**
 * Stop reading a shop's pages once this many have been fetched successfully.
 *
 * A shop that has said nothing usable across six of its own policy pages is not
 * about to say it on a seventh, and the cost of finding out is paid by the
 * shop's servers. Discovery stops earlier still the moment a clean rate turns
 * up, which on a well-behaved shop is the first page tried.
 */
const MAX_PAGES_READ = 6;

const today = new Date().toISOString().slice(0, 10);

/**
 * Whose delivery terms are worth reading today.
 *
 * Exported shape rather than an inline filter so the choice is stated once and
 * can be argued with. `--all` adds the confirmed shops back, for spot-checking
 * figures we already believe.
 */
export function discoveryTargets(
  retailers: readonly (typeof RETAILERS)[number][],
  opts: { onlyShop?: string | null; includeEverything?: boolean } = {},
) {
  if (opts.onlyShop) return retailers.filter((r) => r.id === opts.onlyShop);
  if (opts.includeEverything) return [...retailers];
  return retailers.filter(
    (r) =>
      // Every shop we actually show, whose delivery rule has never been read
      // off the shop itself. This is the population that decides the site's
      // delivered prices.
      (r.enabled && r.shipping.confidence !== 'confirmed') ||
      // And every shop of any kind with no rate at all, enabled or not: that is
      // the state that keeps a researched shop switched off.
      r.shipping.standardGbp === null,
  );
}

const shops = discoveryTargets(RETAILERS, {
  onlyShop: onlyShop ?? rawShop,
  includeEverything,
});

interface PageFinding {
  url: string;
  status: number;
  /** Whether this URL came from the shop's own footer or from the path list. */
  foundBy: 'link' | 'path';
  standardGbp: number | null;
  freeOverGbp: number | null;
  caveats: string[];
  standardRateNotStated: boolean;
  evidence: { kind: string; amountGbp: number; sentence: string; isUpgradeTier: boolean }[];
  /** Only populated in --raw=<retailerId> debug mode. */
  rawText?: string;
}

interface ShopOutcome {
  retailerId: string;
  name: string;
  homepage: string;
  currentStandardGbp: number | null;
  currentFreeOverGbp: number | null;
  currentConfidence: string;
  enabled: boolean;
  pagesTried: number;
  /** Delivery links read out of the shop's own home page. */
  linksFound: { url: string; linkText: string }[];
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
  /** What the evidence entitles us to change, if anything. */
  patch: ShippingPatch | null;
  /** What a human should do next, in one line. */
  verdict: string;
}

const http = createHttp();
const pause = () => new Promise((r) => setTimeout(r, REQUEST_GAP_MS));

console.log('\nShipping terms discovery');
console.log(`shops    ${shops.length}`);
console.log(`target   an unverified delivery rule, or no rate at all`);
console.log(`writing  ${shouldWrite ? 'yes — confirmations only' : 'no (report only)'}\n`);

const outcomes: ShopOutcome[] = [];

for (const retailer of shops) {
  const origin = retailer.homepage.replace(/\/$/, '');
  const outcome: ShopOutcome = {
    retailerId: retailer.id,
    name: retailer.name,
    homepage: retailer.homepage,
    currentStandardGbp: retailer.shipping.standardGbp,
    currentFreeOverGbp: retailer.shipping.freeOverGbp,
    currentConfidence: retailer.shipping.confidence,
    enabled: retailer.enabled,
    pagesTried: 0,
    linksFound: [],
    findings: [],
    quote: null,
    errors: [],
    patch: null,
    verdict: '',
  };

  const robots = await loadRobots(retailer, http);
  const isRawTarget = rawShop === retailer.id;

  // ── route one: ask the shop where its delivery terms are ───────────────────
  const candidates: { url: string; foundBy: 'link' | 'path' }[] = [];
  if (isAllowed(robots, `${origin}/`)) {
    outcome.pagesTried++;
    const home = await http(`${origin}/`, BROWSER_HEADERS);
    if (home.ok) {
      const links = deliveryLinksFrom(home.body, origin);
      outcome.linksFound = links.map((l) => ({ url: l.url, linkText: l.linkText }));
      for (const l of links) candidates.push({ url: l.url, foundBy: 'link' });
    } else {
      outcome.errors.push(`${origin}/: HTTP ${home.status}${home.error ? ` ${home.error}` : ''}`);
    }
    await pause();
  } else {
    outcome.errors.push(`${origin}/: disallowed by robots.txt — footer links not read`);
  }

  // ── route two: the conventional addresses, for anything the footer missed ──
  for (const path of SHIPPING_PAGE_PATHS) {
    const url = `${origin}${path}`;
    if (!candidates.some((c) => c.url === url)) candidates.push({ url, foundBy: 'path' });
  }

  let pagesRead = 0;
  for (const candidate of candidates) {
    if (pagesRead >= MAX_PAGES_READ) break;
    // A clean rate is the answer. Everything after it is a request the shop did
    // not need to serve.
    if (outcome.findings.some((f) => f.standardGbp !== null && f.caveats.length === 0)) break;

    if (!isAllowed(robots, candidate.url)) {
      outcome.errors.push(`${candidate.url}: disallowed by robots.txt — not fetched`);
      continue;
    }

    outcome.pagesTried++;
    const res = await http(candidate.url, BROWSER_HEADERS);
    if (!res.ok) {
      // A 404 on a guessed path is ordinary; a 404 on a link the shop itself
      // published is not, so it is recorded either way but only the second is
      // worth a human's attention.
      if (res.status !== 404 || candidate.foundBy === 'link') {
        outcome.errors.push(`${candidate.url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      }
      await pause();
      continue;
    }

    pagesRead++;
    const reading = readShippingTerms(res.body, {
      includeRawText: isRawTarget,
      deliveryPage: urlLooksLikeDeliveryPage(candidate.url),
    });
    await pause();
    if (reading.claims.length === 0 && !isRawTarget) continue;

    outcome.findings.push({
      url: candidate.url,
      status: res.status,
      foundBy: candidate.foundBy,
      standardGbp: reading.standardGbp,
      freeOverGbp: reading.freeOverGbp,
      caveats: reading.caveats,
      standardRateNotStated: reading.standardRateNotStated,
      evidence: reading.claims.map((c) => ({
        kind: c.kind,
        amountGbp: c.amountGbp,
        sentence: c.evidence,
        isUpgradeTier: c.isUpgradeTier,
      })),
      ...(isRawTarget ? { rawText: reading.rawText } : {}),
    });
  }

  const withStandard = outcome.findings.filter((f) => f.standardGbp !== null);
  const clean = withStandard.filter((f) => f.caveats.length === 0);
  const absence = outcome.findings.filter((f) => f.standardRateNotStated && f.caveats.length === 0);

  // Third tier, only where the pages could not answer cleanly: ask the shop's
  // own checkout estimator what it would charge to send one cheap bottle to a
  // London postcode. See src/catalogue/shippingQuote.ts for exactly what that
  // exchange is and why it stops short of a real checkout.
  if (clean.length === 0 && absence.length === 0) {
    const rateUrl = `${origin}/cart/shipping_rates.json`;
    if (!isAllowed(robots, rateUrl)) {
      // Shopify's stock robots.txt carries `Disallow: /cart`, so on most
      // Shopify shops this route is closed before it starts. That is the
      // shop's own instruction and is honoured, but it has to be *recorded*:
      // an unexplained absence in the report reads as "the tool did not try".
      outcome.errors.push(`${rateUrl}: disallowed by robots.txt — checkout estimator not attempted`);
    } else {
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
  }

  const quotedRates = outcome.quote?.ok ? outcome.quote.rates : [];
  // The cheapest quoted rate is the standard one by definition: everything
  // dearer is an upgrade the buyer opts into.
  const quotedStandard = quotedRates[0] ?? null;

  // ── what, if anything, this entitles us to change ──────────────────────────
  //
  // Only a page reading feeds the registry. A checkout quote is a real number
  // but it is a quote for one basket to one postcode, not the shop's published
  // standard rate, and the difference matters too much to blur.
  const best = clean[0] ?? absence[0] ?? null;
  if (best) {
    const evidence: PageEvidence = {
      url: best.url,
      standardGbp: best.standardGbp,
      freeOverGbp: best.freeOverGbp,
      caveats: best.caveats,
      standardRateNotStated: best.standardRateNotStated,
      // The sentence that gets quoted into the registry. For a rate, the one
      // the rate was read from. For an absence, the longest thing the page said
      // about delivery: "free over £50, a nominal fee applies below" is worth
      // recording, and "free shipping over £50" on its own is not, even though
      // both support the same finding.
      quote:
        best.evidence.find((e) => e.kind === 'standard-cost' && !e.isUpgradeTier)?.sentence ??
        [...best.evidence]
          .filter((e) => !e.isUpgradeTier)
          .sort((a, b) => b.sentence.length - a.sentence.length)[0]?.sentence ??
        best.evidence[0]?.sentence ??
        '',
    };
    outcome.patch = proposeShippingUpdate(retailer, evidence, today);
  }

  if (outcome.patch && outcome.patch.write) {
    outcome.verdict =
      `${outcome.patch.action === 'confirm-rate' ? 'CONFIRMED' : 'NO RATE PUBLISHED'}: ${outcome.patch.detail}`;
  } else if (outcome.patch) {
    outcome.verdict = `${outcome.patch.action.toUpperCase()}: ${outcome.patch.detail}`;
  } else if (clean.length === 0 && quotedStandard && quotedStandard.currency === 'GBP') {
    outcome.verdict =
      `PROPOSE (checkout): £${quotedStandard.priceGbp.toFixed(2)} quoted as "${quotedStandard.name}" ` +
      `on a £${outcome.quote!.basketGbp?.toFixed(2)} basket to ${QUOTE_POSTCODE} — ` +
      `${quotedRates.length} rate(s) offered`;
  } else if (clean.length === 0 && quotedStandard) {
    outcome.verdict =
      `CURRENCY MISMATCH: checkout quoted ${quotedStandard.currency} ${quotedStandard.priceGbp.toFixed(2)}, not GBP — this shop may not sell in sterling`;
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
      `${outcome.linksFound.length ? ` +${outcome.linksFound.length} links` : '          '}` +
      `${outcome.quote ? (outcome.quote.ok ? '  +quote' : '  +quote(x)') : '        '}   ${mark}`,
  );
  if (outcome.quote && !outcome.quote.ok) console.log(`      quote: ${outcome.quote.error}`);
  for (const e of outcome.errors.slice(0, 2)) console.log(`      ${e}`);

  outcomes.push(outcome);
}

// ── writing back ─────────────────────────────────────────────────────────────
const writable = outcomes.filter((o) => o.patch?.write);
let written = 0;
if (shouldWrite && writable.length > 0) {
  const registryPath = resolve(root, 'src/config/retailers.ts');
  let source = readFileSync(registryPath, 'utf8');
  for (const o of writable) {
    try {
      source = applyShippingPatch(source, o.retailerId, o.patch!.write!);
      written++;
    } catch (err) {
      // A patch that does not apply is a bug in the patcher or an unexpected
      // shape in the registry. Either way it stops that shop and not the run,
      // and it is recorded rather than swallowed.
      o.errors.push(`registry patch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (written > 0) writeFileSync(registryPath, source);
}

const reportPath = resolve(root, 'data/shipping-discovery-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  `${JSON.stringify({ checkedAt: new Date().toISOString(), wrote: written, outcomes }, null, 2)}\n`,
);

const confirmed = outcomes.filter((o) => o.patch?.action === 'confirm-rate').length;
const absences = outcomes.filter((o) => o.patch?.action === 'confirm-absence').length;
const proposals = outcomes.filter((o) => o.patch?.action === 'propose-rate').length;
const disagreements = outcomes.filter((o) => o.patch?.action === 'disagrees');

console.log(
  `\n${confirmed} shop(s) confirmed against their own page, ${absences} recorded as publishing no rate.`,
);
console.log(`${proposals} first-time figure(s) waiting on a human, ${disagreements.length} disagreement(s).`);
for (const d of disagreements) console.log(`  DISAGREES  ${d.name}: ${d.patch!.detail}`);
console.log(
  shouldWrite
    ? `Registry updated for ${written} shop(s). Nothing was invented: every write carries the URL and the sentence.`
    : 'Nothing was written to the registry — pass --write to promote confirmations.',
);
console.log(`Report: data/shipping-discovery-report.json\n`);
