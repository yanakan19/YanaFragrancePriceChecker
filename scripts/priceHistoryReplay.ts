/**
 * The replay behind `npm run catalogue:history`, split out of
 * scripts/build-price-history.ts so it can resume from where it last stopped
 * — and so a test can prove that resuming gives the same answer as starting
 * over.
 *
 * ── Why this exists (runs #387–#395, 2026-09-04/05) ─────────────────────────
 * The replay reads every catalogue snapshot at every commit that ever touched
 * data/catalogue: ~40 files × N commits, each `git show`n and JSON-parsed. N
 * was 49 when the script was written and 368 by 2026-09-04, growing by four
 * to six a day, and the cost is linear in it. The workflow step that runs the
 * rebuild carries a 10-minute timeout that was set at "roughly double" a
 * measured 6 minutes; on 2026-09-04 the replay alone crossed it at 360 of
 * 368 commits, the step was killed before `npm run demo` ever ran, and the
 * commit step then pushed a new demo/catalogue.generated.ts beside the OLD
 * demo/index.html. tests/demoBuildFreshness.test.ts caught exactly that — as
 * designed — and because "Test before crawling" gates every harvest, no
 * harvest could start again: eight consecutive red runs, and prices frozen on
 * the live site for over a day. Rebuilding the page by hand would have bought
 * one run, since the next replay would be one commit longer still.
 *
 * ── What changes ─────────────────────────────────────────────────────────────
 * The replay is a fold: each commit's contribution depends only on the state
 * left by the commits before it (the collapsed series, and the first/last
 * dates behind `everPriced`). So the state after commit k is a complete
 * checkpoint, and replaying commits k+1..n from it is byte-for-byte the same
 * as replaying 1..n from nothing — tests/priceHistoryReplay.test.ts asserts
 * that against real history. The script now writes that state to
 * data/price-history-checkpoint.json beside the generated file, and the next
 * run replays only the commits that landed since. A scheduled harvest adds
 * one to three catalogue commits, so the step drops from "minutes and
 * growing" to seconds, permanently, whatever N becomes.
 *
 * ── When a full replay is still forced ──────────────────────────────────────
 * A checkpoint is only as true as the rules that produced it. If
 * isFragrance, fragranceId, isAvailableListing, untrustworthyEans, the set of
 * currency-unconfirmed shops, or the set of fragrance-only catalogues
 * changes, every earlier commit's contribution may change with it (the
 * 2026-09-03 Riiffs fix moved seven products' identities, for one). So every
 * checkpoint records a fingerprint of exactly that logic — the source of the
 * modules the replay imports, walked through their relative imports, plus
 * the two facts it reads out of the retailer registry — and a checkpoint
 * whose fingerprint no longer matches is discarded, loudly, and the replay
 * starts from the first commit. That is the one remaining slow path, it
 * happens at most once per rules change rather than once per harvest, and
 * the workflow now refuses to commit a half-finished rebuild if it ever
 * outruns its timeout (see catalogue-daily.yml's "Commit rebuilt app").
 *
 * The registry facts are hashed as values, not as the file: retailers.ts is
 * edited most days for reasons that cannot change a price point (delivery
 * terms, affiliate notes, a shop disabled), and hashing the whole file would
 * turn each of those into a full replay.
 *
 * Nothing about what a point IS has moved. The rules in the loop below are
 * scripts/build-price-history.ts's own, verbatim, and that file's header is
 * still where they are explained.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isFragrance, fragranceId } from '../src/catalogue/fragranceId.js';
import { isAvailableListing } from '../src/catalogue/listingAvailability.js';
import { untrustworthyEans } from '../src/catalogue/productMatch.js';
import { CURRENCY_UNCONFIRMED, RETAILERS } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';
import type { PriceHistoryGap } from '../src/services/priceHistoryGaps.js';

export const CATALOGUE_PATH = 'data/catalogue';
export const CHECKPOINT_PATH = 'data/price-history-checkpoint.json';
export const OUTPUT_PATH = 'demo/priceHistory.generated.ts';

/** Bumped only if the checkpoint's own shape changes; a rules change is the fingerprint's job. */
export const CHECKPOINT_VERSION = 1;

interface Snapshot {
  retailerId: string;
  updatedAt?: string;
  source?: string;
  listings: StoredListing[];
}

export interface CatalogueCommit {
  sha: string;
  at: string;
}

/**
 * One entry in the shipped, collapsed series. `priceGbp: null` is the
 * explicit gap marker described in build-price-history.ts's header — never a
 * real price, only ever written where one used to be buyable and stopped
 * being so this commit.
 */
export interface PricePoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

export interface EverPriced {
  first: string;
  last: string;
}

/** Everything the fold carries from one commit to the next. */
export interface ReplayState {
  history: Map<string, PricePoint[]>;
  everPriced: Map<string, EverPriced>;
}

export function emptyState(): ReplayState {
  return { history: new Map(), everPriced: new Map() };
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

/** Every commit that touched the catalogue, oldest first, with its real timestamp. */
export function commitsTouchingCatalogue(root: string): CatalogueCommit[] {
  const log = git(root, ['log', '--reverse', '--format=%H %aI', '--', CATALOGUE_PATH]);
  return log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, at] = line.split(' ');
      return { sha: sha!, at: at! };
    });
}

/** Every data/catalogue/*.json path that existed at a given commit. */
function catalogueFilesAt(root: string, sha: string): string[] {
  return git(root, ['ls-tree', '-r', '--name-only', sha, '--', CATALOGUE_PATH])
    .trim()
    .split('\n')
    .filter((p) => p.endsWith('.json'));
}

function readFileAt(root: string, sha: string, path: string): Snapshot | null {
  try {
    const raw = git(root, ['show', `${sha}:${path}`]);
    return JSON.parse(raw) as Snapshot;
  } catch {
    // A file that exists in the tree can still fail to parse if a commit
    // caught it mid-write in some earlier, less careful version of the
    // harvest script. Treated as no data for that retailer at that commit
    // rather than aborting the whole reconstruction over one bad snapshot.
    return null;
  }
}

/**
 * Folds one commit into `state`. This is the body of the original replay
 * loop, unchanged in what it decides; only its inputs and outputs are now
 * explicit so the loop can stop and start.
 */
export function replayCommit(root: string, state: ReplayState, { sha, at }: CatalogueCommit): void {
  const { history, everPriced } = state;
  const cheapestThisCommit = new Map<string, { priceGbp: number; retailerId: string }>();

  // Read every live snapshot at this commit once, up front — not per file
  // inside the pricing loop below — because untrustworthyEans (see its own
  // header comment in productMatch.ts) has to see every retailer's listings
  // before any of them is turned into a price point, for the same reason
  // build-demo-catalogue.ts computes it before its own product loop: an EAN
  // collision within one shop's feed has to be known before the first
  // colliding listing is read, not discovered after the second one has
  // already been read as though it agreed with the first.
  const activeAtCommit: StoredListing[][] = [];
  // The same snapshots, filtered only by lifecycle status — the OLD rule's
  // population, kept solely to feed `everPriced`. Built from the same read
  // rather than a second pass over git, since the expensive part here is
  // `git show`, not the filtering.
  const statusOnlyAtCommit: StoredListing[][] = [];
  for (const path of catalogueFilesAt(root, sha)) {
    const snapshot = readFileAt(root, sha, path);
    if (!snapshot || snapshot.source !== 'live') continue;
    const statusOnly = snapshot.listings.filter((l) => l.status === 'active');
    statusOnlyAtCommit.push(statusOnly);
    // status === 'active' alone is a lifecycle check, not a buyability one —
    // see isAvailableListing's own header for what that means and the
    // measurements behind also requiring `inStock !== false` here.
    activeAtCommit.push(statusOnly.filter(isAvailableListing));
  }
  const untrustworthy = untrustworthyEans(activeAtCommit.flat());

  for (const listings of activeAtCommit) {
    for (const l of listings) {
      if (!isFragrance(l)) continue;
      // A shop whose currency was never established has no price history, and
      // clearing its current snapshot cannot reach the past: this replays old
      // commits, so the pre-quarantine files are still right there holding the
      // figures the quarantine took down. See build-price-history.ts.
      if (CURRENCY_UNCONFIRMED.has(l.retailerId)) continue;
      // A listing with no price is not a price point — see build-price-history.ts
      // for why nulls arrive here by design and what an unguarded compare did.
      if (typeof l.priceGbp !== 'number' || !(l.priceGbp > 0)) continue;
      const id = fragranceId(l, untrustworthy);
      const price = l.priceGbp;
      const current = cheapestThisCommit.get(id);
      // Retailer id as the tiebreaker keeps this deterministic run to run.
      if (!current || price < current.priceGbp || (price === current.priceGbp && l.retailerId < current.retailerId)) {
        cheapestThisCommit.set(id, { priceGbp: price, retailerId: l.retailerId });
      }
    }
  }

  // The OLD rule's own untrustworthy-EAN computation, over its own (larger,
  // stock-inclusive) population — not reused from `untrustworthy` above,
  // because that was computed over a different set of listings and an EAN
  // collision only that stricter set avoids might still exist in this wider
  // one. This mirrors exactly what a real pre-4464daf run would have seen.
  const untrustworthyEverPriced = untrustworthyEans(statusOnlyAtCommit.flat());
  for (const listings of statusOnlyAtCommit) {
    for (const l of listings) {
      if (!isFragrance(l)) continue;
      if (CURRENCY_UNCONFIRMED.has(l.retailerId)) continue;
      if (typeof l.priceGbp !== 'number' || !(l.priceGbp > 0)) continue;
      const id = fragranceId(l, untrustworthyEverPriced);
      const rec = everPriced.get(id);
      // Commits are replayed oldest first, so `at` only ever grows.
      if (!rec) everPriced.set(id, { first: at, last: at });
      else rec.last = at;
    }
  }

  for (const [id, point] of cheapestThisCommit) {
    const series = history.get(id) ?? [];
    const last = series.at(-1);
    // Collapse a run of identical observations into one point — see
    // build-price-history.ts for why a dot at every unchanged commit is noise.
    if (!last || last.priceGbp !== point.priceGbp || last.retailerId !== point.retailerId) {
      series.push({ at, priceGbp: point.priceGbp, retailerId: point.retailerId });
      history.set(id, series);
    }
  }
  // The mid-series gap marker: a fragrance with a price on record but nothing
  // buyable this commit gets one explicit `null` at the transition, and only
  // at the transition — see build-price-history.ts's header.
  for (const [id, series] of history) {
    if (cheapestThisCommit.has(id)) continue;
    const last = series.at(-1);
    if (last && last.priceGbp !== null) {
      series.push({ at, priceGbp: null, retailerId: null });
    }
  }
}

/** Replays `commits` in order into `state`, reporting progress every ten. */
export function replay(
  root: string,
  commits: readonly CatalogueCommit[],
  state: ReplayState,
  onProgress?: (done: number, total: number, fragrances: number) => void,
): ReplayState {
  for (const [i, commit] of commits.entries()) {
    replayCommit(root, state, commit);
    if (onProgress && ((i + 1) % 10 === 0 || i === commits.length - 1)) {
      onProgress(i + 1, commits.length, state.history.size);
    }
  }
  return state;
}

// ── The rules fingerprint ─────────────────────────────────────────────────────

/**
 * The modules whose logic decides what a point is. Walked through their
 * relative imports below, so a helper one of them starts importing tomorrow
 * is covered without anyone remembering to list it. This module is its own
 * first entry: a change to the fold itself must invalidate every checkpoint
 * the old fold wrote.
 */
const RULE_MODULE_ROOTS = [
  'scripts/priceHistoryReplay.ts',
  'src/catalogue/fragranceId.ts',
  'src/catalogue/listingAvailability.ts',
  'src/catalogue/productMatch.ts',
];

/** Read as values instead of as source — see the header for why. */
const REGISTRY_MODULE = 'src/config/retailers.ts';

const RELATIVE_IMPORT = /^\s*import\s[^;]*?\sfrom\s+['"](\.\.?\/[^'"]+)['"]/gm;

/** Every module reachable from the roots by relative import, root-relative and sorted. */
export function ruleModules(root: string): string[] {
  const seen = new Set<string>();
  const queue = [...RULE_MODULE_ROOTS];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || file === REGISTRY_MODULE) continue;
    const full = join(root, file);
    if (!existsSync(full)) continue;
    seen.add(file);
    const source = readFileSync(full, 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const spec = match[1]!.replace(/\.js$/, '.ts');
      const resolved = resolve(dirname(full), spec);
      const rel = resolved.slice(root.length + 1).split('\\').join('/');
      queue.push(rel);
    }
  }
  return [...seen].sort();
}

/** The two things the replay reads out of the retailer registry, as data. */
export function registryFacts(): { currencyUnconfirmed: string[]; fragranceOnlyCatalogue: string[] } {
  return {
    currencyUnconfirmed: [...CURRENCY_UNCONFIRMED.keys()].sort(),
    fragranceOnlyCatalogue: RETAILERS.filter((r) => r.fragranceOnlyCatalogue === true)
      .map((r) => r.id)
      .sort(),
  };
}

/** sha256 over the rule modules' source and the registry facts. Stable until the rules move. */
export function rulesFingerprint(root: string): string {
  const digest = createHash('sha256');
  for (const file of ruleModules(root)) {
    digest.update(file);
    digest.update('\0');
    digest.update(readFileSync(join(root, file)));
    digest.update('\0');
  }
  digest.update(JSON.stringify(registryFacts()));
  return digest.digest('hex');
}

// ── The checkpoint ────────────────────────────────────────────────────────────

export interface Checkpoint {
  version: number;
  /** rulesFingerprint() at the time of writing. */
  rules: string;
  /** The last commit folded in; the next run resumes after it. */
  lastCommit: string;
  commitsReplayed: number;
  history: Record<string, PricePoint[]>;
  everPriced: Record<string, EverPriced>;
}

export function toCheckpoint(state: ReplayState, rules: string, commits: readonly CatalogueCommit[]): Checkpoint {
  return {
    version: CHECKPOINT_VERSION,
    rules,
    lastCommit: commits.at(-1)?.sha ?? '',
    commitsReplayed: commits.length,
    history: Object.fromEntries(state.history),
    everPriced: Object.fromEntries(state.everPriced),
  };
}

export function fromCheckpoint(checkpoint: Checkpoint): ReplayState {
  return {
    history: new Map(Object.entries(checkpoint.history)),
    everPriced: new Map(Object.entries(checkpoint.everPriced)),
  };
}

export type ResumeDecision =
  | { resume: true; state: ReplayState; from: number; commitsReplayed: number }
  | { resume: false; reason: string };

/**
 * Decides whether `checkpoint` may be resumed against `commits` under the
 * current `rules`. Every refusal names its reason, because a silent fall
 * back to a full replay is exactly the slow path this exists to avoid, and
 * the reader of the log should know why it happened.
 */
export function resumeFrom(
  checkpoint: Checkpoint | null,
  rules: string,
  commits: readonly CatalogueCommit[],
): ResumeDecision {
  if (!checkpoint) return { resume: false, reason: `no checkpoint at ${CHECKPOINT_PATH}` };
  if (checkpoint.version !== CHECKPOINT_VERSION) {
    return { resume: false, reason: `checkpoint is version ${checkpoint.version}, this build writes ${CHECKPOINT_VERSION}` };
  }
  if (checkpoint.rules !== rules) {
    return { resume: false, reason: 'the replay rules changed since the checkpoint was written (fingerprint differs)' };
  }
  const index = commits.findIndex((c) => c.sha === checkpoint.lastCommit);
  if (index < 0) {
    return {
      resume: false,
      reason: `checkpoint commit ${checkpoint.lastCommit.slice(0, 8)} is not among the commits touching ${CATALOGUE_PATH}`,
    };
  }
  return { resume: true, state: fromCheckpoint(checkpoint), from: index + 1, commitsReplayed: index + 1 };
}

export function readCheckpoint(root: string): Checkpoint | null {
  const path = join(root, CHECKPOINT_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Checkpoint;
  } catch {
    // A checkpoint that cannot be parsed (a rebase that left conflict markers
    // in it, a truncated write) is treated as absent: the full replay it
    // forces is slow but always right, and never silently wrong.
    return null;
  }
}

export function writeCheckpoint(root: string, checkpoint: Checkpoint): number {
  const body = JSON.stringify(checkpoint);
  writeFileSync(join(root, CHECKPOINT_PATH), body);
  return body.length;
}

// ── The shipped file ──────────────────────────────────────────────────────────

const realPointCount = (series: PricePoint[]): number => series.filter((p) => p.priceGbp !== null).length;

export interface Rendered {
  body: string;
  fragrancesWithHistory: number;
  charted: number;
  gapCounts: Record<PriceHistoryGap['reason'], number>;
}

/**
 * Turns the folded state into demo/priceHistory.generated.ts — the same
 * document, byte for byte, that the un-resumable script wrote. `commits` is
 * the complete list, not just the ones this run replayed, so the header's
 * "reconstructed from N commits" stays true of the whole series.
 */
export function render(state: ReplayState, commits: readonly CatalogueCommit[]): Rendered {
  const { history, everPriced } = state;

  // A single *real* point draws no line — demo/app.ts's chart refuses to
  // render below two — so a sub-two series is filtered here rather than
  // shipped for the frontend to skip. Counted by real points, not length: a
  // series can also hold gap markers.
  const sortedEntries = [...history.entries()]
    .filter(([, series]) => realPointCount(series) >= 2)
    .sort(([a], [b]) => a.localeCompare(b));

  // One reason for every fragrance that does not reach the bar above — see
  // src/services/priceHistoryGaps.ts for the wording each one gets.
  const gapReasons: Record<string, PriceHistoryGap> = {};
  const allKnownIds = new Set<string>([...history.keys(), ...everPriced.keys()]);
  for (const id of allKnownIds) {
    const series = history.get(id);
    if (series && realPointCount(series) >= 2) continue; // has a real chart
    const realPoints = series?.filter((p) => p.priceGbp !== null) ?? [];
    if (realPoints.length === 1) {
      const p = realPoints[0]!;
      gapReasons[id] = { reason: 'not-enough', priceGbp: p.priceGbp!, retailerId: p.retailerId!, at: p.at };
      continue;
    }
    const ever = everPriced.get(id);
    gapReasons[id] = ever ? { reason: 'sold-out', firstAt: ever.first, lastAt: ever.last } : { reason: 'never' };
  }
  // 'same-day' is never produced here — it is a presentation-time reason
  // demo/app.ts computes for itself — but the tally still names it to stay
  // exhaustive over the shared type.
  const gapCounts = { never: 0, 'sold-out': 0, 'not-enough': 0, 'same-day': 0 };
  for (const g of Object.values(gapReasons)) gapCounts[g.reason]++;

  const body = `/**
 * Auto-generated by scripts/build-price-history.ts. Do not edit by hand.
 *
 * Reconstructed from ${commits.length} real harvest commits, ${commits[0]?.at.slice(0, 10)} to
 * ${commits.at(-1)?.at.slice(0, 10)}. Every point is a price a reader could actually have
 * paid at that time — still listed and not confirmed out of stock — see the
 * script's own header for the full rules that keep fixture-era, non-fragrance
 * and unbuyable data out of this file, and for what a null priceGbp/retailerId
 * pair means (never a price; always an explicit "not buyable here" marker).
 *
 * PRICE_HISTORY_GAP names, for every fragrance that falls short of the 2+
 * real point bar above, which of three honest reasons applies — see
 * src/services/priceHistoryGaps.ts for the wording each one gets.
 */

export interface PriceHistoryPoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

export type PriceHistoryGap =
  | { reason: 'never' }
  | { reason: 'sold-out'; firstAt: string; lastAt: string }
  | { reason: 'not-enough'; priceGbp: number; retailerId: string; at: string };

export const PRICE_HISTORY: Record<string, PriceHistoryPoint[]> = ${JSON.stringify(Object.fromEntries(sortedEntries))};

export const PRICE_HISTORY_GAP: Record<string, PriceHistoryGap> = ${JSON.stringify(gapReasons)};

export function priceHistoryFor(fragranceId: string): PriceHistoryPoint[] {
  return PRICE_HISTORY[fragranceId] ?? [];
}

// Falls back to 'never' for an id absent from PRICE_HISTORY_GAP entirely —
// a fragrance that has never once appeared in a replayed commit at all
// (added to the catalogue after the last one, or sourced only from
// fixtures throughout). "Never priced" is the true statement for that case
// too, so the fallback needs no special case of its own.
export function priceHistoryGapFor(fragranceId: string): PriceHistoryGap {
  return PRICE_HISTORY_GAP[fragranceId] ?? { reason: 'never' };
}
`;

  return { body, fragrancesWithHistory: history.size, charted: sortedEntries.length, gapCounts };
}
