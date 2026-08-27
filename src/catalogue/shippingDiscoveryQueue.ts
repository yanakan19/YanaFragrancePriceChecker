/**
 * Which shops' delivery pages this run reads, when it cannot afford to read
 * them all.
 *
 * ── Why a queue exists at all ────────────────────────────────────────────────
 * Shipping discovery used to select shops with no delivery rate at all, which
 * on 2026-08-13 was about two of them. Commit 6b56632 corrected that to every
 * enabled shop whose rule is not confirmed — the right population, and twenty
 * times the size. The cost is measured, not estimated: on run #172, before that
 * commit, "Discover shipping terms" took 3m59s (09:06:10Z to 09:10:09Z). On run
 * #180, the first scheduled run where it fired afterwards, the same step took
 * 48m05s (20:35:23Z to 21:23:28Z) across 49 shops and 714 fetched pages, and
 * the job hit its 100-minute cap during the harvest that followed.
 *
 * Discovery was also all-or-nothing within a run, for as long as this queue
 * was its only defence: scripts/shipping-discover.ts wrote the registry patch
 * and the report after its loop finished, so a run killed at minute 47 of 48
 * recorded nothing. Capping the step alone would therefore have bought
 * nothing — the work had to be small enough to finish, not interruptible,
 * which is what this rotation is for.
 *
 * That second half is no longer true on its own. From 2026-08-25T12:43
 * onward, every scheduled cycle hit the job's 900s backstop mid-batch anyway
 * — John Lewis alone was measured spending ~446s of it, roughly half the
 * budget, on a single chronically slow shop (runs #334, #340, #341, #342) —
 * and the end-of-loop write above lost every one of those cycles, this
 * rotation's own bookkeeping included. scripts/shipping-discover.ts now
 * writes each shop's outcome, registry patch and `checked` stamp the instant
 * that shop finishes (see src/catalogue/shippingDiscoveryReport.ts), and
 * bounds one shop's read so it cannot exhaust the run's budget by itself.
 * The rotation this file implements is unchanged and still the right shape —
 * a killed run's un-stamped shops still queue up exactly as a `held` one
 * does — it no longer has to be the *only* thing standing between a bad shop
 * and a lost cycle.
 *
 * ── The trade this makes ─────────────────────────────────────────────────────
 * So each run reads a bounded slice, least-recently-checked first, and
 * remembers when it last looked at each shop. Coverage becomes a rotation
 * rather than a sweep: every shop is still visited, just over a few cycles
 * instead of all in one.
 *
 * That is the correct shape for what this measures. A shop revises its delivery
 * terms a few times a year — the workflow's own comment calls this
 * "deliberately the least frequent thing in the job" — so the difference
 * between checking a given shop every 11 hours and every few days is not
 * something a reader of the site can perceive. The difference between a run
 * that commits its harvest and one that does not, is.
 *
 * Note what this is measured against. Before 6b56632 the twenty enabled shops
 * behind most of the site's "Cheapest" labels were checked *never* — they were
 * not in the population. A rotation that reaches each of them every few days is
 * an improvement on that by any reading; it is only a relaxation compared to a
 * sweep that has never once completed inside the job's budget.
 */

/** When each shop's delivery pages were last read. Missing means never. */
export interface ShippingDiscoveryState {
  checked: Record<string, string>;
}

export const EMPTY_DISCOVERY_STATE: ShippingDiscoveryState = { checked: {} };

/**
 * Parse a state file, tolerating anything that is not the shape we expect.
 *
 * A malformed or absent ledger must degrade to "nothing has been checked", not
 * throw. It carries no facts about the world — only about the order this run
 * should work in — so the worst a reset costs is one cycle spent revisiting
 * shops sooner than needed. Refusing to run over it would trade a real
 * capability for a bookkeeping file.
 */
export function parseDiscoveryState(raw: string | null | undefined): ShippingDiscoveryState {
  if (!raw) return { checked: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { checked: {} };
    const checked = (parsed as { checked?: unknown }).checked;
    if (!checked || typeof checked !== 'object') return { checked: {} };
    const out: Record<string, string> = {};
    for (const [id, at] of Object.entries(checked as Record<string, unknown>)) {
      if (typeof at === 'string' && at !== '') out[id] = at;
    }
    return { checked: out };
  } catch {
    return { checked: {} };
  }
}

export interface DueSelection<T> {
  /** The shops to read this run, in the order they should be read. */
  due: T[];
  /** The shops held over to a later run. */
  held: T[];
}

/**
 * Take the `budget` least-recently-checked shops.
 *
 * Never-checked shops come first — they are the ones carrying an unverified
 * figure nothing has ever looked at, which is the whole reason 6b56632 widened
 * the population. After them, oldest check first. Ties break on id so that two
 * runs given the same inputs pick the same shops, which is what makes a failed
 * run repeatable rather than a reshuffle.
 *
 * A budget of null, zero or less means no bound: `--all` and single-shop
 * dispatches still read exactly what they were asked for.
 */
export function selectDueTargets<T extends { id: string }>(
  targets: readonly T[],
  state: ShippingDiscoveryState,
  budget: number | null,
): DueSelection<T> {
  const ordered = [...targets].sort((a, b) => {
    const aAt = state.checked[a.id] ?? '';
    const bAt = state.checked[b.id] ?? '';
    if (aAt !== bAt) return aAt < bAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  if (budget === null || budget <= 0 || ordered.length <= budget) {
    return { due: ordered, held: [] };
  }
  return { due: ordered.slice(0, budget), held: ordered.slice(budget) };
}

/**
 * Stamp the shops this run actually read.
 *
 * Only the ones it read: a shop held over must keep its old timestamp, or it
 * would drift to the back of the queue without anyone having looked at it.
 * Entries for shops no longer in the registry are dropped rather than kept
 * forever, so the file tracks the registry instead of accumulating every id the
 * project has ever had.
 */
export function recordChecked(
  state: ShippingDiscoveryState,
  checkedIds: readonly string[],
  knownIds: readonly string[],
  nowIso: string,
): ShippingDiscoveryState {
  const known = new Set(knownIds);
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(state.checked)) {
    if (known.has(id)) out[id] = at;
  }
  for (const id of checkedIds) {
    if (known.has(id)) out[id] = nowIso;
  }
  return { checked: out };
}

/**
 * How long a `confirmed` shipping rule is trusted before it re-enters the
 * discovery rotation on its own.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * `discoveryTargets` (scripts/shipping-discover.ts) has only ever admitted a
 * shop whose rule is *not* `confirmed`, or one with no rate at all. The moment
 * a shop's page reading is promoted to `confirmed` it leaves that population
 * for good — there has never been a mechanism to bring it back. The only way
 * back in is `--all`, a full unrationed sweep, run by hand. A shop confirmed
 * on day one and never touched again by this project stays "confirmed"
 * forever, no matter how long ago that was or whether the shop has since
 * changed its terms — and every write this pipeline makes carries a
 * `verifiedAt` precisely so that "how long ago" is answerable, which made it
 * strange that nothing downstream ever asked the question.
 *
 * Measured against this registry on 2026-08-26: the oldest confirmations
 * (mybeauty-boutique, oud-arabian, the-beauty-store-uk — all `verifiedAt:
 * '2026-08-05'`) are three weeks old. None has crossed a month yet, but every
 * one of them is heading there on exactly this trajectory with nothing in the
 * pipeline positioned to notice.
 *
 * ── Why 45 days, and why this belongs in the existing rotation rather than a ──
 * ── separate one ─────────────────────────────────────────────────────────────
 * A shop revises its standard-delivery rate rarely — this file's own header
 * above calls checking it "the least frequent thing in the job" — and argues
 * that the difference between visiting a given shop every few days and every
 * few weeks is not something a reader of the site can perceive. 45 days is
 * chosen on that same reasoning: closer to a season than a sprint, so a
 * confirmed figure is re-read a handful of times a year rather than being
 * either frozen forever or churned needlessly.
 *
 * What matters more than the exact number is the shape of the fix: a stale
 * confirmation does not jump the queue or get a lane of its own. It simply
 * becomes *eligible* again, the same as a shop that was never confirmed, and
 * `selectDueTargets`'s ordinary least-recently-checked ordering does the
 * rest — the mechanism that already reaches every unverified shop over a few
 * cycles now reaches every confirmed one too, just far less often, because a
 * shop re-admitted here immediately carries an old `checked` timestamp and
 * sorts toward the front of the very next run's slice.
 */
export const STALE_CONFIRMATION_DAYS = 45;

/**
 * Whether a `confirmed` rule's `verifiedAt` is old enough to be re-checked.
 *
 * Takes `today` explicitly (an ISO date, the same shape `verifiedAt` itself
 * is stored in) rather than reading the clock, so a run is reproducible and a
 * test never has to race real time. An unparseable date on either side reads
 * as "not stale" — refusing to re-check is the safe failure here, the same
 * direction `parseDiscoveryState` above degrades in: a bookkeeping fact that
 * cannot be read costs at most one cycle's delay, never a wrong write.
 */
export function isConfirmationStale(
  verifiedAt: string,
  today: string,
  staleDays: number = STALE_CONFIRMATION_DAYS,
): boolean {
  const verified = Date.parse(`${verifiedAt}T00:00:00Z`);
  const asOf = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(verified) || !Number.isFinite(asOf)) return false;
  const ageDays = (asOf - verified) / (1000 * 60 * 60 * 24);
  return ageDays >= staleDays;
}
