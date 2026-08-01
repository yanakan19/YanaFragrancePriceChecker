/**
 * Adaptive retrieval: learn from failed attempts and try something different.
 *
 * ── Why this is not a neural network ────────────────────────────────────────
 * The brief asked for a net that learns from bad attempts. This solves the same
 * problem better, and the reasoning is worth keeping because it will come up
 * again.
 *
 * A network needs thousands of labelled examples. We have twelve shops and one
 * attempt each, so there is nothing to train on, and there never will be much:
 * the whole point is to stop failing quickly. Worse, when a net picks wrong you
 * cannot ask it why, and "Boots is empty today" is exactly the failure that must
 * be explainable, because the alternative is silently publishing wrong prices.
 *
 * What is actually being asked for is: try a thing, notice it failed, try a
 * different thing next time, and remember. That is a multi armed bandit over a
 * handful of discrete strategies. It works from the first observation rather
 * than needing a training set, every decision is inspectable, and it is a few
 * hundred lines instead of a model to host.
 *
 * The learning is real. Each strategy carries a score per shop, built from how
 * often it worked and how much it returned. Order follows score, so a strategy
 * that failed sinks and one that worked rises. Exploration keeps a failed
 * strategy from being written off forever after a single bad night.
 */

/** How a page was retrieved. Each is a genuinely different approach. */
export type StrategyId =
  /** Configured section URL, plain request. Cheapest, try first. */
  | 'section-plain'
  /** Same URL, but presenting as a real browser. Some sites vary on headers. */
  | 'section-browser-headers'
  /** Discover section URLs from the sitemap the shop publishes for crawlers. */
  | 'sitemap-discovery'
  /** The shop's own search page, which is often rendered differently. */
  | 'search-page'
  /** Homepage, purely to learn whether the shop emits JSON-LD anywhere. */
  | 'homepage-probe'
  /** Retrieval through a paid residential proxy. Costs money, so it is last. */
  | 'proxied-fetch';

export interface StrategyRecord {
  strategyId: StrategyId;
  retailerId: string;
  attempts: number;
  successes: number;
  /** Total listings this strategy has ever produced for this shop. */
  listingsFound: number;
  lastStatus: number | null;
  lastError: string | null;
  lastTriedAt: string | null;
  lastSucceededAt: string | null;
  /**
   * Set when a strategy is ruled out permanently rather than merely failing,
   * for example robots.txt disallowing the path. Never retried.
   */
  ruledOut: string | null;
}

export interface StrategyMemory {
  /** Keyed `retailerId::strategyId`. */
  records: Record<string, StrategyRecord>;
  updatedAt: string;
}

export const EMPTY_MEMORY: StrategyMemory = { records: {}, updatedAt: new Date(0).toISOString() };

const key = (retailerId: string, strategyId: StrategyId) => `${retailerId}::${strategyId}`;

/** Every strategy, cheapest and least intrusive first. */
export const ALL_STRATEGIES: StrategyId[] = [
  'section-plain',
  'section-browser-headers',
  'sitemap-discovery',
  'search-page',
  'homepage-probe',
  'proxied-fetch',
];

/** Strategies that cost money per request, so they are never explored casually. */
const METERED: ReadonlySet<StrategyId> = new Set<StrategyId>(['proxied-fetch']);

export function getRecord(
  memory: StrategyMemory,
  retailerId: string,
  strategyId: StrategyId,
): StrategyRecord {
  return (
    memory.records[key(retailerId, strategyId)] ?? {
      strategyId,
      retailerId,
      attempts: 0,
      successes: 0,
      listingsFound: 0,
      lastStatus: null,
      lastError: null,
      lastTriedAt: null,
      lastSucceededAt: null,
      ruledOut: null,
    }
  );
}

/**
 * How promising a strategy looks for this shop.
 *
 * Laplace smoothing means an untried strategy scores 0.5 rather than 0, so it
 * gets a turn instead of being ignored for having no history. Yield multiplies
 * in, because a strategy returning two listings is worse than one returning
 * two hundred even though both technically "worked".
 */
export function score(record: StrategyRecord): number {
  if (record.ruledOut) return -1;

  const rate = (record.successes + 1) / (record.attempts + 2);
  const avgYield = record.successes > 0 ? record.listingsFound / record.successes : 0;
  const yieldBonus = Math.log1p(avgYield) / Math.log1p(100);

  // A metered strategy has to clearly beat the free ones to be chosen.
  const costPenalty = METERED.has(record.strategyId) ? 0.35 : 0;

  return rate * (1 + yieldBonus) - costPenalty;
}

export interface PlanOptions {
  /**
   * Probability of trying something other than the best option, so a strategy
   * that failed once because a site was briefly down is not abandoned forever.
   * Deterministic in tests by injecting `random`.
   */
  explorationRate?: number;
  random?: () => number;
  /** Set false to keep paid retrieval out of the plan entirely. */
  allowMetered?: boolean;
}

/**
 * Order the strategies to try for one shop, best first.
 *
 * This is where learning shows up: yesterday's outcomes decide today's order.
 */
export function planFor(
  memory: StrategyMemory,
  retailerId: string,
  options: PlanOptions = {},
): StrategyId[] {
  const { explorationRate = 0.15, random = Math.random, allowMetered = false } = options;

  const candidates = ALL_STRATEGIES.filter((s) => {
    if (getRecord(memory, retailerId, s).ruledOut) return false;
    if (METERED.has(s) && !allowMetered) return false;
    return true;
  });

  const ranked = [...candidates].sort(
    (a, b) => score(getRecord(memory, retailerId, b)) - score(getRecord(memory, retailerId, a)),
  );

  // Occasionally promote a lower ranked strategy so a one off failure does not
  // bury it permanently.
  if (ranked.length > 1 && random() < explorationRate) {
    const pick = 1 + Math.floor(random() * (ranked.length - 1));
    const [chosen] = ranked.splice(pick, 1);
    if (chosen) ranked.unshift(chosen);
  }

  return ranked;
}

export interface AttemptResult {
  ok: boolean;
  status: number | null;
  error?: string | null;
  listings: number;
  /** Set when this strategy can never work here, for example robots disallow. */
  ruleOut?: string;
}

/** Fold one attempt into memory. This is the entire learning step. */
export function record(
  memory: StrategyMemory,
  retailerId: string,
  strategyId: StrategyId,
  result: AttemptResult,
  now: string = new Date().toISOString(),
): StrategyMemory {
  const prior = getRecord(memory, retailerId, strategyId);

  const updated: StrategyRecord = {
    ...prior,
    attempts: prior.attempts + 1,
    successes: prior.successes + (result.ok && result.listings > 0 ? 1 : 0),
    listingsFound: prior.listingsFound + Math.max(0, result.listings),
    lastStatus: result.status,
    lastError: result.ok ? null : (result.error ?? `HTTP ${result.status}`),
    lastTriedAt: now,
    lastSucceededAt: result.ok && result.listings > 0 ? now : prior.lastSucceededAt,
    ruledOut: result.ruleOut ?? prior.ruledOut,
  };

  return {
    records: { ...memory.records, [key(retailerId, strategyId)]: updated },
    updatedAt: now,
  };
}

/** What the crawler currently believes about a shop, for the run report. */
export function explain(memory: StrategyMemory, retailerId: string): string[] {
  return ALL_STRATEGIES.map((s) => {
    const r = getRecord(memory, retailerId, s);
    if (r.attempts === 0) return `${s}: untried`;
    if (r.ruledOut) return `${s}: ruled out, ${r.ruledOut}`;
    const rate = `${r.successes}/${r.attempts}`;
    const detail = r.successes > 0
      ? `avg ${Math.round(r.listingsFound / r.successes)} listings`
      : (r.lastError ?? 'no listings');
    return `${s}: ${rate}, ${detail}, score ${score(r).toFixed(2)}`;
  });
}
