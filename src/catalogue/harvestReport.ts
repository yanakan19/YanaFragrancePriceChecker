/**
 * What each shop actually gave us this run, written to disk as the run goes.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The harvest already prints a good per-shop line. The problem is where it
 * prints it: a GitHub Actions log, which is exactly the wrong place for the
 * one question worth asking after a bad run.
 *
 * Run #328 is the case that forced this. The sitemap harvest hit its 60-minute
 * step cap and was killed mid-shop, so:
 *
 *   - the end-of-run summary never printed, because the process died before
 *     reaching it — including the line saying how many pages the render tier
 *     had rendered, which was the whole reason anyone was reading the log;
 *   - the shops it never reached left no trace at all, since a shop that is
 *     never asked prints nothing; and
 *   - what *was* printed sits in a log that has to be tailed, so the earliest
 *     shops — which is where the never-live ones are deliberately ordered —
 *     are the hardest part to get at.
 *
 * The result was a run that looked green (the harvest commits before the cap,
 * by design) while being unable to answer "did the render tier work" or "which
 * shops were skipped".
 *
 * ── The one design decision here ────────────────────────────────────────────
 * The file is rewritten after **every shop**, not built up and written at the
 * end. That is the entire point. An end-of-run write is precisely what a
 * timeout destroys, and this exists to survive a timeout. Rewriting a small
 * JSON file thirty-odd times a run costs nothing next to the minutes each shop
 * takes.
 *
 * `notReached` is computed rather than recorded, for the same reason: nothing
 * can write a line at the moment it fails to happen. Naming the planned shops
 * up front and subtracting the ones that reported makes silence visible.
 *
 * `complete` is false until `finish()` is called, so a report from a killed
 * run is self-describing — a reader never has to infer truncation from a
 * missing shop that might simply have been disabled.
 */
import { writeFileSync } from 'node:fs';

/** Which retrieval tier produced this shop's listings. */
export type HarvestTier =
  /** The ordinary free sitemap/JSON-LD walk. */
  | 'free'
  /** The free walk, retried with a longer timeout for a slow shop. */
  | 'patient'
  /** Apify's residential proxy. Costs money. */
  | 'apify-proxy'
  /** A real browser render — local Chromium, or Apify's actor. */
  | 'render'
  /** Nothing worked. */
  | 'none';

export interface ShopHarvestOutcome {
  retailerId: string;
  name: string;
  urlsDiscovered: number;
  pagesFetched: number;
  /** Listings that came out with a usable price. The number that matters. */
  priced: number;
  tier: HarvestTier;
  /**
   * Which renderer ran, when `tier` is 'render'. Null otherwise.
   *
   * Named rather than implied, because "the render tier worked" means
   * something different depending on whether it was a free local Chromium on a
   * datacenter IP or a paid Apify actor on a residential one — that difference
   * is the open question the tier was built to answer.
   */
  renderer: string | null;
  errorCount: number;
  /** The first few errors, for a reader who does not have the log. */
  errors: string[];
  /**
   * Pages where the shop refused this address rather than being empty.
   *
   * Separate from `errors` on purpose. An error line is prose and has to be
   * read; this is the one distinction a reader actually acts on — a shop that
   * says no needs a different address or a partner feed, and a shop that is
   * genuinely empty needs a parser or a different section URL. Run #330
   * reported Boots as "0 listings parsed" when what it got was a 1,199-byte
   * challenge page. See src/catalogue/renderRefusal.ts.
   *
   * Optional so that a report written before this field existed still parses,
   * and so that a shop with nothing to say carries no empty array.
   */
  refusals?: ShopRefusal[];
  finishedAt: string;
}

/** One page a shop refused, as recorded in the report. */
export interface ShopRefusal {
  url: string;
  status: number;
  bytes: number;
  reason: string;
}

/**
 * How a run ended, for the three cases that are genuinely different.
 *
 * `null` — it did not end. The process was killed and never reached finish().
 * `swept-every-shop` — the sweep asked every planned shop.
 * `deadline` — the sweep stopped itself on its own wall clock, in an orderly
 *   way, with shops left unasked. This is the ordinary state of a scheduled
 *   run and is not a failure: see scripts/catalogue-harvest.ts's runMinutes.
 *
 * Without this, `complete: true` had to carry two meanings, and a reader
 * checking it alone would take an intentionally-truncated sweep for a full
 * one.
 */
export type HarvestEndedReason = 'swept-every-shop' | 'deadline';

export interface HarvestReport {
  startedAt: string;
  finishedAt: string | null;
  /** False when the run was killed before finishing — see this file's header. */
  complete: boolean;
  /** Why the run ended, or null if it never got to say. */
  endedReason: HarvestEndedReason | null;
  /** Shops this run intended to ask, in the order it meant to ask them. */
  planned: string[];
  /** Shops that never reported. Planned minus recorded; silence made visible. */
  notReached: string[];
  shops: ShopHarvestOutcome[];
}

export interface HarvestReportWriter {
  /** Record one shop and rewrite the file immediately. */
  record: (outcome: ShopHarvestOutcome) => void;
  /** Mark the run complete and rewrite. Not reached when the run is killed. */
  finish: (reason?: HarvestEndedReason) => void;
  /** The report as it stands. Exposed for tests and for the end-of-run log. */
  current: () => HarvestReport;
}

/**
 * Build the shape of a report without touching disk.
 *
 * Split out so the interesting logic — what counts as not-reached, what
 * `complete` means — is testable without a filesystem.
 */
export function buildHarvestReport(
  startedAt: string,
  planned: readonly string[],
  shops: readonly ShopHarvestOutcome[],
  finishedAt: string | null,
  endedReason: HarvestEndedReason | null = null,
): HarvestReport {
  const reported = new Set(shops.map((s) => s.retailerId));
  return {
    startedAt,
    finishedAt,
    complete: finishedAt !== null,
    endedReason: finishedAt === null ? null : endedReason,
    planned: [...planned],
    notReached: planned.filter((id) => !reported.has(id)),
    shops: [...shops],
  };
}

/**
 * A writer that keeps `path` current after every recorded shop.
 *
 * Write failures are swallowed deliberately: this is a report about the
 * harvest, and it must never be the reason a harvest fails. A run that cannot
 * write its report should still commit its prices.
 */
export function harvestReportWriter(
  path: string,
  planned: readonly string[],
  now: () => string = () => new Date().toISOString(),
): HarvestReportWriter {
  const startedAt = now();
  const shops: ShopHarvestOutcome[] = [];
  let finishedAt: string | null = null;
  let endedReason: HarvestEndedReason | null = null;

  const flush = (): void => {
    try {
      writeFileSync(
        path,
        `${JSON.stringify(buildHarvestReport(startedAt, planned, shops, finishedAt, endedReason), null, 2)}\n`,
      );
    } catch {
      // See the doc comment: a report is never worth failing a harvest for.
    }
  };

  return {
    record: (outcome) => {
      shops.push(outcome);
      flush();
    },
    finish: (reason: HarvestEndedReason = 'swept-every-shop') => {
      finishedAt = now();
      endedReason = reason;
      flush();
    },
    current: () => buildHarvestReport(startedAt, planned, shops, finishedAt, endedReason),
  };
}
