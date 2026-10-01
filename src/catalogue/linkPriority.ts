/**
 * The order scripts/resolve-fragrance-links.ts works through the catalogue in.
 *
 * The resolver runs as a short daily job and can only reach a few hundred
 * perfumes a day, so what it does first decides what a visitor sees links on.
 * The pages a visitor lands on show only the top of a list, so the order is:
 *
 *   1. what the site puts first — the front-page rail, the Top 50, today's
 *      deals — then
 *   2. the top of every other list, round-robin so each brand, note and shop
 *      gets its leading entries checked before any gets its tenth, then
 *   3. everything else, by how many shops offer it.
 *
 * A perfume appears once, at its first position. Perfumes already checked are
 * not this module's business: callers filter and re-queue them (see
 * checkOrder), because "checked" is state in the links file, not a property
 * of the catalogue.
 *
 * Pure and dependency-free so it can be tested without the catalogue.
 */

export interface Prioritised {
  /** brand|name, see fragranceBaseKey. */
  baseKey: string;
  /** Shop offers across the perfume's variants. */
  offers: number;
}

/** [a1, a2, a3], [b1, b2] -> a1, b1, a2, b2, a3: each list's best before any list's second best. */
export function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  const longest = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let rank = 0; rank < longest; rank++) {
    for (const l of lists) if (rank < l.length) out.push(l[rank]!);
  }
  return out;
}

/**
 * `tiers` are lists of baseKeys, most important tier first, each already in
 * the order its list shows them. Anything in no tier follows, most offered
 * first, ties broken by key so the order is the same on every run.
 */
export function priorityOrder<T extends Prioritised>(items: readonly T[], tiers: readonly (readonly string[])[]): T[] {
  const byKey = new Map(items.map((i) => [i.baseKey, i]));
  const out: T[] = [];
  const placed = new Set<string>();
  for (const tier of tiers) {
    for (const key of tier) {
      const item = byKey.get(key);
      if (item && !placed.has(key)) {
        placed.add(key);
        out.push(item);
      }
    }
  }
  const rest = items
    .filter((i) => !placed.has(i.baseKey))
    .sort((a, b) => b.offers - a.offers || a.baseKey.localeCompare(b.baseKey));
  return [...out, ...rest];
}

export type CheckState = 'never' | 'stale' | 'fresh';

/**
 * What is left to do, in order: everything never checked first (in the given
 * priority order), then everything whose last check is older than the re-check
 * age, also in priority order, at the very end. Fresh ones are dropped.
 */
export function checkOrder<T>(ordered: readonly T[], state: (item: T) => CheckState): T[] {
  const never: T[] = [];
  const stale: T[] = [];
  for (const item of ordered) {
    const s = state(item);
    if (s === 'never') never.push(item);
    else if (s === 'stale') stale.push(item);
  }
  return [...never, ...stale];
}

/** When was it last checked, as a state: never, older than `staleAfterDays`, or recent. */
export function checkState(lastCheckedIso: string | undefined, staleAfterDays: number, now = Date.now()): CheckState {
  if (!lastCheckedIso) return 'never';
  const t = Date.parse(lastCheckedIso);
  if (!Number.isFinite(t)) return 'never';
  return (now - t) / 86_400_000 >= staleAfterDays ? 'stale' : 'fresh';
}
