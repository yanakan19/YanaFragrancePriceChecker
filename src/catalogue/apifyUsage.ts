/**
 * How much of this month's Apify credit has already been spent, asked before
 * any metered work starts.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * On 2026-08-21 the account's $5 monthly free credit ran out mid-month. The
 * first anyone knew of it was Apify's own billing email; nothing in this repo
 * asked, and nothing stopped. Every harvest tick after that kept dispatching
 * actor renders for the five shops that need them (Boots, Selfridges, John
 * Lewis, Superdrug, Zara), each one refused for a reason the harvest logged as
 * an ordinary retrieval failure. From inside the run, "the account is out of
 * credit" and "this shop refused us" look identical — the same confusion
 * apifyAccount.ts was written to end for credentials, one layer further out.
 *
 * `MAX_ACTOR_PAGES_PER_RUN` already caps a single run. What it cannot see is
 * the month: ten pages a run, twelve runs a day, is a per-run cap doing
 * exactly what it was asked to do while the monthly total runs away from it.
 * This is the missing half — a ceiling the run can actually check.
 *
 * ── What is measured here, and what is not ──────────────────────────────────
 * Apify publishes two relevant endpoints, both free and neither consuming
 * compute units:
 *
 *   GET /v2/users/me/limits         account and usage limits
 *   GET /v2/users/me/usage/monthly  usage for the current monthly cycle
 *
 * Their existence and paths are confirmed from Apify's own API reference
 * index. Their **response field names are not** — docs.apify.com is
 * unreachable from the sandbox this was written in (egress-blocked), so
 * nothing here asserts a field name it has actually seen on the wire.
 *
 * That shapes the whole design. `readUsdFigures` does not index a field it
 * was told about; it walks the payload and collects every number under a key
 * that names both money and the thing it measures, then takes the largest
 * plausible pair. When it finds nothing it says so **and prints the key names
 * it did see**, so a single real CI run confirms the true schema and this
 * comment can be replaced with a measurement — the same way
 * scripts/awin-feed-diag.ts settled MyBeauty.Boutique's feed columns rather
 * than guessing at them.
 *
 * A consequence worth stating plainly: until that run happens, the expected
 * state of this check is `unknown`, and `unknown` must never block a harvest.
 * A diagnostic that cannot read its own input is not evidence of anything, and
 * turning off five shops' retrieval on the strength of it would be inventing a
 * fact — the exact failure this module exists to prevent.
 */

/** The free plan's monthly credit, in USD. Apify's published free-tier figure. */
export const APIFY_FREE_MONTHLY_USD = 5;

/**
 * Fraction of the monthly credit at which metered work stops.
 *
 * Below 1.0 deliberately. An actor render is dispatched before its cost is
 * known, so stopping exactly at the limit still overspends by whatever the
 * run in flight costs. Ten pages at the actor tier is the largest single-run
 * commitment this project can make, so the reserve has to cover it.
 */
export const APIFY_STOP_AT_FRACTION = 0.9;

/** What the usage check concluded. */
export type ApifyBudgetState =
  /** A figure was read and there is room. */
  | 'ok'
  /** A figure was read and it is past `APIFY_STOP_AT_FRACTION` of the limit. */
  | 'near-limit'
  /** A figure was read and it is at or past the limit. */
  | 'exhausted'
  /** No figure could be read. Never a reason to stop — see this file's header. */
  | 'unknown';

export interface ApifyUsageReport {
  state: ApifyBudgetState;
  /** USD spent this cycle, or null when the payload could not be read. */
  usedUsd: number | null;
  /** USD ceiling for this cycle, or null when the payload could not be read. */
  limitUsd: number | null;
  /** Whether metered tiers should run. False only on a figure actually read. */
  meteredAllowed: boolean;
  /** Human-readable lines for the run log. Never contains a secret. */
  lines: string[];
}

/** A key that names money. */
const USD_KEY = /usd|dollar/i;
/** A key that names spend rather than some other USD-denominated quantity. */
const SPENT_KEY = /usage|used|spent|consumed|current|total/i;
/** A key that names a ceiling. */
const LIMIT_KEY = /limit|max|quota|allowance|credit|included|plan/i;
/**
 * A key that can only be a ceiling, whatever else it also says.
 *
 * Needed because "usage" appears in both halves of the pair: a real payload
 * may well carry `monthlyUsageUsd` beside `maxMonthlyUsageUsd`, and the naive
 * reader took the second as spend — then, under "largest wins", reported the
 * limit as the amount spent and declared the credit exhausted at zero usage.
 * Caught by tests/apifyUsage.test.ts before this ever ran. These markers
 * disqualify a key from being read as spend at all.
 */
const LIMIT_ONLY_KEY = /max|limit|quota|allowance|included/i;

interface Found {
  path: string;
  value: number;
}

/**
 * Walk a payload and collect every finite number whose key path names both
 * USD and the given concept.
 *
 * Deliberately structural rather than a lookup table: the field names are
 * unverified (see this file's header), so matching on shape is the only
 * honest option until one real response settles them.
 */
function collect(
  node: unknown,
  concept: RegExp,
  opts: { excludeLimitNamed: boolean },
  path = '',
  out: Found[] = [],
): Found[] {
  if (node === null || typeof node !== 'object') return out;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;

    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      // The whole path is tested, not just the leaf: Apify may well nest a
      // plain `usd` under a parent that carries the meaning.
      if (!USD_KEY.test(here) || !concept.test(here)) continue;
      if (opts.excludeLimitNamed && LIMIT_ONLY_KEY.test(here)) continue;
      out.push({ path: here, value });
    } else if (typeof value === 'object') {
      collect(value, concept, opts, here, out);
    }
  }

  return out;
}

/** Top-level key names in a payload, for reporting a shape we could not read. */
function shapeOf(payload: unknown): string[] {
  if (payload === null || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  const target = data && typeof data === 'object' ? data : payload;
  return Object.keys(target as Record<string, unknown>).slice(0, 40);
}

/**
 * Read a spend figure and a ceiling out of whatever Apify returned.
 *
 * Exported for testing, and pure: no network, no environment, no clock. Takes
 * both payloads because the spend and the ceiling are documented as living on
 * different endpoints, and either may be absent.
 */
export function describeApifyUsage(
  usagePayload: unknown,
  limitsPayload: unknown,
  fallbackLimitUsd: number = APIFY_FREE_MONTHLY_USD,
): ApifyUsageReport {
  const spend = { excludeLimitNamed: true };
  const ceiling = { excludeLimitNamed: false };
  const spends = [
    ...collect(usagePayload, SPENT_KEY, spend),
    ...collect(limitsPayload, SPENT_KEY, spend),
  ];
  const limits = [
    ...collect(limitsPayload, LIMIT_KEY, ceiling),
    ...collect(usagePayload, LIMIT_KEY, ceiling),
  ];

  // Largest match wins. A payload that breaks spend down by line item will
  // carry both the parts and their total; the total is the one that matters,
  // and undercounting here spends real money.
  const used = spends.length ? spends.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const limit = limits.length ? limits.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  if (!used) {
    return {
      state: 'unknown',
      usedUsd: null,
      limitUsd: null,
      meteredAllowed: true,
      lines: [
        'Apify usage: no USD spend figure found in the response.',
        // The point of the whole exercise: one real run replaces the guess.
        `  usage payload keys: ${shapeOf(usagePayload).join(', ') || '(none)'}`,
        `  limits payload keys: ${shapeOf(limitsPayload).join(', ') || '(none)'}`,
        '  Metered tiers left ON — an unreadable diagnostic is not evidence of anything.',
        '  Record the real field names in src/catalogue/apifyUsage.ts from this log.',
      ],
    };
  }

  // A ceiling this project knows independently (the published free-tier
  // figure) is a safer default than treating "no limit found" as "no limit".
  const limitUsd = limit?.value ?? fallbackLimitUsd;
  const limitSource = limit ? limit.path : `assumed free tier ($${fallbackLimitUsd})`;
  const stopAt = limitUsd * APIFY_STOP_AT_FRACTION;

  const state: ApifyBudgetState =
    used.value >= limitUsd ? 'exhausted' : used.value >= stopAt ? 'near-limit' : 'ok';

  const lines = [
    `Apify usage this cycle: $${used.value.toFixed(2)} of $${limitUsd.toFixed(2)} ` +
      `(${((used.value / limitUsd) * 100).toFixed(0)}%) — read from ${used.path}, limit from ${limitSource}`,
  ];

  if (state === 'exhausted') {
    lines.push(
      'Monthly Apify credit is spent. Metered tiers are OFF for this run: an actor render ' +
        'would be refused anyway, and the harvest would log the refusal as the shop\'s fault.',
    );
  } else if (state === 'near-limit') {
    lines.push(
      `Past ${(APIFY_STOP_AT_FRACTION * 100).toFixed(0)}% of the monthly credit. Metered tiers are OFF ` +
        'for this run, holding the remainder back so a render in flight cannot overshoot the limit.',
    );
  }

  return {
    state,
    usedUsd: used.value,
    limitUsd,
    // Only a figure actually read, with room left, permits metered work. The
    // `unknown` case returned above and left the tiers on; it cannot reach
    // here.
    meteredAllowed: state === 'ok',
    lines,
  };
}

/**
 * Ask Apify what this month has cost. Never throws: this is a diagnostic and
 * must not be able to stop a harvest, so a failure returns `unknown` with the
 * reason on a log line.
 */
export async function checkApifyUsage(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApifyUsageReport> {
  const get = async (path: string): Promise<unknown> => {
    try {
      const res = await fetchImpl(
        `https://api.apify.com/v2/users/me/${path}?token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) return { __httpError: res.status };
      return await res.json();
    } catch {
      return null;
    }
  };

  const [usage, limits] = await Promise.all([get('usage/monthly'), get('limits')]);

  if (usage === null && limits === null) {
    return {
      state: 'unknown',
      usedUsd: null,
      limitUsd: null,
      meteredAllowed: true,
      lines: ['Apify usage check: both endpoints unreachable. Metered tiers left ON.'],
    };
  }

  return describeApifyUsage(usage, limits);
}
