/**
 * Read each shop's own delivery page, and record what it says.
 *
 *   npm run shipping:discover
 *   npm run shipping:discover -- --shop=boots
 *   npm run shipping:discover -- --write     # promote what the pages confirm
 *   npm run shipping:discover -- --all       # every retailer, confirmed ones too
 *   npm run shipping:discover -- --budget=10 # only the 10 least recently checked
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
 * confirmed, plus every shop of any kind with no rate at all, plus every
 * enabled shop whose rule *is* confirmed but has not been re-read in
 * `STALE_CONFIRMATION_DAYS` — see src/catalogue/shippingDiscoveryQueue.ts for
 * why a confirmation ages back into this population rather than staying
 * trusted forever.
 *
 * ── And why it is now rationed ───────────────────────────────────────────────
 * That correction took the step from 3m59s (run #172) to 48m05s (run #180, 49
 * shops, 714 pages) — and #180 was cancelled at the job's 100 minute cap during
 * the harvest that followed it, losing the harvest. `--budget=N` bounds a run
 * to the N least recently checked shops and records when each was last read in
 * data/shipping-discover-state.json, so coverage becomes a rotation over a few
 * cycles rather than one sweep the job cannot afford. Everything below still
 * applies unchanged to whichever shops a given run reads. The argument for the
 * trade is in src/catalogue/shippingDiscoveryQueue.ts.
 *
 * `--shop=`, `--raw=` and `--all` are never rationed: those mean "read exactly
 * what I asked for".
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
 *
 * ── Why a killed run no longer loses its cycle ───────────────────────────────
 * This used to gather every shop's outcome in memory and write the registry
 * patch and the report once, after the loop over `shops` finished. The
 * scheduled job wraps this whole script in `timeout 900` as a backstop
 * against a hung request, and from 2026-08-25T12:43 onward every scheduled
 * cycle hit that backstop mid-batch — confirmed by reading the job logs for
 * runs #334, #340, #341 and #342 — which meant a process killed by `timeout`
 * discarded everything the cycle had already found. See
 * src/catalogue/shippingDiscoveryReport.ts's header for the full evidence,
 * and SHOP_TIME_CEILING_MS's own doc comment below for the shop that was
 * causing it.
 *
 * Both halves of that are fixed now, not just one: every shop's outcome,
 * registry write and rotation-ledger stamp are written to disk the moment
 * that shop finishes, so a killed run keeps everything up to the point it
 * died (see the "incremental persistence" block ahead of the main loop); and
 * SHOP_TIME_CEILING_MS plus RUN_TIME_CEILING_MS make the run stop itself with
 * room to spare, so hitting the external `timeout 900` at all should go back
 * to meaning a genuine hang rather than the routine way a cycle ends.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
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
import { quoteShipping, QUOTE_POSTCODE, shouldAttemptCheckoutQuote } from '../src/catalogue/shippingQuote.js';
import {
  parseDiscoveryState,
  selectDueTargets,
  recordChecked,
  isConfirmationStale,
} from '../src/catalogue/shippingDiscoveryQueue.js';
import { shippingDiscoveryReportWriter } from '../src/catalogue/shippingDiscoveryReport.js';

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
// How many shops this run may read, least-recently-checked first. Absent or
// non-numeric means no bound, which is what an interactive run wants. The
// scheduled run passes one because the full population no longer fits in the
// job — see src/catalogue/shippingDiscoveryQueue.ts for the measurement.
const budgetArg = arg('budget');
const budget = budgetArg !== null && /^\d+$/.test(budgetArg) ? Number(budgetArg) : null;

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

/**
 * Wall-clock ceiling for one shop's entire read: its home page, every
 * candidate path tried after it, and the checkout estimator.
 *
 * ── Measured, not guessed ────────────────────────────────────────────────────
 * John Lewis is the confirmed cause of every scheduled cycle hitting the
 * job's 900s backstop from 2026-08-25T12:43 onward (runs #334, #340, #341,
 * #342 — read from their job logs; named explicitly in run #343's commit
 * message). It answers every request — the home page and all sixteen
 * SHIPPING_PAGE_PATHS candidates — with `HTTP 0 AbortError: This operation
 * was aborted`, which is createHttp's default 25s per-request timeout firing
 * every time. At REQUEST_GAP_MS between requests, seventeen such requests
 * cost 17 * (25s + 1.2s) = 445.4s, which is exactly what three separate runs
 * measured for it, back-to-back with the shop timed immediately before it:
 *   run #340: IBRAQ done 16:26:42Z, John Lewis done 16:34:08Z — 446s
 *   run #341: IBRAQ done 19:57:26Z, John Lewis done 20:04:51Z — 445s
 *   run #342: IBRAQ done 00:38:01Z, John Lewis done 00:45:27Z — 446s
 * Every other shop across those three runs finished in 4-69s. One
 * chronically slow shop was spending roughly half of the entire 900s budget
 * on its own, every cycle — run #342's John Lewis left only 54s of budget for
 * the Kayali attempt that followed it, and runs #340/#341 left none at all.
 *
 * 90 seconds stops a shop shaped like this after its home page plus two or
 * three candidate paths — roughly 78-105s once the checked-between-requests
 * overshoot below is counted — instead of all seventeen: a 75-80% cut to its
 * cost, while this same measurement shows a well-behaved shop finishing in
 * well under a minute regardless, so nothing well-behaved is touched.
 *
 * Checked *between* requests, not by aborting one already in flight, so a
 * shop can overrun this by up to one more request's own timeout (25s) plus
 * one politeness gap. RUN_TIME_CEILING_MS's own margin below accounts for
 * that slop.
 */
const SHOP_TIME_CEILING_MS = 90_000;

/**
 * Wall-clock ceiling for the whole run.
 *
 * The scheduled job wraps `npm run shipping:discover` in `timeout 900`
 * (.github/workflows/catalogue-daily.yml) as a backstop against a genuinely
 * hung request, by that workflow step's own comment — not a budget this
 * script was ever meant to spend down to the second. This constant is that
 * same idea turned inward: the script now stops itself with room to spare, so
 * `timeout 900` goes back to being a backstop for a wedged process rather
 * than the routine way every cycle ends.
 *
 * 840s leaves a 60s margin under the external 900s kill — covering node's own
 * startup before this file's first line runs, the per-shop overshoot
 * SHOP_TIME_CEILING_MS documents, and the final report-and-state flush —
 * without growing the step itself. The job this step lives inside has
 * already been measured tight elsewhere (see catalogue-daily.yml's comments
 * on the harvest steps that follow it and share its runner), so the fix here
 * is to spend the existing 900s more safely, not to ask for more of it.
 */
const RUN_TIME_CEILING_MS = 840_000;

const today = new Date().toISOString().slice(0, 10);

/**
 * Whose delivery terms are worth reading today.
 *
 * Exported shape rather than an inline filter so the choice is stated once and
 * can be argued with. `--all` adds the confirmed shops back, for spot-checking
 * figures we already believe. `opts.today` is threaded through (rather than
 * this function reading the clock itself) purely so a test can pick a fixed
 * date and assert a stale confirmation ages in on schedule; every real call
 * site below leaves it unset and gets the actual run date.
 */
export function discoveryTargets(
  retailers: readonly (typeof RETAILERS)[number][],
  opts: { onlyShop?: string | null; includeEverything?: boolean; today?: string } = {},
) {
  if (opts.onlyShop) return retailers.filter((r) => r.id === opts.onlyShop);
  if (opts.includeEverything) return [...retailers];
  const asOf = opts.today ?? today;
  return retailers.filter(
    (r) =>
      // Every shop we actually show, whose delivery rule has never been read
      // off the shop itself. This is the population that decides the site's
      // delivered prices.
      (r.enabled && r.shipping.confidence !== 'confirmed') ||
      // And every shop of any kind with no rate at all, enabled or not: that is
      // the state that keeps a researched shop switched off.
      r.shipping.standardGbp === null ||
      // And every enabled shop whose confirmation has gone stale — see
      // isConfirmationStale's own doc comment in shippingDiscoveryQueue.ts for
      // why a confirmed rule ages back into this population rather than being
      // trusted forever once written.
      (r.enabled && r.shipping.confidence === 'confirmed' && isConfirmationStale(r.shipping.verifiedAt, asOf)),
  );
}

const eligible = discoveryTargets(RETAILERS, {
  onlyShop: onlyShop ?? rawShop,
  includeEverything,
});

// The rotation ledger. Kept beside the report rather than derived from it: the
// report only ever describes the last run's slice, so deriving "when did we
// last look at Boots" from it would answer "never" for every shop the last run
// happened not to reach.
const statePath = resolve(root, 'data/shipping-discover-state.json');
// Mutable and rewritten after every shop below, not just read once up front —
// see the incremental-persistence block ahead of the main loop for why.
let discoveryState = parseDiscoveryState(
  existsSync(statePath) ? readFileSync(statePath, 'utf8') : null,
);

// An explicitly named shop, a --raw diagnosis and --all all mean "read exactly
// what I asked for". Only the unqualified scheduled sweep is rationed.
const rationed = !onlyShop && !rawShop && !includeEverything;
const { due: shops, held } = selectDueTargets(eligible, discoveryState, rationed ? budget : null);

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
console.log(`shops    ${shops.length}${held.length ? ` of ${eligible.length} eligible` : ''}`);
console.log(`target   an unverified delivery rule, or no rate at all`);
if (held.length) {
  const never = shops.filter((s) => !discoveryState.checked[s.id]).length;
  console.log(
    `queue    least recently checked first — ${never} never checked, ` +
      `${held.length} held for a later run`,
  );
}
console.log(`writing  ${shouldWrite ? 'yes — confirmations only' : 'no (report only)'}\n`);

// ── incremental persistence ──────────────────────────────────────────────────
//
// Everything below this line is written to disk after *every* shop, not
// gathered in memory and flushed once the loop over `shops` finishes. That
// end-of-loop write was the bug: the scheduled job wraps this whole script in
// `timeout 900`, and from 2026-08-25T12:43 onward every cycle has hit that
// backstop mid-batch and lost the lot — see SHOP_TIME_CEILING_MS's doc
// comment above and src/catalogue/shippingDiscoveryReport.ts's for the full
// evidence. A run killed now still leaves, on disk, every shop it had
// already finished — registry writes included — plus a report that says
// `complete: false` rather than silently looking like a full cycle.
const reportPath = resolve(root, 'data/shipping-discovery-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
const report = shippingDiscoveryReportWriter<ShopOutcome>(reportPath, {
  eligible: eligible.length,
  heldForLaterRuns: held.map((r) => r.id),
  planned: shops.map((r) => r.id),
});

const registryPath = resolve(root, 'src/config/retailers.ts');
// Loaded once, up front, and rewritten after every shop this run promotes —
// never batched to the end for the same reason the report above is not. Only
// touched at all when --write is passed; discovery-only runs never open it.
let registrySource: string | null = shouldWrite ? readFileSync(registryPath, 'utf8') : null;
let written = 0;

const runStartedAt = Date.now();
// See RUN_TIME_CEILING_MS's doc comment: this is the run stopping itself with
// room to spare, so the job's external `timeout 900` goes back to being a
// backstop for a genuine hang rather than the routine way every cycle ends.
const runDeadlineAt = runStartedAt + RUN_TIME_CEILING_MS;
let stoppedForTime = false;

for (const retailer of shops) {
  if (Date.now() >= runDeadlineAt) {
    // Whatever is left of `shops` was never asked. Their `checked` timestamps
    // are left untouched below (recordChecked only stamps ids actually
    // processed), so the next cycle picks them up first — the same rotation
    // selectDueTargets already gives a shop held out of the batch entirely,
    // just discovered mid-cycle instead of up front.
    stoppedForTime = true;
    break;
  }
  // Whichever comes first: this shop's own ceiling, or whatever is left of
  // the run's. A shop started with little of the run's budget left must not
  // still get its full 90s — that would just move the overrun from "one shop"
  // to "the last shop", which is the exact failure being fixed.
  const shopDeadlineAt = Math.min(runDeadlineAt, Date.now() + SHOP_TIME_CEILING_MS);
  const withinShopBudget = () => Date.now() < shopDeadlineAt;

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
  let candidatesIndex = 0;
  for (const candidate of candidates) {
    candidatesIndex++;
    if (pagesRead >= MAX_PAGES_READ) break;
    // A clean rate is the answer. Everything after it is a request the shop did
    // not need to serve.
    if (outcome.findings.some((f) => f.standardGbp !== null && f.caveats.length === 0)) break;

    // See SHOP_TIME_CEILING_MS's doc comment: a shop that answers every
    // request with a 25s AbortError (John Lewis, measured across three runs)
    // would otherwise burn through all sixteen SHIPPING_PAGE_PATHS at ~26s
    // each. Checked between requests, so the shop can still overrun this by
    // one more request's timeout — accounted for in RUN_TIME_CEILING_MS.
    if (!withinShopBudget()) {
      const remaining = candidates.length - candidatesIndex + 1;
      outcome.errors.push(
        `shop time ceiling (${SHOP_TIME_CEILING_MS / 1000}s) reached — ${remaining} candidate page(s) left unattempted`,
      );
      break;
    }

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

  // Third tier: ask the shop's own checkout estimator what it would charge to
  // send one cheap bottle to a London postcode. See src/catalogue/
  // shippingQuote.ts for exactly what that exchange is and why it stops short
  // of a real checkout, and shouldAttemptCheckoutQuote's own doc comment for
  // why this fires whenever the page reading alone produced no *clean* rate —
  // not only when it produced nothing at all. An absence claim or a
  // disagreement with the registry both leave the standard rate genuinely
  // unsettled, and a checkout quote is exactly the kind of independent second
  // reading that helps a human settle either one.
  if (shouldAttemptCheckoutQuote(clean.length) && !withinShopBudget()) {
    outcome.errors.push(
      `shop time ceiling (${SHOP_TIME_CEILING_MS / 1000}s) reached — checkout estimator not attempted`,
    );
  } else if (shouldAttemptCheckoutQuote(clean.length)) {
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
  // The summary line above only ever printed `mark`, the word before the
  // colon — for CONFIRMED/NO RATE PUBLISHED that is fine, since --write mode
  // has already put the number in the registry and the log need not repeat
  // it. For every other verdict (PROPOSE-RATE, PROPOSE (checkout), AMBIGUOUS,
  // CURRENCY MISMATCH) that colon is followed by the one thing a human
  // reading this log came for — the actual figure the page proposed, or the
  // reason it is ambiguous — and it was being silently dropped, unreadable
  // from CI even though it had already been computed. A CI runner with no
  // outbound network from elsewhere in this project is often the only place
  // this line can ever be read.
  const detail = outcome.verdict.slice(outcome.verdict.indexOf(':') + 1).trim();
  if (detail && !(outcome.patch && outcome.patch.write)) console.log(`      ${detail}`);
  if (outcome.quote && !outcome.quote.ok) console.log(`      quote: ${outcome.quote.error}`);
  // A quote that succeeded is folded into `detail` above only for the
  // PROPOSE (checkout) verdict, the one case where the quote is the entire
  // finding. Everywhere else — DISAGREES and no-action chief among them,
  // exactly the cases shouldAttemptCheckoutQuote's own doc comment argues for
  // — a successful quote was computed and then dropped on the floor, visible
  // only to someone who went and opened the JSON report. Printed here instead,
  // as the independent second reading it is: never something this tool acts
  // on by itself, only something placed next to the verdict for a human.
  if (outcome.quote?.ok && !outcome.verdict.startsWith('PROPOSE (checkout)') && quotedRates.length > 0) {
    console.log(
      `      checkout quoted £${quotedRates[0]!.priceGbp.toFixed(2)} (${quotedRates[0]!.currency}) as ` +
        `"${quotedRates[0]!.name}" on a £${outcome.quote.basketGbp?.toFixed(2)} basket to ` +
        `${outcome.quote.postcode} — for a human weighing the verdict above, not acted on here`,
    );
  }
  for (const e of outcome.errors.slice(0, 2)) console.log(`      ${e}`);

  // ── writing back, one shop at a time ────────────────────────────────────────
  //
  // Applied immediately rather than gathered into a `writable` list processed
  // once the loop finishes: that end-of-loop batching is exactly what
  // discarded every registry write a killed cycle had already earned — see
  // this file's incremental-persistence comment above and
  // src/catalogue/shippingDiscoveryReport.ts for the full evidence.
  // `registrySource` is threaded through the loop as a plain string and
  // rewritten to disk after every shop that earns a write, the same
  // discipline as the report and the rotation ledger below.
  if (shouldWrite && outcome.patch?.write && registrySource !== null) {
    try {
      registrySource = applyShippingPatch(registrySource, outcome.retailerId, outcome.patch.write);
      written++;
      writeFileSync(registryPath, registrySource);
    } catch (err) {
      // A patch that does not apply is a bug in the patcher or an unexpected
      // shape in the registry. Either way it stops that shop and not the run,
      // and it is recorded rather than swallowed.
      outcome.errors.push(`registry patch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  report.record(outcome, written);

  // Stamped the instant this shop finishes, not batched with the rest of
  // `shops` after the loop: recordChecked only stamps the ids it is given, so
  // a shop this run never reaches keeps its old timestamp and sorts back to
  // the front of the very next cycle's queue — exactly the treatment
  // selectDueTargets already gives a shop held out of the batch entirely,
  // just discovered mid-cycle instead of up front.
  discoveryState = recordChecked(discoveryState, [retailer.id], RETAILERS.map((r) => r.id), new Date().toISOString());
  try {
    writeFileSync(statePath, `${JSON.stringify(discoveryState, null, 2)}\n`);
  } catch {
    // A rotation ledger is bookkeeping, not a fact about the world — see
    // parseDiscoveryState's own doc comment. Never worth failing the run for.
  }
}

// `stoppedForTime` is only ever true when the run chose to stop between
// shops on its own RUN_TIME_CEILING_MS — never when it is killed, since a
// killed process never reaches this line at all. Both cases leave `complete`
// false in the report until this call; only this call can make it true.
report.finish(stoppedForTime ? 'time-budget' : 'swept-batch');

const { outcomes } = report.current();
const confirmed = outcomes.filter((o) => o.patch?.action === 'confirm-rate').length;
const absences = outcomes.filter((o) => o.patch?.action === 'confirm-absence').length;
const proposals = outcomes.filter((o) => o.patch?.action === 'propose-rate').length;
const disagreements = outcomes.filter((o) => o.patch?.action === 'disagrees');

console.log(
  `\n${confirmed} shop(s) confirmed against their own page, ${absences} recorded as publishing no rate.`,
);
console.log(`${proposals} first-time figure(s) waiting on a human, ${disagreements.length} disagreement(s).`);
// Persisted into the report above, not only printed here — a disagreement
// (Kayali, run #342: £5.99 quoted against the registry's £5.50) used to live
// only in this ephemeral CI log once the end-of-loop write it depended on was
// lost to the backstop. It is now one of the outcomes `report.record` already
// wrote to disk the moment this shop finished, same as everything else.
for (const d of disagreements) console.log(`  DISAGREES  ${d.name}: ${d.patch!.detail}`);
console.log(
  shouldWrite
    ? `Registry updated for ${written} shop(s). Nothing was invented: every write carries the URL and the sentence.`
    : 'Nothing was written to the registry — pass --write to promote confirmations.',
);
if (held.length) {
  console.log(
    `${held.length} shop(s) held for a later run: ${held.map((r) => r.id).join(', ')}`,
  );
}
if (stoppedForTime) {
  const notReached = shops.length - outcomes.length;
  console.log(
    `Stopped on the run's own ${RUN_TIME_CEILING_MS / 1000}s time budget with ${notReached} of this ` +
      `cycle's ${shops.length} shop(s) not yet reached — they keep their place at the front of the next cycle.`,
  );
}
console.log(`Report: data/shipping-discovery-report.json\n`);
