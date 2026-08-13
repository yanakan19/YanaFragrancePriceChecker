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
 * Discovery is also all-or-nothing within a run: scripts/shipping-discover.ts
 * writes the registry patch and the report after its loop finishes, so a run
 * killed at minute 47 of 48 records nothing. Capping the step would therefore
 * have bought nothing — the work has to be small enough to finish, not
 * interruptible.
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
