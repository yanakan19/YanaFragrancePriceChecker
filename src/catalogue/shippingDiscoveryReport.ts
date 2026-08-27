/**
 * The shipping-discovery report, kept current after every shop — not built up
 * in memory and written once at the end.
 *
 * ── The bug this replaces ────────────────────────────────────────────────────
 * scripts/shipping-discover.ts used to hold every shop's outcome in an array
 * and call writeFileSync exactly once, after its for-loop over `shops`
 * finished. The scheduled job wraps that loop in `timeout 900` as a backstop
 * against a hung request. From 2026-08-25T12:43 onward, every scheduled cycle
 * has hit that backstop mid-batch — confirmed by reading the job logs for runs
 * #334, #340, #341 and #342 — and a process killed by `timeout` never reaches
 * the write. The result, verified against those four logs and the committed
 * data/shipping-discovery-report.json (whose checkedAt is still
 * 2026-08-25T12:43:49.906Z, the last cycle that finished): a real checkout
 * quote for Kayali (run #342, £5.99 against the registry's £5.50) existed
 * only in an ephemeral CI log, and every shop a killed cycle had already
 * finished reading — including whatever it disagreed with the registry about
 * — was thrown away with it.
 *
 * scripts/catalogue-harvest.ts solved the identical problem for the harvest
 * (see src/catalogue/harvestReport.ts's own header) by rewriting a small JSON
 * file after every shop instead of once at the end. This is that same
 * discipline applied here: `record()` appends one shop's outcome and writes
 * the file immediately, so a run killed mid-batch still leaves every shop it
 * had already finished on disk. `complete` stays false until `finish()` is
 * called, so a report from a killed run is self-describing — a reader never
 * has to infer truncation from a missing shop, and never mistakes a partial
 * cycle for a full one.
 *
 * Generic over the outcome shape rather than importing shipping-discover.ts's
 * `ShopOutcome`, the same reasoning src/catalogue/shippingDiscoveryQueue.ts
 * uses for `selectDueTargets<T>`: this module only ever serialises what it is
 * given, so it does not need to know the shape to keep it safe on disk.
 */
import { writeFileSync } from 'node:fs';

/**
 * Why this cycle's batch ended, for the one case that is not a failure.
 *
 * `null` — it did not end. The process was killed and never called `finish()`.
 * `swept-batch` — every shop this cycle planned to read was read.
 * `time-budget` — the run stopped itself on RUN_TIME_CEILING_MS, in an orderly
 *   way, with shops from this cycle's batch left unread. Those shops keep
 *   their old `checked` timestamp (see recordChecked) and sort back to the
 *   front of the next cycle's batch, exactly like a shop `selectDueTargets`
 *   held over — this is the same rotation, just discovered mid-cycle instead
 *   of up front.
 *
 * Mirrors HarvestEndedReason in src/catalogue/harvestReport.ts, which solves
 * the identical "was this a kill or a choice" question for the harvest.
 */
export type ShippingDiscoveryEndedReason = 'swept-batch' | 'time-budget';

export interface ShippingDiscoveryReport<TOutcome> {
  /** When this file was last (re)written — updated on every flush. */
  checkedAt: string;
  /** When the run began. Constant across every rewrite of one run's report. */
  startedAt: string;
  /**
   * False until `finish()` runs. A report a killed run left behind stays
   * false forever, which is the entire point: nothing else on disk can tell
   * a reader that the process died mid-batch rather than choosing to stop.
   */
  complete: boolean;
  /** Why the batch ended, or null if it never got to say — see the type doc. */
  endedReason: ShippingDiscoveryEndedReason | null;
  /** How many shops this run actually promoted a write to the registry for. */
  wrote: number;
  /** How many shops were eligible for discovery this run, rationed or not. */
  eligible: number;
  /** Shops the rotation held over to a later run — see selectDueTargets. */
  heldForLaterRuns: string[];
  /** Shops this run intended to read this cycle, in read order. */
  planned: string[];
  /**
   * Planned shops this run never got to. Computed from `planned` minus
   * `outcomes` rather than recorded as it happens, for the same reason
   * harvestReport.ts's `notReached` is: nothing can write a line at the
   * moment it fails to happen. A killed run's own report makes this visible
   * without needing a marker written in advance.
   */
  notReached: string[];
  /** One entry per shop that was actually read, in the order it was read. */
  outcomes: TOutcome[];
}

export interface ShippingDiscoveryReportWriter<TOutcome> {
  /**
   * Record one shop's outcome and rewrite the file immediately.
   *
   * `registryWritesSoFar` is the running total of shops this run has actually
   * promoted to the registry — passed in rather than inferred from `outcome`,
   * because this module does not know which field on an arbitrary TOutcome
   * means "and this one got written".
   */
  record: (outcome: TOutcome, registryWritesSoFar: number) => void;
  /** Mark the run complete and rewrite. Not reached when the run is killed. */
  finish: (reason: ShippingDiscoveryEndedReason) => void;
  /** The report as it stands. Exposed for tests and for the end-of-run log. */
  current: () => ShippingDiscoveryReport<TOutcome>;
}

/**
 * Build the shape of a report without touching disk.
 *
 * Split out, same as buildHarvestReport, so the one fact worth testing —
 * what counts as `notReached`, what `complete` means — is testable without a
 * filesystem or a clock.
 */
export function buildShippingDiscoveryReport<TOutcome extends { retailerId: string }>(
  startedAt: string,
  checkedAt: string,
  complete: boolean,
  endedReason: ShippingDiscoveryEndedReason | null,
  wrote: number,
  eligible: number,
  heldForLaterRuns: readonly string[],
  planned: readonly string[],
  outcomes: readonly TOutcome[],
): ShippingDiscoveryReport<TOutcome> {
  const reported = new Set(outcomes.map((o) => o.retailerId));
  return {
    checkedAt,
    startedAt,
    complete,
    // Never claim a reason for a run that never got to say — same guard
    // buildHarvestReport applies, for the same reason.
    endedReason: complete ? endedReason : null,
    wrote,
    eligible,
    heldForLaterRuns: [...heldForLaterRuns],
    planned: [...planned],
    notReached: planned.filter((id) => !reported.has(id)),
    outcomes: [...outcomes],
  };
}

/**
 * A writer that keeps `path` current after every recorded shop.
 *
 * Write failures are swallowed deliberately, same as harvestReportWriter: a
 * report about the discovery run must never be the reason the run — or the
 * registry write a shop earned — fails.
 */
export function shippingDiscoveryReportWriter<TOutcome extends { retailerId: string }>(
  path: string,
  meta: { eligible: number; heldForLaterRuns: readonly string[]; planned: readonly string[] },
  now: () => string = () => new Date().toISOString(),
): ShippingDiscoveryReportWriter<TOutcome> {
  const startedAt = now();
  const outcomes: TOutcome[] = [];
  let complete = false;
  let endedReason: ShippingDiscoveryEndedReason | null = null;
  let wrote = 0;

  const flush = (): void => {
    try {
      writeFileSync(
        path,
        `${JSON.stringify(
          buildShippingDiscoveryReport(
            startedAt,
            now(),
            complete,
            endedReason,
            wrote,
            meta.eligible,
            meta.heldForLaterRuns,
            meta.planned,
            outcomes,
          ),
          null,
          2,
        )}\n`,
      );
    } catch {
      // See the doc comment: a report is never worth failing a run for.
    }
  };

  return {
    record: (outcome, registryWritesSoFar) => {
      outcomes.push(outcome);
      wrote = registryWritesSoFar;
      flush();
    },
    finish: (reason) => {
      complete = true;
      endedReason = reason;
      flush();
    },
    current: () =>
      buildShippingDiscoveryReport(
        startedAt,
        now(),
        complete,
        endedReason,
        wrote,
        meta.eligible,
        meta.heldForLaterRuns,
        meta.planned,
        outcomes,
      ),
  };
}
